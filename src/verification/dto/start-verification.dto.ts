import { IsString, IsEnum, IsArray, IsOptional } from 'class-validator';
import { GovtIdType } from '@prisma/client';

export class StartVerificationDto {
  @IsString()
  userId: string;

  @IsArray()
  @IsEnum(['govt_id', 'bank', 'business_reg', 'tax'], { each: true })
  steps: string[];
}

export class SubmitVerificationDto {
  @IsString()
  verificationId: string;

  @IsOptional()
  @IsArray()
  files?: Express.Multer.File[];

  @IsOptional()
  metadata?: Record<string, any>;
}

export class OverrideVerificationDto {
  @IsString()
  userId: string;

  @IsEnum(['VERIFIED', 'REJECTED', 'EXPIRED'])
  status: 'VERIFIED' | 'REJECTED' | 'EXPIRED';

  @IsString()
  reason: string;
}
