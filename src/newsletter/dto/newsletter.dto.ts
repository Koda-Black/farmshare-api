import {
  IsEmail,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubscribeNewsletterDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address to subscribe',
  })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Name of the subscriber',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'footer',
    description: 'Source of subscription',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    example: ['updates', 'promotions'],
    description: 'Tags for segmentation',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UnsubscribeNewsletterDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address to unsubscribe',
  })
  @IsEmail()
  email: string;
}

export class SendNewsletterDto {
  @ApiProperty({
    example: 'Weekly Update: New Features & Deals',
    description: 'Subject line of the newsletter',
  })
  @IsString()
  subject: string;

  @ApiProperty({
    example: '<h1>Hello!</h1><p>Here are your weekly updates...</p>',
    description: 'HTML content of the newsletter',
  })
  @IsString()
  htmlContent: string;

  @ApiPropertyOptional({
    example: 'Hello! Here are your weekly updates...',
    description: 'Plain text version of the newsletter',
  })
  @IsOptional()
  @IsString()
  textContent?: string;

  @ApiPropertyOptional({
    example: ['promotions'],
    description: 'Only send to subscribers with these tags',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetTags?: string[];

  @ApiPropertyOptional({
    example: false,
    description: 'Send as test to admin email only',
  })
  @IsOptional()
  @IsBoolean()
  testMode?: boolean;
}
