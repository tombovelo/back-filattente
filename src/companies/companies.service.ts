import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';
import { TicketsGateway } from '../tickets/tickets.gateway';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { CreateCounterDto } from './dto/create-counter.dto';
import { UpdateCounterDto } from './dto/update-counter.dto';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TicketsGateway,
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    const adminPasswordHash = await bcrypt.hash(dto.adminPassword, 10);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: dto.name,
          },
        });

        const admin = await tx.user.create({
          data: {
            companyId: company.id,
            username: dto.adminUsername,
            passwordHash: adminPasswordHash,
            role: Role.COMPANY_ADMIN,
          },
          select: { id: true, username: true, role: true, companyId: true },
        });

        return { ...company, admin };
      });

      this.broadcastCompanyChanged(result.id, 'company_created');
      return result;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          `Le nom d'utilisateur "${dto.adminUsername}" est deja utilise dans cette societe`,
        );
      }
      throw err;
    }
  }

  async updateCompany(companyId: number, dto: UpdateCompanyDto) {
    await this.ensureCompany(companyId);

    const companyData: {
      name?: string;
    } = {};
    if (dto.name !== undefined) companyData.name = dto.name;

    const adminData: { username?: string; passwordHash?: string } = {};
    if (dto.adminUsername !== undefined) adminData.username = dto.adminUsername;
    if (dto.adminPassword !== undefined) {
      adminData.passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.update({
        where: { id: companyId },
        data: companyData,
      });

      let adminUpdate: { count: number } | null = null;
      if (Object.keys(adminData).length > 0) {
        adminUpdate = await tx.user.updateMany({
          where: { companyId, role: Role.COMPANY_ADMIN },
          data: adminData,
        });
      }

      return { ...company, adminUpdated: adminUpdate?.count ?? 0 };
    });

    this.broadcastCompanyChanged(companyId, 'company_updated');
    return result;
  }

  async getAllCompany(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        serviceCounters: true,
        users: {
          select: {
            id: true,
            username: true,
            role: true,
            isActive: true,
            assignedCounter: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!company) throw new NotFoundException('Societe introuvable');
    return company;
  }

  async listCompanies() {
    return this.prisma.company.findMany({
      include: { _count: { select: { users: true, serviceCounters: true } } },
    });
  }

  async createAgent(companyId: number, dto: CreateAgentDto, callerRole: Role) {
    await this.ensureCompany(companyId);
    const role = (dto.role as Role | undefined) ?? Role.AGENT;
    if (role === Role.COMPANY_ADMIN && callerRole !== Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'Seul le super administrateur peut creer un compte administrateur',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    let agent:
      | {
          id: number;
          username: string;
          role: Role;
          companyId: number | null;
        }
      | null = null;

    try {
      agent = await this.prisma.user.create({
        data: {
          companyId,
          username: dto.username,
          passwordHash,
          role,
        },
        select: { id: true, username: true, role: true, companyId: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(
          `Le nom d'utilisateur "${dto.username}" est deja utilise dans cette societe`,
        );
      }
      throw err;
    }

    this.broadcastCompanyChanged(companyId, 'agent_created');
    return agent;
  }

  async createCounter(companyId: number, dto: CreateCounterDto) {
    await this.ensureCompany(companyId);
    const counter = await this.prisma.serviceCounter.create({
      data: {
        companyId,
        name: dto.name,
        prefix: dto.prefix,
        isActive: dto.isActive ?? true,
      },
    });
    this.gateway.broadcastToCompany(companyId, 'queue_status', {
      companyId,
      type: 'queue_status',
      data: { event: 'counter_created', counterId: counter.id },
    });
    this.broadcastCompanyChanged(companyId, 'counter_created');
    return counter;
  }

  async updateCounter(companyId: number, counterId: number, dto: UpdateCounterDto) {
    await this.ensureCounterInCompany(companyId, counterId);

    const data: { name?: string; prefix?: string; isActive?: boolean } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.prefix !== undefined) data.prefix = dto.prefix;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const counter = await this.prisma.serviceCounter.update({
      where: { id: counterId },
      data,
    });
    this.gateway.broadcastToCompany(companyId, 'queue_status', {
      companyId,
      type: 'queue_status',
      data: { event: 'counter_updated', counterId: counter.id },
    });
    this.broadcastCompanyChanged(companyId, 'counter_updated');
    return counter;
  }

  async assignAgentToCounter(companyId: number, agentId: number, counterId: number) {
    const counter = await this.prisma.serviceCounter.findFirst({
      where: { id: counterId, companyId },
    });
    if (!counter) throw new NotFoundException('Guichet introuvable');

    const user = await this.prisma.user.findFirst({
      where: {
        id: agentId,
        companyId,
        role: { in: [Role.AGENT, Role.COMPANY_ADMIN] },
      },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Agent introuvable');

    const agent = await this.prisma.user.update({
      where: { id: agentId },
      data: { assignedCounterId: counterId },
      select: {
        id: true,
        username: true,
        role: true,
        assignedCounter: { select: { id: true, name: true } },
      },
    });
    this.broadcastCompanyChanged(companyId, 'agent_assigned');
    return agent;
  }

  async updateAgent(companyId: number, agentId: number, dto: UpdateAgentDto) {
    await this.ensureAgentInCompany(companyId, agentId);

    const data: { username?: string; passwordHash?: string } = {};
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, 10);

    const agent = await this.prisma.user.update({
      where: { id: agentId },
      data,
      select: { id: true, username: true, role: true, companyId: true, isActive: true },
    });
    this.broadcastCompanyChanged(companyId, 'agent_updated');
    return agent;
  }

  async setAgentActive(companyId: number, agentId: number, isActive: boolean) {
    await this.ensureAgentInCompany(companyId, agentId);

    if (!isActive) {
      const user = await this.prisma.user.findUnique({
        where: { id: agentId },
        select: { role: true },
      });
      if (user?.role === Role.COMPANY_ADMIN) {
        throw new BadRequestException(
          'Impossible de desactiver le compte administrateur de la societe',
        );
      }
    }

    if (!isActive) {
      const activeUsers = await this.prisma.user.count({
        where: { companyId, isActive: true },
      });
      if (activeUsers <= 1) {
        throw new BadRequestException('Impossible de desactiver le dernier utilisateur actif de la societe');
      }
    }

    const agent = await this.prisma.user.update({
      where: { id: agentId },
      data: { isActive },
      select: { id: true, username: true, role: true, companyId: true, isActive: true },
    });
    this.broadcastCompanyChanged(companyId, 'agent_active_changed');
    return agent;
  }

  async deleteAgent(companyId: number, agentId: number) {
    await this.ensureAgentInCompany(companyId, agentId);

    const agent = await this.prisma.user.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent introuvable');

    if (agent.role === Role.COMPANY_ADMIN) {
      throw new BadRequestException(
        'Impossible de supprimer le compte administrateur de la societe',
      );
    }

    const activeUsers = await this.prisma.user.count({
      where: { companyId, isActive: true },
    });
    if (agent.isActive && activeUsers <= 1) {
      throw new BadRequestException('Impossible de supprimer le dernier utilisateur actif de la societe');
    }

    const hasTickets = await this.prisma.queueTicket.count({
      where: { calledByUserId: agentId },
    });
    if (hasTickets > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : cet agent a appele ${hasTickets} ticket(s). Desactivez-le a la place.`,
      );
    }

    const deleted = await this.prisma.user.delete({ where: { id: agentId } });
    this.broadcastCompanyChanged(companyId, 'agent_deleted');
    return deleted;
  }

  async deleteCompany(companyId: number) {
    await this.ensureCompany(companyId);
    const deleted = await this.prisma.company.delete({ where: { id: companyId } });
    return deleted;
  }

  async deleteCounter(companyId: number, counterId: number) {
    await this.ensureCounterInCompany(companyId, counterId);
    const hasTickets = await this.prisma.queueTicket.count({ where: { counterId } });
    if (hasTickets > 0) {
      throw new BadRequestException(`Impossible de supprimer : ce guichet a ${hasTickets} ticket(s).`);
    }
    const deleted = await this.prisma.serviceCounter.delete({ where: { id: counterId } });
    this.broadcastCompanyChanged(companyId, 'counter_deleted');
    return deleted;
  }

  private async ensureCompany(companyId: number): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Societe introuvable');
  }

  private async ensureAgentInCompany(companyId: number, agentId: number) {
    await this.ensureCompany(companyId);
    const agent = await this.prisma.user.findFirst({
      where: {
        id: agentId,
        companyId,
        role: { in: [Role.AGENT, Role.COMPANY_ADMIN] },
      },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException('Agent introuvable');
  }

  private async ensureCounterInCompany(companyId: number, counterId: number) {
    await this.ensureCompany(companyId);
    const counter = await this.prisma.serviceCounter.findFirst({
      where: { id: counterId, companyId },
      select: { id: true },
    });
    if (!counter) throw new NotFoundException('Guichet introuvable');
  }

  private broadcastCompanyChanged(companyId: number, action: string) {
    this.gateway.broadcastToCompany(companyId, 'company.changed', {
      companyId,
      type: 'company_changed',
      data: { action, companyId },
    });
  }
}
