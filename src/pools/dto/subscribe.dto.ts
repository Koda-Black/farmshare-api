import { IsString, IsInt } from 'class-validator';

export class SubscribeDto {
  @IsString()
  poolId: string;

  @IsInt()
  slots: number;
}
