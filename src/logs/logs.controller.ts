import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LogsService } from './logs.service';

@Controller('logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN)
  list(@Query('limit') limit?: string, @Query('from') from?: string) {
    const take = limit ? Math.min(Number(limit) || 100, 500) : 100;

    let since: Date | undefined;
    if (from) {
      since = new Date(from);
      if (Number.isNaN(since.getTime())) {
        throw new BadRequestException('Parametre "from" invalide');
      }
    }

    return this.logs.list(take, undefined, since);
  }
}