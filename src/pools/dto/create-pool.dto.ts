import { IsString, IsNumber, IsEnum, IsNotEmpty } from 'class-validator';
import { PoolCategory } from '@prisma/client';

export class CreatePoolDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  price: number;

  @IsNumber()
  totalSlots: number;

  @IsEnum(PoolCategory)
  category: PoolCategory;

  @IsString()
  description: string;
}
