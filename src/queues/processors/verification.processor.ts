import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { VerificationService } from '../../verification/verification.service';
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

        case 'bvn':
          return await this.processBVNVerification(userId, metadata);

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

    // Use VerificationService method
    const result = await this.verificationService.verifyBankAccountWithPaystack(
      accountNumber,
      bankCode,
      userId,
    );

    if (!result.verified) {
      throw new Error('Bank account verification failed');
    }

    this.logger.log(`Bank account verified for user: ${userId}`);

    return result;
  }

  private async processBusinessRegistration(
    verificationId: string,
    metadata?: Record<string, any>,
  ) {
    const { registrationNumber } = metadata || {};

    if (!registrationNumber) {
      throw new Error('Business registration number required');
    }

    // Use VerificationService method
    const verification = await this.prisma.verification.findUnique({
      where: { id: verificationId },
    });

    if (!verification) {
      throw new Error('Verification not found');
    }

    const result = await this.verificationService.verifyBusinessRegistration(
      registrationNumber,
      verification.userId,
    );

    if (!result) {
      throw new Error('Business registration verification failed');
    }

    await this.prisma.verification.update({
      where: { id: verificationId },
      data: {
        status: 'VERIFIED',
        details: {
          ...metadata,
          processedAt: new Date().toISOString(),
          registrationNumber,
        },
      },
    });

    this.logger.log(`Business registration verified: ${verificationId}`);

    return { status: 'verified', verificationId };
  }

  private async processBVNVerification(
    userId: string,
    metadata?: Record<string, any>,
  ) {
    const { bvn } = metadata || {};

    if (!bvn) {
      throw new Error('BVN required');
    }

    // Use VerificationService method
    const result = await this.verificationService.verifyBVNWithProvider(
      bvn,
      userId,
    );

    if (!result) {
      throw new Error('BVN verification failed');
    }

    this.logger.log(`BVN verified for user: ${userId}`);

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
