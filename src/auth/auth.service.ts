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
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  private async generateOtp(): Promise<string> {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async signUp(signUpDto: SignUpDto) {
    const { email, password, name } = signUpDto;

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = await this.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60000);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        otp,
        otpExpiry,
      },
    });

    await this.emailService.sendOtpEmail(email, name, otp);

    return {
      message: 'OTP sent to your email',
      userId: user.id,
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    if (user.otp !== otp || !user.otpExpiry || new Date() > user.otpExpiry) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        otp: null,
        otpExpiry: null,
      },
    });

    const payload = {
      sub: updatedUser.id,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
      role: updatedUser.role, // Assuming role is a field in the user model
    };
    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }

  async resendOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.isVerified) {
      throw new BadRequestException('Email already verified');
    }

    const otp = await this.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { otp, otpExpiry },
    });

    await this.emailService.sendOtpEmail(email, user.name || 'User', otp);

    return { message: 'New OTP sent to your email' };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('Invalid credentials');
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Email not verified');
    }

    const passwordValid = await bcrypt.compare(password, user.password || '');
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      role: user.role, // Assuming role is a field in the user model
    };
    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
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

    await this.emailService.sendPasswordResetEmail(
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
          password: '',
          isVerified: true,
          isAdmin: false,
        },
      });
    } else if (!dbUser.isVerified) {
      await this.prisma.user.update({
        where: { id: dbUser.id },
        data: { isVerified: true },
      });
    }

    const payload = {
      sub: dbUser.id,
      email: dbUser.email,
      isAdmin: dbUser.isAdmin,
      role: dbUser.role, // Assuming role is a field in the user model
    };
    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        role: true,
        createdAt: true,
      },
    });
  }
}
