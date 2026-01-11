// src/auth/dto/signup.dto.ts
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

// Nigerian states for validation
export const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

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

  // Location fields - required for marketplace functionality
  @IsString()
  @IsNotEmpty()
  @IsIn(NIGERIAN_STATES)
  state: NigerianState;

  @IsOptional()
  @IsString()
  country?: string = 'Nigeria';

  @IsOptional()
  @IsString()
  city?: string;
}
