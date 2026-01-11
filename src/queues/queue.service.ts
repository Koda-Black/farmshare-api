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
    @InjectQueue('payment-processing') private paymentProcessingQueue: Queue,
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

  // Add scheduled escrow releases job (runs every minute to check for pools ready for release)
  async addScheduledEscrowReleaseJob() {
    const job = await this.escrowReleaseQueue.add(
      'process-scheduled-releases',
      {},
      {
        priority: 2,
        repeat: { pattern: '* * * * *' }, // Every minute (for testing with 5min grace period)
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    this.logger.log(`Added scheduled escrow release job: ${job.id}`);
    return job;
  }

  // Add manual escrow release job
  async addManualEscrowReleaseJob(
    poolId: string,
    reason?: string,
    forceRelease = false,
  ) {
    const job = await this.escrowReleaseQueue.add(
      'release-pool-escrow',
      {
        poolId,
        triggerType: 'manual',
        reason: reason || 'Manual release by admin',
        forceRelease,
      },
      {
        priority: 1, // High priority for manual releases
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );

    this.logger.log(
      `Added manual escrow release job: ${job.id} for pool ${poolId}`,
    );
    return job;
  }

  // Add vendor funds release job (release all funds for a vendor)
  async addVendorFundsReleaseJob(vendorId: string) {
    const job = await this.escrowReleaseQueue.add(
      'process-vendor-releases',
      {
        vendorId,
        triggerType: 'manual',
        reason: 'Release all vendor funds by admin',
      },
      {
        priority: 1, // High priority
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      },
    );

    this.logger.log(
      `Added vendor funds release job: ${job.id} for vendor ${vendorId}`,
    );
    return job;
  }

  // Add notification job
  async addNotificationJob(data: {
    userId: string;
    type: NotificationType;
    mediums: NotificationMedium[];
    payload: Record<string, any>;
  }) {
    // Validate userId before adding to queue
    if (!data.userId) {
      this.logger.error(
        `Attempted to add notification job with undefined userId. Type: ${data.type}`,
      );
      return null;
    }

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
    // Filter out notifications with undefined userId
    const validNotifications = notifications.filter((n) => {
      if (!n.userId) {
        this.logger.error(
          `Skipping bulk notification with undefined userId. Type: ${n.type}`,
        );
        return false;
      }
      return true;
    });

    if (validNotifications.length === 0) {
      this.logger.warn('No valid notifications to add in bulk');
      return [];
    }

    const jobs = await this.notificationsQueue.addBulk(
      validNotifications.map((data) => ({
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

  // Add payment processing job
  async addPaymentProcessingJob(data: {
    pendingId: string;
    paymentMethod: 'STRIPE' | 'PAYSTACK';
    paymentReference: string;
    userId: string;
    poolId: string;
    amount: number;
    metadata?: Record<string, any>;
  }) {
    const job = await this.paymentProcessingQueue.add('process-payment', data, {
      priority: 1, // Highest priority - payments are critical
      attempts: 5, // More attempts for reliability
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 72 * 3600, // Keep for 3 days for audit
        count: 5000, // Keep more payment jobs
      },
      removeOnFail: {
        age: 30 * 24 * 3600, // Keep for 30 days for debugging
      },
    });

    this.logger.log(
      `Added payment processing job: ${job.id} for pending ${data.pendingId}`,
    );
    return job;
  }

  // Add payment verification job (for handling webhooks)
  async addPaymentVerificationJob(data: {
    paymentReference: string;
    paymentMethod: 'STRIPE' | 'PAYSTACK';
    pendingId?: string;
    webhookData?: any;
  }) {
    const job = await this.paymentProcessingQueue.add('verify-payment', data, {
      priority: 1, // Highest priority
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      delay: 5000, // Wait 5 seconds to allow webhooks to be processed first
    });

    this.logger.log(
      `Added payment verification job: ${job.id} for reference ${data.paymentReference}`,
    );
    return job;
  }

  // Get job status
  async getJobStatus(
    queueName:
      | 'verification'
      | 'escrow-release'
      | 'notifications'
      | 'payment-processing',
    jobId: string,
  ) {
    const queue =
      queueName === 'verification'
        ? this.verificationQueue
        : queueName === 'escrow-release'
          ? this.escrowReleaseQueue
          : queueName === 'payment-processing'
            ? this.paymentProcessingQueue
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
    queueName:
      | 'verification'
      | 'escrow-release'
      | 'notifications'
      | 'payment-processing',
  ) {
    const queue =
      queueName === 'verification'
        ? this.verificationQueue
        : queueName === 'escrow-release'
          ? this.escrowReleaseQueue
          : queueName === 'payment-processing'
            ? this.paymentProcessingQueue
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
