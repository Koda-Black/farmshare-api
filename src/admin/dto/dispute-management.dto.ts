import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsUUID,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DisputeStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export class GetDisputesDto {
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

  @ApiPropertyOptional({ enum: DisputeStatus, example: DisputeStatus.OPEN })
  @IsEnum(DisputeStatus)
  @IsOptional()
  status?: DisputeStatus;
}

export class UpdateDisputeStatusDto {
  @ApiProperty({ example: 'dispute123', description: 'Dispute ID' })
  @IsUUID()
  disputeId: string;

  @ApiProperty({ enum: DisputeStatus, example: DisputeStatus.INVESTIGATING })
  @IsEnum(DisputeStatus)
  status: DisputeStatus;

  @ApiPropertyOptional({ example: 'Reviewing evidence submitted by both parties' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class ResolveDisputeDto {
  @ApiProperty({ example: 'dispute123', description: 'Dispute ID' })
  @IsUUID()
  disputeId: string;

  @ApiProperty({ example: 'Refund approved for buyer' })
  @IsString()
  resolution: string;

  @ApiPropertyOptional({
    example: { buyer: 80, vendor: 20 },
    description: 'Percentage distribution of escrow funds',
  })
  @IsOptional()
  distribution?: {
    buyer: number;
    vendor: number;
  };
}

export class GetDisputeDetailsDto {
  @ApiProperty({ example: 'dispute123', description: 'Dispute ID' })
  @IsUUID()
  disputeId: string;
}
