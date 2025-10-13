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
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailChannelService } from '../notifications/channels/email.channel';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailChannel: EmailChannelService,
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
    const { email, password, name, role } = signUpDto as any;

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

    // Save pending signup instead of creating a user
    await this.prisma.pendingSignup.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        otp,
        otpExpiry,
      },
    });

    await this.emailChannel.sendOtpEmail(email, name, otp);

    return {
      message: 'OTP sent to your email',
    };
  }
  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;

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
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Create verified user now
    const user = await this.prisma.user.create({
      data: {
        email: pending.email,
        name: pending.name,
        password: pending.password,
        role: pending.role,
        verificationStatus: 'VERIFIED',
      },
    });

    // Clean up pending record
    await this.prisma.pendingSignup.delete({ where: { email } });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const { accessToken, refreshToken } = this.generateTokens(payload);
    await this.saveRefreshToken(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
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

    if (user.verificationStatus !== 'VERIFIED') {
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

  async oAuthLogin(user: { email: string; name: string }) {
    if (!user) {
      throw new Error('User not found');
    }

    let dbUser = await this.prisma.user.findUnique({
      where: { email: user.email },
    });

    if (!dbUser) {
      dbUser = await this.prisma.user.create({
        data: {
          email: user.email,
          name: user.name,
          phone: '0000000000',
          // role: user.rolel || 'buyer',
          password: '',
          verificationStatus: 'VERIFIED',
        },
      });
    } else if (dbUser.verificationStatus !== 'VERIFIED') {
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { verificationStatus: 'VERIFIED' },
      });
    }

    const payload = {
      sub: dbUser.id,
      email: dbUser.email,
      role: dbUser.role, // Assuming role is a field in the user model
    };
    const { accessToken, refreshToken } = this.generateTokens(payload);
    await this.saveRefreshToken(dbUser.id, refreshToken);
    return { accessToken, refreshToken };
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
