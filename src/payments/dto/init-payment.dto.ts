import {
  IsString,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  IsBoolean,
  Validate,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { PaymentMethod } from '../payments.service';
import { IsEitherTrue } from '../../utils/either-true.validator';

export class InitPaymentDto {
  @IsUUID()
  poolId: string;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsInt()
  @Min(1)
  slots: number;

  @IsBoolean()
  waybillWithin: boolean;

  @IsBoolean()
  @Validate(IsEitherTrue, ['waybillWithin'])
  waybillOutside: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idempotencyKey?: string;
}
