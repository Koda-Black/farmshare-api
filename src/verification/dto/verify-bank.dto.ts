import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyBankDto {
  @ApiProperty({
    description: '10-digit Nigerian bank account number',
    example: '0123456789',
    minLength: 10,
    maxLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @Length(10, 10, { message: 'Account number must be exactly 10 digits' })
  @Matches(/^\d{10}$/, {
    message: 'Account number must contain only digits',
  })
  accountNumber: string;

  @ApiProperty({
    description: 'Paystack bank code (3-6 digits)',
    example: '058',
    minLength: 3,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{3,6}$/, {
    message: 'Bank code must be 3-6 digits',
  })
  bankCode: string;
}
