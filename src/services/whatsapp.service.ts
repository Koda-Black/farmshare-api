import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private client: twilio.Twilio;

  constructor(private config: ConfigService) {
    this.client = twilio(
      config.get('TWILIO_ACCOUNT_SID'),
      config.get('TWILIO_AUTH_TOKEN'),
    );
  }

  async sendSubscriptionReceipt(toPhone: string, message: string) {
    try {
      await this.client.messages.create({
        from: `whatsapp:${this.config.get('TWILIO_WHATSAPP_NUMBER')}`,
        to: `whatsapp:${toPhone}`,
        body: message,
      });
      this.logger.log(`WhatsApp receipt sent to ${toPhone}`);
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp to ${toPhone}`, error.stack);
    }
  }
}
