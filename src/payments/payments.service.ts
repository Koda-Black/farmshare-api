import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { StripeService } from '../services/stripe.service';
import { PaystackService } from '../services/paystack.service';
import { EmailService } from '../email/email.service';
import { WhatsappService } from '../services/whatsapp.service';
import { PaymentStatus, PaymentGateway } from '@prisma/client';

export enum PaymentMethod {
  STRIPE = 'STRIPE',
  PAYSTACK = 'PAYSTACK',
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
    private paystack: PaystackService,
    private email: EmailService,
    private whatsapp: WhatsappService,
  ) {}

  async init(opts: {
    method: PaymentMethod;
    userId: string;
    poolId: string;
    slots: number;
    waybillWithin: boolean;
    waybillOutside: boolean;
  }) {
    const { method, userId, poolId, slots, waybillWithin, waybillOutside } =
      opts;

    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      include: { product: true },
    });
    if (!pool) throw new NotFoundException('Pool not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const deliveryFee = waybillWithin ? 5000 : waybillOutside ? 10000 : 0;
    const total = Number(pool.pricePerSlot) * slots + deliveryFee;

    const pending = await this.prisma.pendingSubscription.create({
      data: {
        userId,
        poolId,
        slots,
        deliveryFee,
        status: PaymentStatus.PENDING,
        gateway:
          opts.method === PaymentMethod.STRIPE
            ? PaymentGateway.STRIPE
            : PaymentGateway.PAYSTACK,
      },
    });

    const metadata = {
      pendingId: pending.id,
      poolId,
      slots,
      deliveryFee,
      email: user.email,
    };

    if (method === PaymentMethod.STRIPE) {
      const session = await this.stripe.createSession(
        userId,
        pending.id,
        total,
        pool.product?.name || 'FarmShare Pool',
      );
      await this.prisma.pendingSubscription.update({
        where: { id: pending.id },
        data: { stripeSessionId: session.id },
      });
      return { method: 'STRIPE', url: session.url };
    } else {
      const result = await this.paystack.initialize(total, metadata);
      await this.prisma.pendingSubscription.update({
        where: { id: pending.id },
        data: { paystackRef: result.reference },
      });
      return {
        method: 'PAYSTACK',
        url: result.authorization_url,
        reference: result.reference,
      };
    }
  }

  async verifyPaystack(reference: string) {
    const res = await this.paystack.verify(reference);
    const { pendingId } = res.metadata;
    const pending = await this.prisma.pendingSubscription.findUnique({
      where: { id: pendingId },
      include: { pool: { include: { product: true } }, user: true },
    });

    if (!pending) throw new NotFoundException('Pending not found');

    return this.finalize(pendingId);
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.constructEvent(rawBody, signature);
    if (event.type === 'checkout.session.completed') {
      const session: any = event.data.object;
      const pendingId = session.metadata.subscriptionId;
      await this.finalize(pendingId);
    }
    return { received: true };
  }

  async finalize(pendingId: string) {
    const pending = await this.prisma.pendingSubscription.findUnique({
      where: { id: pendingId },
      include: { pool: true, user: true },
    });

    if (!pending || pending.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Invalid or already processed');
    }

    const sub = await this.prisma.$transaction(async (tx) => {
      // Check slot availability atomically via aggregate of existing subscriptions
      const pool = await tx.pool.findUnique({
        where: { id: pending.poolId },
      });

      if (!pool) {
        await tx.pendingSubscription.update({
          where: { id: pendingId },
          data: { status: PaymentStatus.FAILED },
        });
        throw new BadRequestException('Pool not found');
      }

      const taken = await tx.subscription.aggregate({
        where: { poolId: pending.poolId },
        _sum: { slots: true },
      });
      const slotsTaken = taken._sum.slots ?? 0;
      if (slotsTaken + pending.slots > pool.slotsCount) {
        await tx.pendingSubscription.update({
          where: { id: pendingId },
          data: { status: PaymentStatus.FAILED },
        });
        throw new BadRequestException('Not enough slots available');
      }

      // Create subscription
      const subscription = await tx.subscription.create({
        data: {
          userId: pending.userId,
          poolId: pending.poolId,
          slots: pending.slots,
          amountPaid:
            Number(pending.pool.pricePerSlot) * pending.slots +
            Number(pending.deliveryFee),
          deliveryFee: pending.deliveryFee,
          paymentMethod: pending.gateway,
          paymentRef: pending.stripeSessionId || pending.paystackRef || '',
        },
      });

      // Mark filled if capacity reached
      if (slotsTaken + pending.slots === pool.slotsCount) {
        await tx.pool.update({
          where: { id: pending.poolId },
          data: { status: 'FILLED', filledAt: new Date() },
        });
      }

      // Update pending status
      await tx.pendingSubscription.update({
        where: { id: pendingId },
        data: { status: PaymentStatus.SUCCESS },
      });

      return subscription;
    });

    // Auto-clone is not supported in the new model; handled by admin/workers if needed

    // Send receipts
    const totalAmount =
      Number((pending as any).pool.pricePerSlot) * pending.slots +
      Number(pending.deliveryFee);
    const productName =
      ((pending as any).pool?.product?.name as string) ?? 'Pool';
    const receiptMessage = `Your FarmShare subscription:\nPool: ${productName}\nSlots: ${pending.slots}\nAmount: ₦${totalAmount.toLocaleString()}\nID: ${sub.id}`;

    try {
      await this.email.sendSubscriptionReceipt(
        sub.id,
        productName,
        pending.user.email,
        pending.slots,
        Number(pending.pool.pricePerSlot) * pending.slots,
        Number(pending.deliveryFee),
      );

      if (pending.user.phone) {
        await this.whatsapp.sendSubscriptionReceipt(
          pending.user.phone,
          receiptMessage,
        );
      }
    } catch (error) {
      this.logger.error('Failed to send receipts', error);
    }

    return { success: true };
  }
}
