// src/notifications/channels/email.channel.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  NotificationChannel,
  ReceiptDetails,
} from '../interfaces/receipt.interface';

@Injectable()
export class EmailChannelService {
  private readonly logger = new Logger(EmailChannelService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Always use production SMTP (getfitness.space) since Brevo account is deleted
    const host = this.config.get<string>('EMAIL_HOST');
    const port = this.config.get<number>('EMAIL_PORT') || 465;
    const user = this.config.get<string>('EMAIL_USERNAME');
    const pass = this.config.get<string>('EMAIL_PASSWORD');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP not configured. Email disabled.');
      this.logger.warn(
        'Set EMAIL_HOST, EMAIL_USERNAME, EMAIL_PASSWORD in .env',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: { user, pass },
    });

    this.logger.log(`Email configured with SMTP: ${host}:${port}`);
  }

  private get sender() {
    return {
      email:
        this.config.get<string>('EMAIL_FROM') || 'no-reply@getfitness.space',
      name: this.config.get<string>('EMAIL_SENDER_NAME') || 'FarmShare',
    };
  }

  async send(to: string, subject: string, html: string) {
    if (!this.transporter) {
      this.logger.warn('Email service disabled. Skipping email send.');
      return;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.sender.name}" <${this.sender.email}>`,
        to,
        subject,
        html,
      });
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🌱 FarmShare</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937;">Hello ${userName},</h2>
          <p style="color: #4b5563; font-size: 16px;">Your verification code is:</p>
          <div style="background: #22c55e; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; letter-spacing: 8px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code will expire in <strong>10 minutes</strong>.</p>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">© $(date +%Y) FarmShare. All rights reserved.</p>
        </div>
      </div>
    `;
    await this.send(email, 'Verify Your Email - FarmShare', html);
  }

  async sendPasswordResetEmail(
    email: string,
    name: string | null,
    resetToken: string,
  ) {
    const userName = name || 'User';
    const resetUrl = `${this.config.get('FRONTEND_URL')}/reset-password?token=${resetToken}&email=${email}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🌱 FarmShare</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937;">Hello ${userName},</h2>
          <p style="color: #4b5563; font-size: 16px;">You requested to reset your password. Click the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #22c55e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email.</p>
          <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">© $(date +%Y) FarmShare. All rights reserved.</p>
        </div>
      </div>
    `;
    await this.send(email, 'Password Reset Request - FarmShare', html);
  }

  async sendRoleChangedEmail(
    email: string,
    name: string | null,
    newRole: string,
  ) {
    const userName = name || 'User';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🌱 FarmShare</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937;">Hello ${userName},</h2>
          <p style="color: #4b5563; font-size: 16px;">Your account role has been updated to:</p>
          <div style="background: #dbeafe; color: #1e40af; font-size: 24px; font-weight: bold; text-align: center; padding: 15px; border-radius: 8px; margin: 20px 0; text-transform: capitalize;">
            ${newRole}
          </div>
          <p style="color: #6b7280; font-size: 14px;">If you have any questions, please contact our support team.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">© $(date +%Y) FarmShare. All rights reserved.</p>
        </div>
      </div>
    `;
    await this.send(email, 'Role Changed - FarmShare', html);
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

    const subjectMap: Record<string, string> = {
      subscription: 'Slots Subscription Receipt',
      refund: 'Refund Receipt',
      delivery: 'Delivery Receipt',
    };
    const subject = `Receipt: ${subjectMap[type] || 'Transaction'} for ${poolName}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🌱 FarmShare</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Payment Receipt</p>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937;">Hello ${userName},</h2>
          <p style="color: #4b5563; font-size: 16px;">Thank you for your ${type} transaction.</p>
          
          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #1f2937; margin-top: 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px;">Transaction Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Pool:</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right; font-weight: 500;">${poolName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Slots:</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right; font-weight: 500;">${slots}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Item Price:</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right; font-weight: 500;">₦${amount.toLocaleString()}</td>
              </tr>
              ${
                deliveryFee > 0
                  ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Delivery Fee:</td>
                <td style="padding: 8px 0; color: #1f2937; text-align: right; font-weight: 500;">₦${deliveryFee.toLocaleString()}</td>
              </tr>
              `
                  : ''
              }
              <tr style="border-top: 2px solid #22c55e;">
                <td style="padding: 12px 0; color: #1f2937; font-weight: bold; font-size: 18px;">Total Paid:</td>
                <td style="padding: 12px 0; color: #22c55e; text-align: right; font-weight: bold; font-size: 18px;">₦${totalAmount.toLocaleString()}</td>
              </tr>
            </table>
          </div>
          
          <div style="background: #f3f4f6; border-radius: 8px; padding: 15px; margin: 20px 0;">
            ${transactionId ? `<p style="margin: 5px 0; color: #6b7280; font-size: 14px;"><strong>Transaction ID:</strong> ${transactionId}</p>` : ''}
            <p style="margin: 5px 0; color: #6b7280; font-size: 14px;"><strong>Subscription ID:</strong> ${subscriptionId}</p>
            ${date ? `<p style="margin: 5px 0; color: #6b7280; font-size: 14px;"><strong>Date:</strong> ${date}</p>` : ''}
          </div>
          
          <p style="color: #4b5563; font-size: 16px;">We appreciate your trust in FarmShare! 🌾</p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">© $(date +%Y) FarmShare. All rights reserved.</p>
        </div>
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

  /**
   * Send a custom email with arbitrary subject and HTML content.
   * Used by newsletter and other custom email needs.
   */
  async sendCustomEmail(
    to: string,
    subject: string,
    htmlContent: string,
    textContent?: string,
  ): Promise<void> {
    try {
      // If text content is provided, we can include it as a fallback
      // For now, we use the existing send method which handles HTML
      await this.send(to, subject, htmlContent);
      this.logger.log(`📧 Custom email sent to ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to send custom email to ${to}: ${subject}`,
        error.stack,
      );
      throw error;
    }
  }
}
