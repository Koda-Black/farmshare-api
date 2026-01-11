import { IsString, IsEmail } from 'class-validator';
import {
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';
import { Role } from '@prisma/client';

export class ModifyRoleDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(['BUYER', 'VENDOR', 'ADMIN'], {
    message: 'newRole must be BUYER, VENDOR, or ADMIN',
  })
  newRole: 'BUYER' | 'VENDOR' | 'ADMIN';
}

export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 10;
}
