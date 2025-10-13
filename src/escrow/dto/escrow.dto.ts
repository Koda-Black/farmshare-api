import { IsString, IsNumber, IsOptional, IsObject } from 'class-validator';

export class CreateEscrowDto {
  @IsString()
  poolId: string;

  @IsNumber()
  totalHeld: number;

  @IsObject()
  computations: Record<string, any>;
}

export class ReleaseEscrowDto {
  @IsString()
  poolId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class PartialReleaseDto {
  @IsString()
  poolId: string;

  @IsObject()
  releaseMap: Record<string, number>; // buyerId -> amount
}

export class ManualReleaseDto {
  @IsString()
  poolId: string;

  @IsNumber()
  amount: number;

  @IsString()
  reason: string;
}

export class ManualRefundDto {
  @IsString()
  transactionId: string;

  @IsNumber()
  amount: number;

  @IsString()
  reason: string;
}
