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

@Module({
  imports: [
    // Configure BullMQ with Redis
    BullModule.forRootAsync({
      imports: [ConfigModule, NotificationsModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
          password: configService.get('REDIS_PASSWORD') || undefined,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: {
            age: 24 * 3600, // Keep for 24 hours
            count: 1000, // Keep last 1000 jobs
          },
          removeOnFail: {
            age: 7 * 24 * 3600, // Keep for 7 days
          },
        },
      }),
      inject: [ConfigService],
    }),

    // Register queues
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
