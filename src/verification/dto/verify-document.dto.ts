import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum DocumentType {
  NIN = 'NIN',
  PASSPORT = 'PASSPORT',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  VOTER_CARD = 'VOTER_CARD',
}

export class VerifyDocumentDto {
  @ApiProperty({
    description: 'Expected document type (optional, for validation)',
    enum: DocumentType,
    required: false,
    example: DocumentType.NIN,
  })
  @IsOptional()
  @IsEnum(DocumentType, {
    message: 'Document type must be one of: NIN, PASSPORT, DRIVERS_LICENSE, VOTER_CARD',
  })
  documentType?: DocumentType;
}
