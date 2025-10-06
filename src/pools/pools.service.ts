import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { CreatePoolDto } from './dto/create-pool.dto';
import { UpdatePoolDto } from './dto/update-pool.dto';

@Injectable()
export class PoolsService {
  private readonly logger = new Logger(PoolsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePoolDto, adminId: string) {
    return this.prisma.pool.create({
      data: {
        ...dto,
        adminId,
        slotsLeft: dto.totalSlots,
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
    return this.prisma.pool.update({
      where: { id },
      data: { status: 'INACTIVE' },
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
