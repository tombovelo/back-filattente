import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  deviceToken: string;

  @IsOptional()
  @IsIn(['expo', 'fcm', 'apns'])
  platform?: string;
}