// src/stripe/stripe.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { StripeService } from '../services/stripe.service';
import { CurrencyService } from 'src/services/currency.service';
// import { StripeController } from './stripe.controller';
import { ConfigModule } from '@nestjs/config';
import { PoolsModule } from '../pools/pools.module';

@Module({
  imports: [forwardRef(() => PoolsModule), ConfigModule],
  //   controllers: [StripeController],
  providers: [StripeService, CurrencyService],
  exports: [StripeService, CurrencyService],
})
export class StripeModule {}
