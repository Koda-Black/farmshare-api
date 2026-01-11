// src/verification/verification.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { cloudinaryConfig } from '../config/cloudinary.config';

// Import verification services
import { PaystackVerificationService } from './services/paystack-verification.service';
import { FaceVerificationService } from './services/face-verification.service';
import { DocumentOcrService } from './services/document-ocr.service';
import { CacVerificationService } from './services/cac-verification.service';
import { IdentityVerificationService } from './services/identity-verification.service';

@Module({
  imports: [PrismaModule, NotificationsModule, HttpModule, ConfigModule],
  controllers: [VerificationController],
  providers: [
    VerificationService,
    EmailChannelService,
    PaystackVerificationService,
    FaceVerificationService,
    DocumentOcrService,
    CacVerificationService,
    IdentityVerificationService,
    cloudinaryConfig,
  ],
  exports: [
    VerificationService,
    PaystackVerificationService,
    FaceVerificationService,
    DocumentOcrService,
    CacVerificationService,
    IdentityVerificationService,
  ],
})
export class VerificationModule {}
