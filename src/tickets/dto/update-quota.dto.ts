import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateQuotaDto {
  // null ou 0 = aucune limite
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  dailyCapacity?: number | null;
}