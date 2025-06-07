import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtGuardStrategy } from './strategies/jwt-auth.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleOauthGuard } from './guards/google-oauth.guard';
import { GoogleStrategy } from './strategies/google-oauth.strategy';
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: {
          expiresIn: '3d',
        },
        global: true,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtGuardStrategy,
    JwtAuthGuard,
    GoogleStrategy,
    GoogleOauthGuard,
  ],
})
export class AuthModule {}
