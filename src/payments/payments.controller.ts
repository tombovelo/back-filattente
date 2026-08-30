import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { RecordCompanyPaymentDto } from './dto/record-company-payment.dto';
import { RecordAgentPaymentDto } from './dto/record-agent-payment.dto';
import { UpdatePaymentModeDto } from './dto/update-payment-mode.dto';
import { UpdatePaymentConfigDto } from './dto/update-payment-config.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('status')
  @Roles(Role.SUPER_ADMIN)
  getStatus() {
    return this.payments.getStatus();
  }

  @Get('report')
  @Roles(Role.SUPER_ADMIN)
  getReport(@Query('year') year?: string, @Query('month') month?: string) {
    return this.payments.getReport(
      Number(year),
      month != null && month !== '' ? Number(month) : undefined,
    );
  }

  @Get('my-report')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.AGENT)
  getMyReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.payments.getMyReport(
      Number(year),
      month != null && month !== '' ? Number(month) : undefined,
      user,
    );
  }

  @Post('company')
  @Roles(Role.SUPER_ADMIN)
  recordCompanyPayment(
    @Body() dto: RecordCompanyPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payments.recordCompanyPayment(dto, user.id);
  }

  @Post('agent')
  @Roles(Role.SUPER_ADMIN)
  recordAgentPayment(@Body() dto: RecordAgentPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.recordAgentPayment(dto, user.id);
  }

  @Patch('company/:companyId/mode')
  @Roles(Role.SUPER_ADMIN)
  setCompanyPaymentMode(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdatePaymentModeDto,
  ) {
    return this.payments.setCompanyPaymentMode(companyId, dto.paymentMode);
  }

  @Get('config')
  @Roles(Role.SUPER_ADMIN)
  getConfig() {
    return this.payments.getConfig();
  }

  @Patch('config/:companyId')
  @Roles(Role.SUPER_ADMIN)
  updateConfig(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdatePaymentConfigDto,
  ) {
    return this.payments.updateConfig(companyId, dto);
  }

  @Delete(':paymentId')
  @Roles(Role.SUPER_ADMIN)
  cancelPayment(@Param('paymentId', ParseIntPipe) paymentId: number) {
    return this.payments.cancelPayment(paymentId);
  }
}