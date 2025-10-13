import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import { VerificationStatus, Role, PoolStatus } from '@prisma/client';
import { CreatePoolDto } from './dto/create-pool.dto';
import { UpdatePoolDto } from './dto/update-pool.dto';
import Decimal from 'decimal.js';

@Injectable()
export class PoolsService {
  private readonly logger = new Logger(PoolsService.name);

  constructor(
    private prisma: PrismaService,
    private escrowService: EscrowService,
  ) {}

  async create(dto: CreatePoolDto, vendorId: string) {
    // Ensure vendor exists and is verified with bank
    const vendor = await this.prisma.user.findUnique({
      where: { id: vendorId },
    });

    if (!vendor || vendor.role !== Role.VENDOR) {
      throw new BadRequestException('Only verified vendors can create pools');
    }

    if (
      vendor.verificationStatus !== VerificationStatus.VERIFIED ||
      !vendor.bankVerified
    ) {
      throw new BadRequestException('Vendor must be verified with bank linked');
    }

    // Ensure product exists and is active
    const product = await this.prisma.productCatalog.findUnique({
      where: { id: (dto as any).productId },
    });

    if (!product || !product.active) {
      throw new BadRequestException('Product not available');
    }

    const priceTotal = (dto as any).priceTotal as number;
    const slotsCount = (dto as any).slotsCount as number;

    if (!priceTotal || !slotsCount || slotsCount <= 0) {
      throw new BadRequestException('Invalid price or slotsCount');
    }

    // Calculate price per slot
    const pricePerSlot = new Decimal(priceTotal).div(slotsCount).toNumber();

    // Validate minimum units constraint
    const minUnitsConstraint = (dto as any).minUnitsConstraint || 1;
    if (minUnitsConstraint < 1) {
      throw new BadRequestException(
        'Minimum units constraint must be at least 1',
      );
    }

    const pool = await this.prisma.pool.create({
      data: {
        vendorId,
        productId: (dto as any).productId,
        priceTotal,
        slotsCount,
        pricePerSlot,
        commissionRate: (dto as any).commissionRate ?? 0.05,
        allowHomeDelivery: (dto as any).allowHomeDelivery ?? false,
        homeDeliveryCost: (dto as any).homeDeliveryCost ?? null,
        lockAfterFirstJoin: true,
        maxSlots: (dto as any).maxSlots ?? slotsCount,
        minUnitsConstraint,
        timezone: (dto as any).timezone ?? 'Africa/Lagos',
        status: PoolStatus.OPEN,
      },
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
    });

    this.logger.log(`Pool created: ${pool.id} by vendor ${vendorId}`);

    return pool;
  }

