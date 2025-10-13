import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../services/prisma.service';
import * as admin from 'firebase-admin';

@Injectable()
export class PushChannelService {
  private readonly logger = new Logger(PushChannelService.name);
  private initialized = false;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    const serverKey = this.config.get('FIREBASE_SERVER_KEY');

    if (serverKey) {
      try {
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(serverKey)),
          });
        }
        this.initialized = true;
      } catch (error) {
        this.logger.error('Failed to initialize Firebase', error.stack);
      }
    } else {
      this.logger.warn('Firebase not configured. Push notifications disabled.');
    }
  }

  async send(userId: string, payload: Record<string, any>): Promise<void> {
    if (!this.initialized) {
      this.logger.warn('Push notifications not configured. Skipping.');
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return;

    const settings = (user.settings as any) || {};
    const devices = settings.devices || [];

    const tokens = devices.map((d: any) => d.token).filter(Boolean);

    if (tokens.length === 0) {
      this.logger.log(`No FCM tokens registered for user ${userId}`);
      return;
    }

    try {
      const message = {
        notification: {
          title: payload.title || 'FarmShare Notification',
          body: payload.message || payload.body,
        },
        data: payload.data || {},
        tokens,
      };

      const response = await admin.messaging().sendMulticast(message);

      this.logger.log(
        `Push sent to ${response.successCount}/${tokens.length} devices`,
      );
    } catch (error) {
      this.logger.error(`Failed to send push notification`, error.stack);
      throw error;
    }
  }
}
