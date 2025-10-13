// src/notifications/channels/email.channel.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sendgridMail from '@sendgrid/mail';
import {
  NotificationChannel,
  ReceiptDetails,
} from '../interfaces/receipt.interface';

@Injectable()
export class EmailChannelService {
  private readonly logger = new Logger(EmailChannelService.name);

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      this.logger.warn('SENDGRID_API_KEY not configured. Email disabled.');
    } else {
      sendgridMail.setApiKey(apiKey);
      console.log('SendGrid key loaded:', this.config.get('SENDGRID_API_KEY'));
    }
  }

  private get sender() {
    return {
      email: this.config.get<string>('SENDGRID_SENDER_EMAIL')!,
      name: this.config.get<string>('SENDGRID_SENDER_NAME') || 'FarmShare',
    };
  }

  async send(to: string, subject: string, html: string) {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      this.logger.warn('Email service disabled. Skipping email send.');
      return;
    }

    try {
      await sendgridMail.send({ to, from: this.sender, subject, html });
      this.logger.log(`Email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error.stack);
      throw error;
    }
  }

  // ---------- Helper Methods ----------
  async sendOtpEmail(email: string, name: string | null, otp: string) {
    const userName = name || 'User';
    const html = `
      <div>
        <h2>Hello ${userName},</h2>
        <p>Your verification code is: <strong>${otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `;
    await this.send(email, 'Verify Your Email', html);
  }

  async sendPasswordResetEmail(
    email: string,
    name: string | null,
    resetToken: string,
  ) {
    const userName = name || 'User';
    const resetUrl = `${this.config.get('FRONTEND_URL')}/reset-password?token=${resetToken}&email=${email}`;
    const html = `
      <div>
        <h2>Hello ${userName},</h2>
        <p>Click below to reset your password:</p>
        <p><a href="${resetUrl}">Reset Password</a></p>
      </div>
    `;
    await this.send(email, 'Password Reset Request', html);
  }

  async sendRoleChangedEmail(
    email: string,
    name: string | null,
    newRole: string,
  ) {
    const userName = name || 'User';
    const html = `
      <div>
        <h2>Hello ${userName},</h2>
        <p>Your role has been updated to <strong>${newRole}</strong>.</p>
        <p>Regards,<br>The Admin Team</p>
      </div>
    `;
    await this.send(email, 'Role Changed', html);
  }

  async sendReceipt(
    user: { email?: string; name?: string },
    details: ReceiptDetails,
  ) {
    const { email } = user;
    if (!email) {
      this.logger.warn('No email provided — skipping receipt email.');
      return;
    }

    const {
      amount,
      poolName,
      transactionId,
      subscriptionId,
      slots,
      deliveryFee,
      date,
      type = 'subscription',
    } = details;

    const totalAmount = amount + (deliveryFee || 0);
    const userName = user.name || 'User';

    // Dynamic subject and heading based on transaction type
    const subjectMap: Record<string, string> = {
      subscription: 'Slots Subscription Receipt',
      refund: 'Refund Receipt',
      delivery: 'Delivery Receipt',
    };
    const subject = `Receipt: ${subjectMap[type] || 'Transaction'} for ${poolName}`;

    // Build the HTML body
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Hello ${userName},</h2>
        <p>Thank you for your recent ${type} transaction.</p>
  
        <h3>Transaction Details:</h3>
        <p><strong>Pool:</strong> ${poolName}</p>
        <p><strong>Slots:</strong> ${slots}</p>
        <p><strong>Item Price:</strong> ₦${amount.toLocaleString()}</p>
        ${deliveryFee > 0 ? `<p><strong>Delivery Fee:</strong> ₦${deliveryFee.toLocaleString()}</p>` : ''}
        <p><strong>Total Paid:</strong> ₦${totalAmount.toLocaleString()}</p>
  
        ${transactionId ? `<p><strong>Transaction ID:</strong> ${transactionId}</p>` : ''}
        <p><strong>Subscription ID:</strong> ${subscriptionId}</p>
        ${date ? `<p><strong>Date:</strong> ${date}</p>` : ''}
  
        <br />
        <p>We appreciate your trust in <strong>FarmShare</strong>.</p>
        <p>Warm regards,<br/>The FarmShare Team</p>
      </div>
    `;

    try {
      await this.send(email, subject, html);
      this.logger.log(`📧 Receipt email sent to ${email}: ${subject}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to send receipt email to ${email}`,
        error.stack,
      );
      throw error;
    }
  }
}
