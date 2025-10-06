import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { UpdateUserDto, PaginationDto } from './dto/update-user.dto';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { streamUpload } from '../utils/cloudinary.helper';
import { User } from '@prisma/client';
import { ApiBearerAuth } from '@nestjs/swagger';
import { EmailService } from '../email/email.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    @Inject('CLOUDINARY') private cloudinaryClient: typeof cloudinary,
    private emailService: EmailService,
  ) {}

  getProfile = (userId: string) =>
    this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

  updateProfile = (userId: string, dto: UpdateUserDto) =>
    this.prisma.user.update({ where: { id: userId }, data: dto });

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const result = await streamUpload(this.cloudinaryClient, file.buffer);

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: result.secure_url },
    });
  }
}
