// src/pools/pools.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PoolsService } from './pools.service';
import { PoolsController } from './pools.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { StripeModule } from '../stripe/stripe.module';
import { EscrowModule } from '../escrow/escrow.module';
import { EscrowService } from '../escrow/escrow.service';

@Module({
  imports: [
    forwardRef(() => StripeModule),
    PrismaModule,
    NotificationsModule,
    JwtModule,
    EscrowModule,
  ],
  controllers: [PoolsController],
  providers: [PoolsService, EscrowService, EmailChannelService],
  exports: [PoolsService],
})
export class PoolsModule {}
