import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private logger = new Logger();

  constructor() {
    super({
      log: ['error', 'warn'],
      transactionOptions: {
        maxWait: 5000, // 5 seconds max wait for transaction
        timeout: 30000, // 30 seconds timeout for transactions
      },
      // Configure connection pooling for better concurrency
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (error) {
      Sentry.captureException(error, { extra: { phase: 'prisma_connect' } });
      this.logger.error('Failed to connect to database', error.stack);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Helper method for executing transactions with proper error handling
  async executeTransaction<T>(
    callback: (tx: PrismaClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T> {
    try {
      return await this.$transaction(callback, {
        maxWait: options?.maxWait || 5000,
        timeout: options?.timeout || 30000,
      });
    } catch (error) {
      this.logger.error('Transaction failed:', error.message);
      Sentry.captureException(error, { extra: { phase: 'transaction' } });
      throw error;
    }
  }

  // Helper method for short-lived operations
  async executeQuickTransaction<T>(
    callback: (tx: PrismaClient) => Promise<T>
  ): Promise<T> {
    try {
      return await this.$transaction(callback, {
        maxWait: 2000, // 2 seconds max wait for quick operations
        timeout: 10000, // 10 seconds timeout
      });
    } catch (error) {
      this.logger.error('Quick transaction failed:', error.message);
      throw error;
    }
  }
}
