import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdatePaymentConfigDto {
  // null = non défini
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyAgentAmount?: number | null;

  // null = non défini
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyCompanyAmount?: number | null;
}