import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TicketsService } from './tickets.service';
import { UpdateQuotaDto } from './dto/update-quota.dto';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post('next')
  callNext(@CurrentUser() agent: AuthenticatedUser) {
    return this.tickets.callNext(agent.id, agent.companyId!);
  }

  @Patch(':id/complete')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() agent: AuthenticatedUser,
  ) {
    return this.tickets.complete(id, agent.id, agent.companyId!);
  }

  @Patch(':id/absent')
  markAbsent(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() agent: AuthenticatedUser,
  ) {
    return this.tickets.markAbsent(id, agent.id, agent.companyId!);
  }

  @Get('queue-status')
  queueStatus(@CurrentUser() agent: AuthenticatedUser, @Query('companyId') companyId?: string) {
    const id = agent.role === 'SUPER_ADMIN' && companyId ? Number(companyId) : agent.companyId;
    return this.tickets.queueStatus(id);
  }

  @Get('treated-count')
  treatedCount(@CurrentUser() agent: AuthenticatedUser, @Query('companyId') companyId?: string) {
    const id = agent.role === 'SUPER_ADMIN' && companyId ? Number(companyId) : agent.companyId;
    return this.tickets.treatedCount(id);
  }

  @Get('wait-times')
  waitTimes(@CurrentUser() agent: AuthenticatedUser, @Query('companyId') companyId?: string) {
    const id = agent.role === 'SUPER_ADMIN' && companyId ? Number(companyId) : agent.companyId;
    return this.tickets.waitTimes(id);
  }

  @Get('absent')
  listAbsent(@CurrentUser() agent: AuthenticatedUser) {
    return this.tickets.listAbsent(agent.id, agent.companyId!);
  }

  @Patch(':id/re-call')
  reCallTicket(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() agent: AuthenticatedUser,
  ) {
    return this.tickets.reCallTicket(id, agent.id, agent.companyId!);
  }

  @Get('quota')
  myQuota(@CurrentUser() agent: AuthenticatedUser) {
    return this.tickets.getMyQuota(agent.id, agent.companyId!);
  }

  @Get('blocked')
  async isBlocked(@CurrentUser() agent: AuthenticatedUser) {
    const blocked = await this.tickets.isAgentBlocked(agent.id, agent.companyId!);
    return { blocked };
  }

  @Get('stats')
  stats(@CurrentUser() agent: AuthenticatedUser, @Query('companyId') companyId?: string) {
    const id = agent.role === 'SUPER_ADMIN' && companyId ? Number(companyId) : agent.companyId!;
    return this.tickets.getStats(id);
  }

  @Get('superadmin-stats')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  superadminStats(@CurrentUser() agent: AuthenticatedUser) {
    return this.tickets.getSuperAdminStats();
  }

  @Get('agent-stats')
  agentStats(@CurrentUser() agent: AuthenticatedUser, @Query('companyId') companyId?: string) {
    const id = agent.role === 'SUPER_ADMIN' && companyId ? Number(companyId) : agent.companyId!;
    return this.tickets.getAgentStats(id);
  }

  @Patch('quota')
  updateQuota(
    @Body() dto: UpdateQuotaDto,
    @CurrentUser() agent: AuthenticatedUser,
  ) {
    return this.tickets.setMyQuota(agent.id, agent.companyId!, dto.dailyCapacity ?? null);
  }
}