import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { VerificationService } from '../../verification/verification.service';
import { PaystackVerificationService } from '../../verification/services/paystack-verification.service';
import { FaceVerificationService } from '../../verification/services/face-verification.service';
import { DocumentOcrService } from '../../verification/services/document-ocr.service';
import { CacVerificationService } from '../../verification/services/cac-verification.service';
import { PrismaService } from '../../services/prisma.service';
import { EmailChannelService } from '../../notifications/channels/email.channel';

interface VerificationJobData {
  verificationId: string;
  userId: string;
  step: string;
  metadata?: Record<string, any>;
}

@Processor('verification')
export class VerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(VerificationProcessor.name);

  constructor(
    private verificationService: VerificationService,
    private paystackService: PaystackVerificationService,
    private faceService: FaceVerificationService,
    private documentOcrService: DocumentOcrService,
    private cacService: CacVerificationService,
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
  ) {
    super();
  }

  async process(job: Job<VerificationJobData>): Promise<any> {
    const { verificationId, userId, step, metadata } = job.data;

    this.logger.log(
      `Processing verification job: ${job.id} for verification ${verificationId}`,
    );

    try {
      switch (step) {
        case 'govt_id':
          return await this.processGovtIdVerification(verificationId, metadata);

        case 'bank':
          return await this.processBankVerification(userId, metadata);

        case 'business_reg':
          return await this.processBusinessRegistration(
            verificationId,
            metadata,
          );

        case 'nin':
          return await this.processNINVerification(userId, metadata);

        default:
          throw new Error(`Unknown verification step: ${step}`);
      }
    } catch (error) {
      this.logger.error(
        `Verification job ${job.id} failed: ${error.message}`,
        error.stack,
      );
      throw error; // Will trigger retry
    }
  }

  private async processGovtIdVerification(
    verificationId: string,
    metadata?: Record<string, any>,
  ) {
    // TODO: Integrate with OCR service to validate ID documents
    // TODO: Integrate with facial recognition to match photo
    // For now, auto-approve

    await this.prisma.verification.update({
      where: { id: verificationId },
      data: {
        status: 'VERIFIED',
        details: {
          ...metadata,
          processedAt: new Date().toISOString(),
          processor: 'auto',
        },
      },
    });

    this.logger.log(`Government ID verified: ${verificationId}`);

    return { status: 'verified', verificationId };
  }

  private async processBankVerification(
    userId: string,
    metadata?: Record<string, any>,
  ) {
    const { accountNumber, bankCode } = metadata || {};

    if (!accountNumber || !bankCode) {
      throw new Error('Bank account number and bank code required');
    }

    // Use PaystackVerificationService
    const result = await this.paystackService.verifyBankAccount(
      accountNumber,
      bankCode,
    );

    if (!result.success) {
      throw new Error(result.message || 'Bank account verification failed');
    }

    // Update user record
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        bankVerified: true,
        bankAccountId: accountNumber,
      },
    });

    this.logger.log(`Bank account verified for user: ${userId}`);

    return result;
  }

  private async processBusinessRegistration(
    verificationId: string,
    metadata?: Record<string, any>,
  ) {
    const { registrationNumber, companyName } = metadata || {};

    if (!registrationNumber) {
      throw new Error('Business registration number required');
    }

    // Use CacVerificationService
    const result = await this.cacService.verifyBusinessRegistration(
      registrationNumber,
      companyName,
    );

    if (!result.success) {
      throw new Error(
        result.message || 'Business registration verification failed',
      );
    }

    // Update verification record
    await this.prisma.verification.update({
      where: { id: verificationId },
      data: {
        status: 'VERIFIED',
        details: {
          ...metadata,
          ...result,
          processedAt: new Date().toISOString(),
        },
      },
    });

    // Update user record
    const verification = await this.prisma.verification.findUnique({
      where: { id: verificationId },
    });

    if (verification) {
      await this.prisma.user.update({
        where: { id: verification.userId },
        data: {
          businessRegistrationNumber: registrationNumber,
        },
      });
    }

    this.logger.log(`Business registration verified: ${verificationId}`);

    return { status: 'verified', verificationId, result };
  }

  private async processNINVerification(
    userId: string,
    metadata?: Record<string, any>,
  ) {
    const { nin } = metadata || {};

    if (!nin) {
      throw new Error('NIN required');
    }

    // Use VerificationService method
    const result = await this.verificationService.verifyNINWithProvider(
      nin,
      userId,
    );

    if (!result) {
      throw new Error('NIN verification failed');
    }

    this.logger.log(`NIN verified for user: ${userId}`);

    return { status: 'verified', userId };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<VerificationJobData>) {
    this.logger.log(`Verification job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<VerificationJobData>, error: Error) {
    this.logger.error(
      `Verification job ${job.id} failed: ${error.message}`,
      error.stack,
    );

    // Notify user about failed verification
    this.notifyVerificationFailed(
      job.data.userId,
      job.data.step,
      error.message,
    );
  }

  private async notifyVerificationFailed(
    userId: string,
    step: string,
    reason: string,
  ) {
    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });

      if (user) {
        await this.emailChannel.send(
          user.email,
          'Verification Failed',
          `Your ${step} verification failed. Reason: ${reason}. Please try again or contact support.`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to send verification failure email', error);
    }
  }
}
