import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateCounterDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(/^[A-Za-z]$/, { message: 'prefix doit être une seule lettre' })
  prefix!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}