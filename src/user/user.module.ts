import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { cloudinaryConfig } from '../config/cloudinary.config';
import { EmailModule } from '../email/email.module'; // if using emailService
import { PrismaModule } from '../../prisma/prisma.module'; // if using PrismaService

@Module({
  imports: [PrismaModule, EmailModule], // Import necessary modules
  controllers: [UserController],
  providers: [UserService, cloudinaryConfig],
})
export class UserModule {}
