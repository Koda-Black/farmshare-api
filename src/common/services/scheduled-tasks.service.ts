// ============================================================================
// FILE: src/common/services/scheduled-tasks.service.ts
// PURPOSE: Centralized scheduled tasks for security cleanup and maintenance
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SecurityService } from './security.service';
import { PrismaService } from '../../services/prisma.service';

/**
 * ScheduledTasksService handles all periodic maintenance tasks:
 * - Cleanup old OTP attempts
 * - Cleanup old webhook events
 * - Reset payment rate limit windows
 * - Cleanup expired pending subscriptions
 * - Auto-release eligible escrows
 */
@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private securityService: SecurityService,
    private prisma: PrismaService,
  ) {}

  /**
   * Run every hour - clean up old security data
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupSecurityData() {
    this.logger.log('Running hourly security cleanup...');

    try {
      // Clean old OTP attempts (older than 24 hours and not locked)
      const otpCount = await this.securityService.cleanupOldOtpAttempts();
      this.logger.log(`Cleaned up ${otpCount} old OTP attempts`);

      // Clean old webhook events (older than 30 days)
      const webhookCount = await this.securityService.cleanupOldWebhookEvents();
      this.logger.log(`Cleaned up ${webhookCount} old webhook events`);
    } catch (error) {
      this.logger.error('Security cleanup failed:', error);
    }
  }

  /**
   * Run every 6 hours - reset expired payment rate limit windows
   */
  @Cron('0 */6 * * *')
  async resetExpiredPaymentLimits() {
    this.logger.log('Resetting expired payment rate limits...');

    try {
      const oneHourAgo = new Date(Date.now() - 3600000);

      const result = await this.prisma.paymentRateLimit.updateMany({
        where: {
          windowStart: { lt: oneHourAgo },
        },
        data: {
          initiations: 0,
          windowStart: new Date(),
        },
      });

      this.logger.log(`Reset ${result.count} payment rate limit windows`);
    } catch (error) {
      this.logger.error('Payment rate limit reset failed:', error);
    }
  }

  /**
   * Run daily at 2 AM - cleanup expired pending subscriptions
   */
  @Cron('0 2 * * *')
  async cleanupExpiredPendingSubscriptions() {
    this.logger.log('Cleaning up expired pending subscriptions...');

    try {
      // Pending subscriptions older than 24 hours are stale
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Use FAILED status as PaymentStatus doesn't have EXPIRED
      const result = await this.prisma.pendingSubscription.updateMany({
        where: {
          createdAt: { lt: twentyFourHoursAgo },
          status: 'PENDING',
        },
        data: {
          status: 'FAILED',
        },
      });

      this.logger.log(`Expired ${result.count} stale pending subscriptions`);
    } catch (error) {
      this.logger.error('Pending subscription cleanup failed:', error);
    }
  }

  /**
   * Run every 15 minutes - check and release eligible escrows
   * Escrows become releasable 7 days after delivery confirmation
   */
  @Cron('*/15 * * * *')
  async processEscrowReleases() {
    this.logger.log('Checking for eligible escrow releases...');

    try {
      // Find escrows ready for release (RELEASABLE status, releaseAt in the past)
      const eligibleEscrows = await this.prisma.escrowEntry.findMany({
        where: {
          status: 'RELEASABLE',
          releaseAt: { lte: new Date() },
        },
        include: {
          pool: {
            include: {
              vendor: true,
              disputes: {
                where: { status: { in: ['open', 'in_review'] } },
              },
            },
          },
        },
      });

      this.logger.log(
        `Found ${eligibleEscrows.length} escrows ready for release`,
      );

      for (const escrow of eligibleEscrows) {
        // Skip if there are open disputes
        if (escrow.pool.disputes && escrow.pool.disputes.length > 0) {
          this.logger.log(`Skipping escrow ${escrow.id} - has open disputes`);
          continue;
        }

        // Queue the escrow release job
        // The actual release is handled by escrow service to ensure proper transfer
        this.logger.log(
          `Queueing release for escrow ${escrow.id} (pool ${escrow.poolId})`,
        );

        // Mark as processing to prevent duplicate releases
        await this.prisma.escrowEntry.update({
          where: { id: escrow.id },
          data: { status: 'PROCESSING' },
        });
      }
    } catch (error) {
      this.logger.error('Escrow release processing failed:', error);
    }
  }

  /**
   * Run weekly on Sunday at 3 AM - cleanup old system metrics
   */
  @Cron('0 3 * * 0')
  async cleanupOldMetrics() {
    this.logger.log('Cleaning up old system metrics...');

    try {
      // Keep metrics for last 90 days
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const result = await this.prisma.systemMetric.deleteMany({
        where: {
          timestamp: { lt: ninetyDaysAgo },
        },
      });

      this.logger.log(`Cleaned up ${result.count} old system metrics`);
    } catch (error) {
      this.logger.error('Metrics cleanup failed:', error);
    }
  }

  /**
   * Run every 5 minutes - collect system health metrics
   */
  @Cron('*/5 * * * *')
  async collectHealthMetrics() {
    try {
      const now = new Date();

      // Collect various system metrics
      const [activeUsers, pendingPayments, heldEscrows, openDisputes] =
        await Promise.all([
          this.prisma.user.count({
            where: {
              lastActive: { gte: new Date(now.getTime() - 15 * 60 * 1000) },
            },
          }),
          this.prisma.pendingSubscription.count({
            where: { status: 'PENDING' },
          }),
          this.prisma.escrowEntry.count({
            where: { status: 'HELD' },
          }),
          this.prisma.dispute.count({
            where: { status: { in: ['open', 'in_review'] } },
          }),
        ]);

      // Store metrics
      await this.prisma.systemMetric.createMany({
        data: [
          { metricName: 'active_users_15m', metricValue: activeUsers },
          { metricName: 'pending_payments', metricValue: pendingPayments },
          { metricName: 'held_escrows', metricValue: heldEscrows },
          { metricName: 'open_disputes', metricValue: openDisputes },
        ],
      });
    } catch (error) {
      this.logger.error('Health metrics collection failed:', error);
    }
  }
}
