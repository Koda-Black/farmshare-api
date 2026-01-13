// ============================================================================
// FILE: src/common/services/redis.service.ts
// PURPOSE: Shared Redis connection manager to reduce connection count
// ============================================================================

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

/**
 * RedisService provides a shared Redis connection for the entire application.
 *
 * IMPORTANT: This module creates a single shared Redis connection to avoid
 * hitting the max client limit on Redis (especially on free tiers).
 *
 * Free Redis Labs tier allows ~30 connections max.
 * Each BullMQ Worker creates 2 connections, each Queue creates 1.
 * By sharing connections, we reduce total connections significantly.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private sharedConnection: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get or create the shared Redis connection
   * This connection is reused by all BullMQ queues and workers
   */
  getConnection(): Redis {
    if (this.sharedConnection && this.isConnected) {
      return this.sharedConnection;
    }

    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;
    const password =
      this.configService.get<string>('REDIS_PASSWORD') || undefined;

    this.logger.log(`Creating shared Redis connection to ${host}:${port}`);

    this.sharedConnection = new IORedis({
      host,
      port,
      password,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false, // Faster startup
      lazyConnect: false, // Connect immediately
      retryStrategy: (times: number) => {
        if (times > 5) {
          this.logger.warn(
            `Redis connection failed after ${times} attempts, stopping retries`,
          );
          return null; // Stop retrying after 5 attempts
        }
        const delay = Math.min(times * 1000, 5000); // Max 5 second delay
        this.logger.log(`Redis retry attempt ${times}, waiting ${delay}ms...`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetErrors = ['READONLY', 'ETIMEDOUT'];
        if (targetErrors.some((e) => err.message.includes(e))) {
          return true; // Reconnect on these errors
        }
        return false;
      },
    });

    this.sharedConnection.on('connect', () => {
      this.isConnected = true;
      this.logger.log('✅ Shared Redis connection established');
    });

    this.sharedConnection.on('ready', () => {
      this.logger.log('✅ Shared Redis connection ready');
    });

    this.sharedConnection.on('error', (err: Error) => {
      // Don't spam logs with max client errors
      if (!err.message.includes('max number of clients')) {
        this.logger.warn(`Redis connection error: ${err.message}`);
      }
    });

    this.sharedConnection.on('close', () => {
      this.isConnected = false;
      this.logger.warn('Redis connection closed');
    });

    return this.sharedConnection;
  }

  /**
   * Get connection options for BullMQ modules
   * Returns a configuration object that can be used with BullModule.forRootAsync
   */
  getConnectionOptions() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;
    const password =
      this.configService.get<string>('REDIS_PASSWORD') || undefined;

    return {
      host,
      port,
      password,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  /**
   * Check if Redis is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const conn = this.getConnection();
      await conn.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gracefully close the Redis connection
   */
  async onModuleDestroy() {
    if (this.sharedConnection) {
      this.logger.log('Closing shared Redis connection...');
      await this.sharedConnection.quit();
      this.sharedConnection = null;
      this.isConnected = false;
      this.logger.log('Shared Redis connection closed');
    }
  }
}
