import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateUserDto {
  @ApiProperty({ example: 'abc123', description: 'User ID' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ enum: Role, example: Role.VENDOR })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isAdmin?: boolean;
}

export class SearchUsersDto {
  @ApiPropertyOptional({ example: 'john@example.com' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: Role, example: Role.VENDOR })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isVerified?: boolean;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

export class BanUserDto {
  @ApiProperty({ example: 'abc123', description: 'User ID to ban' })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'Violated terms of service' })
  @IsString()
  reason: string;
}

export class UnbanUserDto {
  @ApiProperty({ example: 'abc123', description: 'User ID to unban' })
  @IsUUID()
  userId: string;
}

export class SetProbationDto {
  @ApiProperty({ example: 'abc123', description: 'User ID to set on probation' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    enum: ['PROBATION', 'WARNED'],
    example: 'PROBATION',
    description: 'Probation status'
  })
  @IsEnum(['PROBATION', 'WARNED'])
  status: string;

  @ApiPropertyOptional({
    example: 'User reported for suspicious activity',
    description: 'Reason for probation'
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    example: 7,
    description: 'Probation duration in days'
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  duration?: number;
}

export class RemoveProbationDto {
  @ApiProperty({ example: 'abc123', description: 'User ID to remove from probation' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    example: 'User behavior has improved',
    description: 'Reason for removing probation'
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
