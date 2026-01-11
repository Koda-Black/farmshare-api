import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, from, lastValueFrom } from 'rxjs';
import { PRISMA_TRANSACTION_KEY } from 'src/constant';
import { PrismaService } from 'src/services/prisma.service';

// Endpoints that should not use database transactions
const EXCLUDED_PATHS = [
  '/payments/pay',
  '/payments/stripe/webhook',
  '/payments/paystack/webhook',
  '/payments/paystack/verify',
  '/auth/login',
  '/auth/signup',
  '/verification/start',
  '/verification/submit',
];

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(protected prisma: PrismaService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const path = req.path || req.url;

    // Skip transaction for excluded paths
    if (EXCLUDED_PATHS.some(excludedPath => path.includes(excludedPath))) {
      return next.handle();
    }

    return from(
      this.prisma.$transaction(
        async (transactionPrisma) => {
          // attach prisma transaction to the request
          req[PRISMA_TRANSACTION_KEY] = transactionPrisma;

          const observable = this.handleNext(context, next);
          return await lastValueFrom(observable);
        },
        {
          timeout: 90000,
        },
      ),
    );
  }

  protected handleNext(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> {
    return next.handle();
  }
}