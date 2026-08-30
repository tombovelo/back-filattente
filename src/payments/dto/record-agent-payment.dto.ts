import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class RecordAgentPaymentDto {
  @IsInt()
  @IsPositive()
  agentId!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  note?: string;

  // Mois/année couverts par le paiement (ex: "2026-09"). Défaut = mois courant.
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'periodMonth doit être au format YYYY-MM',
  })
  periodMonth?: string;
}