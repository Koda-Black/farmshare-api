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
import { NotificationsService } from '../notifications/notifications.service';
import { EscrowService } from '../escrow/escrow.service';
import { PoolsService } from '../pools/pools.service';
import { QueueService } from '../queues/queue.service';
import { SecurityService } from '../common/services/security.service';
import {
  PaymentStatus,
  PaymentGateway,
  NotificationType,
  NotificationMedium,
} from '@prisma/client';
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
    private notificationsService: NotificationsService,
    private escrowService: EscrowService,
    private poolsService: PoolsService,
    private queueService: QueueService,
    private securityService: SecurityService,
  ) {}

  async init(opts: {
    method: PaymentMethod;
    userId: string;
    poolId: string;
    slots: number;
    waybillWithin: boolean;
    waybillOutside: boolean;
    idempotencyKey?: string;
  }) {
    const {
      method,
      userId,
      poolId,
      slots,
      waybillWithin,
      waybillOutside,
      idempotencyKey,
    } = opts;

    // SECURITY: Check payment rate limit before processing
    await this.securityService.checkPaymentRateLimit(userId);
    await this.securityService.recordPaymentInitiation(userId);

    // Generate idempotency key if not provided
    const finalIdempotencyKey =
      idempotencyKey || `pk_${userId}_${poolId}_${Date.now()}`;

    // Check for existing pending subscription with same idempotency key
    if (idempotencyKey) {
      const existingPending = await this.prisma.pendingSubscription.findFirst({
        where: {
          idempotencyKey,
          userId,
          poolId,
          status: { in: [PaymentStatus.PENDING, PaymentStatus.SUCCESS] },
        },
      });

      if (existingPending) {
        this.logger.log(
          `Found existing pending subscription with idempotency key: ${idempotencyKey}`,
        );

        // If already successful, return the existing payment reference
        if (existingPending.status === PaymentStatus.SUCCESS) {
          const existingSubscription = await this.prisma.subscription.findFirst(
            {
              where: {
                userId,
                poolId,
                paymentRef:
                  existingPending.stripeSessionId ||
                  existingPending.paystackRef ||
                  '',
              },
            },
          );

          if (existingSubscription) {
            if (existingPending.stripeSessionId) {
              return {
                method: 'STRIPE',
                url: '',
                pendingId: existingPending.id,
                alreadyProcessed: true,
              };
            } else if (existingPending.paystackRef) {
              return {
                method: 'PAYSTACK',
                url: '',
                reference: existingPending.paystackRef,
                pendingId: existingPending.id,
                alreadyProcessed: true,
              };
            }
          }
        }

        // If pending, return the existing payment reference
        if (existingPending.stripeSessionId) {
          return {
            method: 'STRIPE',
            url: '',
            pendingId: existingPending.id,
            alreadyProcessed: false,
          };
        } else if (existingPending.paystackRef) {
          return {
            method: 'PAYSTACK',
            url: '',
            reference: existingPending.paystackRef,
            pendingId: existingPending.id,
            alreadyProcessed: false,
          };
        }
      }
    }

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
    // Platform fee is 2% of slot cost only (not including delivery)
    const platformFee = Math.round(itemCost * 0.02);
    const total = itemCost + platformFee + deliveryFee;

    // Create pending subscription with idempotency key
    const pending = await this.prisma.pendingSubscription.create({
      data: {
        userId,
        poolId,
        slots,
        deliveryFee,
        status: PaymentStatus.PENDING,
        idempotencyKey: finalIdempotencyKey,
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

      // Add payment processing job for reliability
      await this.queueService.addPaymentProcessingJob({
        pendingId: pending.id,
        paymentMethod: 'STRIPE',
        paymentReference: session.id,
        userId,
        poolId,
        amount: total,
        metadata: { sessionId: session.id },
      });

      return { method: 'STRIPE', url: session.url, pendingId: pending.id };
    } else {
      const result = await this.paystack.initialize(total, metadata);

      await this.prisma.pendingSubscription.update({
        where: { id: pending.id },
        data: { paystackRef: result.reference },
      });

      // Add payment processing job for reliability
      await this.queueService.addPaymentProcessingJob({
        pendingId: pending.id,
        paymentMethod: 'PAYSTACK',
        paymentReference: result.reference,
        userId,
        poolId,
        amount: total,
        metadata: { authorizationUrl: result.authorization_url },
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
    this.logger.log(
      `Paystack verification response for reference ${reference}:`,
      JSON.stringify(res, null, 2),
    );

    const { pendingId } = res.metadata;
    this.logger.log(`Extracted pendingId: ${pendingId}`);

    if (!pendingId) {
      this.logger.error('No pendingId found in Paystack metadata');
      throw new BadRequestException('Invalid payment metadata');
    }

    // Check if already processed to prevent duplicate processing
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        paymentRef: reference,
        userId: res.metadata.userId,
      },
    });

    if (existingSubscription) {
      this.logger.log(
        `Payment ${reference} already processed - subscription ${existingSubscription.id} exists`,
      );
      return {
        success: true,
        alreadyProcessed: true,
        subscriptionId: existingSubscription.id,
      };
    }

    const pending = await this.prisma.pendingSubscription.findUnique({
      where: { id: pendingId },
      include: { pool: { include: { product: true } }, user: true },
    });

    if (!pending) {
      this.logger.error(`Pending subscription not found for ID: ${pendingId}`);
      // Try to find by reference instead
      const pendingByRef = await this.prisma.pendingSubscription.findFirst({
        where: { paystackRef: reference },
        include: { pool: { include: { product: true } }, user: true },
      });

      if (pendingByRef) {
        this.logger.log(
          `Found pending subscription by reference: ${pendingByRef.id}`,
        );
        return this.finalize(pendingByRef.id);
      }

      throw new NotFoundException('Pending subscription not found');
    }

    // Check if pending is already processed
    if (pending.status === PaymentStatus.SUCCESS) {
      this.logger.log(
        `Pending subscription ${pendingId} already processed successfully`,
      );
      return { success: true, alreadyProcessed: true, pendingId: pending.id };
    }

    return this.finalize(pendingId);
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripe.constructEvent(rawBody, signature);

    // SECURITY: Check for webhook replay attack
    const eventId = event.id;
    const isProcessed = await this.securityService.isWebhookProcessed(
      'stripe',
      eventId,
    );
    if (isProcessed) {
      this.logger.warn(`Duplicate Stripe webhook detected: ${eventId}`);
      return { received: true, duplicate: true };
    }

    if (event.type === 'checkout.session.completed') {
      const session: any = event.data.object;
      const pendingId = session.metadata.subscriptionId;
      const stripeSessionId = session.id;

      // Check if already processed to prevent duplicate processing
      const existingSubscription = await this.prisma.subscription.findFirst({
        where: {
          paymentRef: stripeSessionId,
        },
      });

      if (existingSubscription) {
        this.logger.log(
          `Stripe session ${stripeSessionId} already processed - subscription ${existingSubscription.id} exists`,
        );
        return {
          received: true,
          alreadyProcessed: true,
          subscriptionId: existingSubscription.id,
        };
      }

      // Check if pending is already processed
      const existingPending = await this.prisma.pendingSubscription.findUnique({
        where: { id: pendingId },
      });

      if (existingPending && existingPending.status === PaymentStatus.SUCCESS) {
        this.logger.log(
          `Pending subscription ${pendingId} already processed successfully`,
        );
        return {
          received: true,
          alreadyProcessed: true,
          pendingId: existingPending.id,
        };
      }

      await this.finalize(pendingId);

      // Mark webhook as processed
      await this.securityService.markWebhookProcessed(
        'stripe',
        eventId,
        event.type,
        signature,
      );
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

    // SECURITY: Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature || '', 'hex');
    const computedBuffer = Buffer.from(computed, 'hex');

    if (
      signatureBuffer.length !== computedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, computedBuffer)
    ) {
      this.logger.warn('Invalid Paystack webhook signature');
      throw new BadRequestException('Invalid Paystack signature');
    }

    const body = JSON.parse(req.body.toString());
    const eventId = body?.data?.id?.toString() || body?.data?.reference;
    const eventType = body?.event;

    // SECURITY: Check for webhook replay attack
    if (eventId) {
      const isProcessed = await this.securityService.isWebhookProcessed(
        'paystack',
        eventId,
      );
      if (isProcessed) {
        this.logger.warn(`Duplicate Paystack webhook detected: ${eventId}`);
        return { received: true, duplicate: true };
      }
    }

    if (body?.event === 'charge.success') {
      const reference = body?.data?.reference;
      const res = await this.paystack.verify(reference);
      const { pendingId } = res.metadata;

      await this.finalize(pendingId);

      // Mark webhook as processed
      if (eventId) {
        await this.securityService.markWebhookProcessed(
          'paystack',
          eventId,
          eventType,
          signature,
        );
      }
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

    const subscription = await this.prisma.executeQuickTransaction(
      async (tx) => {
        // Verify slot availability atomically
        const pool = await tx.pool.findUnique({
          where: { id: pending.poolId },
        });

        if (!pool) {
          await tx.pendingSubscription.update({
            where: { id: pendingId },
            data: { status: PaymentStatus.FAILED },
          });
          // Record payment failure for rate limiting
          await this.securityService.recordPaymentFailure(pending.userId);
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
          // Record payment failure for rate limiting
          await this.securityService.recordPaymentFailure(pending.userId);
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

        return subscription;
      },
    );

    // Clear payment failures on success (done outside transaction)
    await this.securityService.clearPaymentFailures(pending.userId);

    // Create escrow entry OUTSIDE the transaction to avoid timeout
    try {
      await this.escrowService.createEscrowEntry(
        pending.poolId,
        subscription.id,
      );
    } catch (escrowError) {
      this.logger.error(
        `Escrow creation failed for subscription ${subscription.id}:`,
        escrowError,
      );
      // Don't fail the payment if escrow creation fails - it can be retried later
    }

    // Check if pool is now filled and update status
    // Need to get fresh pool data since we're outside transaction
    const currentPool = await this.prisma.pool.findUnique({
      where: { id: pending.poolId },
    });

    if (!currentPool) {
      this.logger.error(
        `Pool ${pending.poolId} not found after subscription creation`,
      );
      throw new BadRequestException(
        'Pool not found after subscription creation',
      );
    }

    // Recalculate slots taken
    const currentSlotsTaken = await this.prisma.subscription.aggregate({
      where: { poolId: pending.poolId },
      _sum: { slots: true },
    });

    const currentSlotsTakenTotal = currentSlotsTaken._sum.slots ?? 0;

    if (currentSlotsTakenTotal + pending.slots === currentPool!.slotsCount) {
      await this.prisma.pool.update({
        where: { id: pending.poolId },
        data: {
          status: 'FILLED',
          filledAt: new Date(),
        },
      });

      // Calculate delivery deadline (14 days from fill)
      const deliveryDeadline = new Date();
      deliveryDeadline.setDate(deliveryDeadline.getDate() + 14);

      await this.prisma.pool.update({
        where: { id: pending.poolId },
        data: {
          deliveryDeadlineUtc: deliveryDeadline,
        },
      });

      this.logger.log(
        `Pool ${pending.poolId} filled. Delivery deadline: ${deliveryDeadline}`,
      );
    }

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

    // ✅ Send in-app notification for payment success
    try {
      await this.notificationsService.sendNotification(
        pending.userId,
        NotificationType.PAYMENT,
        [NotificationMedium.IN_APP],
        {
          title: 'Payment Successful! 🎉',
          body: `Your payment of ₦${totalAmount.toLocaleString()} for ${productName} was successful. You've joined the pool with ${pending.slots} slot(s).`,
          message: `Payment of ₦${totalAmount.toLocaleString()} for ${productName} was successful.`,
          data: {
            subscriptionId: subscription.id,
            poolId: pending.poolId,
            amount: totalAmount,
            slots: pending.slots,
            url: `/buyer/pool/${pending.poolId}`,
          },
        },
      );
      this.logger.log(
        `In-app notification sent for payment ${subscription.id}`,
      );
    } catch (notifError) {
      this.logger.error('Failed to send in-app notification', notifError);
    }

    return { success: true, subscriptionId: subscription.id };
  }
}
