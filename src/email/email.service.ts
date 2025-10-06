// src/email/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sendgridMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (!apiKey) {
      throw new Error('SENDGRID_API_KEY is not defined');
    }
    sendgridMail.setApiKey(apiKey);
  }

  async sendOtpEmail(
    email: string,
    name: string | null,
    otp: string,
  ): Promise<void> {
    const userName = name || 'User';

    const html = `
      <div>
        <h2>Hello ${userName},</h2>
        <p>Your verification code is: <strong>${otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `;

    try {
      await sendgridMail.send({
        to: email,
        from: {
          email: this.configService.get<string>('SENDGRID_SENDER_EMAIL')!,
          name:
            this.configService.get<string>('SENDGRID_SENDER_NAME') ||
            'Your App Name',
        },
        subject: 'Verify Your Email',
        html,
      });

      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}`, error.stack);
      throw new Error('Failed to send OTP email');
    }
  }

  async sendPasswordResetEmail(
    email: string,
    name: string | null,
    resetToken: string,
  ): Promise<void> {
    const userName = name || 'User';
    const resetUrl = `${this.configService.get('FRONTEND_URL')}/reset-password?token=${resetToken}&email=${email}`;

    const html = `
      <div>
        <h2>Hello ${userName},</h2>
        <p>You requested to reset your password. Click the link below to proceed:</p>
        <p><a href="${resetUrl}">Reset Password</a></p>
        <p>This link will expire in 1 hour.</p>
      </div>
    `;

    try {
      await sendgridMail.send({
        to: email,
        from: {
          email: this.configService.get<string>('SENDGRID_SENDER_EMAIL')!,
          name:
            this.configService.get<string>('SENDGRID_SENDER_NAME') ||
            'Your App Name',
        },
        subject: 'Password Reset Request',
        html,
      });

      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}`,
        error.stack,
      );
      throw new Error('Failed to send password reset email');
    }
  }

  async sendEmail(to: string, subject: string, body: string) {
    const from = {
      email: this.configService.get<string>('SENDGRID_SENDER_EMAIL')!,
      name:
        this.configService.get<string>('SENDGRID_SENDER_NAME') || 'Your App',
    };

    const html = `
    <div>
      <p>${body.replace(/\n/g, '<br>')}</p>
    </div>`;

    await sendgridMail.send({ to, from, subject, html });
  }

  async sendRoleChangedEmail(
    email: string,
    name: string | null,
    newRole: string,
  ) {
    const subject = `Your role has been changed to ${newRole}`;
    const body = `Hello ${name || 'User'},\n\n Your role has been updated to : ${newRole} status.\n\nRegards,\nThe Admin Team`;
    await this.sendEmail(email, subject, body);
  }

  async sendSubscriptionReceipt(
    subscriptionId: string,
    poolName: string,
    email: string,
    slots: number,
    amount: number,
    deliveryFee: number,
  ) {
    const totalAmount = amount + deliveryFee;

    const html = `
    <div>
      <h2>Subscription Confirmed</h2>
      <p>Pool: <strong>${poolName}</strong></p>
      <p>Slots: ${slots}</p>
      <p>Item Price: ₦${amount.toLocaleString()}</p>
      ${deliveryFee > 0 ? `<p>Delivery Fee: ₦${deliveryFee.toLocaleString()}</p>` : ''}
      <p>Total Paid: ₦${totalAmount.toLocaleString()}</p>
      <p>Subscription ID: ${subscriptionId}</p>
    </div>
  `;

    try {
      await sendgridMail.send({
        to: email,
        from: {
          email: this.configService.get<string>('SENDGRID_SENDER_EMAIL')!,
          name:
            this.configService.get<string>('SENDGRID_SENDER_NAME') ||
            'FarmShare',
        },
        subject: 'Your Subscription Receipt',
        html,
      });

      this.logger.log(`Receipt sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send receipt to ${email}`, error.stack);
    }
  }
}
