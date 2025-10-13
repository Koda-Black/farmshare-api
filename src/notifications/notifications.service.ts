import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { EmailChannelService } from './channels/email.channel';
import { SmsChannelService } from './channels/sms.channel';
import { PushChannelService } from './channels/push.channel';
import { WebhookChannelService } from './channels/webhook.channel';
import { NotificationType, NotificationMedium } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
    private smsChannel: SmsChannelService,
    private pushChannel: PushChannelService,
    private webhookChannel: WebhookChannelService,
  ) {}

  async sendNotification(
    userId: string,
    type: NotificationType,
    mediums: NotificationMedium[],
    payload: Record<string, any>,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check user notification preferences
    const settings = (user.settings as any) || {};
    const preferences = settings.notifications || {};

    const results = await Promise.allSettled(
      mediums.map(async (medium) => {
        // Check if user has opted out of this medium
        if (preferences[medium] === false) {
          this.logger.log(
            `User ${userId} opted out of ${medium} notifications`,
          );
          return { medium, sent: false, reason: 'opted_out' };
        }

        // Create notification record
        const notification = await this.prisma.notification.create({
          data: {
            userId,
            type,
            medium,
            payload,
            read: false,
          },
        });

        try {
          switch (medium) {
            case NotificationMedium.EMAIL:
              await this.sendEmailNotification(user, type, payload);
              break;
            case NotificationMedium.SMS:
              if (user.phone) {
                await this.smsChannel.send(user.phone, payload.message);
              } else {
                this.logger.warn(`User ${userId} has no phone number for SMS`);
              }
              break;
            case NotificationMedium.PUSH:
              await this.pushChannel.send(userId, payload);
              break;
            case NotificationMedium.WEBHOOK:
              await this.webhookChannel.send(userId, type, payload);
              break;
            case NotificationMedium.IN_APP:
              // Already created in DB
              break;
          }

          await this.prisma.notification.update({
            where: { id: notification.id },
            data: { deliveredAt: new Date() },
          });

          return { medium, sent: true, notificationId: notification.id };
        } catch (error) {
          this.logger.error(
            `Failed to send ${medium} notification to ${userId}`,
            error.stack,
          );
          return { medium, sent: false, error: error.message };
        }
      }),
    );

    return {
      userId,
      type,
      results: results.map((r) =>
        r.status === 'fulfilled' ? r.value : { error: r.reason },
      ),
    };
  }

  private async sendEmailNotification(
    user: any,
    type: NotificationType,
    payload: Record<string, any>,
  ) {
    const subject = this.getEmailSubject(type);
    const body =
      payload.message || payload.body || 'You have a new notification';

    await this.emailChannel.send(user.email, subject, body);
  }

  private getEmailSubject(type: NotificationType): string {
    const subjects = {
      VERIFICATION: 'Verification Update',
      PAYMENT: 'Payment Notification',
      POOL_UPDATE: 'Pool Status Update',
      DISPUTE: 'Dispute Notification',
      ADMIN: 'Admin Notice',
    };
    return subjects[type] || 'FarmShare Notification';
  }

  async getUserNotifications(
    userId: string,
    skip: number,
    take: number,
    unreadOnly: boolean = false,
  ) {
    const where: any = { userId };

    if (unreadOnly) {
      where.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
      skip,
      take,
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('Unauthorized');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async registerDevice(userId: string, fcmToken: string, deviceType?: string) {
    // Store FCM token in user settings
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const settings = (user.settings as any) || {};
    const devices = settings.devices || [];

    // Check if token already exists
    const existingDevice = devices.find((d: any) => d.token === fcmToken);

    if (!existingDevice) {
      devices.push({
        token: fcmToken,
        deviceType: deviceType || 'unknown',
        registeredAt: new Date().toISOString(),
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          settings: {
            ...settings,
            devices,
          },
        },
      });
    }

    return { message: 'Device registered successfully' };
  }

  async unregisterDevice(userId: string, fcmToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const settings = (user.settings as any) || {};
    const devices = settings.devices || [];

    const updatedDevices = devices.filter((d: any) => d.token !== fcmToken);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        settings: {
          ...settings,
          devices: updatedDevices,
        },
      },
    });

    return { message: 'Device unregistered successfully' };
  }

  // Helper methods for common notifications
  async notifyPoolFilled(poolId: string) {
    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        vendor: true,
        subscriptions: { include: { user: true } },
        product: true,
      },
    });

    if (!pool) return;

    // Notify vendor
    await this.sendNotification(
      pool.vendorId,
      NotificationType.POOL_UPDATE,
      [
        NotificationMedium.EMAIL,
        NotificationMedium.PUSH,
        NotificationMedium.IN_APP,
      ],
      {
        title: 'Pool Filled',
        message: `Your pool "${pool.product?.name}" is now filled! Delivery deadline: ${pool.deliveryDeadlineUtc}`,
        poolId,
      },
    );

    // Notify all buyers
    for (const sub of pool.subscriptions) {
      await this.sendNotification(
        sub.userId,
        NotificationType.POOL_UPDATE,
        [
          NotificationMedium.EMAIL,
          NotificationMedium.PUSH,
          NotificationMedium.IN_APP,
        ],
        {
          title: 'Pool Filled',
          message: `The pool "${pool.product?.name}" is now filled! Delivery expected by ${pool.deliveryDeadlineUtc}`,
          poolId,
        },
      );
    }
  }

  async notifyPaymentSuccess(userId: string, subscriptionId: string) {
    await this.sendNotification(
      userId,
      NotificationType.PAYMENT,
      [
        NotificationMedium.EMAIL,
        NotificationMedium.PUSH,
        NotificationMedium.IN_APP,
      ],
      {
        title: 'Payment Successful',
        message: 'Your payment was processed successfully!',
        subscriptionId,
      },
    );
  }

  async notifyVerificationComplete(userId: string) {
    await this.sendNotification(
      userId,
      NotificationType.VERIFICATION,
      [
        NotificationMedium.EMAIL,
        NotificationMedium.PUSH,
        NotificationMedium.IN_APP,
      ],
      {
        title: 'Verification Complete',
        message: 'Your account has been verified! You can now create pools.',
      },
    );
  }
}
