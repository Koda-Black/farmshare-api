import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import envConfiguration, { envValidationSchema } from './config/env.config';
import { PrismaModule } from '../prisma/prisma.module';
import { ThrottlerModule } from '@nestjs/throttler';
// import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { HttpModule } from '@nestjs/axios';
import { RawBodyMiddleware } from './middleware/raw-body.middleware';
import { PoolsModule } from './pools/pools.module';
import { StripeModule } from './stripe/stripe.module';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';
import { VerificationModule } from './verification/verification.module';
import { EscrowModule } from './escrow/escrow.module';
import { DisputesModule } from './disputes/disputes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { QueueModule } from './queues/queue.module';
import { CatalogModule } from './catalog/catalog.module';
import { CommonModule } from './common/common.module';
import { SupportModule } from './support/support.module';
import { NewsletterModule } from './newsletter/newsletter.module';

@Module({
  imports: [
    CommonModule, // Global module with SecurityService, ScheduledTasksService
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [envConfiguration],
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
    AuthModule,
    PoolsModule,
    PrismaModule,
    UserModule,
    StripeModule,
    AdminModule,
    PaymentsModule,
    VerificationModule,
    EscrowModule,
    DisputesModule,
    NotificationsModule,
    CatalogModule,
    SupportModule,
    QueueModule,
    NewsletterModule,
    // RedisCacheModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes({ path: 'stripe/webhook', method: RequestMethod.POST });
  }
}
