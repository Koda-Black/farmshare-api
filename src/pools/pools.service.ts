import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service'; // Adjust path if needed
import { CreatePoolDto } from './dto/create-pool.dto';
import { SubscribeDto } from './dto/subscribe.dto';

@Injectable()
export class PoolsService {
  constructor(private prisma: PrismaService) {}

  async create(createPoolDto: CreatePoolDto) {
    return this.prisma.pool.create({ data: createPoolDto });
  }

  async findAll() {
    const pools = await this.prisma.pool.findMany({
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    return pools.map((pool) => {
      const subscribedSlots = pool._count.subscriptions;
      return {
        ...pool,
        slotsLeft: pool.totalSlots - subscribedSlots,
      };
    });
  }

  async findOne(id: string) {
    const pool = await this.prisma.pool.findUnique({
      where: { id },
      include: {
        subscriptions: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!pool) {
      throw new NotFoundException(`Pool with ID ${id} not found`);
    }

    const subscribedSlots = pool.subscriptions.reduce(
      (acc, sub) => acc + sub.slots,
      0,
    );

    return {
      ...pool,
      slotsLeft: pool.totalSlots - subscribedSlots,
    };
  }

  async subscribe(userId: string, subscribeDto: SubscribeDto) {
    const { poolId, slots } = subscribeDto;

    const pool = await this.prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) {
      throw new NotFoundException(`Pool with ID ${poolId} not found`);
    }

    const existingSubscription = await this.prisma.subscription.findUnique({
      where: { poolId_userId: { poolId, userId } },
    });

    if (existingSubscription) {
      return this.prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: { slots: existingSubscription.slots + slots },
      });
    }

    return this.prisma.subscription.create({
      data: {
        userId,
        poolId,
        slots,
      },
    });
  }

  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      include: { pool: true },
    });
  }
}
