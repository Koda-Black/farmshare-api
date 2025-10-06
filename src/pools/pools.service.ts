import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { VerificationStatus, Role } from '@prisma/client';
import { CreatePoolDto } from './dto/create-pool.dto';
import { UpdatePoolDto } from './dto/update-pool.dto';

@Injectable()
export class PoolsService {
  private readonly logger = new Logger(PoolsService.name);

  constructor(private prisma: PrismaService) {}

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

    // Ensure product exists and is admin managed
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

    const pricePerSlot = priceTotal / slotsCount;

    return this.prisma.pool.create({
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
        maxSlots: (dto as any).maxSlots ?? null,
        minUnitsConstraint: (dto as any).minUnitsConstraint ?? 1,
        timezone: (dto as any).timezone ?? null,
      },
    });
  }

  async findAll() {
    return this.prisma.pool.findMany({
      where: { status: 'ACTIVE' },
    });
  }

  async findOne(id: string) {
    const pool = await this.prisma.pool.findUnique({
      where: { id },
      include: {
        subscriptions: {
          include: { user: true },
        },
      },
    });

    if (!pool) throw new NotFoundException('Pool not found');
    return pool;
  }

  async update(id: string, dto: UpdatePoolDto) {
    return this.prisma.pool.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    const slots = await this.prisma.poolSlot.count({
      where: { poolId: id, status: { in: ['PAID', 'CONFIRMED'] } },
    });
    if (slots > 0) {
      throw new BadRequestException(
        'Pool cannot be deleted after buyers joined',
      );
    }
    return this.prisma.pool.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async deductSlots(poolId: string, slots: number) {
    const pool = await this.findOne(poolId);
    if (pool.slotsLeft < slots) {
      throw new BadRequestException('Not enough slots available');
    }

    const updatedPool = await this.prisma.pool.update({
      where: { id: poolId },
      data: {
        slotsLeft: { decrement: slots },
      },
    });

    if (updatedPool.slotsLeft === 0) {
      await this.autoClonePool(updatedPool.id);
    }

    return updatedPool;
  }

  private async autoClonePool(originalPoolId: string) {
    const original = await this.prisma.pool.findUnique({
      where: { id: originalPoolId },
    });

    if (original) {
      await this.prisma.pool.create({
        data: {
          name: original.name,
          price: original.price,
          totalSlots: original.totalSlots,
          slotsLeft: original.totalSlots,
          category: original.category,
          description: original.description,
          adminId: original.adminId,
          status: 'ACTIVE',
        },
      });
      this.logger.log(`Auto-cloned new pool from ${original.id}`);
    }
  }

  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      include: { pool: true },
    });
  }
}
