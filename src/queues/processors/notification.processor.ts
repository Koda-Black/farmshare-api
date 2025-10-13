import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType, NotificationMedium } from '@prisma/client';

interface NotificationJobData {
  userId: string;
  type: NotificationType;
  mediums: NotificationMedium[];
  payload: Record<string, any>;
  priority?: number;
}

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<any> {
    const { userId, type, mediums, payload } = job.data;

    this.logger.log(
      `Processing notification job: ${job.id} for user ${userId} (${type})`,
    );

    try {
      const result = await this.notificationsService.sendNotification(
        userId,
        type,
        mediums,
        payload,
      );

      this.logger.log(
        `Notification sent to user ${userId} via ${mediums.join(', ')}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Notification job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error; // Will trigger retry
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<NotificationJobData>) {
    this.logger.log(
      `Notification job ${job.id} completed for user ${job.data.userId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NotificationJobData>, error: Error) {
    this.logger.error(
      `Notification job ${job.id} failed for user ${job.data.userId}: ${error.message}`,
      error.stack,
    );
    // Don't retry notification failures - just log them
  }
}
