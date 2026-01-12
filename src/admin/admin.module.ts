import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../services/prisma.service';
import { PaystackService } from '../services/paystack.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    PrismaService,
    PaystackService,
    EmailChannelService,
    RolesGuard,
    ConfigService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
