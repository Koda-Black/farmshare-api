import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EscrowService } from '../../escrow/escrow.service';
import { PrismaService } from '../../services/prisma.service';
import { EmailChannelService } from '../../notifications/channels/email.channel';
import { PoolStatus } from '@prisma/client';

interface EscrowReleaseJobData {
  poolId: string;
  triggerType: 'auto' | 'manual' | 'deadline';
  reason?: string;
}

@Processor('escrow-release')
export class EscrowReleaseProcessor extends WorkerHost {
  private readonly logger = new Logger(EscrowReleaseProcessor.name);

  constructor(
    private escrowService: EscrowService,
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
  ) {
    super();
  }

  async process(job: Job<EscrowReleaseJobData>): Promise<any> {
    const { poolId, triggerType, reason } = job.data;

    this.logger.log(
      `Processing escrow release job: ${job.id} for pool ${poolId} (${triggerType})`,
    );

    try {
      // Get pool details
      const pool = await this.prisma.pool.findUnique({
        where: { id: poolId },
        include: {
          vendor: true,
          disputes: {
            where: {
              status: { in: ['open', 'in_review'] },
            },
          },
        },
      });

      if (!pool) {
        throw new Error(`Pool ${poolId} not found`);
      }

      // Check if pool is in the right state
      if (
        pool.status !== PoolStatus.IN_DELIVERY &&
        pool.status !== PoolStatus.FILLED
      ) {
        this.logger.warn(
          `Pool ${poolId} not in delivery state. Current: ${pool.status}`,
        );
        return { status: 'skipped', reason: 'invalid_pool_state' };
      }

      // Check for open disputes
      if (pool.disputes && pool.disputes.length > 0) {
        this.logger.warn(
          `Pool ${poolId} has ${pool.disputes.length} open disputes. Escrow release blocked.`,
        );
        return { status: 'blocked', reason: 'open_disputes' };
      }

      // Check delivery deadline + 24h grace period
      if (pool.deliveryDeadlineUtc) {
        const gracePeriodEnd = new Date(
          pool.deliveryDeadlineUtc.getTime() + 24 * 60 * 60 * 1000,
        );

        if (new Date() < gracePeriodEnd) {
          this.logger.warn(
            `Pool ${poolId} grace period not ended yet. Deadline: ${gracePeriodEnd}`,
          );
          return { status: 'skipped', reason: 'grace_period_not_ended' };
        }
      }

      // Release escrow
      const result = await this.escrowService.releaseEscrow(
        poolId,
        reason || `Automatic release (${triggerType})`,
      );

      this.logger.log(
        `Escrow released for pool ${poolId}: ₦${result.amountReleased}`,
      );

      // Send success notification to vendor
      await this.emailChannel.send(
        pool.vendor.email,
        'Escrow Released',
        `Your escrow for pool ${poolId} has been released successfully. Amount: ₦${result.amountReleased.toLocaleString()}`,
      );

      return {
        status: 'released',
        poolId,
        amount: result.amountReleased,
      };
    } catch (error) {
      this.logger.error(
        `Escrow release job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error; // Will trigger retry
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<EscrowReleaseJobData>) {
    this.logger.log(
      `Escrow release job ${job.id} completed for pool ${job.data.poolId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<EscrowReleaseJobData>, error: Error) {
    this.logger.error(
      `Escrow release job ${job.id} failed for pool ${job.data.poolId}: ${error.message}`,
      error.stack,
    );

    // Notify admin about failed release
    this.notifyAdminAboutFailedRelease(job.data.poolId, error.message);
  }

  private async notifyAdminAboutFailedRelease(poolId: string, reason: string) {
    try {
      // Get all admin users
      const admins = await this.prisma.user.findMany({
        where: {
          role: { in: ['ADMIN'] },
        },
      });

      for (const admin of admins) {
        await this.emailChannel.send(
          admin.email,
          'Escrow Release Failed - Action Required',
          `Automatic escrow release failed for pool ${poolId}.\n\nReason: ${reason}\n\nPlease review and take manual action if needed.`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to notify admins about release failure', error);
    }
  }
}
