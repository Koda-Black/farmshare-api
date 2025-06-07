import { Request } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
// import { PRISMA_TRANSACTION_KEY } from './constants';
import * as Sentry from '@sentry/nestjs';
import { PRISMA_TRANSACTION_KEY } from 'src/constant';

export class BaseService {
  constructor(
    private prisma: PrismaClient,
    private request: Request | null,
  ) {}

  protected getClient(): PrismaClient | Prisma.TransactionClient {
    return this.request && PRISMA_TRANSACTION_KEY in this.request
      ? (this.request[PRISMA_TRANSACTION_KEY] as Prisma.TransactionClient)
      : this.prisma;
  }

  protected async reportError(error: any, context: Record<string, any> = {}) {
    Sentry.captureException(error, {
      extra: {
        request: this.request
          ? {
              method: this.request.method,
              url: this.request.url,
              headers: this.request.headers,
            }
          : { message: 'No request context available' },
        ...context,
      },
    });
    throw error;
  }
}