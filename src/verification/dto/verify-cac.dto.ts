import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCacDto {
  @ApiProperty({
    description: 'CAC registration number (Format: RC123456, BN1234567890, or IT123456)',
    example: 'RC123456',
  })
  @IsString()
  @IsNotEmpty({ message: 'Registration number is required' })
  @Matches(/^(RC|BN|IT)\d{6,11}$/i, {
    message:
      'Registration number must start with RC, BN, or IT followed by 6-11 digits',
  })
  registrationNumber: string;

  @ApiProperty({
    description: 'Company name (optional, for additional verification)',
    example: 'Farmshare Technologies Limited',
    required: false,
  })
  @IsOptional()
  @IsString()
  companyName?: string;
}
