import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsUUID,
} from 'class-validator';
import { VerificationStatus } from '@prisma/client';
import { Type } from 'class-transformer';

export class GetPendingVerificationsDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: VerificationStatus, example: VerificationStatus.PENDING })
  @IsEnum(VerificationStatus)
  @IsOptional()
  status?: VerificationStatus;
}

export class ApproveVerificationDto {
  @ApiProperty({ example: 'abc123', description: 'Verification ID' })
  @IsUUID()
  verificationId: string;

  @ApiPropertyOptional({ example: 'All documents verified successfully' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class RejectVerificationDto {
  @ApiProperty({ example: 'abc123', description: 'Verification ID' })
  @IsUUID()
  verificationId: string;

  @ApiProperty({ example: 'ID document is not clear' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ example: 'Please re-upload a clearer image' })
  @IsString()
  @IsOptional()
  feedback?: string;
}

export class GetVerificationDetailsDto {
  @ApiProperty({ example: 'user123', description: 'User ID' })
  @IsUUID()
  userId: string;
}
