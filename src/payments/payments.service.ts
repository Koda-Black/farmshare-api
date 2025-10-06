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

    const pool = await this.prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const deliveryFee = waybillWithin ? 5000 : waybillOutside ? 10000 : 0;
    const total = pool.price * slots + deliveryFee;

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
        pool.name,
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
      include: { pool: true, user: true },
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
      // Check slot availability atomically
      const pool = await tx.pool.findUnique({
        where: { id: pending.poolId },
      });

      if (!pool || pool.slotsLeft < pending.slots) {
        await tx.pendingSubscription.update({
          where: { id: pendingId },
          data: { status: PaymentStatus.FAILED },
        });
        throw new BadRequestException('Not enough slots available');
      }

      // Update pool slots
      const updatedPool = await tx.pool.update({
        where: { id: pending.poolId },
        data: { slotsLeft: { decrement: pending.slots } },
      });

      // Create subscription
      const subscription = await tx.subscription.create({
        data: {
          userId: pending.userId,
          poolId: pending.poolId,
          slots: pending.slots,
          amountPaid: pending.pool.price * pending.slots + pending.deliveryFee,
          deliveryFee: pending.deliveryFee,
          paymentMethod: pending.gateway,
          paymentRef: pending.stripeSessionId || pending.paystackRef || '',
        },
      });

      // Update pending status
      await tx.pendingSubscription.update({
        where: { id: pendingId },
        data: { status: PaymentStatus.SUCCESS },
      });

      return subscription;
    });

    // Auto-clone pool if slots are exhausted
    const updatedPool = await this.prisma.pool.findUnique({
      where: { id: pending.poolId },
    });

    if (updatedPool && updatedPool.slotsLeft === 0) {
      await this.prisma.pool.create({
        data: {
          name: updatedPool.name,
          price: updatedPool.price,
          totalSlots: updatedPool.totalSlots,
          slotsLeft: updatedPool.totalSlots,
          category: updatedPool.category,
          description: updatedPool.description,
          adminId: updatedPool.adminId,
          status: 'ACTIVE',
        },
      });
    }

    // Send receipts
    const totalAmount =
      pending.pool.price * pending.slots + pending.deliveryFee;
    const receiptMessage = `Your FarmShare subscription:\nPool: ${pending.pool.name}\nSlots: ${pending.slots}\nAmount: ₦${totalAmount.toLocaleString()}\nID: ${sub.id}`;

    try {
      await this.email.sendSubscriptionReceipt(
        sub.id,
        pending.pool.name,
        pending.user.email,
        pending.slots,
        pending.pool.price * pending.slots,
        pending.deliveryFee,
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
