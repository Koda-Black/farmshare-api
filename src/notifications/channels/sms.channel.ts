// src/notifications/channels/sms.channel.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';
import { ReceiptDetails } from '../interfaces/receipt.interface';

@Injectable()
export class SmsChannelService {
  private readonly logger = new Logger(SmsChannelService.name);
  private client: twilio.Twilio | null = null;

  constructor(private config: ConfigService) {
    const sid = config.get('TWILIO_ACCOUNT_SID');
    const token = config.get('TWILIO_AUTH_TOKEN');

    if (sid && token) {
      this.client = twilio(sid, token);
    } else {
      this.logger.warn('Twilio credentials not configured. SMS disabled.');
    }
  }

  async send(phone: string, message: string): Promise<void> {
    if (!this.client) {
      this.logger.warn('SMS not configured. Skipping SMS send.');
      return;
    }

    try {
      await this.client.messages.create({
        from: this.config.get('TWILIO_PHONE_NUMBER'),
        to: phone,
        body: message,
      });

      this.logger.log(`SMS sent to ${phone}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${phone}`, error.stack);
      throw error;
    }
  }

  // ✅ New method: Send SMS receipt
  async sendReceipt(
    user: { phone?: string; name?: string },
    details: ReceiptDetails,
  ): Promise<void> {
    const { phone } = user;
    if (!phone) {
      this.logger.warn('No phone number provided — skipping SMS receipt.');
      return;
    }

    const {
      amount,
      poolName,
      transactionId,
      subscriptionId,
      slots,
      deliveryFee,
      type = 'subscription',
    } = details;

    const totalAmount = amount + (deliveryFee || 0);
    const shortType =
      type === 'refund'
        ? 'Refund'
        : type === 'delivery'
          ? 'Delivery'
          : 'Subscription';

    const message = [
      `FarmShare ${shortType} Receipt`,
      `Pool: ${poolName}`,
      `Slots: ${slots}`,
      `Total: ₦${totalAmount.toLocaleString()}`,
      transactionId ? `Txn ID: ${transactionId}` : null,
      `Sub ID: ${subscriptionId}`,
      'Thank you for using FarmShare!',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await this.send(phone, message);
      this.logger.log(`📱 Receipt SMS sent to ${phone}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to send receipt SMS to ${phone}`,
        error.stack,
      );
      throw error;
    }
  }
}
