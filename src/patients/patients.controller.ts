import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { ScanTicketDto } from './dto/scan-ticket.dto';
import { PatientGuard } from './patient.guard';
import { PatientDeviceId } from './patient-device.decorator';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post('register')
  register(@Body() dto: RegisterDeviceDto) {
    return this.patients.register(dto);
  }

  @Post('scan')
  @UseGuards(PatientGuard)
  scan(@PatientDeviceId() deviceId: number, @Body() dto: ScanTicketDto) {
    return this.patients.scan(deviceId, dto.ref);
  }

  @Get('ticket')
  @UseGuards(PatientGuard)
  myTicket(@PatientDeviceId() deviceId: number) {
    return this.patients.myTicket(deviceId);
  }

  @Get('tickets/:id/position')
  @UseGuards(PatientGuard)
  position(
    @PatientDeviceId() deviceId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.patients.ticketPosition(deviceId, id);
  }

  @Post('tickets/:id/cancel')
  @UseGuards(PatientGuard)
  cancel(
    @PatientDeviceId() deviceId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.patients.cancelTicket(deviceId, id);
  }
}