import {
  IsString,
  IsNumber,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class CreatePoolDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  priceTotal: number;

  @IsNumber()
  slotsCount: number;

  @IsBoolean()
  @IsOptional()
  allowHomeDelivery?: boolean;

  @IsNumber()
  @IsOptional()
  homeDeliveryCost?: number;
}
