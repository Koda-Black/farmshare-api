import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { EmailChannelService } from './channels/email.channel';
import { SmsChannelService } from './channels/sms.channel';
import { PushChannelService } from './channels/push.channel';
import { WebhookChannelService } from './channels/webhook.channel';
import { NotificationType, NotificationMedium } from '@prisma/client';
import { UpdateNotificationPreferencesDto } from './dto/notification.dto';

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
    // Validate userId before querying
    if (!userId) {
      this.logger.error('sendNotification called with undefined userId');
      throw new Error('userId is required for sending notifications');
    }

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
    // Validate and sanitize inputs
    const validSkip = Math.max(0, isNaN(skip) ? 0 : Number(skip));
    const validTake = Math.max(
      1,
      Math.min(100, isNaN(take) ? 20 : Number(take)),
    );

    const where: any = { userId };

    if (unreadOnly) {
      where.read = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: validSkip,
        take: validTake,
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

  async getNotificationPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const settings = (user.settings as any) || {};
    const preferences = settings.notifications || {};

    // Return default preferences if none are set
    return {
      email: preferences.email !== false,
      sms: preferences.sms !== false,
      push: preferences.push !== false,
      inApp: preferences.inApp !== false,
      types: {
        verification: preferences.types?.verification !== false,
        payment: preferences.types?.payment !== false,
        poolUpdates: preferences.types?.poolUpdates !== false,
        disputes: preferences.types?.disputes !== false,
        admin: preferences.types?.admin !== false,
      },
    };
  }

  async updateNotificationPreferences(
    userId: string,
    updateData: UpdateNotificationPreferencesDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get current settings
    const currentSettings = (user.settings as any) || {};
    const currentNotifications = currentSettings.notifications || {};

    // Update notification preferences
    const updatedNotifications = {
      ...currentNotifications,
      ...updateData,
    };

    // Update user settings
    const updatedSettings = {
      ...currentSettings,
      notifications: updatedNotifications,
    };

    await this.prisma.user.update({
      where: { id: userId },
      data: { settings: updatedSettings },
    });

    return this.getNotificationPreferences(userId);
  }

  async notifyWelcome(userId: string) {
    await this.sendNotification(
      userId,
      NotificationType.ADMIN,
      [
        NotificationMedium.EMAIL,
        NotificationMedium.PUSH,
        NotificationMedium.IN_APP,
      ],
      {
        title: 'Welcome to FarmShare!',
        message:
          'Thank you for joining FarmShare. Get started by exploring available pools or creating your own.',
      },
    );
  }

  async notifyPaymentSuccess(
    userId: string,
    paymentDetails: {
      amount: number;
      poolName: string;
      slots: number;
      transactionId: string;
    },
  ) {
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
        message: `Payment of ₦${paymentDetails.amount.toLocaleString()} for ${paymentDetails.slots} slots in ${paymentDetails.poolName} was successful.`,
        data: {
          transactionId: paymentDetails.transactionId,
          amount: paymentDetails.amount,
          poolName: paymentDetails.poolName,
        },
      },
    );
  }

  async notifyPaymentFailed(
    userId: string,
    paymentDetails: {
      amount: number;
      poolName: string;
      error: string;
      transactionId: string;
    },
  ) {
    await this.sendNotification(
      userId,
      NotificationType.PAYMENT,
      [
        NotificationMedium.EMAIL,
        NotificationMedium.PUSH,
        NotificationMedium.IN_APP,
      ],
      {
        title: 'Payment Failed',
        message: `Your payment of ₦${paymentDetails.amount.toLocaleString()} for ${paymentDetails.poolName} could not be processed. ${paymentDetails.error}`,
        data: {
          transactionId: paymentDetails.transactionId,
          error: paymentDetails.error,
          amount: paymentDetails.amount,
        },
      },
    );
  }

  async notifySecurityAlert(
    userId: string,
    alertDetails: {
      type: 'login' | 'password_change' | 'account_update';
      location?: string;
      timestamp: string;
    },
  ) {
    await this.sendNotification(
      userId,
      NotificationType.ADMIN,
      [
        NotificationMedium.EMAIL,
        NotificationMedium.PUSH,
        NotificationMedium.IN_APP,
      ],
      {
        title: 'Security Alert',
        message: this.getSecurityMessage(alertDetails),
        data: {
          type: alertDetails.type,
          location: alertDetails.location,
          timestamp: alertDetails.timestamp,
        },
      },
    );
  }

  async notifyPoolStatusChange(
    userId: string,
    poolDetails: {
      poolName: string;
      oldStatus: string;
      newStatus: string;
      message?: string;
    },
  ) {
    await this.sendNotification(
      userId,
      NotificationType.POOL_UPDATE,
      [
        NotificationMedium.EMAIL,
        NotificationMedium.PUSH,
        NotificationMedium.IN_APP,
      ],
      {
        title: 'Pool Status Update',
        message:
          poolDetails.message ||
          `Pool "${poolDetails.poolName}" status changed from ${poolDetails.oldStatus} to ${poolDetails.newStatus}.`,
        data: {
          poolName: poolDetails.poolName,
          oldStatus: poolDetails.oldStatus,
          newStatus: poolDetails.newStatus,
        },
      },
    );
  }

  async notifyDisputeUpdate(
    userId: string,
    disputeDetails: {
      disputeId: string;
      poolName: string;
      status: string;
      resolution?: string;
    },
  ) {
    await this.sendNotification(
      userId,
      NotificationType.DISPUTE,
      [
        NotificationMedium.EMAIL,
        NotificationMedium.PUSH,
        NotificationMedium.IN_APP,
      ],
      {
        title: 'Dispute Update',
        message: `Your dispute for "${disputeDetails.poolName}" is now ${disputeDetails.status}${disputeDetails.resolution ? ': ' + disputeDetails.resolution : ''}.`,
        data: {
          disputeId: disputeDetails.disputeId,
          poolName: disputeDetails.poolName,
          status: disputeDetails.status,
          resolution: disputeDetails.resolution,
        },
      },
    );
  }

  private getSecurityMessage(alertDetails: {
    type: 'login' | 'password_change' | 'account_update';
    location?: string;
    timestamp: string;
  }): string {
    switch (alertDetails.type) {
      case 'login':
        return `New login detected ${alertDetails.location ? `from ${alertDetails.location}` : ''} at ${new Date(alertDetails.timestamp).toLocaleString()}.`;
      case 'password_change':
        return "Your password was successfully changed. If you didn't make this change, please contact support immediately.";
      case 'account_update':
        return "Your account information was updated. If you didn't make these changes, please contact support.";
      default:
        return 'A security event was detected on your account.';
    }
  }

  /**
   * Send welcome notification to newly registered users
   */
  async sendWelcomeNotification(user: {
    id: string;
    email: string;
    name: string;
    role: string;
  }) {
    const isBuyer = user.role === 'buyer';
    const isVendor = user.role === 'vendor';

    const welcomeTitle = `Welcome to FarmShare, ${user.name}! 🎉`;
    const welcomeMessage = isBuyer
      ? `Welcome to FarmShare! You're now part of Nigeria's largest agricultural marketplace. Start exploring pools to get wholesale prices on fresh farm products. Save money by buying together with your community!`
      : `Welcome to FarmShare! You're now registered as a vendor. Complete your verification to start creating buying pools and selling your products to thousands of buyers across Nigeria.`;

    const nextSteps = isBuyer
      ? [
          '🔍 Browse available pools in your area',
          '🛒 Join a pool and enjoy wholesale prices',
          '📱 Enable notifications to never miss deals',
        ]
      : [
          '✅ Complete your vendor verification',
          '🏪 Set up your business profile',
          '📦 Create your first buying pool',
        ];

    try {
      // Send in-app notification
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: 'ADMIN',
          medium: 'IN_APP',
          payload: {
            title: welcomeTitle,
            message: welcomeMessage,
            nextSteps,
            actionUrl: isBuyer ? '/buyer/marketplace' : '/vendor/verification',
            actionText: isBuyer ? 'Browse Pools' : 'Complete Verification',
          },
          read: false,
        },
      });

      // Send welcome email
      const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
    .btn { display: inline-block; background: #16a34a; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; }
    .step { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .step:last-child { border-bottom: none; }
    h1 { margin: 0; font-size: 28px; }
    .emoji { font-size: 48px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="emoji">🌾</div>
      <h1>Welcome to FarmShare!</h1>
    </div>
    <div class="content">
      <p>Hi <strong>${user.name}</strong>,</p>
      <p>${welcomeMessage}</p>
      
      <h3>📋 Your Next Steps:</h3>
      ${nextSteps.map((step) => `<div class="step">${step}</div>`).join('')}
      
      <center>
        <a href="${process.env.FRONTEND_URL || 'https://farmshare.ng'}${isBuyer ? '/buyer/marketplace' : '/vendor/verification'}" class="btn">
          ${isBuyer ? 'Start Shopping' : 'Complete Verification'}
        </a>
      </center>
      
      <p>If you have any questions, our support team is always here to help.</p>
      <p>Happy farming! 🚜</p>
      <p><strong>The FarmShare Team</strong></p>
    </div>
    <div class="footer">
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        © ${new Date().getFullYear()} FarmShare. All rights reserved.<br>
        Nigeria's #1 Agricultural Marketplace
      </p>
    </div>
  </div>
</body>
</html>
      `;

      await this.emailChannel.send(user.email, welcomeTitle, emailBody);

      this.logger.log(
        `Welcome notification sent to user ${user.id} (${user.email})`,
      );

      return { success: true, userId: user.id };
    } catch (error) {
      this.logger.error(
        `Failed to send welcome notification to ${user.email}:`,
        error,
      );
      // Don't throw - welcome messages shouldn't block the signup flow
      return { success: false, error: error.message };
    }
  }
}
