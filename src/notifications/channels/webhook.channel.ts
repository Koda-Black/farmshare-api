import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../../services/prisma.service';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class WebhookChannelService {
  private readonly logger = new Logger(WebhookChannelService.name);

  constructor(
    private http: HttpService,
    private prisma: PrismaService,
  ) {}

  async send(
    userId: string,
    type: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return;

    const settings = (user.settings as any) || {};
    const webhookUrl = settings.webhookUrl;

    if (!webhookUrl) {
      this.logger.log(`No webhook URL configured for user ${userId}`);
      return;
    }

    try {
      const observable = this.http.post(webhookUrl, {
        event: type,
        userId,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      await firstValueFrom(observable);

      this.logger.log(`Webhook sent to ${webhookUrl}`);
    } catch (error) {
      this.logger.error(`Failed to send webhook to ${webhookUrl}`, error.stack);
      throw error;
    }
  }
}