  async findAll(filters?: {
    status?: PoolStatus;
    category?: string;
    vendorId?: string;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    } else {
      // Default to showing only OPEN pools
      where.status = PoolStatus.OPEN;
    }

    if (filters?.category) {
      where.product = {
        category: filters.category,
      };
    }

    if (filters?.vendorId) {
      where.vendorId = filters.vendorId;
    }

    const pools = await this.prisma.pool.findMany({
      where,
      include: {
        product: true,
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        subscriptions: {
          select: {
            id: true,
            slots: true,
            userId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate remaining slots for each pool
    return pools.map((pool) => {
      const takenSlots = pool.subscriptions.reduce(
        (sum, sub) => sum + sub.slots,
        0,
      );
      const slotsLeft = pool.slotsCount - takenSlots;
      const fillPercentage = (takenSlots / pool.slotsCount) * 100;

      return {
        ...pool,
        takenSlots,
        slotsLeft,
        fillPercentage: Math.round(fillPercentage),
      };
    });
  }

  async findOne(id: string) {
    const pool = await this.prisma.pool.findUnique({
      where: { id },
      include: {
        product: true,
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            bankVerified: true,
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
        disputes: {
          where: {
            status: { in: ['open', 'in_review'] },
          },
        },
      },
    });

    if (!pool) throw new NotFoundException('Pool not found');

    const takenSlots = pool.subscriptions.reduce(
      (sum, sub) => sum + sub.slots,
      0,
    );
    const slotsLeft = pool.slotsCount - takenSlots;
    const fillPercentage = (takenSlots / pool.slotsCount) * 100;

    return {
      ...pool,
      takenSlots,
      slotsLeft,
      fillPercentage: Math.round(fillPercentage),
    };
  }

  async update(id: string, dto: UpdatePoolDto, userId: string) {
    const pool = await this.prisma.pool.findUnique({
      where: { id },
      include: {
        subscriptions: {
          where: {
            paymentMethod: { in: ['STRIPE', 'PAYSTACK'] },
          },
        },
      },
    });

    if (!pool) throw new NotFoundException('Pool not found');

    // Check ownership
    if (pool.vendorId !== userId) {
      throw new BadRequestException('You can only update your own pools');
    }

    // Prevent updates if pool is locked (has paid subscribers)
    if (pool.lockAfterFirstJoin && pool.subscriptions.length > 0) {
      throw new BadRequestException(
        'Cannot modify pool after buyers have joined',
      );
    }

    return this.prisma.pool.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, userId: string) {
    const pool = await this.prisma.pool.findUnique({
      where: { id },
      include: {
        subscriptions: true,
        slots: {
          where: {
            status: { in: ['PAID', 'CONFIRMED'] },
          },
        },
      },
    });

    if (!pool) throw new NotFoundException('Pool not found');

    // Check ownership
    if (pool.vendorId !== userId) {
      throw new BadRequestException('You can only delete your own pools');
    }

    // Check if any slots are paid
    if (pool.slots && pool.slots.length > 0) {
      throw new BadRequestException(
        'Pool cannot be deleted after buyers have paid',
      );
    }

    // Soft delete by setting status to CANCELLED
    return this.prisma.pool.update({
      where: { id },
      data: { status: PoolStatus.CANCELLED },
    });
  }

  async joinPool(
    poolId: string,
    userId: string,
    slots: number,
    addHomeDelivery: boolean = false,
  ) {
    // Use transaction with row-level locking to prevent race conditions
    return this.prisma.$transaction(
      async (tx) => {
        // Lock the pool row
        const pool = await tx.pool.findUnique({
          where: { id: poolId },
          include: {
            product: true,
            vendor: true,
          },
        });

        if (!pool) {
          throw new NotFoundException('Pool not found');
        }

        if (pool.status !== PoolStatus.OPEN) {
          throw new BadRequestException('Pool is not open for subscriptions');
        }

        // Calculate taken slots atomically
        const takenSlots = await tx.subscription.aggregate({
          where: { poolId },
          _sum: { slots: true },
        });

        const currentTaken = takenSlots._sum.slots || 0;
        const available = pool.slotsCount - currentTaken;

        if (slots > available) {
          throw new BadRequestException(
            `Only ${available} slots available, you requested ${slots}`,
          );
        }

        // Calculate payment amount
        let totalAmount = new Decimal(pool.pricePerSlot).mul(slots).toNumber();

        if (
          addHomeDelivery &&
          pool.allowHomeDelivery &&
          pool.homeDeliveryCost
        ) {
          totalAmount = new Decimal(totalAmount)
            .add(pool.homeDeliveryCost)
            .toNumber();
        }

        // Create pool slot reservation
        const poolSlot = await tx.poolSlot.create({
          data: {
            poolId,
            buyerId: userId,
            slotsReserved: slots,
            unitCount: slots,
            amountPaid: totalAmount,
            status: 'PENDING_PAYMENT',
          },
        });

        return {
          poolSlot,
          pool,
          totalAmount,
          paymentRequired: true,
        };
      },
      {
        isolationLevel: 'Serializable', // Prevent race conditions
      },
    );
  }

  async confirmPayment(poolSlotId: string, subscriptionId: string) {
    await this.prisma.$transaction(async (tx) => {
      // Update pool slot status
      await tx.poolSlot.update({
        where: { id: poolSlotId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          paymentId: subscriptionId,
        },
      });

      // Get pool slot with pool info
      const poolSlot = await tx.poolSlot.findUnique({
        where: { id: poolSlotId },
        include: {
          pool: {
            include: {
              subscriptions: true,
            },
          },
        },
      });

      if (!poolSlot) return;

      // Check if this is the first paid slot - lock the pool
      const paidSlots = await tx.poolSlot.count({
        where: {
          poolId: poolSlot.poolId,
          status: { in: ['PAID', 'CONFIRMED'] },
        },
      });

      if (paidSlots === 1 && poolSlot.pool.lockAfterFirstJoin) {
        await tx.pool.update({
          where: { id: poolSlot.poolId },
          data: { lockAfterFirstJoin: true },
        });
        this.logger.log(`Pool ${poolSlot.poolId} locked after first payment`);
      }

      // Check if pool is now full
      const totalTaken = poolSlot.pool.subscriptions.reduce(
        (sum, sub) => sum + sub.slots,
        0,
      );

      if (totalTaken >= poolSlot.pool.slotsCount) {
        await this.markPoolFilled(poolSlot.poolId, tx);
      }
    });
  }

  private async markPoolFilled(poolId: string, tx?: any) {
    const prisma = tx || this.prisma;

    const filledAt = new Date();
    const deliveryDeadlineUtc = new Date(
      filledAt.getTime() + 14 * 24 * 60 * 60 * 1000, // 14 days from fill
    );

    await prisma.pool.update({
      where: { id: poolId },
      data: {
        status: PoolStatus.FILLED,
        filledAt,
        deliveryDeadlineUtc,
      },
    });

    this.logger.log(
      `Pool ${poolId} marked as FILLED. Delivery deadline: ${deliveryDeadlineUtc}`,
    );

    // TODO: Trigger notification to vendor and buyers
    // TODO: Schedule auto-release job for deadline + 24h
  }

  async markPoolInDelivery(poolId: string) {
    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
    });

    if (!pool) throw new NotFoundException('Pool not found');

    if (pool.status !== PoolStatus.FILLED) {
      throw new BadRequestException(
        'Pool must be filled before marking as in delivery',
      );
    }

    return this.prisma.pool.update({
      where: { id: poolId },
      data: { status: PoolStatus.IN_DELIVERY },
    });
  }

  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
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

  async getVendorPools(vendorId: string) {
    return this.findAll({ vendorId });
  }

  async checkAndTriggerAutoRelease() {
    // Scheduled job to check pools that have passed deadline + 24h grace
    const gracePeriodEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const pools = await this.prisma.pool.findMany({
      where: {
        status: PoolStatus.IN_DELIVERY,
        deliveryDeadlineUtc: {
          lte: gracePeriodEnd,
        },
      },
      include: {
        disputes: {
          where: {
            status: { in: ['open', 'in_review'] },
          },
        },
      },
    });

    for (const pool of pools) {
      if (pool.disputes.length === 0) {
        try {
          await this.escrowService.releaseEscrow(
            pool.id,
            'Automatic release after grace period',
          );
          this.logger.log(`Auto-released escrow for pool ${pool.id}`);
        } catch (error) {
          this.logger.error(
            `Failed to auto-release escrow for pool ${pool.id}`,
            error.stack,
          );
        }
      } else {
        this.logger.log(
          `Skipped auto-release for pool ${pool.id} due to open disputes`,
        );
      }
    }

    return {
      processed: pools.length,
      timestamp: new Date(),
    };
  }
}
