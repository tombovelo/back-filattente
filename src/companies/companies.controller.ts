import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { CreateCounterDto } from './dto/create-counter.dto';
import { UpdateCounterDto } from './dto/update-counter.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  // === SuperAdmin ===
  @Post()
  @Roles(Role.SUPER_ADMIN)
  createCompany(@Body() dto: CreateCompanyDto) {
    return this.companies.createCompany(dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  listCompanies() {
    return this.companies.listCompanies();
  }

  @Patch(':companyId')
  @Roles(Role.SUPER_ADMIN)
  updateCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.updateCompany(companyId, dto);
  }

  // === CompanyAdmin ===
  @Get(':companyId')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.AGENT)
  async getCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.getAllCompany(companyId);
  }

  @Post(':companyId/agents')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  createAgent(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateAgentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.createAgent(companyId, dto, user.role);
  }

  @Post(':companyId/counters')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  createCounter(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: CreateCounterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.createCounter(companyId, dto);
  }

  @Patch(':companyId/counters/:counterId')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  updateCounter(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('counterId', ParseIntPipe) counterId: number,
    @Body() dto: UpdateCounterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.updateCounter(companyId, counterId, dto);
  }

  @Delete(':companyId/counters/:counterId')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  deleteCounter(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('counterId', ParseIntPipe) counterId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.deleteCounter(companyId, counterId);
  }

  @Post(':companyId/agents/:agentId/assign-counter/:counterId')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  assignAgentToCounter(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('agentId', ParseIntPipe) agentId: number,
    @Param('counterId', ParseIntPipe) counterId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.assignAgentToCounter(companyId, agentId, counterId);
  }

  @Patch(':companyId/agents/:agentId')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  updateAgent(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('agentId', ParseIntPipe) agentId: number,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.updateAgent(companyId, agentId, dto);
  }

  @Patch(':companyId/agents/:agentId/active/:isActive')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  setAgentActive(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('agentId', ParseIntPipe) agentId: number,
    @Param('isActive', ParseBoolPipe) isActive: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.setAgentActive(companyId, agentId, isActive);
  }

  @Delete(':companyId')
  @Roles(Role.SUPER_ADMIN)
  deleteCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.companies.deleteCompany(companyId);
  }

  @Delete(':companyId/agents/:agentId')
  @Roles(Role.SUPER_ADMIN, Role.COMPANY_ADMIN)
  deleteAgent(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('agentId', ParseIntPipe) agentId: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertAccessCompanyAdmin(user, companyId);
    return this.companies.deleteAgent(companyId, agentId);
  }

  /**
   * Un COMPANY_ADMIN ne peut gérer que SA société
   */
  private assertAccessCompanyAdmin(user: AuthenticatedUser, companyId: number) {
    if (user.role !== Role.SUPER_ADMIN && user.companyId !== companyId) {
      throw new BadRequestException('Accès interdit à cette société');
    }
  }
}