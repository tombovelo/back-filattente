import { IsString, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  adminUsername!: string;

  @IsString()
  @MinLength(6)
  adminPassword!: string;
}
