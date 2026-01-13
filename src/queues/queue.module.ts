import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VerificationProcessor } from './processors/verification.processor';
import { EscrowReleaseProcessor } from './processors/escrow-release.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { PaymentProcessor } from './processors/payment.processor';
import { QueueService } from './queue.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { VerificationModule } from '../verification/verification.module';
import { EscrowModule } from '../escrow/escrow.module';

/**
 * Shared Redis connection options for BullMQ
 * This ensures all queues share a single connection to minimize Redis connections
 * 
 * IMPORTANT: Free Redis tiers have limited connections (~30).
 * Each BullMQ Worker creates 2 connections, each Queue creates 1.
 * By sharing connections with sharedConnection: true, we reduce total connections.
 */
@Module({
  imports: [
    // Configure BullMQ with shared Redis connection
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get('REDIS_HOST') || 'localhost';
        const redisPort = configService.get('REDIS_PORT') || 6379;
        const redisPassword = configService.get('REDIS_PASSWORD') || undefined;
        
        console.log(`[QueueModule] Configuring shared Redis connection to ${redisHost}:${redisPort}`);
        
        return {
          connection: {
            host: redisHost,
            port: redisPort,
            password: redisPassword,
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: false, // Faster startup
          },
          // Enable connection sharing to reduce total Redis connections
          sharedConnection: true,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: {
              age: 24 * 3600, // Keep for 24 hours
              count: 100, // Reduced from 1000 to save memory
            },
            removeOnFail: {
              age: 3 * 24 * 3600, // Reduced from 7 days to 3 days
              count: 50, // Limit failed jobs stored
            },
          },
        };
      },
      inject: [ConfigService],
    }),

    // Register all queues - they will share the root connection
    BullModule.registerQueue(
      {
        name: 'verification',
        defaultJobOptions: {
          priority: 1, // High priority
        },
      },
      {
        name: 'payment-processing',
        defaultJobOptions: {
          priority: 1, // Highest priority - payments are critical
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      },
      {
        name: 'escrow-release',
        defaultJobOptions: {
          priority: 2, // Medium priority
        },
      },
      {
        name: 'notifications',
        defaultJobOptions: {
          priority: 3, // Low priority
        },
      },
    ),

    // Import required modules
    PrismaModule,
    VerificationModule,
    EscrowModule,
    NotificationsModule,
  ],
  providers: [
    QueueService,
    VerificationProcessor,
    PaymentProcessor,
    EscrowReleaseProcessor,
    NotificationProcessor,
    EmailChannelService,
  ],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
