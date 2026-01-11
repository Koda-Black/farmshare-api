import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailChannelService } from '../notifications/channels/email.channel';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { VerificationStatus, Role } from '@prisma/client';
import {
  AdminSignupDto,
  AdminLoginDto,
  EnableMfaDto,
  VerifyMfaDto,
  DisableMfaDto,
} from './dto/admin-auth.dto';
import {
  UpdateUserDto,
  SearchUsersDto,
  BanUserDto,
  UnbanUserDto,
  SetProbationDto,
  RemoveProbationDto,
} from './dto/user-management.dto';
import {
  GetPendingVerificationsDto,
  ApproveVerificationDto,
  RejectVerificationDto,
  GetVerificationDetailsDto,
} from './dto/verification-review.dto';
import {
  GetDisputesDto,
  UpdateDisputeStatusDto,
  ResolveDisputeDto,
  GetDisputeDetailsDto,
} from './dto/dispute-management.dto';
import {
  GetPayoutsDto,
  InitiatePayoutDto,
  SimulatePayoutDto,
  GetVendorPayoutStatsDto,
  PayoutStatus,
} from './dto/payout-management.dto';
import Decimal from 'decimal.js';

@Injectable()
export class AdminService {
  private readonly PLATFORM_FEE_RATE = 0.02; // 2% platform fee

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailChannel: EmailChannelService,
  ) {}

  // ==================== AUTHENTICATION ====================

  /**
   * Admin signup with secret key verification
   */
  async adminSignup(dto: AdminSignupDto) {
    const { email, name, password, adminSecretKey } = dto;

    // Verify admin secret key from environment
    const requiredSecretKey =
      this.configService.get<string>('ADMIN_SECRET_KEY');
    if (!requiredSecretKey || adminSecretKey !== requiredSecretKey) {
      throw new ForbiddenException('Invalid admin registration key');
    }

    // Check if user already exists
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await this.prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        role: 'ADMIN',
        isAdmin: true,
        isVerified: true, // Admins are auto-verified
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isAdmin: true,
        mfaEnabled: false,
      },
    });

    // Send welcome email
    await this.emailChannel.sendRoleChangedEmail(email, name, Role.ADMIN);

    // Create audit log
    await this.createAuditLog(admin.id, 'ADMIN_SIGNUP', 'User', admin.id, {
      email,
      name,
    });

    return {
      message: 'Admin account created successfully',
      admin,
    };
  }

  /**
   * Admin login with optional MFA
   */
  async adminLogin(dto: AdminLoginDto) {
    const { email, password } = dto;

    // Find admin user
    const admin = await this.prisma.user.findUnique({ where: { email } });

    if (!admin || !admin.isAdmin) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, admin.password || '');
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    // If MFA is enabled, require MFA verification in next step
    if (admin.mfaEnabled) {
      return {
        requiresMfa: true,
        message: 'Please provide MFA code',
      };
    }

    // Generate tokens
    const tokens = this.generateTokens(admin);
    await this.saveRefreshToken(admin.id, tokens.refreshToken);

    // Create audit log
    await this.createAuditLog(admin.id, 'ADMIN_LOGIN', 'User', admin.id, {
      email,
    });

    return {
      ...tokens,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        mfaEnabled: admin.mfaEnabled,
      },
    };
  }

  /**
   * Verify MFA code during login
   */
  async verifyMfaLogin(dto: VerifyMfaDto) {
    const { email, token } = dto;

    const admin = await this.prisma.user.findUnique({ where: { email } });

    if (!admin || !admin.isAdmin || !admin.mfaEnabled || !admin.mfaSecret) {
      throw new UnauthorizedException('Invalid MFA configuration');
    }

    // Verify MFA token
    const verified = speakeasy.totp.verify({
      secret: admin.mfaSecret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps before/after for clock skew
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Generate tokens
    const tokens = this.generateTokens(admin);
    await this.saveRefreshToken(admin.id, tokens.refreshToken);

    // Create audit log
    await this.createAuditLog(admin.id, 'ADMIN_MFA_LOGIN', 'User', admin.id, {
      email,
    });

    return {
      ...tokens,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        mfaEnabled: admin.mfaEnabled,
      },
    };
  }

  /**
   * Enable MFA for admin account
   */
  async enableMfa(adminId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }

    if (admin.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    // Generate MFA secret
    const secret = speakeasy.generateSecret({
      name: `FarmShare Admin (${admin.email})`,
      issuer: 'FarmShare Marketplace',
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Save secret temporarily (not enabled until verified)
    await this.prisma.user.update({
      where: { id: adminId },
      data: { mfaSecret: secret.base32 },
    });

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      message:
        'Scan QR code with your authenticator app and verify with a code',
    };
  }

  /**
   * Confirm and enable MFA with verification code
   */
  async confirmEnableMfa(adminId: string, dto: EnableMfaDto) {
    const { token } = dto;

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isAdmin || !admin.mfaSecret) {
      throw new BadRequestException('MFA setup not initiated');
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: admin.mfaSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Enable MFA
    await this.prisma.user.update({
      where: { id: adminId },
      data: { mfaEnabled: true },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'MFA_ENABLED', 'User', adminId, {});

    return { message: 'MFA enabled successfully' };
  }

  /**
   * Disable MFA for admin account
   */
  async disableMfa(adminId: string, dto: DisableMfaDto) {
    const { token } = dto;

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isAdmin || !admin.mfaEnabled || !admin.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    // Verify the token before disabling
    const verified = speakeasy.totp.verify({
      secret: admin.mfaSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Disable MFA
    await this.prisma.user.update({
      where: { id: adminId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'MFA_DISABLED', 'User', adminId, {});

    return { message: 'MFA disabled successfully' };
  }

  // ==================== USER MANAGEMENT ====================

  /**
   * Search and list users with filters
   */
  async searchUsers(dto: SearchUsersDto) {
    const { search, role, isVerified, page = 1, limit = 20 } = dto;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isVerified: true,
          isAdmin: true,
          verificationStatus: true,
          createdAt: true,
          lastActive: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get detailed user information
   */
  async getUserDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        pools: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        verifications: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        disputesRaised: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        transactions: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Update user information
   */
  async updateUser(adminId: string, dto: UpdateUserDto) {
    const { userId, ...updates } = dto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updates,
    });

    // Create audit log
    await this.createAuditLog(adminId, 'USER_UPDATED', 'User', userId, updates);

    return updatedUser;
  }

  /**
   * Ban a user
   */
  async banUser(adminId: string, dto: BanUserDto) {
    const { userId, reason } = dto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update user to set ban status and store details in settings
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: true,
        settings: {
          ...(user.settings as any),
          banReason: reason,
          bannedAt: new Date().toISOString(),
        },
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'USER_BANNED', 'User', userId, {
      reason,
    });

    // Send notification email
    await this.emailChannel.sendRoleChangedEmail(
      user.email,
      user.name || 'User',
      user.role,
    );

    return { message: 'User banned successfully' };
  }

  /**
   * Unban a user
   */
  async unbanUser(adminId: string, dto: UnbanUserDto) {
    const { userId } = dto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Remove ban from settings
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        settings: {
          ...(user.settings as any),
          banned: false,
          banReason: null,
          bannedAt: null,
          unbannedAt: new Date().toISOString(),
        },
      },
    });

    // Update user to use direct field instead of settings
    await this.prisma.user.update({
      where: { id: userId },
      data: { isBanned: false },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'USER_UNBANNED', 'User', userId, {});

    return { message: 'User unbanned successfully' };
  }

  /**
   * Set user on probation
   */
  async setProbation(adminId: string, dto: SetProbationDto) {
    const { userId, status, reason, duration } = dto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isBanned) {
      throw new BadRequestException('Cannot set banned user on probation');
    }

    const probationEndDate = duration
      ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
      : null;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        probationStatus: status,
        settings: {
          ...(user.settings as any),
          probationReason: reason,
          probationStartDate: new Date().toISOString(),
          probationEndDate: probationEndDate?.toISOString(),
        },
      },
    });

    // Create audit log
    await this.createAuditLog(adminId, 'USER_PROBATION_SET', 'User', userId, {
      status,
      reason,
      duration,
    });

    return {
      message: `User set on ${status.toLowerCase()} successfully`,
      probationEndDate,
    };
  }

  /**
   * Remove user from probation
   */
  async removeProbation(adminId: string, dto: RemoveProbationDto) {
    const { userId, reason } = dto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.probationStatus) {
      throw new BadRequestException('User is not on probation');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        probationStatus: null,
        settings: {
          ...(user.settings as any),
          probationReason: null,
          probationStartDate: null,
          probationEndDate: null,
          probationRemovedReason: reason,
          probationRemovedAt: new Date().toISOString(),
        },
      },
    });

    // Create audit log
    await this.createAuditLog(
      adminId,
      'USER_PROBATION_REMOVED',
      'User',
      userId,
      {
        previousStatus: user.probationStatus,
        reason,
      },
    );

    return { message: 'User removed from probation successfully' };
  }

  // ==================== VERIFICATION REVIEW ====================

  /**
   * Get pending verifications for review - consolidated by vendor
   * All verification steps for a vendor are grouped into one record
   */
  async getPendingVerifications(dto: GetPendingVerificationsDto) {
    const { page = 1, limit = 20, status = VerificationStatus.PENDING } = dto;
    const skip = (page - 1) * limit;

    // Get all verifications with the specified status
    const allVerifications = await this.prisma.verification.findMany({
      where: { status },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            verificationStatus: true,
            govtIdType: true,
            govtIdNumber: true,
            govtIdFiles: true,
            businessRegistrationNumber: true,
            taxId: true,
            bankAccountId: true,
            bankCode: true,
            bankName: true,
            bankAccountName: true,
            bankVerified: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group verifications by userId
    const groupedByUser = new Map<
      string,
      {
        userId: string;
        user: any;
        steps: any[];
        latestCreatedAt: Date;
        earliestCreatedAt: Date;
      }
    >();

    for (const verification of allVerifications) {
      const userId = verification.userId;

      if (!groupedByUser.has(userId)) {
        groupedByUser.set(userId, {
          userId,
          user: verification.user,
          steps: [],
          latestCreatedAt: verification.createdAt,
          earliestCreatedAt: verification.createdAt,
        });
      }

      const group = groupedByUser.get(userId)!;
      group.steps.push({
        id: verification.id,
        step: verification.step,
        status: verification.status,
        details: verification.details,
        externalReference: verification.externalReference,
        createdAt: verification.createdAt,
        expiresAt: verification.expiresAt,
      });

      // Track the latest and earliest dates
      if (verification.createdAt > group.latestCreatedAt) {
        group.latestCreatedAt = verification.createdAt;
      }
      if (verification.createdAt < group.earliestCreatedAt) {
        group.earliestCreatedAt = verification.createdAt;
      }
    }

    // Convert to array and sort by earliest submission date
    const consolidatedVerifications = Array.from(groupedByUser.values())
      .map((group) => ({
        id: group.steps[0].id, // Use first step's ID as primary ID
        userId: group.userId,
        user: group.user,
        steps: group.steps.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
        status: status, // All steps have same status since we filter by status
        createdAt: group.earliestCreatedAt,
        updatedAt: group.latestCreatedAt,
        // Aggregate document info from user record
        documents: {
          govtId: {
            type: group.user.govtIdType,
            number: group.user.govtIdNumber,
            files: group.user.govtIdFiles || [],
          },
          business: {
            registrationNumber: group.user.businessRegistrationNumber,
          },
          tax: {
            taxId: group.user.taxId,
          },
          bank: {
            accountId: group.user.bankAccountId,
            bankCode: group.user.bankCode,
            bankName: group.user.bankName,
            accountName: group.user.bankAccountName,
            verified: group.user.bankVerified,
          },
        },
      }))
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    // Apply pagination
    const total = consolidatedVerifications.length;
    const paginatedVerifications = consolidatedVerifications.slice(
      skip,
      skip + limit,
    );

    return {
      verifications: paginatedVerifications,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get verification details for a user
   */
  async getVerificationDetails(dto: GetVerificationDetailsDto) {
    const { userId } = dto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isVerified: true,
        verificationStatus: true,
        govtIdType: true,
        govtIdNumber: true,
        govtIdFiles: true,
        ninVerified: true,
        businessRegistrationNumber: true,
        taxId: true,
        bankAccountId: true,
        bankVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const verifications = await this.prisma.verification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      user,
      verifications,
    };
  }

  /**
   * Approve a verification - approves ALL pending steps for this vendor
   */
  async approveVerification(adminId: string, dto: ApproveVerificationDto) {
    const { verificationId, notes } = dto;

    const verification = await this.prisma.verification.findUnique({
      where: { id: verificationId },
      include: { user: true },
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    // Get all pending verifications for this user
    const allUserVerifications = await this.prisma.verification.findMany({
      where: {
        userId: verification.userId,
        status: VerificationStatus.PENDING,
      },
    });

    // Update ALL verification steps for this user to VERIFIED
    await this.prisma.verification.updateMany({
      where: {
        userId: verification.userId,
        status: VerificationStatus.PENDING,
      },
      data: {
        status: VerificationStatus.VERIFIED,
      },
    });

    // Update each verification's details individually (updateMany doesn't support JSON merge)
    for (const v of allUserVerifications) {
      await this.prisma.verification.update({
        where: { id: v.id },
        data: {
          details: {
            ...(v.details as any),
            approvedBy: adminId,
            approvedAt: new Date().toISOString(),
            notes,
          },
        },
      });
    }

    // Update user verification status
    await this.prisma.user.update({
      where: { id: verification.userId },
      data: {
        verificationStatus: VerificationStatus.VERIFIED,
        isVerified: true,
      },
    });

    // Create audit log
    await this.createAuditLog(
      adminId,
      'VERIFICATION_APPROVED',
      'Verification',
      verificationId,
      {
        userId: verification.userId,
        notes,
        stepsApproved: allUserVerifications.map((v) => v.step),
      },
    );

    // Send notification
    await this.emailChannel.sendRoleChangedEmail(
      verification.user.email,
      verification.user.name || 'User',
      verification.user.role,
    );

    return {
      message: 'Verification approved successfully',
      stepsApproved: allUserVerifications.length,
    };
  }

  /**
   * Reject a verification - rejects ALL pending steps for this vendor
   */
  async rejectVerification(adminId: string, dto: RejectVerificationDto) {
    const { verificationId, reason, feedback } = dto;

    const verification = await this.prisma.verification.findUnique({
      where: { id: verificationId },
      include: { user: true },
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    // Get all pending verifications for this user
    const allUserVerifications = await this.prisma.verification.findMany({
      where: {
        userId: verification.userId,
        status: VerificationStatus.PENDING,
      },
    });

    // Update ALL verification steps for this user to REJECTED
    await this.prisma.verification.updateMany({
      where: {
        userId: verification.userId,
        status: VerificationStatus.PENDING,
      },
      data: {
        status: VerificationStatus.REJECTED,
      },
    });

    // Update each verification's details individually
    for (const v of allUserVerifications) {
      await this.prisma.verification.update({
        where: { id: v.id },
        data: {
          details: {
            ...(v.details as any),
            rejectedBy: adminId,
            rejectedAt: new Date().toISOString(),
            reason,
            feedback,
          },
        },
      });
    }

    // Update user verification status
    await this.prisma.user.update({
      where: { id: verification.userId },
      data: {
        verificationStatus: VerificationStatus.REJECTED,
      },
    });

    // Create audit log
    await this.createAuditLog(
      adminId,
      'VERIFICATION_REJECTED',
      'Verification',
      verificationId,
      {
        userId: verification.userId,
        reason,
        feedback,
        stepsRejected: allUserVerifications.map((v) => v.step),
      },
    );

    // Send notification
    await this.emailChannel.sendRoleChangedEmail(
      verification.user.email,
      verification.user.name || 'User',
      verification.user.role,
    );

    return {
      message: 'Verification rejected successfully',
      stepsRejected: allUserVerifications.length,
    };
  }

  // ==================== DISPUTE MANAGEMENT ====================

  /**
   * Get disputes for admin review
   */
  async getDisputes(dto: GetDisputesDto) {
    const { page = 1, limit = 20, status } = dto;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [disputes, total] = await this.prisma.$transaction([
      this.prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        include: {
          pool: {
            select: {
              id: true,
              vendorId: true,
              productId: true,
              priceTotal: true,
              status: true,
            },
          },
          raisedBy: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return {
      disputes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get dispute details
   */
  async getDisputeDetails(dto: GetDisputeDetailsDto) {
    const { disputeId } = dto;

    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        pool: {
          include: {
            vendor: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            product: true,
            subscriptions: true,
            escrowEntries: true,
          },
        },
        raisedBy: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return dispute;
  }

  /**
   * Update dispute status
   */
  async updateDisputeStatus(adminId: string, dto: UpdateDisputeStatusDto) {
    const { disputeId, status, notes } = dto;

    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: { status },
    });

    // Create audit log
    await this.createAuditLog(
      adminId,
      'DISPUTE_STATUS_UPDATED',
      'Dispute',
      disputeId,
      { status, notes },
    );

    return { message: 'Dispute status updated successfully' };
  }

  /**
   * Resolve dispute with escrow distribution
   */
  async resolveDispute(adminId: string, dto: ResolveDisputeDto) {
    const { disputeId, resolution, distribution } = dto;

    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        pool: {
          include: {
            escrowEntries: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    // Update dispute
    await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolutionNotes: resolution,
        distribution: distribution ?? Prisma.JsonNull,
      },
    });

    // If distribution is provided, update escrow
    if (distribution && dispute.pool.escrowEntries.length > 0) {
      const escrowEntry = dispute.pool.escrowEntries[0];
      const totalHeld = Number(escrowEntry.totalHeld);

      const buyerAmount = (totalHeld * distribution.buyer) / 100;
      const vendorAmount = (totalHeld * distribution.vendor) / 100;

      await this.prisma.escrowEntry.update({
        where: { id: escrowEntry.id },
        data: {
          releasedAmount: vendorAmount,
          withheldAmount: buyerAmount,
          withheldReason: `Dispute resolved: ${resolution}`,
          computations: {
            ...(escrowEntry.computations as any),
            resolvedBy: adminId,
            resolvedAt: new Date().toISOString(),
            distribution,
          },
        },
      });
    }

    // Create audit log
    await this.createAuditLog(
      adminId,
      'DISPUTE_RESOLVED',
      'Dispute',
      disputeId,
      { resolution, distribution },
    );

    return { message: 'Dispute resolved successfully' };
  }

  // ==================== PAYOUT MANAGEMENT ====================

  /**
   * Get all payouts (escrow releases) with filtering
   */
  async getPayouts(dto: GetPayoutsDto) {
    const { page = 1, limit = 20, status, vendorId } = dto;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status.toUpperCase();
    }
    if (vendorId) {
      where.pool = { vendorId };
    }

    const [escrowEntries, total] = await this.prisma.$transaction([
      this.prisma.escrowEntry.findMany({
        where,
        skip,
        take: limit,
        include: {
          pool: {
            include: {
              vendor: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  bankAccountId: true,
                  bankName: true,
                  bankAccountName: true,
                },
              },
              product: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.escrowEntry.count({ where }),
    ]);

    // Calculate platform fee for each payout
    const payouts = escrowEntries.map((entry) => {
      const totalHeld = Number(entry.totalHeld);
      const platformFee = new Decimal(totalHeld)
        .mul(this.PLATFORM_FEE_RATE)
        .toNumber();
      const netPayout = new Decimal(totalHeld).sub(platformFee).toNumber();

      return {
        id: entry.id,
        poolId: entry.poolId,
        vendor: entry.pool?.vendor,
        product: entry.pool?.product,
        totalHeld,
        platformFee,
        platformFeeRate: this.PLATFORM_FEE_RATE,
        netPayout,
        releasedAmount: Number(entry.releasedAmount),
        withheldAmount: Number(entry.withheldAmount),
        status: entry.status,
        transferReference: entry.transferReference,
        createdAt: entry.createdAt,
      };
    });

    return {
      payouts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Simulate a payout - calculate fees without actually releasing funds
   */
  async simulatePayout(dto: SimulatePayoutDto) {
    const { poolId } = dto;

    const pool = await this.prisma.pool.findUnique({
      where: { id: poolId },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            bankAccountId: true,
            bankCode: true,
            bankName: true,
            bankAccountName: true,
            paystackRecipientCode: true,
          },
        },
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        escrowEntries: true,
      },
    });

    if (!pool) {
      throw new NotFoundException('Pool not found');
    }

    const escrow = pool.escrowEntries[0];
    if (!escrow) {
      throw new NotFoundException('No escrow entry found for this pool');
    }

    const totalHeld = Number(escrow.totalHeld);
    const withheldAmount = Number(escrow.withheldAmount);
    const alreadyReleased = Number(escrow.releasedAmount);
    const availableForPayout = totalHeld - withheldAmount - alreadyReleased;

    // Calculate 2% platform fee
    const platformFee = new Decimal(availableForPayout)
      .mul(this.PLATFORM_FEE_RATE)
      .toDecimalPlaces(2)
      .toNumber();
    const netPayoutToVendor = new Decimal(availableForPayout)
      .sub(platformFee)
      .toDecimalPlaces(2)
      .toNumber();

    // Breakdown by buyer
    const buyerBreakdown = pool.subscriptions.map((sub) => {
      const amountPaid = Number(sub.amountPaid);
      const buyerFee = new Decimal(amountPaid)
        .mul(this.PLATFORM_FEE_RATE)
        .toDecimalPlaces(2)
        .toNumber();
      return {
        buyerId: sub.user.id,
        buyerName: sub.user.name,
        buyerEmail: sub.user.email,
        amountPaid,
        platformFee: buyerFee,
        netToVendor: new Decimal(amountPaid)
          .sub(buyerFee)
          .toDecimalPlaces(2)
          .toNumber(),
        slots: sub.slots,
      };
    });

    return {
      pool: {
        id: pool.id,
        status: pool.status,
        priceTotal: Number(pool.priceTotal),
      },
      vendor: pool.vendor,
      escrow: {
        totalHeld,
        withheldAmount,
        alreadyReleased,
        availableForPayout,
      },
      calculation: {
        platformFeeRate: `${this.PLATFORM_FEE_RATE * 100}%`,
        platformFee,
        netPayoutToVendor,
      },
      buyerBreakdown,
      canPayout: availableForPayout > 0 && pool.status === 'COMPLETED',
      vendorBankConfigured:
        !!pool.vendor.paystackRecipientCode ||
        (!!pool.vendor.bankAccountId && !!pool.vendor.bankCode),
    };
  }

  /**
   * Initiate an actual payout to vendor (simulated for demo)
   */
  async initiatePayout(adminId: string, dto: InitiatePayoutDto) {
    const { poolId, notes } = dto;

    // First simulate to get all the calculations
    const simulation = await this.simulatePayout({ poolId });

    if (!simulation.canPayout) {
      throw new BadRequestException('This pool is not eligible for payout');
    }

    if (!simulation.vendorBankConfigured) {
      throw new BadRequestException('Vendor bank details not configured');
    }

    const escrow = await this.prisma.escrowEntry.findFirst({
      where: { poolId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow entry not found');
    }

    // Simulate the payout (in production, this would call Paystack transfer)
    const transferReference = `PAYOUT_${poolId}_${Date.now()}`;

    // Update escrow entry
    await this.prisma.escrowEntry.update({
      where: { id: escrow.id },
      data: {
        releasedAmount: simulation.escrow.availableForPayout,
        status: 'RELEASED',
        transferReference,
        computations: {
          ...(escrow.computations as any),
          payout: {
            initiatedBy: adminId,
            initiatedAt: new Date().toISOString(),
            platformFee: simulation.calculation.platformFee,
            netPayout: simulation.calculation.netPayoutToVendor,
            notes,
          },
        },
      },
    });

    // Create transaction records
    await this.prisma.transaction.create({
      data: {
        userId: simulation.vendor.id,
        poolId,
        amount: simulation.calculation.netPayoutToVendor,
        fees: simulation.calculation.platformFee,
        status: 'SUCCESS',
        type: 'ESCROW_RELEASE',
        externalTxnId: transferReference,
        metadata: {
          platformFee: simulation.calculation.platformFee,
          platformFeeRate: this.PLATFORM_FEE_RATE,
          notes,
        },
      },
    });

    // Create audit log
    await this.createAuditLog(
      adminId,
      'PAYOUT_INITIATED',
      'Escrow',
      escrow.id,
      {
        poolId,
        vendorId: simulation.vendor.id,
        amount: simulation.calculation.netPayoutToVendor,
        platformFee: simulation.calculation.platformFee,
        notes,
      },
    );

    // Send notification to vendor
    const vendorName = simulation.vendor.name || 'Vendor';
    const payoutHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">🌾 FarmShare</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937;">Payout Initiated!</h2>
          <p style="color: #4b5563; font-size: 16px;">Hello ${vendorName},</p>
          <p style="color: #4b5563; font-size: 16px;">
            A payout of <strong>₦${simulation.calculation.netPayoutToVendor.toLocaleString()}</strong> has been initiated to your bank account.
          </p>
          <div style="background: #22c55e; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px;">Pool ID: ${poolId}</p>
            <p style="margin: 5px 0 0 0; font-size: 12px;">Platform fee: ₦${simulation.calculation.platformFee.toLocaleString()}</p>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            The funds should arrive in your account within 1-2 business days.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">© ${new Date().getFullYear()} FarmShare. All rights reserved.</p>
        </div>
      </div>
    `;
    await this.emailChannel.send(
      simulation.vendor.email,
      'Payout Initiated - FarmShare',
      payoutHtml,
    );

    return {
      message: 'Payout initiated successfully',
      payout: {
        transferReference,
        amount: simulation.calculation.netPayoutToVendor,
        platformFee: simulation.calculation.platformFee,
        vendor: simulation.vendor.name,
        status: 'RELEASED',
      },
    };
  }

  /**
   * Get vendor payout statistics
   */
  async getVendorPayoutStats(dto: GetVendorPayoutStatsDto) {
    const { startDate, endDate } = dto;

    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    const where: any = {
      status: 'RELEASED',
    };
    if (Object.keys(dateFilter).length > 0) {
      where.createdAt = dateFilter;
    }

    // Get released escrow entries with vendor info
    const releasedPayouts = await this.prisma.escrowEntry.findMany({
      where,
      include: {
        pool: {
          include: {
            vendor: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Aggregate stats
    const vendorStats = new Map<
      string,
      {
        vendorId: string;
        vendorName: string;
        vendorEmail: string;
        totalPayouts: number;
        totalAmount: number;
        totalFees: number;
        payoutCount: number;
      }
    >();

    let totalPaidOut = 0;
    let totalPlatformFees = 0;

    for (const payout of releasedPayouts) {
      const vendorId = payout.pool?.vendor?.id;
      if (!vendorId) continue;

      const releasedAmount = Number(payout.releasedAmount);
      const platformFee = new Decimal(releasedAmount)
        .mul(this.PLATFORM_FEE_RATE)
        .toNumber();
      const netPayout = releasedAmount - platformFee;

      totalPaidOut += netPayout;
      totalPlatformFees += platformFee;

      if (!vendorStats.has(vendorId)) {
        vendorStats.set(vendorId, {
          vendorId,
          vendorName: payout.pool.vendor.name || 'Unknown',
          vendorEmail: payout.pool.vendor.email,
          totalPayouts: 0,
          totalAmount: 0,
          totalFees: 0,
          payoutCount: 0,
        });
      }

      const stats = vendorStats.get(vendorId)!;
      stats.totalPayouts += netPayout;
      stats.totalAmount += releasedAmount;
      stats.totalFees += platformFee;
      stats.payoutCount += 1;
    }

    // Get pending payouts
    const pendingPayouts = await this.prisma.escrowEntry.aggregate({
      where: {
        status: { in: ['HELD', 'RELEASABLE'] },
      },
      _sum: { totalHeld: true },
      _count: true,
    });

    const pendingAmount = Number(pendingPayouts._sum.totalHeld || 0);
    const pendingPlatformFees = new Decimal(pendingAmount)
      .mul(this.PLATFORM_FEE_RATE)
      .toNumber();

    return {
      summary: {
        totalVendorsPaid: vendorStats.size,
        totalPayoutCount: releasedPayouts.length,
        totalAmountPaidOut: totalPaidOut,
        totalPlatformFeesCollected: totalPlatformFees,
        platformFeeRate: `${this.PLATFORM_FEE_RATE * 100}%`,
      },
      pending: {
        count: pendingPayouts._count,
        amount: pendingAmount,
        estimatedFees: pendingPlatformFees,
      },
      vendorBreakdown: Array.from(vendorStats.values()).sort(
        (a, b) => b.totalPayouts - a.totalPayouts,
      ),
      period: {
        startDate: startDate || 'All time',
        endDate: endDate || 'Present',
      },
    };
  }

  // ==================== HELPER METHODS ====================

  private generateTokens(admin: any) {
    const payload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      isAdmin: admin.isAdmin,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return { accessToken, refreshToken };
  }

  // ==================== METRICS ====================

  /**
   * Get revenue metrics for charts
   */
  async getRevenueMetrics(period: string = 'week') {
    const days = period === 'month' ? 30 : 7;
    const data: { name: string; date: string; revenue: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const revenue = await this.prisma.transaction.aggregate({
        where: {
          createdAt: {
            gte: date,
            lt: nextDate,
          },
          status: 'SUCCESS',
          type: 'ESCROW_HOLD',
        },
        _sum: { amount: true },
      });

      data.push({
        name: date.toLocaleDateString('en-US', { weekday: 'short' }),
        date: date.toISOString().split('T')[0],
        revenue: Number(revenue._sum.amount || 0),
      });
    }

    return data;
  }

  /**
   * Get user growth metrics for charts
   */
  async getUserGrowthMetrics(period: string = 'month') {
    const months = period === 'year' ? 12 : 6;
    const data: {
      name: string;
      month: string;
      users: number;
      vendors: number;
      buyers: number;
    }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);

      const nextMonth = new Date(date);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const [users, vendors, buyers] = await Promise.all([
        this.prisma.user.count({
          where: {
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),
        this.prisma.user.count({
          where: {
            role: 'VENDOR',
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),
        this.prisma.user.count({
          where: {
            role: 'BUYER',
            createdAt: {
              gte: date,
              lt: nextMonth,
            },
          },
        }),
      ]);

      data.push({
        name: date.toLocaleDateString('en-US', { month: 'short' }),
        month: date.toISOString().split('T')[0],
        users,
        vendors,
        buyers,
      });
    }

    return data;
  }

  /**
   * Get pool distribution metrics for charts
   */
  async getPoolDistributionMetrics() {
    // Get pools with their product categories
    const pools = await this.prisma.pool.findMany({
      select: {
        id: true,
        product: {
          select: { category: true },
        },
      },
    });

    // Group by category manually
    const categoryCount: Record<string, number> = {};
    pools.forEach((pool) => {
      const category = pool.product?.category || 'OTHER';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    const colors: Record<string, string> = {
      VEGETABLES: 'hsl(var(--chart-1))',
      FRUITS: 'hsl(var(--chart-2))',
      GRAINS: 'hsl(var(--chart-3))',
      DAIRY: 'hsl(var(--chart-4))',
      MEAT: 'hsl(var(--chart-5))',
      OTHER: 'hsl(var(--muted))',
    };

    return Object.entries(categoryCount).map(([category, count]) => ({
      name: category || 'Other',
      value: count,
      color: colors[category.toUpperCase()] || colors.OTHER,
    }));
  }

  // ==================== DASHBOARD ====================

  /**
   * Get admin dashboard statistics
   */
  async getDashboardStats() {
    const [
      totalUsers,
      totalVendors,
      totalBuyers,
      verifiedVendors,
      pendingVerifications,
      activeDisputes,
      completedVerifications,
      bannedUsers,
      probationUsers,
      totalPools,
      activePools,
      completedPools,
      totalEscrowAmount,
      releasedEscrowAmount,
    ] = await Promise.all([
      // Total users
      this.prisma.user.count(),

      // Total vendors
      this.prisma.user.count({ where: { role: 'VENDOR' } }),

      // Total buyers
      this.prisma.user.count({ where: { role: 'BUYER' } }),

      // Verified vendors (approved)
      this.prisma.user.count({
        where: {
          role: 'VENDOR',
          verificationStatus: 'verified',
        },
      }),

      // Pending verifications
      this.prisma.verification.count({
        where: { status: VerificationStatus.PENDING },
      }),

      // Active disputes
      this.prisma.dispute.count({
        where: { status: 'open' },
      }),

      // Completed verifications
      this.prisma.verification.count({
        where: { status: VerificationStatus.VERIFIED },
      }),

      // Banned users
      this.prisma.user.count({ where: { isBanned: true } }),

      // Probation users
      this.prisma.user.count({
        where: {
          probationStatus: { not: null },
          isBanned: false,
        },
      }),

      // Pool statistics
      this.prisma.pool.count(),
      this.prisma.pool.count({ where: { status: 'OPEN' } }),
      this.prisma.pool.count({ where: { status: 'COMPLETED' } }),

      // Escrow statistics
      this.prisma.escrowEntry.aggregate({
        _sum: { totalHeld: true },
      }),
      this.prisma.escrowEntry.aggregate({
        _sum: { releasedAmount: true },
      }),
    ]);

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      newUsersThisWeek,
      newVerificationsThisWeek,
      newDisputesThisWeek,
      completedPoolsThisWeek,
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.verification.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.dispute.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.pool.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { gte: sevenDaysAgo },
        },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        vendors: totalVendors,
        buyers: totalBuyers,
        verifiedVendors: verifiedVendors,
        banned: bannedUsers,
        probation: probationUsers,
        newThisWeek: newUsersThisWeek,
      },
      verifications: {
        pending: pendingVerifications,
        completed: completedVerifications,
        newThisWeek: newVerificationsThisWeek,
      },
      disputes: {
        active: activeDisputes,
        newThisWeek: newDisputesThisWeek,
      },
      pools: {
        total: totalPools,
        active: activePools,
        completed: completedPools,
        completedThisWeek: completedPoolsThisWeek,
      },
      escrow: {
        totalHeld: totalEscrowAmount._sum.totalHeld || 0,
        totalReleased: releasedEscrowAmount._sum.releasedAmount || 0,
      },
      metrics: {
        verificationCompletionRate:
          totalUsers > 0
            ? Math.round((completedVerifications / totalUsers) * 100)
            : 0,
        disputeRate:
          totalPools > 0 ? Math.round((activeDisputes / totalPools) * 100) : 0,
        userGrowthRate: newUsersThisWeek,
      },
    };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const hashedToken = await bcrypt.hash(token, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedToken },
    });
  }

  private async createAuditLog(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: any,
  ) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        details,
      },
    });
  }
}
