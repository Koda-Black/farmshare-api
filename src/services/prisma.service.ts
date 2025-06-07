import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private logger = new Logger();
  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (error) {
      Sentry.captureException(error, { extra: { phase: 'prisma_connect' } });
      this.logger.error('Failed to connect to database', error.stack);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
