import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { UpdateUserDto, PaginationDto } from './dto/update-user.dto';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { streamUpload } from '../utils/cloudinary.helper';
import { User } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { EmailChannelService } from '../notifications/channels/email.channel';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    @Inject('CLOUDINARY') private cloudinaryClient: typeof cloudinary,
    private emailChannel: EmailChannelService,
  ) {}

  getProfile = async (userId: string) => {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        isVerified: true,
        phone: true,
        businessRegistrationNumber: true,
      },
    });

    if (!user) return null;

    // Fetch business information from verification details
    const businessVerification = await this.prisma.verification.findFirst({
      where: {
        userId,
        step: 'business_reg',
        status: 'VERIFIED',
      },
      select: {
        details: true,
      },
    });

    // Extract business details from verification
    const businessDetails = businessVerification?.details as any;
    const businessName =
      businessDetails?.companyName || businessDetails?.businessName;
    const businessAddress =
      businessDetails?.address || businessDetails?.businessAddress;

    return {
      ...user,
      businessName,
      businessAddress,
    };
  };

  updateProfile = (userId: string, dto: UpdateUserDto) =>
    this.prisma.user.update({ where: { id: userId }, data: dto });

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const result = await streamUpload(this.cloudinaryClient, file.buffer);

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: result.secure_url },
    });
  }

  async getTopVendors(state?: string, limit: number = 10) {
    // Get verified vendors with their pool statistics
    const vendors = await this.prisma.user.findMany({
      where: {
        role: 'VENDOR',
        isVerified: true,
        ...(state && { state }),
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        state: true,
        city: true,
        isVerified: true,
        createdAt: true,
        _count: {
          select: {
            pools: true,
          },
        },
      },
      orderBy: {
        pools: {
          _count: 'desc',
        },
      },
      take: limit,
    });

    // Get subscription stats for each vendor
    const vendorsWithStats = await Promise.all(
      vendors.map(async (vendor) => {
        // Get total subscriptions for this vendor's pools
        const subscriptionStats = await this.prisma.subscription.aggregate({
          where: {
            pool: {
              vendorId: vendor.id,
            },
          },
          _count: true,
        });

        return {
          ...vendor,
          poolCount: vendor._count.pools,
          totalSubscribers: subscriptionStats._count || 0,
        };
      }),
    );

    return vendorsWithStats;
  }
}
