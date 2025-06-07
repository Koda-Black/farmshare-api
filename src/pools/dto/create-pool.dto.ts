import { IsString, IsInt, IsNumber } from 'class-validator';

export class CreatePoolDto {
  @IsString()
  name: string;

  @IsNumber()
  price: number;

  @IsInt()
  totalSlots: number;
}
