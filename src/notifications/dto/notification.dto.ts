import {
  IsString,
  IsEnum,
  IsArray,
  IsObject,
  IsOptional,
} from 'class-validator';
import { NotificationType, NotificationMedium } from '@prisma/client';

export class SendNotificationDto {
  @IsString()
  userId: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsArray()
  @IsEnum(NotificationMedium, { each: true })
  mediums: NotificationMedium[];

  @IsObject()
  payload: Record<string, any>;
}

export class RegisterDeviceDto {
  @IsString()
  userId: string;

  @IsString()
  fcmToken: string;

  @IsOptional()
  @IsString()
  deviceType?: string;
}
