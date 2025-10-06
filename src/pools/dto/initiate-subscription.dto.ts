// src/pools/dto/initiate-subscription.dto.ts
import { IsString, IsInt, Min } from 'class-validator';

export class InitiateSubscriptionDto {
  @IsString()
  poolId: string;

  @IsInt()
  @Min(1)
  slots: number;
}
