import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsUUID,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PayoutStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class GetPayoutsDto {
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

  @ApiPropertyOptional({ enum: PayoutStatus })
  @IsEnum(PayoutStatus)
  @IsOptional()
  status?: PayoutStatus;

  @ApiPropertyOptional({ description: 'Filter by vendor ID' })
  @IsUUID()
  @IsOptional()
  vendorId?: string;
}

export class InitiatePayoutDto {
  @ApiProperty({ example: 'pool-uuid', description: 'Pool ID to pay out' })
  @IsUUID()
  poolId: string;

  @ApiPropertyOptional({ description: 'Notes for this payout' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class SimulatePayoutDto {
  @ApiProperty({
    example: 'pool-uuid',
    description: 'Pool ID to simulate payout for',
  })
  @IsUUID()
  poolId: string;
}

export class GetVendorPayoutStatsDto {
  @ApiPropertyOptional({ description: 'Start date for the stats period' })
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for the stats period' })
  @IsOptional()
  endDate?: string;
}
