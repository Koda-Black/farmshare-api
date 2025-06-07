import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import envConfiguration, { envValidationSchema } from './config/env.config';
import { PrismaModule } from '../prisma/prisma.module';
import { ThrottlerModule } from '@nestjs/throttler';
// import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HttpModule } from '@nestjs/axios';
import { PoolsModule } from './pools/pools.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
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
    PrismaModule,
    AuthModule,
    UserModule,
    PoolsModule,
    // RedisCacheModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
