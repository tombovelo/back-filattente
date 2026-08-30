import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LogsModule } from '../logs/logs.module';
import { PaymentsModule } from '../payments/payments.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientStrategy } from './patient.strategy';

@Module({
  imports: [AuthModule, TicketsModule, NotificationsModule, LogsModule, PaymentsModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientStrategy],
})
export class PatientsModule {}