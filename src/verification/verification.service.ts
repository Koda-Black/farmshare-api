// ============================================================================
// FILE: src/verification/verification.service.ts (COMPLETE)
// ============================================================================
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { v2 as cloudinary } from 'cloudinary';
import { VerificationStatus, GovtIdType } from '@prisma/client';
import { streamUpload } from '../utils/cloudinary.helper';

// Step name mapping: frontend names -> backend names
const STEP_NAME_MAP: Record<string, string> = {
  id: 'govt_id',
  business: 'business_reg',
  details: 'tax',
  // These are already backend names
  govt_id: 'govt_id',
  bank: 'bank',
  business_reg: 'business_reg',
  tax: 'tax',
};

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailChannel: EmailChannelService,
    @Inject('CLOUDINARY') private cloudinaryClient: typeof cloudinary,
  ) {}

  /**
   * Normalize step names from frontend to backend format
   */
  private normalizeStepName(step: string): string {
    return STEP_NAME_MAP[step] || step;
  }

  /**
   * Normalize an array of step names
   */
  private normalizeSteps(steps: string[]): string[] {
    return steps.map((step) => this.normalizeStepName(step));
  }

  async startVerification(userId: string, steps: string[]) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Check if already verified
    if (user.verificationStatus === VerificationStatus.VERIFIED) {
      throw new BadRequestException('User is already verified');
    }

    // Normalize step names from frontend to backend format
    const normalizedSteps = this.normalizeSteps(steps);
    this.logger.log(
      `Starting verification with steps: ${normalizedSteps.join(', ')}`,
    );

    // Create verification records for each step
    const verifications = await Promise.all(
      normalizedSteps.map((step) =>
        this.prisma.verification.create({
          data: {
            userId,
            step,
            status: VerificationStatus.PENDING,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
        }),
      ),
    );

    // Update user status to PENDING
    await this.prisma.user.update({
      where: { id: userId },
      data: { verificationStatus: VerificationStatus.PENDING },
    });

    // Generate presigned URLs for document uploads
    const uploadInstructions = verifications.map((v) => ({
      verificationId: v.id,
      step: v.step,
      uploadUrl: `/verification/submit?verificationId=${v.id}`,
      requiredDocuments: this.getRequiredDocuments(v.step),
    }));

    return {
      message: 'Verification started',
      verifications: uploadInstructions,
    };
  }

  async submitVerification(
    verificationId: string,
    files: Express.Multer.File[],
    metadata: Record<string, any>,
    userId: string,
  ) {
    const verification = await this.prisma.verification.findUnique({
      where: { id: verificationId },
      include: { user: true },
    });

    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    if (verification.status !== VerificationStatus.PENDING) {
      throw new BadRequestException('Verification is not in pending state');
    }

    // Upload files to Cloudinary
    const uploadedFiles = await Promise.all(
      files.map((file) => streamUpload(this.cloudinaryClient, file.buffer)),
    );

    const fileUrls = uploadedFiles.map((result) => result.secure_url);

    // Update verification record
    const updated = await this.prisma.verification.update({
      where: { id: verificationId },
      data: {
        details: {
          ...metadata,
          files: fileUrls,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    // Store files in user record based on step
    if (verification.step === 'govt_id') {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          govtIdFiles: fileUrls,
          govtIdType: metadata.idType as GovtIdType,
          govtIdNumber: metadata.idNumber,
        },
      });
    } else if (verification.step === 'business_reg') {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          businessRegistrationNumber: metadata.registrationNumber,
        },
      });
    } else if (verification.step === 'tax') {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          taxId: metadata.taxId,
        },
      });
    }

    // Trigger background verification job (mock for now)
    await this.processVerification(verificationId);

    return {
      message: 'Verification documents submitted successfully',
      verification: updated,
    };
  }

  private async processVerification(verificationId: string) {
    const verification = await this.prisma.verification.findUnique({
      where: { id: verificationId },
      include: { user: true },
    });

    if (!verification) return;

    // Mock verification logic - in production, integrate with:
    // - NIN verification API
    // - Business registry API
    // - Paystack bank verification
    // - OCR/AI document validation

    try {
      if (verification.step === 'govt_id') {
        // Mock: Always approve for testing
        await this.prisma.verification.update({
          where: { id: verificationId },
          data: { status: VerificationStatus.VERIFIED },
        });
        await this.prisma.user.update({
          where: { id: verification.userId },
          data: { ninVerified: true },
        });
      } else if (verification.step === 'bank') {
        // Integrate with Paystack bank verification
        await this.verifyBankAccount(verification.userId);
      } else if (verification.step === 'business_reg') {
        // Integrate with business registry API
        await this.prisma.verification.update({
          where: { id: verificationId },
          data: { status: VerificationStatus.VERIFIED },
        });
      } else if (verification.step === 'tax') {
        // Optional step - auto-approve if submitted
        await this.prisma.verification.update({
          where: { id: verificationId },
          data: { status: VerificationStatus.VERIFIED },
        });
      }

      // Check if all required verifications are complete
      await this.checkCompleteVerification(verification.userId);
    } catch (error) {
      this.logger.error(
        `Verification processing failed: ${verificationId}`,
        error.stack,
      );
      await this.prisma.verification.update({
        where: { id: verificationId },
        data: {
          status: VerificationStatus.REJECTED,
          details: { error: error.message },
        },
      });
    }
  }

  private async verifyBankAccount(userId: string) {
    // TODO: Integrate with Paystack bank verification API
    // For now, mock approval
    await this.prisma.user.update({
      where: { id: userId },
      data: { bankVerified: true },
    });
  }

  private async checkCompleteVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { verifications: true },
    });

    if (!user) return;

    // Check required verifications: govt_id + bank
    const requiredSteps = ['govt_id', 'bank'];
    const verifiedSteps = user.verifications.filter(
      (v) =>
        requiredSteps.includes(v.step) &&
        v.status === VerificationStatus.VERIFIED,
    );

    if (verifiedSteps.length >= requiredSteps.length) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { verificationStatus: VerificationStatus.VERIFIED },
      });

      // Send verification complete email
      await this.emailChannel.send(
        user.email,
        'Verification Complete',
        'Your account has been verified! You can now create pools and start selling.',
      );

      this.logger.log(`User ${userId} verification completed`);
    }
  }

  async getVerificationStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        verifications: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      overallStatus: user.verificationStatus,
      ninVerified: user.ninVerified,
      bankVerified: user.bankVerified,
      verifications: user.verifications.map((v) => ({
        id: v.id,
        step: v.step,
        status: v.status,
        createdAt: v.createdAt,
        expiresAt: v.expiresAt,
      })),
    };
  }

  async adminOverride(
    userId: string,
    status: 'VERIFIED' | 'REJECTED' | 'EXPIRED',
    reason: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationStatus: status as VerificationStatus,
      },
    });

    // Log admin action
    // TODO: Create AdminAuditLog entry

    // Send email notification
    await this.emailChannel.send(
      user.email,
      `Verification ${status}`,
      `Your verification status has been updated to ${status}. Reason: ${reason}`,
    );

    return {
      message: `Verification status updated to ${status}`,
    };
  }

  async getPendingVerifications(skip: number, take: number) {
    const [verifications, total] = await Promise.all([
      this.prisma.verification.findMany({
        where: { status: VerificationStatus.PENDING },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
        },
        skip,
        take,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.verification.count({
        where: { status: VerificationStatus.PENDING },
      }),
    ]);

    return {
      total,
      verifications,
      skip,
      take,
    };
  }

  private getRequiredDocuments(step: string): string[] {
    const docs = {
      govt_id: [
        'Government-issued ID (NIN, Voter Card, Driver License, or Passport)',
        'Clear photo showing full face and ID details',
      ],
      bank: ['Bank account number', 'Bank name', 'Account holder name'],
      business_reg: [
        'Business registration certificate',
        'CAC registration number',
      ],
      tax: ['Tax Identification Number (TIN)', 'Tax certificate (optional)'],
    };
    return docs[step] || [];
  }

  // Additional helper methods for production integrations

  async verifyNINWithProvider(nin: string, userId: string): Promise<boolean> {
    // TODO: Integrate with NIN verification provider (Mono, Okra, Verifyghana)
    // Example implementation:
    /*
      try {
        const response = await axios.post(
          'https://api.mono.co/v1/identity/nin/verify',
          { nin },
          {
            headers: {
              'Authorization': `Bearer ${process.env.NIN_VERIFICATION_API_KEY}`,
              'Content-Type': 'application/json',
            },
          },
        );
  
        if (response.data.status === 'success') {
          await this.prisma.user.update({
            where: { id: userId },
            data: {
              ninVerified: true,
              verificationStatus: VerificationStatus.VERIFIED,
            },
          });
          return true;
        }
        return false;
      } catch (error) {
        this.logger.error('NIN verification failed', error);
        return false;
      }
      */

    // Mock implementation for now
    this.logger.warn('Using mock NIN verification - integrate real API');
    return true;
  }

  async verifyBusinessRegistration(
    registrationNumber: string,
    userId: string,
  ): Promise<boolean> {
    // TODO: Integrate with CAC (Corporate Affairs Commission) API
    // Example implementation:
    /*
      try {
        const response = await axios.get(
          `https://api.cac.gov.ng/verify/${registrationNumber}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.BUSINESS_REGISTRY_API_KEY}`,
            },
          },
        );
  
        if (response.data.valid) {
          await this.prisma.user.update({
            where: { id: userId },
            data: {
              businessRegistrationNumber: registrationNumber,
            },
          });
          return true;
        }
        return false;
      } catch (error) {
        this.logger.error('Business registration verification failed', error);
        return false;
      }
      */

    // Mock implementation for now
    this.logger.warn('Using mock business verification - integrate real API');
    return true;
  }

  async verifyBankAccountWithPaystack(
    accountNumber: string,
    bankCode: string,
    userId: string,
  ): Promise<any> {
    // TODO: Integrate with Paystack Bank Account Verification
    // Example implementation:
    /*
      try {
        const response = await axios.get(
          `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            },
          },
        );
  
        if (response.data.status && response.data.data.account_name) {
          await this.prisma.user.update({
            where: { id: userId },
            data: {
              bankVerified: true,
              bankAccountId: accountNumber,
            },
          });
  
          return {
            verified: true,
            accountName: response.data.data.account_name,
            accountNumber,
            bankCode,
          };
        }
        return { verified: false };
      } catch (error) {
        this.logger.error('Bank account verification failed', error);
        return { verified: false, error: error.message };
      }
      */

    // Mock implementation for now
    this.logger.warn('Using mock bank verification - integrate Paystack API');
    return {
      verified: true,
      accountName: 'Mock Account Name',
      accountNumber,
      bankCode,
    };
  }

  async checkExpiredVerifications(): Promise<void> {
    // Background job to mark expired verifications
    const expiredVerifications = await this.prisma.verification.findMany({
      where: {
        status: VerificationStatus.PENDING,
        expiresAt: {
          lte: new Date(),
        },
      },
    });

    for (const verification of expiredVerifications) {
      await this.prisma.verification.update({
        where: { id: verification.id },
        data: { status: VerificationStatus.EXPIRED },
      });

      // Notify user
      const user = await this.prisma.user.findUnique({
        where: { id: verification.userId },
      });

      if (user) {
        await this.emailChannel.send(
          user.email,
          'Verification Expired',
          `Your ${verification.step} verification has expired. Please start the verification process again.`,
        );
      }
    }

    this.logger.log(`Expired ${expiredVerifications.length} verifications`);
  }
}
