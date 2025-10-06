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
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsEnum(['USER', 'ADMIN', 'SUPERADMIN'], {
    message: 'newRole must be USER, ADMIN, or SUPERADMIN',
  })
  newRole: 'USER' | 'ADMIN' | 'SUPERADMIN';
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
