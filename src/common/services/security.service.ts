// ============================================================================
// FILE: src/common/services/security.service.ts
// PURPOSE: Centralized security service for rate limiting, lockouts, and replay prevention
// ============================================================================

import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';

/**
 * SecurityService handles:
 * - OTP attempt tracking and account lockout
 * - Payment rate limiting
 * - Webhook replay prevention
 */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  // Configuration constants
  private readonly OTP_MAX_ATTEMPTS = 5;
  private readonly OTP_LOCKOUT_MINUTES = 15;
  private readonly OTP_RATE_LIMIT_PER_MINUTE = 5;

  private readonly PAYMENT_MAX_INITIATIONS_PER_HOUR = 5;
  private readonly PAYMENT_MAX_FAILURES_BEFORE_BLOCK = 3;
  private readonly PAYMENT_BLOCK_DURATION_MINUTES = 30;

  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // OTP RATE LIMITING & ACCOUNT LOCKOUT
  // ============================================================================

  /**
   * Check if OTP verification is allowed for this email
   * Throws HttpException with 429 status if locked out or rate limited
   */
  async checkOtpRateLimit(email: string, ipAddress?: string): Promise<void> {
    const attempt = await this.prisma.otpAttempt.findUnique({
      where: { email },
    });

    if (attempt) {
      // Check if account is locked
      if (attempt.lockedUntil && new Date() < attempt.lockedUntil) {
        const remainingMinutes = Math.ceil(
          (attempt.lockedUntil.getTime() - Date.now()) / 60000,
        );
        this.logger.warn(
          `OTP locked for email ${email}, ${remainingMinutes} minutes remaining`,
        );
        throw new HttpException(
          `Too many failed attempts. Please try again in ${remainingMinutes} minutes.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Check rate limit (requests per minute)
      const oneMinuteAgo = new Date(Date.now() - 60000);
      if (
        attempt.lastAttempt > oneMinuteAgo &&
        attempt.attempts >= this.OTP_RATE_LIMIT_PER_MINUTE
      ) {
        this.logger.warn(`OTP rate limit exceeded for email ${email}`);
        throw new HttpException(
          'Too many requests. Please wait a minute before trying again.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /**
   * Record a failed OTP attempt
   * Locks account after max attempts
   */
  async recordFailedOtpAttempt(
    email: string,
    ipAddress?: string,
  ): Promise<void> {
    const attempt = await this.prisma.otpAttempt.upsert({
      where: { email },
      create: {
        email,
        ipAddress,
        attempts: 1,
        lastAttempt: new Date(),
      },
      update: {
        attempts: { increment: 1 },
        lastAttempt: new Date(),
        ipAddress: ipAddress || undefined,
      },
    });

    // Check if should lock account
    if (attempt.attempts >= this.OTP_MAX_ATTEMPTS) {
      const lockedUntil = new Date(
        Date.now() + this.OTP_LOCKOUT_MINUTES * 60000,
      );
      await this.prisma.otpAttempt.update({
        where: { email },
        data: { lockedUntil },
      });
      this.logger.warn(
        `Account locked for email ${email} until ${lockedUntil.toISOString()}`,
      );
    }
  }

  /**
   * Clear OTP attempts on successful verification
   */
  async clearOtpAttempts(email: string): Promise<void> {
    await this.prisma.otpAttempt.deleteMany({
      where: { email },
    });
    this.logger.log(`Cleared OTP attempts for email ${email}`);
  }

  // ============================================================================
  // PAYMENT RATE LIMITING
  // ============================================================================

  /**
   * Check if user can initiate a payment
   * Throws if rate limited or blocked
   */
  async checkPaymentRateLimit(userId: string): Promise<void> {
    const rateLimit = await this.prisma.paymentRateLimit.findUnique({
      where: { userId },
    });

    if (rateLimit) {
      // Check if blocked
      if (rateLimit.blockedUntil && new Date() < rateLimit.blockedUntil) {
        const remainingMinutes = Math.ceil(
          (rateLimit.blockedUntil.getTime() - Date.now()) / 60000,
        );
        this.logger.warn(
          `Payment blocked for user ${userId}, ${remainingMinutes} minutes remaining`,
        );
        throw new HttpException(
          `Payment temporarily blocked due to failed attempts. Please try again in ${remainingMinutes} minutes.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Check hourly rate limit
      const oneHourAgo = new Date(Date.now() - 3600000);
      if (rateLimit.windowStart > oneHourAgo) {
        if (rateLimit.initiations >= this.PAYMENT_MAX_INITIATIONS_PER_HOUR) {
          this.logger.warn(`Payment rate limit exceeded for user ${userId}`);
          throw new HttpException(
            'Maximum payment attempts reached. Please try again in an hour.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }
  }

  /**
   * Record a payment initiation
   */
  async recordPaymentInitiation(userId: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 3600000);

    await this.prisma.paymentRateLimit.upsert({
      where: { userId },
      create: {
        userId,
        initiations: 1,
        windowStart: new Date(),
      },
      update: {
        initiations: {
          increment: 1,
        },
        // Reset window if it's been more than an hour
        windowStart: new Date(),
      },
    });
  }

  /**
   * Record a failed payment
   * Blocks user after max failures
   */
  async recordPaymentFailure(userId: string): Promise<void> {
    const rateLimit = await this.prisma.paymentRateLimit.upsert({
      where: { userId },
      create: {
        userId,
        failedAttempts: 1,
      },
      update: {
        failedAttempts: { increment: 1 },
      },
    });

    if (rateLimit.failedAttempts >= this.PAYMENT_MAX_FAILURES_BEFORE_BLOCK) {
      const blockedUntil = new Date(
        Date.now() + this.PAYMENT_BLOCK_DURATION_MINUTES * 60000,
      );
      await this.prisma.paymentRateLimit.update({
        where: { userId },
        data: { blockedUntil, failedAttempts: 0 },
      });
      this.logger.warn(
        `User ${userId} blocked from payments until ${blockedUntil.toISOString()}`,
      );
    }
  }

  /**
   * Clear payment failures on success
   */
  async clearPaymentFailures(userId: string): Promise<void> {
    await this.prisma.paymentRateLimit.updateMany({
      where: { userId },
      data: { failedAttempts: 0, blockedUntil: null },
    });
  }

  // ============================================================================
  // WEBHOOK REPLAY PREVENTION
  // ============================================================================

  /**
   * Check if a webhook event has already been processed
   * Returns true if already processed (duplicate)
   */
  async isWebhookProcessed(
    provider: string,
    eventId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.webhookEvent.findUnique({
      where: {
        provider_eventId: { provider, eventId },
      },
    });

    if (existing) {
      this.logger.warn(`Duplicate webhook detected: ${provider}/${eventId}`);
      return true;
    }

    return false;
  }

  /**
   * Mark a webhook event as processed
   */
  async markWebhookProcessed(
    provider: string,
    eventId: string,
    eventType: string,
    signature?: string,
  ): Promise<void> {
    await this.prisma.webhookEvent.create({
      data: {
        provider,
        eventId,
        eventType,
        signature,
      },
    });
    this.logger.log(`Webhook marked as processed: ${provider}/${eventId}`);
  }

  /**
   * Cleanup old webhook events (keep last 30 days)
   */
  async cleanupOldWebhookEvents(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.webhookEvent.deleteMany({
      where: {
        processedAt: { lt: thirtyDaysAgo },
      },
    });
    this.logger.log(`Cleaned up ${result.count} old webhook events`);
    return result.count;
  }

  /**
   * Cleanup old OTP attempts (keep last 24 hours)
   */
  async cleanupOldOtpAttempts(): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.prisma.otpAttempt.deleteMany({
      where: {
        updatedAt: { lt: oneDayAgo },
        lockedUntil: { lt: new Date() },
      },
    });
    this.logger.log(`Cleaned up ${result.count} old OTP attempts`);
    return result.count;
  }
}
