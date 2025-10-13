import {
  IsString,
  IsArray,
  IsOptional,
  IsEnum,
  IsObject,
} from 'class-validator';

export class CreateDisputeDto {
  @IsString()
  poolId: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsArray()
  evidenceFiles?: Express.Multer.File[];
}

export class ResolveDisputeDto {
  @IsString()
  disputeId: string;

  @IsEnum(['refund', 'release', 'split'])
  action: 'refund' | 'release' | 'split';

  @IsOptional()
  @IsObject()
  distribution?: Record<string, number>;

  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}
