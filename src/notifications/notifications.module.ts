import { Module } from '@nestjs/common';
import { PatientPushService } from './patient-push.service';

@Module({
  providers: [PatientPushService],
  exports: [PatientPushService],
})
export class NotificationsModule {}