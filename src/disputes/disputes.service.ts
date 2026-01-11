// ============================================================================
// FILE: src/disputes/disputes.service.ts (COMPLETE)
// ============================================================================
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { EscrowService } from '../escrow/escrow.service';
import { v2 as cloudinary } from 'cloudinary';
import { streamUpload } from '../utils/cloudinary.helper';
import { TransactionType, TransactionStatus } from '@prisma/client';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);
  private readonly THRESHOLD_PARTIAL_HOLD = 0.25; // 25%
  private readonly THRESHOLD_FULL_HOLD = 0.6; // 60%

  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
    private escrowService: EscrowService,
    @Inject('CLOUDINARY') private cloudinaryClient: typeof cloudinary,
  ) {}

  async createDispute(
    poolId: string,
    raisedByUserId: string,
    reason: string,
    files?: Express.Multer.File[],
  ) {
    // Verify user is a subscriber to the pool
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        poolId,
        userId: raisedByUserId,
      },
    });

    if (!subscription) {
      throw new BadRequestException(
        'You must be a subscriber to raise a dispute',
      );
    }

    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        vendor: true,
        subscriptions: true,
      },
    });

    if (!pool) {
      throw new NotFoundException('Pool not found');
    }

    // Upload evidence files
    let evidenceUrls: string[] = [];
    if (files && files.length > 0) {
      const uploadResults = await Promise.all(
        files.map((file) => streamUpload(this.cloudinaryClient, file.buffer)),
      );
      evidenceUrls = uploadResults.map((result) => result.secure_url);
    }

    // Check if user already has an open dispute
    const existingDispute = await this.prisma.dispute.findFirst({
      where: {
        poolId,
        raisedByUserId,
        status: { in: ['open', 'in_review'] },
      },
    });

    if (existingDispute) {
      throw new BadRequestException(
        'You already have an open dispute for this pool',
      );
    }

    // Create dispute
    const dispute = await this.prisma.dispute.create({
      data: {
        poolId,
        raisedByUserId,
        reason,
        evidenceFiles: evidenceUrls,
        status: 'open',
        complainantCount: 1,
      },
    });

    // Calculate dispute threshold
    const totalSubscribers = pool.subscriptions.length;
    const complainantRatio = 1 / totalSubscribers;

    // Get escrow entry
    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId },
    });

    if (escrow) {
      // Determine withholding strategy
      if (complainantRatio >= this.THRESHOLD_FULL_HOLD) {
        // Hold full escrow
        const availableAmount =
          Number(escrow.totalHeld) -
          Number(escrow.releasedAmount) -
          Number(escrow.withheldAmount);

        await this.escrowService.withholdEscrow(
          poolId,
          availableAmount,
          `Dispute raised: ${dispute.id}`,
        );

        this.logger.log(`Full escrow withheld for pool ${poolId}`);
      } else if (complainantRatio >= this.THRESHOLD_PARTIAL_HOLD) {
        // Hold proportional amount
        const contributions = (escrow.computations as any)?.contributions || {};
        const disputantContribution = contributions[raisedByUserId] || 0;

        await this.escrowService.withholdEscrow(
          poolId,
          disputantContribution,
          `Dispute raised by ${raisedByUserId}`,
        );

        this.logger.log(`Partial escrow withheld for pool ${poolId}`);
      }
    }

    // Notify vendor and admin
    await this.emailChannel.send(
      pool.vendor.email,
      'Dispute Raised',
      `A dispute has been raised for pool ${poolId}. Reason: ${reason}`,
    );

    // TODO: Notify admins via admin notification system

    this.logger.log(`Dispute created: ${dispute.id} for pool ${poolId}`);

    return {
      message: 'Dispute created successfully',
      dispute: {
        id: dispute.id,
        status: dispute.status,
        reason: dispute.reason,
      },
    };
  }

  async getDisputeById(id: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        pool: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            product: true,
          },
        },
        raisedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return dispute;
  }

  async getDisputesByPool(poolId: string) {
    return this.prisma.dispute.findMany({
      where: { poolId },
      include: {
        raisedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingDisputes() {
    return this.prisma.dispute.findMany({
      where: {
        status: { in: ['open', 'in_review'] },
      },
      include: {
        pool: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            product: true,
          },
        },
        raisedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resolveDispute(
    disputeId: string,
    action: 'refund' | 'release' | 'split',
    distribution?: Record<string, number>,
    resolutionNotes?: string,
    adminId?: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        pool: {
          include: {
            vendor: true,
            subscriptions: {
              include: {
                user: true,
              },
            },
          },
        },
        raisedBy: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      throw new BadRequestException('Dispute is already resolved');
    }

    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId: dispute.poolId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow entry not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update dispute status
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolutionNotes: resolutionNotes || `Admin resolution: ${action}`,
          distribution: distribution || {},
        },
      });

      // Execute resolution action
      if (action === 'refund') {
        // Refund the complainant
        const contributions = (escrow.computations as any)?.contributions || {};
        const refundAmount = contributions[dispute.raisedByUserId] || 0;

        // Create refund transaction
        await tx.transaction.create({
          data: {
            userId: dispute.raisedByUserId,
            poolId: dispute.poolId,
            amount: refundAmount,
            fees: 0,
            status: TransactionStatus.SUCCESS,
            type: TransactionType.REFUND,
            metadata: {
              disputeId,
              resolutionType: 'refund',
              reason: resolutionNotes,
            },
          },
        });

        // Update escrow
        await tx.escrowEntry.update({
          where: { id: escrow.id },
          data: {
            withheldAmount: 0,
            withheldReason: null,
            releasedAmount: Number(escrow.releasedAmount) + refundAmount,
          },
        });

        // Send notification
        await this.emailChannel.send(
          dispute.raisedBy.email,
          'Dispute Resolved - Refund Issued',
          `Your dispute has been resolved. A refund of ₦${refundAmount.toLocaleString()} has been issued.`,
        );

        this.logger.log(
          `Refund of ₦${refundAmount} issued for dispute ${disputeId}`,
        );
      } else if (action === 'release') {
        // Release to vendor
        const withheldAmount = Number(escrow.withheldAmount);

        await tx.escrowEntry.update({
          where: { id: escrow.id },
          data: {
            withheldAmount: 0,
            withheldReason: null,
          },
        });

        await this.emailChannel.send(
          dispute.pool.vendor.email,
          'Dispute Resolved - Escrow Released',
          `The dispute has been resolved in your favor. Withheld escrow of ₦${withheldAmount.toLocaleString()} will be released.`,
        );

        this.logger.log(`Escrow released for vendor in dispute ${disputeId}`);
      } else if (action === 'split' && distribution) {
        // Split based on custom distribution
        let totalRefunded = 0;

        for (const [userId, amount] of Object.entries(distribution)) {
          // Create refund transactions
          await tx.transaction.create({
            data: {
              userId,
              poolId: dispute.poolId,
              amount,
              fees: 0,
              status: TransactionStatus.SUCCESS,
              type: TransactionType.REFUND,
              metadata: {
                disputeId,
                resolutionType: 'split',
              },
            },
          });

          totalRefunded += amount;

          // Notify each user
          const user = dispute.pool.subscriptions.find(
            (sub) => sub.userId === userId,
          )?.user;
          if (user) {
            await this.emailChannel.send(
              user.email,
              'Dispute Resolved - Partial Refund',
              `The dispute has been resolved. You have been refunded ₦${amount.toLocaleString()}.`,
            );
          }
        }

        // Update escrow
        await tx.escrowEntry.update({
          where: { id: escrow.id },
          data: {
            withheldAmount: 0,
            withheldReason: null,
            releasedAmount: Number(escrow.releasedAmount) + totalRefunded,
          },
        });

        this.logger.log(
          `Split resolution completed for dispute ${disputeId}. Total refunded: ₦${totalRefunded}`,
        );
      }

      // Create admin audit log
      if (adminId) {
        await tx.adminAuditLog.create({
          data: {
            adminId,
            action: `resolve_dispute_${action}`,
            targetType: 'dispute',
            targetId: disputeId,
            details: {
              action,
              distribution,
              resolutionNotes,
            },
          },
        });
      }
    });

    this.logger.log(`Dispute ${disputeId} resolved with action: ${action}`);

    return {
      message: 'Dispute resolved successfully',
      action,
      disputeId,
    };
  }

  async incrementComplainantCount(poolId: string): Promise<void> {
    // When multiple users raise disputes for the same pool
    await this.prisma.dispute.updateMany({
      where: {
        poolId,
        status: 'open',
      },
      data: {
        complainantCount: {
          increment: 1,
        },
      },
    });

    this.logger.log(`Incremented complainant count for pool ${poolId}`);
  }

  async updateDisputeStatus(
    disputeId: string,
    status: 'open' | 'in_review' | 'resolved' | 'rejected',
    adminId?: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: { status },
    });

    // Log admin action if admin is updating
    if (adminId) {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'update_dispute_status',
          targetType: 'dispute',
          targetId: disputeId,
          details: {
            oldStatus: dispute.status,
            newStatus: status,
          },
        },
      });
    }

    this.logger.log(`Dispute ${disputeId} status updated to ${status}`);

    return {
      message: 'Dispute status updated',
      status,
    };
  }

  async getDisputeStatistics(poolId?: string) {
    const where: any = {};
    if (poolId) {
      where.poolId = poolId;
    }

    const [total, open, inReview, resolved, rejected] = await Promise.all([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.count({ where: { ...where, status: 'open' } }),
      this.prisma.dispute.count({ where: { ...where, status: 'in_review' } }),
      this.prisma.dispute.count({ where: { ...where, status: 'resolved' } }),
      this.prisma.dispute.count({ where: { ...where, status: 'rejected' } }),
    ]);

    return {
      total,
      open,
      inReview,
      resolved,
      rejected,
      resolutionRate: total > 0 ? ((resolved + rejected) / total) * 100 : 0,
    };
  }

  async addDisputeEvidence(
    disputeId: string,
    userId: string,
    files: Express.Multer.File[],
    notes?: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    // Verify user is the one who raised the dispute
    if (dispute.raisedByUserId !== userId) {
      throw new BadRequestException(
        'Only the user who raised the dispute can add evidence',
      );
    }

    if (dispute.status !== 'open' && dispute.status !== 'in_review') {
      throw new BadRequestException('Cannot add evidence to a closed dispute');
    }

    // Upload new evidence files
    const uploadResults = await Promise.all(
      files.map((file) => streamUpload(this.cloudinaryClient, file.buffer)),
    );
    const newEvidenceUrls = uploadResults.map((result) => result.secure_url);

    // Append to existing evidence
    const existingEvidence = dispute.evidenceFiles || [];
    const allEvidence = [...existingEvidence, ...newEvidenceUrls];

    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        evidenceFiles: allEvidence,
        resolutionNotes: notes
          ? `${dispute.resolutionNotes || ''}\nAdditional notes: ${notes}`
          : dispute.resolutionNotes,
      },
    });

    this.logger.log(
      `Added ${newEvidenceUrls.length} evidence files to dispute ${disputeId}`,
    );

    return {
      message: 'Evidence added successfully',
      evidenceCount: allEvidence.length,
    };
  }

  async getDisputesByUser(userId: string) {
    return this.prisma.dispute.findMany({
      where: { raisedByUserId: userId },
      include: {
        pool: {
          include: {
            product: true,
            vendor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDisputesByVendor(vendorId: string) {
    return this.prisma.dispute.findMany({
      where: {
        pool: {
          vendorId,
        },
      },
      include: {
        pool: {
          include: {
            product: true,
          },
        },
        raisedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkDisputeThresholds(poolId: string): Promise<{
    shouldHoldPartial: boolean;
    shouldHoldFull: boolean;
    complainantRatio: number;
  }> {
    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        subscriptions: true,
        disputes: {
          where: {
            status: { in: ['open', 'in_review'] },
          },
        },
      },
    });

    if (!pool) {
      throw new NotFoundException('Pool not found');
    }

    const totalSubscribers = pool.subscriptions.length;
    const activeDisputes = pool.disputes.length;

    if (totalSubscribers === 0) {
      return {
        shouldHoldPartial: false,
        shouldHoldFull: false,
        complainantRatio: 0,
      };
    }

    const complainantRatio = activeDisputes / totalSubscribers;

    return {
      shouldHoldPartial: complainantRatio >= this.THRESHOLD_PARTIAL_HOLD,
      shouldHoldFull: complainantRatio >= this.THRESHOLD_FULL_HOLD,
      complainantRatio,
    };
  }

  async escalateDispute(disputeId: string, escalationNotes: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        pool: {
          include: {
            vendor: true,
          },
        },
        raisedBy: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.status !== 'in_review') {
      await this.prisma.dispute.update({
        where: { id: disputeId },
        data: { status: 'in_review' },
      });
    }

    // Notify all parties about escalation
    await this.emailChannel.send(
      dispute.raisedBy.email,
      'Dispute Escalated',
      `Your dispute (ID: ${disputeId}) has been escalated for review. ${escalationNotes}`,
    );

    await this.emailChannel.send(
      dispute.pool.vendor.email,
      'Dispute Escalated',
      `A dispute for your pool has been escalated for review. ${escalationNotes}`,
    );

    // TODO: Notify admin team

    this.logger.log(`Dispute ${disputeId} escalated`);

    return {
      message: 'Dispute escalated successfully',
      disputeId,
    };
  }

  async rejectDispute(
    disputeId: string,
    rejectionReason: string,
    adminId: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        raisedBy: true,
        pool: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update dispute status
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'rejected',
          resolvedAt: new Date(),
          resolutionNotes: rejectionReason,
        },
      });

      // Release any withheld escrow
      const escrow = await tx.escrowEntry.findFirst({
        where: { poolId: dispute.poolId },
      });

      if (escrow && Number(escrow.withheldAmount) > 0) {
        await tx.escrowEntry.update({
          where: { id: escrow.id },
          data: {
            withheldAmount: 0,
            withheldReason: null,
          },
        });
      }

      // Create audit log
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: 'reject_dispute',
          targetType: 'dispute',
          targetId: disputeId,
          details: {
            rejectionReason,
          },
        },
      });
    });

    // Notify complainant
    await this.emailChannel.send(
      dispute.raisedBy.email,
      'Dispute Rejected',
      `Your dispute has been reviewed and rejected. Reason: ${rejectionReason}`,
    );

    this.logger.log(`Dispute ${disputeId} rejected by admin ${adminId}`);

    return {
      message: 'Dispute rejected',
      disputeId,
    };
  }

  async getDisputeTimeline(disputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        pool: true,
        raisedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    // Get related audit logs
    const auditLogs = await this.prisma.adminAuditLog.findMany({
      where: {
        targetType: 'dispute',
        targetId: disputeId,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Build timeline
    const timeline: {
      event: string;
      timestamp: Date;
      actor: string | null;
      details: {
        reason?: string;
        evidenceCount?: number;
        status?: string;
        notes?: string;
      };
    }[] = [
      {
        event: 'dispute_created',
        timestamp: dispute.createdAt,
        actor: dispute.raisedBy.name,
        details: {
          reason: dispute.reason,
          evidenceCount: dispute.evidenceFiles?.length || 0,
        },
      },
    ];

    // Add audit log events
    auditLogs.forEach((log) => {
      timeline.push({
        event: log.action,
        timestamp: log.createdAt,
        actor: `Admin (${log.adminId})`,
        details:
          (log.details as {
            reason?: string;
            evidenceCount?: number;
            status?: string;
            notes?: string;
          } | null) ?? {},
      });
    });

    // Add resolution event if resolved
    if (dispute.resolvedAt) {
      timeline.push({
        event: 'dispute_resolved',
        timestamp: dispute.resolvedAt,
        actor: 'Admin',
        details: {
          status: dispute.status ?? '',
          notes: dispute.resolutionNotes ?? '',
        },
      });
    }

    return {
      disputeId,
      currentStatus: dispute.status,
      timeline,
    };
  }

  async bulkResolveDisputes(
    disputeIds: string[],
    action: 'refund' | 'release' | 'reject',
    notes: string,
    adminId: string,
  ) {
    const results: { disputeId: string; success: boolean; error?: string }[] =
      [];

    for (const disputeId of disputeIds) {
      try {
        if (action === 'reject') {
          await this.rejectDispute(disputeId, notes, adminId);
        } else {
          await this.resolveDispute(
            disputeId,
            action,
            undefined,
            notes,
            adminId,
          );
        }

        results.push({
          disputeId,
          success: true,
        });
      } catch (error) {
        this.logger.error(
          `Failed to resolve dispute ${disputeId}`,
          error.stack,
        );
        results.push({
          disputeId,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    this.logger.log(
      `Bulk resolved ${successCount}/${disputeIds.length} disputes`,
    );

    return {
      total: disputeIds.length,
      successful: successCount,
      failed: disputeIds.length - successCount,
      results,
    };
  }

  async getDisputeMetrics(startDate?: Date, endDate?: Date) {
    const where: any = {};

    if (startDate) {
      where.createdAt = { gte: startDate };
    }

    if (endDate) {
      where.createdAt = {
        ...where.createdAt,
        lte: endDate,
      };
    }

    const [
      totalDisputes,
      resolvedDisputes,
      rejectedDisputes,
      openDisputes,
      averageResolutionTime,
    ] = await Promise.all([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.count({
        where: { ...where, status: 'resolved' },
      }),
      this.prisma.dispute.count({
        where: { ...where, status: 'rejected' },
      }),
      this.prisma.dispute.count({
        where: { ...where, status: { in: ['open', 'in_review'] } },
      }),
      this.calculateAverageResolutionTime(where),
    ]);

    const resolutionRate =
      totalDisputes > 0
        ? ((resolvedDisputes + rejectedDisputes) / totalDisputes) * 100
        : 0;

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      totalDisputes,
      resolvedDisputes,
      rejectedDisputes,
      openDisputes,
      resolutionRate: Math.round(resolutionRate * 100) / 100,
      averageResolutionTimeHours: averageResolutionTime,
    };
  }

  private async calculateAverageResolutionTime(where: any): Promise<number> {
    const resolvedDisputes = await this.prisma.dispute.findMany({
      where: {
        ...where,
        status: { in: ['resolved', 'rejected'] },
        resolvedAt: { not: null },
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    if (resolvedDisputes.length === 0) return 0;

    const totalHours = resolvedDisputes.reduce((sum, dispute) => {
      const diff = dispute.resolvedAt!.getTime() - dispute.createdAt.getTime();
      return sum + diff / (1000 * 60 * 60); // Convert to hours
    }, 0);

    return Math.round(totalHours / resolvedDisputes.length);
  }

  /**
   * Raiser marks dispute as resolved from their side.
   * When both raiser and vendor agree, dispute auto-resolves and funds are released.
   */
  async markRaiserResolved(disputeId: string, userId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        pool: {
          include: {
            vendor: true,
          },
        },
        raisedBy: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.raisedByUserId !== userId) {
      throw new BadRequestException(
        'Only the dispute raiser can mark this as resolved',
      );
    }

    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      throw new BadRequestException('Dispute is already closed');
    }

    // Update raiser resolution status
    const updatedDispute = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        raiserResolved: true,
        raiserResolvedAt: new Date(),
      },
    });

    this.logger.log(`Raiser marked dispute ${disputeId} as resolved`);

    // Check if both parties have resolved
    if (updatedDispute.vendorResolved) {
      return this.autoResolveDispute(disputeId);
    }

    // Notify vendor
    await this.emailChannel.send(
      dispute.pool.vendor.email,
      'Dispute Resolution Progress',
      `The buyer has marked dispute ${disputeId} as resolved from their side. Please mark it as resolved from your side to complete the resolution.`,
    );

    return {
      message:
        'Dispute marked as resolved by raiser. Awaiting vendor confirmation.',
      disputeId,
      raiserResolved: true,
      vendorResolved: updatedDispute.vendorResolved,
    };
  }

  /**
   * Vendor marks dispute as resolved from their side.
   * When both raiser and vendor agree, dispute auto-resolves and funds are released.
   */
  async markVendorResolved(disputeId: string, userId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        pool: {
          include: {
            vendor: true,
          },
        },
        raisedBy: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.pool.vendorId !== userId) {
      throw new BadRequestException(
        'Only the pool vendor can mark this as resolved',
      );
    }

    if (dispute.status === 'resolved' || dispute.status === 'rejected') {
      throw new BadRequestException('Dispute is already closed');
    }

    // Update vendor resolution status
    const updatedDispute = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        vendorResolved: true,
        vendorResolvedAt: new Date(),
      },
    });

    this.logger.log(`Vendor marked dispute ${disputeId} as resolved`);

    // Check if both parties have resolved
    if (updatedDispute.raiserResolved) {
      return this.autoResolveDispute(disputeId);
    }

    // Notify raiser
    await this.emailChannel.send(
      dispute.raisedBy.email,
      'Dispute Resolution Progress',
      `The vendor has marked dispute ${disputeId} as resolved from their side. Please mark it as resolved from your side to complete the resolution.`,
    );

    return {
      message:
        'Dispute marked as resolved by vendor. Awaiting buyer confirmation.',
      disputeId,
      raiserResolved: updatedDispute.raiserResolved,
      vendorResolved: true,
    };
  }

  /**
   * Auto-resolve dispute when both parties agree.
   * Releases withheld escrow funds to vendor.
   */
  private async autoResolveDispute(disputeId: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        pool: {
          include: {
            vendor: true,
          },
        },
        raisedBy: true,
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    // Get escrow entry
    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId: dispute.poolId },
    });

    await this.prisma.$transaction(async (tx) => {
      // Update dispute status
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolutionNotes: 'Auto-resolved: Both parties agreed to resolution.',
        },
      });

      // Release withheld escrow if exists
      if (escrow && Number(escrow.withheldAmount) > 0) {
        const withheldAmount = Number(escrow.withheldAmount);

        await tx.escrowEntry.update({
          where: { id: escrow.id },
          data: {
            withheldAmount: 0,
            withheldReason: null,
          },
        });

        this.logger.log(
          `Released withheld escrow of ₦${withheldAmount} for dispute ${disputeId}`,
        );
      }
    });

    // Notify both parties
    await Promise.all([
      this.emailChannel.send(
        dispute.raisedBy.email,
        'Dispute Resolved',
        `Your dispute has been successfully resolved as both parties agreed. The pool will proceed as normal.`,
      ),
      this.emailChannel.send(
        dispute.pool.vendor.email,
        'Dispute Resolved',
        `The dispute has been successfully resolved as both parties agreed. Any withheld funds will be released.`,
      ),
    ]);

    this.logger.log(`Dispute ${disputeId} auto-resolved by mutual agreement`);

    return {
      message: 'Dispute auto-resolved by mutual agreement',
      disputeId,
      status: 'resolved',
      resolution: 'mutual_agreement',
    };
  }
}
