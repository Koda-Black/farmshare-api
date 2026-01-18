// src/auth/auth.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../services/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailChannelService } from '../notifications/channels/email.channel';
import { SecurityService } from '../common/services/security.service';
import { NotificationsService } from '../notifications/notifications.service';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailChannel: EmailChannelService,
    private securityService: SecurityService,
    private notificationsService: NotificationsService,
  ) {}

  private generateTokens(payload: any) {
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  }

  private async hashToken(token: string) {
    return bcrypt.hash(token, 10);
  }

  private async saveRefreshToken(userId: string, token: string) {
    const hashedToken = await this.hashToken(token);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedToken },
    });
  }

  private async generateOtp(): Promise<string> {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async signUp(signUpDto: SignUpDto) {
    const { email, password, name, role, state, country, city } =
      signUpDto as any;

    // Check if a verified user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Check for pending signup
    const pending = await this.prisma.pendingSignup.findUnique({
      where: { email },
    });
    if (pending) {
      await this.resendOtp(email); // reuse resend logic
      throw new BadRequestException('Verification pending. OTP resent.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = await this.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60000);

    // Save pending signup with location fields
    await this.prisma.pendingSignup.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        otp,
        otpExpiry,
        state: state || 'Lagos', // Default to Lagos if not provided
        country: country || 'Nigeria',
        city,
      },
    });

    // Try to send email, but don't fail signup if email fails
    let emailSent = false;
    try {
      await this.emailChannel.sendOtpEmail(email, name, otp);
      emailSent = true;
    } catch (error) {
      console.error('Failed to send OTP email:', error.message);
      // In development, we'll return the OTP so testing can proceed
    }

    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';

    return {
      message: emailSent
        ? 'OTP sent to your email'
        : 'Account created. Email delivery failed - check your email settings.',
      emailSent,
      // In development, return OTP for testing when email fails
      ...(isDev && !emailSent
        ? { otp, devNote: 'OTP returned for dev testing since email failed' }
        : {}),
    };
  }
  async verifyOtp(verifyOtpDto: VerifyOtpDto, ipAddress?: string) {
    const { email, otp } = verifyOtpDto;

    // Check rate limit and lockout status
    await this.securityService.checkOtpRateLimit(email, ipAddress);

    const pending = await this.prisma.pendingSignup.findUnique({
      where: { email },
    });
    if (!pending) {
      throw new NotFoundException('No pending verification found');
    }

    if (
      pending.otp !== otp ||
      !pending.otpExpiry ||
      new Date() > pending.otpExpiry
    ) {
      // Record failed attempt
      await this.securityService.recordFailedOtpAttempt(email, ipAddress);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Clear OTP attempts on success
    await this.securityService.clearOtpAttempts(email);

    // Create verified user and cleanup pending record atomically
    const user = await this.prisma.executeQuickTransaction(async (tx) => {
      // Create verified user with location fields
      const newUser = await tx.user.create({
        data: {
          email: pending.email,
          name: pending.name,
          password: pending.password,
          role: pending.role,
          isVerified: true,
          // Location fields from pending signup
          state: pending.state,
          country: pending.country,
          city: pending.city,
        },
      });

      // Clean up pending record
      await tx.pendingSignup.delete({ where: { email } });

      return newUser;
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const { accessToken, refreshToken } = this.generateTokens(payload);
    await this.saveRefreshToken(user.id, refreshToken);

    // Send welcome notification (async, don't await to not block response)
    this.notificationsService
      .sendWelcomeNotification({
        id: user.id,
        email: user.email,
        name: user.name || 'User',
        role: user.role,
      })
      .catch((err) =>
        console.error('Failed to send welcome notification:', err),
      );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        state: user.state,
        country: user.country,
      },
    };
  }

  async resendOtp(email: string) {
    const pending = await this.prisma.pendingSignup.findUnique({
      where: { email },
    });
    if (!pending) {
      throw new NotFoundException('No pending verification found');
    }

    const otp = await this.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60000);

    await this.prisma.pendingSignup.update({
      where: { email },
      data: { otp, otpExpiry },
    });

    await this.emailChannel.sendOtpEmail(email, pending.name || 'User', otp);

    return { message: 'New OTP sent to your email' };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('Invalid credentials');
    }

    if (user.isVerified !== true) {
      throw new ForbiddenException('Email not verified');
    }

    const passwordValid = await bcrypt.compare(password, user.password || '');
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role, // Assuming role is a field in the user model
    };
    const { accessToken, refreshToken } = this.generateTokens(payload);

    await this.saveRefreshToken(user.id, refreshToken);
    return { accessToken, refreshToken, user };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) throw new UnauthorizedException('User not found');

      const isMatch = await bcrypt.compare(token, user.refreshToken || '');
      if (!isMatch) throw new UnauthorizedException('Invalid refresh token');

      const newTokens = this.generateTokens({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      await this.saveRefreshToken(user.id, newTokens.refreshToken);
      return newTokens;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async initiatePasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user)
      return { message: 'If an account exists, a reset email was sent' };

    const resetToken = this.jwtService.sign({ email }, { expiresIn: '1h' });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetToken },
    });

    await this.emailChannel.sendPasswordResetEmail(
      email,
      user.name || 'User',
      resetToken,
    );

    return { message: 'Password reset email sent' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, token, newPassword } = resetPasswordDto;

    try {
      this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.resetToken !== token) {
      throw new UnauthorizedException('Invalid token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
      },
    });

    return { message: 'Password reset successful' };
  }

  async oAuthLogin(
    user: { email: string; name: string; picture?: string },
    mode: string = 'signup',
  ): Promise<{
    accessToken?: string;
    refreshToken?: string;
    user?: { id: string; role: string; email: string; name: string };
    needsSignup?: boolean;
    accountNotFound?: boolean;
  }> {
    if (!user) {
      throw new Error('User not found');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { email: user.email },
    });

    // If mode is 'login' and user doesn't exist, return error
    if (mode === 'login' && !dbUser) {
      return { accountNotFound: true };
    }

    // If user doesn't exist, they need to complete signup
    if (!dbUser) {
      return { needsSignup: true };
    }

    // User exists - generate tokens and login
    if (dbUser.isVerified !== true) {
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { isVerified: true },
      });
    }

    const payload = {
      sub: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
    };
    const { accessToken, refreshToken } = this.generateTokens(payload);
    await this.saveRefreshToken(dbUser.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: dbUser.id,
        role: dbUser.role,
        email: dbUser.email,
        name: dbUser.name || user.name,
      },
    };
  }

  /**
   * Complete Google signup with state/city information
   */
  async completeGoogleSignup(data: {
    email: string;
    name: string;
    picture?: string;
    role: 'BUYER' | 'VENDOR';
    state: string;
    city?: string;
  }) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Generate a random secure password for OAuth users
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(randomPassword, 10);

    // Create the user with all details
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        phone: '0000000000', // Placeholder for Google signups
        role: data.role,
        password: hashedPassword,
        isVerified: true,
        state: data.state,
        country: 'Nigeria',
        city: data.city,
        avatarUrl: data.picture,
      },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const { accessToken, refreshToken } = this.generateTokens(payload);
    await this.saveRefreshToken(user.id, refreshToken);

    // Send welcome notification
    this.notificationsService
      .sendWelcomeNotification({
        id: user.id,
        email: user.email,
        name: user.name || 'User',
        role: user.role,
      })
      .catch((err) =>
        console.error('Failed to send welcome notification:', err),
      );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        state: user.state,
        country: user.country,
      },
      // Vendors need to go to verification after signup
      redirectTo:
        data.role === 'VENDOR' ? '/vendor/verification' : '/buyer/marketplace',
    };
  }

  /**
   * Check if an email already exists
   */
  async checkEmailExists(
    email: string,
  ): Promise<{ exists: boolean; role?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { role: true },
    });

    return {
      exists: !!user,
      role: user?.role,
    };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });
  }
}
