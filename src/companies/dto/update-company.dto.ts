import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  adminUsername?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  adminPassword?: string;
}
