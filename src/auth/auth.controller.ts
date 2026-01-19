// src/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  Param,
  Ip,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleOauthGuard } from './guards/google-oauth.guard';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Post('signup/buyer')
  async signupBuyer(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp({ ...signUpDto, role: 'BUYER' });
  }

  @Post('signup/vendor')
  async signupVendor(@Body() signUpDto: SignUpDto) {
    return this.authService.signUp({ ...signUpDto, role: 'VENDOR' });
  }

  @Post('verify-otp')
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto, @Ip() ipAddress: string) {
    return this.authService.verifyOtp(verifyOtpDto, ipAddress);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') token: string) {
    return this.authService.refreshToken(token);
  }

  @Post('resend-otp')
  async resendOtp(@Body('email') email: string) {
    return this.authService.resendOtp(email);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.initiatePasswordReset(email);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  /**
   * Initiate Google OAuth - stores role and mode in session/state
   * Redirect URL: /auth/google?role=buyer&mode=signup
   * or: /auth/google?mode=login
   */
  @Get('google')
  @UseGuards(GoogleOauthGuard)
  async googleAuth() {
    // The guard handles the redirect to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleOauthGuard)
  async googleAuthCallback(
    @Req()
    req: Request & {
      user: { email: string; name: string; picture?: string };
    },
    @Res() res: Response,
  ) {
    const frontendUrl =
      process.env.PRODUCTION_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      'http://localhost:3000';

    try {
      // Check if user exists
      const result = await this.authService.oAuthLogin(
        req.user as any,
        'check',
      );

      if (result.needsSignup) {
        // User doesn't exist - redirect to complete signup with Google data
        const googleData = encodeURIComponent(
          JSON.stringify({
            email: req.user.email,
            name: req.user.name,
            picture: req.user.picture,
          }),
        );
        res.redirect(
          `${frontendUrl}/google?mode=signup&googleData=${googleData}`,
        );
      } else {
        // Existing user - login successful
        res.redirect(
          `${frontendUrl}/google?token=${result.accessToken}&refresh=${result.refreshToken}&role=${result.user?.role || 'BUYER'}`,
        );
      }
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect(`${frontendUrl}/google?error=oauth_failed`);
    }
  }

  /**
   * Complete Google signup with additional details (state, city, role)
   */
  @Post('google/complete-signup')
  async completeGoogleSignup(
    @Body()
    body: {
      email: string;
      name: string;
      picture?: string;
      role: 'BUYER' | 'VENDOR';
      state: string;
      city?: string;
    },
  ) {
    return this.authService.completeGoogleSignup(body);
  }

  /**
   * Check if an email exists (for Google login flow)
   */
  @Post('check-email')
  async checkEmail(@Body('email') email: string) {
    return this.authService.checkEmailExists(email);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req) {
    return this.authService.getProfile(req.user.userId);
  }
}
