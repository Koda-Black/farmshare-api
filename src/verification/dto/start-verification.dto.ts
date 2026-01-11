import { IsString, IsEnum, IsArray, IsOptional, IsUUID } from 'class-validator';
import { GovtIdType } from '@prisma/client';

// Step values that are accepted by the verification system
// Maps to: govt_id, bank, business_reg, tax (legacy) OR id, bank, business, details (new frontend)
export const VALID_VERIFICATION_STEPS = [
  'govt_id',
  'bank',
  'business_reg',
  'tax', // Legacy/backend names
  'id',
  'business',
  'details', // New frontend names (bank is shared)
] as const;

export class StartVerificationDto {
  @IsOptional()
  @IsUUID()
  userId?: string; // Made optional - will use authenticated user if not provided

  @IsArray()
  @IsString({ each: true })
  steps: string[];
}

export class SubmitVerificationDto {
  @IsUUID()
  verificationId: string;

  @IsOptional()
  @IsArray()
  files?: Express.Multer.File[];

  @IsOptional()
  metadata?: Record<string, any>;
}

export class OverrideVerificationDto {
  @IsUUID()
  userId: string;

  @IsEnum(['VERIFIED', 'REJECTED', 'EXPIRED'])
  status: 'VERIFIED' | 'REJECTED' | 'EXPIRED';

  @IsString()
  reason: string;
}
