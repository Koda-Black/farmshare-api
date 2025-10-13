import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { StripeService } from '../services/stripe.service';
import { PaystackService } from '../services/paystack.service';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { SmsChannelService } from '../notifications/channels/sms.channel';
import { EscrowService } from '../escrow/escrow.service';
import { PoolsService } from '../pools/pools.service';
import { PaymentStatus, PaymentGateway } from '@prisma/client';
import { ReceiptDetails } from '../notifications/interfaces/receipt.interface';

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
    private email: EmailChannelService,
    private sms: SmsChannelService,
    private escrowService: EscrowService,
    private poolsService: PoolsService,
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

    if (pool.status !== 'OPEN') {
      throw new BadRequestException('Pool is not open for subscriptions');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Calculate delivery fee
    const deliveryFee = waybillWithin ? 5000 : waybillOutside ? 10000 : 0;

    // Check if home delivery is allowed
    if (deliveryFee > 0 && !pool.allowHomeDelivery) {
      throw new BadRequestException(
        'Home delivery not available for this pool',
      );
    }

    // Calculate total amount
    const itemCost = Number(pool.pricePerSlot) * slots;
    const total = itemCost + deliveryFee;

    // Create pending subscription
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
      userId,
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

      return { method: 'STRIPE', url: session.url, pendingId: pending.id };
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
        pendingId: pending.id,
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

    if (!pending) throw new NotFoundException('Pending subscription not found');

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

  async handlePaystackWebhook(req: any) {
    const signature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY as string;
    const crypto = await import('crypto');
    const computed = crypto
      .createHmac('sha512', secret)
      .update(req.body)
      .digest('hex');

    if (computed !== signature) {
      throw new BadRequestException('Invalid Paystack signature');
    }

    const body = JSON.parse(req.body.toString());

    if (body?.event === 'charge.success') {
      const reference = body?.data?.reference;
      const res = await this.paystack.verify(reference);
      const { pendingId } = res.metadata;

      await this.finalize(pendingId);
    }

    return { received: true };
  }

  async finalize(pendingId: string) {
    const pending = await this.prisma.pendingSubscription.findUnique({
      where: { id: pendingId },
      include: {
        pool: {
          include: {
            product: true,
            vendor: true,
          },
        },
        user: true,
      },
    });

    if (!pending || pending.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Invalid or already processed');
    }

    const subscription = await this.prisma.$transaction(async (tx) => {
      // Verify slot availability atomically
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

      // Update pending status
      await tx.pendingSubscription.update({
        where: { id: pendingId },
        data: { status: PaymentStatus.SUCCESS },
      });

      // Create escrow entry
      await this.escrowService.createEscrowEntry(
        pending.poolId,
        subscription.id,
      );

      // Check if pool is now filled
      if (slotsTaken + pending.slots === pool.slotsCount) {
        await tx.pool.update({
          where: { id: pending.poolId },
          data: {
            status: 'FILLED',
            filledAt: new Date(),
          },
        });

        // Calculate delivery deadline (14 days from fill)
        const deliveryDeadline = new Date();
        deliveryDeadline.setDate(deliveryDeadline.getDate() + 14);

        await tx.pool.update({
          where: { id: pending.poolId },
          data: {
            deliveryDeadlineUtc: deliveryDeadline,
          },
        });

        this.logger.log(
          `Pool ${pending.poolId} filled. Delivery deadline: ${deliveryDeadline}`,
        );
      }

      // Confirm payment in pools service
      await this.poolsService.confirmPayment(subscription.id, subscription.id);

      return subscription;
    });

    // ---------- SEND RECEIPTS (EMAIL + SMS) ----------
    const totalAmount =
      Number(pending.pool.pricePerSlot) * pending.slots +
      Number(pending.deliveryFee);
    const productName = pending.pool?.product?.name ?? 'Pool';

    const receiptDetails = {
      amount: Number(pending.pool.pricePerSlot) * pending.slots,
      poolName: productName,
      transactionId: pending.stripeSessionId || pending.paystackRef || '',
      subscriptionId: subscription.id,
      email: pending.user.email,
      slots: pending.slots,
      deliveryFee: Number(pending.deliveryFee), // ✅ fixed
      type: 'subscription' as const,
    };

    // ✅ Normalize user data (convert null → undefined)
    const userForEmail = {
      email: pending.user.email,
      name: pending.user.name ?? undefined,
    };
    const userForSms = {
      phone: pending.user.phone ?? undefined,
      name: pending.user.name ?? undefined,
    };

    try {
      // ✅ Use unified interface
      await this.email.sendReceipt(userForEmail, receiptDetails);
      await this.sms.sendReceipt(userForSms, receiptDetails);
    } catch (error) {
      this.logger.error('Failed to send receipts', error);
    }

    return { success: true, subscriptionId: subscription.id };
  }
}
