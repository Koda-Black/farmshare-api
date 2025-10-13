import { IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class UpdatePoolDto {
  @IsNumber()
  @IsOptional()
  priceTotal?: number;

  @IsNumber()
  @IsOptional()
  slotsCount?: number;

  @IsBoolean()
  @IsOptional()
  allowHomeDelivery?: boolean;

  @IsNumber()
  @IsOptional()
  homeDeliveryCost?: number;
}
