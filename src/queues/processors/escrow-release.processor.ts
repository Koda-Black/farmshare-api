import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EscrowService } from '../../escrow/escrow.service';
import { PrismaService } from '../../services/prisma.service';
import { EmailChannelService } from '../../notifications/channels/email.channel';
import { PoolStatus } from '@prisma/client';

interface EscrowReleaseJobData {
  poolId?: string;
  vendorId?: string;
  triggerType: 'auto' | 'manual' | 'deadline' | 'scheduled';
  reason?: string;
  forceRelease?: boolean;
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
    const { poolId, vendorId, triggerType, reason, forceRelease } = job.data;

    this.logger.log(
      `Processing escrow release job: ${job.id} (${triggerType})`,
    );

    try {
      // Handle job by name instead of trigger type for more granular processing
    switch (job.name) {
        case 'release-pool-escrow':
          if (!poolId) {
            throw new Error('Pool ID is required for pool escrow release');
          }
          return await this.processPoolRelease(poolId, triggerType || 'manual', reason, forceRelease);

        case 'process-scheduled-releases':
          return await this.processScheduledReleases();

        case 'process-vendor-releases':
          if (!vendorId) {
            throw new Error('Vendor ID is required for vendor releases');
          }
          return await this.processVendorReleases(vendorId);

        default:
          throw new Error(`Unknown escrow release job type: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(
        `Escrow release job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async processPoolRelease(
    poolId: string,
    triggerType: string,
    reason?: string,
    forceRelease = false
  ): Promise<any> {
    this.logger.log(`Processing pool release for ${poolId} (${triggerType})`);

    // Get pool details
    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        vendor: true,
        escrowEntries: true,
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
    if (pool.status !== PoolStatus.IN_DELIVERY && pool.status !== PoolStatus.FILLED) {
      this.logger.warn(`Pool ${poolId} not in delivery state. Current: ${pool.status}`);
      return { status: 'skipped', reason: 'invalid_pool_state', poolId };
    }

    // Check for open disputes (unless force release)
    if (!forceRelease && pool.disputes && pool.disputes.length > 0) {
      this.logger.warn(`Pool ${poolId} has ${pool.disputes.length} open disputes. Escrow release blocked.`);
      return { status: 'blocked', reason: 'open_disputes', poolId };
    }

    // Check if escrow exists and is in correct state
    const escrowEntry = pool.escrowEntries.find(e => e.status === 'HELD' || e.status === 'RELEASABLE');
    if (!escrowEntry) {
      this.logger.warn(`No releasable escrow entry found for pool ${poolId}`);
      return { status: 'skipped', reason: 'no_releasable_escrow', poolId };
    }

    try {
      // Use the enhanced escrow service for release
      const result = await this.escrowService.releaseEscrow(
        poolId,
        reason || `Automatic release (${triggerType})`
      );

      this.logger.log(`Escrow released for pool ${poolId}:`, {
        message: result.message,
        amountReleased: result.amountReleased,
        commission: result.commission,
        transactionId: result.transactionId,
      });

      // Send success notification to vendor
      await this.emailChannel.send(
        pool.vendor.email,
        'FarmShare Escrow Released',
        `Your escrow for pool ${poolId} has been released successfully.

Amount Released: ₦${result.amountReleased.toLocaleString()}
Platform Commission: ₦${result.commission.toLocaleString()}
Transaction ID: ${result.transactionId}

The funds have been processed. Thank you for using FarmShare!`,
      );

      return {
        status: 'released',
        poolId,
        message: result.message,
        amountReleased: result.amountReleased,
        commission: result.commission,
        transactionId: result.transactionId,
      };

    } catch (error) {
      this.logger.error(`Failed to release escrow for pool ${poolId}: ${error.message}`);

      // Notify admin about failed release
      await this.notifyAdminAboutFailedRelease(poolId!, error.message);

      throw error;
    }
  }

  private async processScheduledReleases(): Promise<any> {
    this.logger.log('Processing scheduled automatic escrow releases');

    try {
      // Find pools that are ready for automatic release (basic implementation)
      const readyPools = await this.prisma.pool.findMany({
        where: {
          status: 'FILLED',
          deliveryDeadlineUtc: {
            lte: new Date(),
          },
        },
        include: {
          vendor: true,
          escrowEntries: {
            where: {
              status: 'HELD',
            },
          },
        },
      });

      if (readyPools.length === 0) {
        this.logger.log('No pools ready for automatic escrow release');
        return { processed: 0, message: 'No pools ready for release' };
      }

      this.logger.log(`Found ${readyPools.length} pools ready for automatic escrow release`);

      const results: any[] = [];
      for (const pool of readyPools) {
        try {
          if (pool.escrowEntries.length > 0) {
            // For now, just mark as completed (basic implementation)
            this.logger.log(`Pool ${pool.id} is ready for release (manual review needed)`);
            results.push({
              poolId: pool.id,
              success: true,
              message: 'Pool ready for manual release',
            });
          }
        } catch (error) {
          this.logger.error(`Auto release failed for pool ${pool.id}: ${error.message}`);
          results.push({
            poolId: pool.id,
            success: false,
            error: error.message,
          });
        }
      }

      const successfulCount = results.filter(r => r.success).length;
      const failedCount = results.length - successfulCount;

      this.logger.log(`Auto release processing completed: ${successfulCount} successful, ${failedCount} failed`);

      return {
        processed: results.length,
        successful: successfulCount,
        failed: failedCount,
        results,
      };
    } catch (error) {
      this.logger.error(`Failed to process scheduled releases: ${error.message}`);
      throw error;
    }
  }

  private async processVendorReleases(vendorId: string): Promise<any> {
    this.logger.log(`Processing all releases for vendor: ${vendorId}`);

    try {
      // Find all escrow entries for this vendor that are held
      const escrowEntries = await this.prisma.escrowEntry.findMany({
        where: {
          vendorId,
          status: 'HELD',
        },
        include: {
          pool: true,
        },
      });

      if (escrowEntries.length === 0) {
        this.logger.log(`No held escrow entries found for vendor: ${vendorId}`);
        return { success: true, message: 'No funds to release', totalReleased: 0, transferCount: 0 };
      }

      this.logger.log(`Found ${escrowEntries.length} escrow entries for vendor: ${vendorId}`);

      // For now, just log the entries (manual release needed)
      const totalAmount = escrowEntries.reduce((sum, entry) =>
        sum + Number(entry.totalHeld) - Number(entry.releasedAmount), 0
      );

      return {
        success: true,
        message: 'Vendor funds review completed (manual release needed)',
        totalReleased: totalAmount,
        transferCount: escrowEntries.length,
        entries: escrowEntries.map(e => ({
          poolId: e.poolId,
          totalHeld: e.totalHeld,
          releasedAmount: e.releasedAmount,
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to process vendor releases for ${vendorId}: ${error.message}`);
      throw error;
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
    this.notifyAdminAboutFailedRelease(job.data.poolId!, error.message);
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
