import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LogsModule } from '../logs/logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketsGateway } from './tickets.gateway';
import { NotifierService } from './notifier.service';
import { WaitEstimationService } from './wait-estimation.service';

@Module({
  imports: [AuthModule, LogsModule, NotificationsModule, PaymentsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsGateway, NotifierService, WaitEstimationService],
  exports: [TicketsGateway, WaitEstimationService, LogsModule],
})
export class TicketsModule {}
