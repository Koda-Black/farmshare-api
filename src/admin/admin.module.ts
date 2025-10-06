import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../services/prisma.service';
import { JwtModule } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminController],
  providers: [AdminService, PrismaService, EmailService, RolesGuard],
})
export class AdminModule {}
