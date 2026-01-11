import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class VerifyFaceDto {
  @ApiProperty({
    description: 'Base64 encoded selfie image',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Selfie image is required' })
  selfieImage: string;

  @ApiProperty({
    description: 'Base64 encoded ID card image',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  })
  @IsString()
  @IsNotEmpty({ message: 'ID card image is required' })
  idCardImage: string;

  @ApiProperty({
    description: 'Minimum confidence threshold (0-100). Default: 70',
    example: 70,
    required: false,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0, { message: 'Confidence threshold must be at least 0' })
  @Max(100, { message: 'Confidence threshold must be at most 100' })
  confidenceThreshold?: number = 70;
}
