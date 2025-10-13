import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { TransactionType, TransactionStatus, PoolStatus } from '@prisma/client';
import Decimal from 'decimal.js';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  private readonly COMMISSION_RATE = 0.05; // 5% platform commission

  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
  ) {}

  async createEscrowEntry(poolId: string, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        pool: true,
        user: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Check if escrow entry exists
    let escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId },
    });

    const amountPaid = Number(subscription.amountPaid);

    if (!escrow) {
      // Create new escrow entry
      escrow = await this.prisma.escrowEntry.create({
        data: {
          poolId,
          totalHeld: amountPaid,
          computations: {
            contributions: {
              [subscription.userId]: amountPaid,
            },
          },
        },
      });
    } else {
      // Update existing escrow
      const contributions = (escrow.computations as any)?.contributions || {};
      contributions[subscription.userId] =
        (contributions[subscription.userId] || 0) + amountPaid;

      await this.prisma.escrowEntry.update({
        where: { id: escrow.id },
        data: {
          totalHeld: Number(escrow.totalHeld) + amountPaid,
          computations: {
            contributions,
          },
        },
      });
    }

    // Create transaction record
    await this.prisma.transaction.create({
      data: {
        userId: subscription.userId,
        poolId,
        amount: amountPaid,
        fees: 0, // Calculate Paystack/Stripe fees
        status: TransactionStatus.SUCCESS,
        type: TransactionType.ESCROW_HOLD,
        externalTxnId: subscription.paymentRef,
        metadata: {
          subscriptionId: subscription.id,
          slots: subscription.slots,
        },
      },
    });

    this.logger.log(
      `Escrow entry created/updated for pool ${poolId}, subscription ${subscriptionId}`,
    );

    return escrow;
  }

  async getEscrowDetails(poolId: string) {
    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId },
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
            subscriptions: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow entry not found');
    }

    // Calculate commission
    const totalHeld = Number(escrow.totalHeld);
    const commission = new Decimal(totalHeld)
      .mul(this.COMMISSION_RATE)
      .toNumber();
    const netForVendor = new Decimal(totalHeld).sub(commission).toNumber();

    return {
      escrow: {
        id: escrow.id,
        poolId: escrow.poolId,
        totalHeld,
        releasedAmount: Number(escrow.releasedAmount),
        withheldAmount: Number(escrow.withheldAmount),
        withheldReason: escrow.withheldReason,
        computations: escrow.computations,
      },
      calculations: {
        commission,
        netForVendor,
        commissionRate: this.COMMISSION_RATE,
      },
      pool: escrow.pool,
    };
  }

  async releaseEscrow(poolId: string, reason?: string) {
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
      throw new NotFoundException('Pool not found');
    }

    // Check if pool is filled
    if (
      pool.status !== PoolStatus.FILLED &&
      pool.status !== PoolStatus.IN_DELIVERY
    ) {
      throw new BadRequestException(
        'Pool must be filled before escrow release',
      );
    }

    // Check if there are blocking disputes
    if (pool.disputes && pool.disputes.length > 0) {
      throw new BadRequestException('Cannot release escrow with open disputes');
    }

    // Check delivery deadline + 24h grace period
    if (pool.deliveryDeadlineUtc) {
      const gracePeriodEnd = new Date(
        pool.deliveryDeadlineUtc.getTime() + 24 * 60 * 60 * 1000,
      );
      if (new Date() < gracePeriodEnd) {
        throw new BadRequestException(
          'Cannot release escrow before grace period ends',
        );
      }
    }

    // Get escrow entry
    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow entry not found');
    }

    // Calculate amounts
    const totalHeld = Number(escrow.totalHeld);
    const withheldAmount = Number(escrow.withheldAmount);
    const releaseableAmount =
      totalHeld - withheldAmount - Number(escrow.releasedAmount);

    if (releaseableAmount <= 0) {
      throw new BadRequestException('No amount available for release');
    }

    const commission = new Decimal(releaseableAmount)
      .mul(this.COMMISSION_RATE)
      .toNumber();
    const netForVendor = new Decimal(releaseableAmount)
      .sub(commission)
      .toNumber();

    // TODO: Integrate with Paystack transfer API to send funds to vendor
    // For now, mark as released

    await this.prisma.$transaction(async (tx) => {
      // Update escrow entry
      await tx.escrowEntry.update({
        where: { id: escrow.id },
        data: {
          releasedAmount: Number(escrow.releasedAmount) + releaseableAmount,
        },
      });

      // Create release transaction
      await tx.transaction.create({
        data: {
          userId: pool.vendorId,
          poolId,
          amount: netForVendor,
          fees: commission,
          status: TransactionStatus.SUCCESS,
          type: TransactionType.ESCROW_RELEASE,
          metadata: {
            reason: reason || 'Automatic release after grace period',
            commission,
            originalAmount: releaseableAmount,
          },
        },
      });

      // Update pool status
      await tx.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.COMPLETED },
      });
    });

    // Send notification to vendor
    await this.emailChannel.send(
      pool.vendor.email,
      'Escrow Released',
      `Your escrow for pool ${poolId} has been released. Amount: ₦${netForVendor.toLocaleString()}`,
    );

    this.logger.log(`Escrow released for pool ${poolId}: ₦${netForVendor}`);

    return {
      message: 'Escrow released successfully',
      amountReleased: netForVendor,
      commission,
      transactionId: escrow.id,
    };
  }

  async partialRelease(poolId: string, releaseMap: Record<string, number>) {
    // For handling partial disputes where some buyers are satisfied
    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId },
      include: { pool: true },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow entry not found');
    }

    const contributions = (escrow.computations as any)?.contributions || {};
    let totalToRelease = 0;

    // Validate release amounts
    for (const [userId, amount] of Object.entries(releaseMap)) {
      if (amount > contributions[userId]) {
        throw new BadRequestException(
          `Release amount for user ${userId} exceeds their contribution`,
        );
      }
      totalToRelease += amount;
    }

    const commission = new Decimal(totalToRelease)
      .mul(this.COMMISSION_RATE)
      .toNumber();
    const netForVendor = new Decimal(totalToRelease).sub(commission).toNumber();

    await this.prisma.$transaction(async (tx) => {
      await tx.escrowEntry.update({
        where: { id: escrow.id },
        data: {
          releasedAmount: Number(escrow.releasedAmount) + totalToRelease,
        },
      });

      await tx.transaction.create({
        data: {
          userId: escrow.pool.vendorId,
          poolId,
          amount: netForVendor,
          fees: commission,
          status: TransactionStatus.SUCCESS,
          type: TransactionType.ESCROW_RELEASE,
          metadata: {
            releaseType: 'partial',
            releaseMap,
            commission,
          },
        },
      });
    });

    return {
      message: 'Partial escrow released',
      amountReleased: netForVendor,
      commission,
    };
  }

  async manualRelease(poolId: string, amount: number, reason: string) {
    // Admin override to release escrow manually
    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId },
      include: { pool: { include: { vendor: true } } },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow entry not found');
    }

    const availableAmount =
      Number(escrow.totalHeld) -
      Number(escrow.releasedAmount) -
      Number(escrow.withheldAmount);

    if (amount > availableAmount) {
      throw new BadRequestException('Amount exceeds available escrow balance');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.escrowEntry.update({
        where: { id: escrow.id },
        data: {
          releasedAmount: Number(escrow.releasedAmount) + amount,
        },
      });

      await tx.transaction.create({
        data: {
          userId: escrow.pool.vendorId,
          poolId,
          amount,
          fees: 0,
          status: TransactionStatus.SUCCESS,
          type: TransactionType.ESCROW_RELEASE,
          metadata: {
            releaseType: 'manual',
            reason,
            adminOverride: true,
          },
        },
      });

      // Log admin action
      // TODO: Create AdminAuditLog entry
    });

    await this.emailChannel.send(
      escrow.pool.vendor.email,
      'Manual Escrow Release',
      `Admin has manually released ₦${amount.toLocaleString()} from your escrow. Reason: ${reason}`,
    );

    return {
      message: 'Manual release successful',
      amount,
      reason,
    };
  }

  async manualRefund(transactionId: string, amount: number, reason: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { user: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (amount > Number(transaction.amount)) {
      throw new BadRequestException('Refund amount exceeds transaction amount');
    }

    await this.prisma.$transaction(async (tx) => {
      // Create refund transaction
      await tx.transaction.create({
        data: {
          userId: transaction.userId,
          poolId: transaction.poolId,
          amount,
          fees: 0,
          status: TransactionStatus.SUCCESS,
          type: TransactionType.REFUND,
          externalTxnId: transaction.externalTxnId,
          metadata: {
            originalTransactionId: transactionId,
            reason,
            adminRefund: true,
          },
        },
      });

      // Update escrow if applicable
      if (transaction.poolId) {
        const escrow = await tx.escrowEntry.findFirst({
          where: { poolId: transaction.poolId },
        });

        if (escrow) {
          await tx.escrowEntry.update({
            where: { id: escrow.id },
            data: {
              totalHeld: Number(escrow.totalHeld) - amount,
            },
          });
        }
      }
    });

    // TODO: Integrate with Paystack refund API

    await this.emailChannel.send(
      transaction.user.email,
      'Refund Processed',
      `Your refund of ₦${amount.toLocaleString()} has been processed. Reason: ${reason}`,
    );

    return {
      message: 'Refund processed successfully',
      amount,
      transactionId,
    };
  }

  async withholdEscrow(
    poolId: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow entry not found');
    }

    const availableAmount =
      Number(escrow.totalHeld) -
      Number(escrow.releasedAmount) -
      Number(escrow.withheldAmount);

    if (amount > availableAmount) {
      throw new BadRequestException(
        'Withhold amount exceeds available balance',
      );
    }

    await this.prisma.escrowEntry.update({
      where: { id: escrow.id },
      data: {
        withheldAmount: Number(escrow.withheldAmount) + amount,
        withheldReason: reason,
      },
    });

    this.logger.log(`Withheld ₦${amount} from pool ${poolId}: ${reason}`);
  }
}
