// src/auth/dto/signup.dto.ts
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @IsOptional()
  @IsIn(['BUYER', 'VENDOR'])
  role?: 'BUYER' | 'VENDOR';
}
