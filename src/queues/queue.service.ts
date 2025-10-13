import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationType, NotificationMedium } from '@prisma/client';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('verification') private verificationQueue: Queue,
    @InjectQueue('escrow-release') private escrowReleaseQueue: Queue,
    @InjectQueue('notifications') private notificationsQueue: Queue,
  ) {}

  // Add verification job
  async addVerificationJob(data: {
    verificationId: string;
    userId: string;
    step: string;
    metadata?: Record<string, any>;
  }) {
    const job = await this.verificationQueue.add('process-verification', data, {
      priority: 1, // High priority
      delay: 5000, // Wait 5 seconds before processing
    });

    this.logger.log(`Added verification job: ${job.id}`);
    return job;
  }

  // Add escrow release job
  async addEscrowReleaseJob(
    data: {
      poolId: string;
      triggerType: 'auto' | 'manual' | 'deadline';
      reason?: string;
    },
    delay?: number,
  ) {
    const job = await this.escrowReleaseQueue.add('release-escrow', data, {
      priority: 2, // Medium priority
      delay: delay || 0, // Optional delay in milliseconds
    });

    this.logger.log(
      `Added escrow release job: ${job.id} for pool ${data.poolId}`,
    );
    return job;
  }

  // Schedule escrow release for specific time
  async scheduleEscrowRelease(poolId: string, releaseDate: Date) {
    const delay = releaseDate.getTime() - Date.now();

    if (delay < 0) {
      this.logger.warn(
        `Cannot schedule escrow release in the past for pool ${poolId}`,
      );
      return null;
    }

    return this.addEscrowReleaseJob(
      {
        poolId,
        triggerType: 'deadline',
        reason: 'Scheduled automatic release after grace period',
      },
      delay,
    );
  }

  // Add notification job
  async addNotificationJob(data: {
    userId: string;
    type: NotificationType;
    mediums: NotificationMedium[];
    payload: Record<string, any>;
  }) {
    const job = await this.notificationsQueue.add('send-notification', data, {
      priority: 3, // Low priority
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });

    this.logger.log(
      `Added notification job: ${job.id} for user ${data.userId}`,
    );
    return job;
  }

  // Batch add notifications
  async addBulkNotificationJobs(
    notifications: Array<{
      userId: string;
      type: NotificationType;
      mediums: NotificationMedium[];
      payload: Record<string, any>;
    }>,
  ) {
    const jobs = await this.notificationsQueue.addBulk(
      notifications.map((data) => ({
        name: 'send-notification',
        data,
        opts: {
          priority: 3,
        },
      })),
    );

    this.logger.log(`Added ${jobs.length} notification jobs in bulk`);
    return jobs;
  }

  // Get job status
  async getJobStatus(
    queueName: 'verification' | 'escrow-release' | 'notifications',
    jobId: string,
  ) {
    const queue =
      queueName === 'verification'
        ? this.verificationQueue
        : queueName === 'escrow-release'
          ? this.escrowReleaseQueue
          : this.notificationsQueue;

    const job = await queue.getJob(jobId);

    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      state: await job.getState(),
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  }

  // Get queue stats
  async getQueueStats(
    queueName: 'verification' | 'escrow-release' | 'notifications',
  ) {
    const queue =
      queueName === 'verification'
        ? this.verificationQueue
        : queueName === 'escrow-release'
          ? this.escrowReleaseQueue
          : this.notificationsQueue;

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }
}
