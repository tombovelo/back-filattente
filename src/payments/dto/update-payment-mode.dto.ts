import { IsIn } from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class UpdatePaymentModeDto {
  @IsIn([PaymentMode.BY_COMPANY, PaymentMode.BY_AGENT])
  paymentMode!: PaymentMode;
}