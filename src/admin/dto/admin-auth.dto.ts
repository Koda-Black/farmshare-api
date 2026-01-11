import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsOptional,
  Length,
} from 'class-validator';

export class AdminSignupDto {
  @ApiProperty({ example: 'admin@farmshare.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Admin User' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'SecureP@ssw0rd123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'admin-secret-key-2024', description: 'Admin registration secret key' })
  @IsString()
  @IsNotEmpty()
  adminSecretKey: string;
}

export class AdminLoginDto {
  @ApiProperty({ example: 'admin@farmshare.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SecureP@ssw0rd123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class EnableMfaDto {
  @ApiProperty({ example: '123456', description: '6-digit MFA code from authenticator app' })
  @IsString()
  @Length(6, 6)
  @IsNotEmpty()
  token: string;
}

export class VerifyMfaDto {
  @ApiProperty({ example: 'admin@farmshare.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456', description: '6-digit MFA code from authenticator app' })
  @IsString()
  @Length(6, 6)
  @IsNotEmpty()
  token: string;
}

export class DisableMfaDto {
  @ApiProperty({ example: '123456', description: '6-digit MFA code to confirm disabling' })
  @IsString()
  @Length(6, 6)
  @IsNotEmpty()
  token: string;
}
