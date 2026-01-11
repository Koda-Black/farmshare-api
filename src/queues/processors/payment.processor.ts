import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import { EmailChannelService } from '../../notifications/channels/email.channel';
import { PaymentStatus } from '@prisma/client';

interface PaymentProcessingJobData {
  pendingId: string;
  paymentMethod: 'STRIPE' | 'PAYSTACK';
  paymentReference: string;
  userId: string;
  poolId: string;
  amount: number;
  metadata?: Record<string, any>;
}

interface PaymentVerificationJobData {
  paymentReference: string;
  paymentMethod: 'STRIPE' | 'PAYSTACK';
  pendingId?: string;
  webhookData?: any;
}

@Processor('payment-processing')
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
  ) {
    super();
  }

  async process(job: Job<PaymentProcessingJobData | PaymentVerificationJobData>): Promise<any> {
    const jobName = job.name;

    this.logger.log(
      `Processing payment job: ${job.id} (${jobName})`,
    );

    try {
      switch (jobName) {
        case 'process-payment':
          return await this.processPayment(job as Job<PaymentProcessingJobData>);

        case 'verify-payment':
          return await this.verifyPayment(job as Job<PaymentVerificationJobData>);

        default:
          throw new Error(`Unknown payment job type: ${jobName}`);
      }
    } catch (error) {
      this.logger.error(
        `Payment job ${job.id} (${jobName}) failed: ${error.message}`,
        error.stack,
      );

      // For critical payment failures, notify support
      if (jobName === 'process-payment') {
        await this.notifyPaymentFailure(job.data as PaymentProcessingJobData, error.message);
      }

      throw error; // Will trigger retry
    }
  }

  private async processPayment(job: Job<PaymentProcessingJobData>): Promise<any> {
    const { pendingId, paymentMethod, paymentReference, userId, poolId, amount, metadata } = job.data;

    this.logger.log(`Processing payment for pending ${pendingId}, reference ${paymentReference}`);

    // Check if already processed
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        paymentRef: paymentReference,
        userId,
      },
    });

    if (existingSubscription) {
      this.logger.log(`Payment ${paymentReference} already processed - subscription ${existingSubscription.id} exists`);
      return {
        success: true,
        alreadyProcessed: true,
        subscriptionId: existingSubscription.id,
        message: 'Payment already processed'
      };
    }

    // Check if pending subscription exists and is still pending
    const pending = await this.prisma.pendingSubscription.findUnique({
      where: { id: pendingId },
      include: { pool: true, user: true },
    });

    if (!pending) {
      throw new Error(`Pending subscription ${pendingId} not found`);
    }

    if (pending.status === PaymentStatus.SUCCESS) {
      this.logger.log(`Pending subscription ${pendingId} already processed successfully`);
      return {
        success: true,
        alreadyProcessed: true,
        pendingId: pending.id,
        message: 'Pending subscription already processed'
      };
    }

    // For payment processing jobs, we primarily handle retry logic and status updates
    // The actual payment verification should be handled by webhooks
    this.logger.log(`Payment processing job for ${paymentReference} - checking if webhook has processed it`);

    // Add a delay to allow webhooks to be processed
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check again if payment was processed by webhook
    const webhookProcessedSubscription = await this.prisma.subscription.findFirst({
      where: {
        paymentRef: paymentReference,
        userId,
      },
    });

    if (webhookProcessedSubscription) {
      this.logger.log(`Payment ${paymentReference} was processed by webhook - subscription ${webhookProcessedSubscription.id} exists`);
      return {
        success: true,
        alreadyProcessed: true,
        subscriptionId: webhookProcessedSubscription.id,
        message: 'Payment processed by webhook'
      };
    }

    // If still not processed after delay, we may need to handle based on payment method
    if (paymentMethod === 'PAYSTACK') {
      this.logger.warn(`Paystack payment ${paymentReference} not processed by webhook after delay - may need manual verification`);
    } else if (paymentMethod === 'STRIPE') {
      this.logger.warn(`Stripe payment ${paymentReference} not processed by webhook after delay - may need manual verification`);
    }

    return {
      success: false,
      needsManualReview: true,
      message: 'Payment not processed by webhook, requires manual verification',
      paymentReference,
      paymentMethod,
      pendingId
    };
  }

  private async verifyPayment(job: Job<PaymentVerificationJobData>): Promise<any> {
    const { paymentReference, paymentMethod, pendingId, webhookData } = job.data;

    this.logger.log(`Verifying payment ${paymentReference} with method ${paymentMethod}`);

    // Add delay to ensure webhooks have been processed
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if payment was already processed
    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        paymentRef: paymentReference,
      },
    });

    if (existingSubscription) {
      this.logger.log(`Payment ${paymentReference} already verified - subscription ${existingSubscription.id} exists`);
      return {
        success: true,
        alreadyProcessed: true,
        subscriptionId: existingSubscription.id,
        message: 'Payment already verified'
      };
    }

    // If we have a pendingId, check its status
    if (pendingId) {
      const pending = await this.prisma.pendingSubscription.findUnique({
        where: { id: pendingId },
        include: { pool: true, user: true },
      });

      if (pending) {
        if (pending.status === PaymentStatus.SUCCESS) {
          this.logger.log(`Pending subscription ${pendingId} already marked as success`);
          return {
            success: true,
            alreadyProcessed: true,
            pendingId: pending.id,
            message: 'Pending subscription already processed'
          };
        } else if (pending.status === PaymentStatus.PENDING) {
          this.logger.warn(`Pending subscription ${pendingId} still in PENDING status - webhook may be delayed`);

          // For verification jobs, we don't finalize payments directly
          // We just report the status for potential manual review
          return {
            success: false,
            needsManualReview: true,
            message: 'Payment still pending after webhook delay - requires manual verification',
            paymentReference,
            paymentMethod,
            pendingId
          };
        } else {
          this.logger.warn(`Pending subscription ${pendingId} has status: ${pending.status}`);
          return {
            success: false,
            message: `Payment failed with status: ${pending.status}`,
            paymentReference,
            paymentMethod,
            pendingId
          };
        }
      } else {
        this.logger.error(`Pending subscription ${pendingId} not found`);
      }
    }

    // If we reach here, the payment might be in limbo
    this.logger.warn(`Payment ${paymentReference} verification could not be completed - may need manual review`);

    return {
      success: false,
      needsManualReview: true,
      message: 'Payment verification incomplete - requires manual review',
      paymentReference,
      paymentMethod
    };
  }

  private async notifyPaymentFailure(data: PaymentProcessingJobData, error: string) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: data.userId } });

      if (user) {
        await this.emailChannel.send(
          'support@farmshare.ng', // Send to support instead of user
          `Payment Processing Failure - ${data.paymentReference}`,
          `Payment processing failed for user ${user.email} (${data.userId}):

Reference: ${data.paymentReference}
Method: ${data.paymentMethod}
Amount: ${data.amount}
Pending ID: ${data.pendingId}
Pool ID: ${data.poolId}
Error: ${error}

Please investigate this payment failure urgently.`,
        );
      }
    } catch (emailError) {
      this.logger.error('Failed to send payment failure notification to support', emailError);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<PaymentProcessingJobData | PaymentVerificationJobData>) {
    this.logger.log(`Payment job ${job.id} (${job.name}) completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PaymentProcessingJobData | PaymentVerificationJobData>, error: Error) {
    this.logger.error(
      `Payment job ${job.id} (${job.name}) failed: ${error.message}`,
      error.stack,
    );

    // For failed payment processing jobs, update the pending subscription status
    if (job.name === 'process-payment' && job.attemptsMade >= 3) {
      this.updateFailedPaymentStatus(job.data as PaymentProcessingJobData, error.message);
    }
  }

  private async updateFailedPaymentStatus(data: PaymentProcessingJobData, error: string) {
    try {
      await this.prisma.pendingSubscription.update({
        where: { id: data.pendingId },
        data: {
          status: 'FAILED',
          // Note: We would need to add a failureReason field to the schema
        },
      });

      this.logger.log(`Updated pending subscription ${data.pendingId} status to FAILED`);
    } catch (updateError) {
      this.logger.error(`Failed to update pending subscription status: ${updateError.message}`);
    }
  }
}