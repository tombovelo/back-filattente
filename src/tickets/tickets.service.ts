import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsGateway } from './tickets.gateway';
import { NotifierService } from './notifier.service';
import { WaitEstimationService } from './wait-estimation.service';
import { LogsService } from '../logs/logs.service';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TicketsGateway,
    private readonly notifier: NotifierService,
    private readonly estimation: WaitEstimationService,
    private readonly logs: LogsService,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Retourne le guichet assigné a l'agent, avec garde-fous
   */
  private async getAgentCounter(agentId: number, companyId: number) {
    const agent = await this.prisma.user.findFirst({
      where: { id: agentId, companyId },
      include: { assignedCounter: true },
    });
    if (!agent) throw new NotFoundException('Agent introuvable');
    if (!agent.assignedCounter) {
      throw new BadRequestException("Aucun guichet n'est assigné à cet agent");
    }
    return agent;
  }

  async isAgentBlocked(agentId: number, companyId: number): Promise<boolean> {
    return this.payments.isAgentBlocked(agentId);
  }

  /**
   * POST /tickets/next - Appelle le ticket suivant (WAITING -> CALLED)
   */
  async callNext(agentId: number, companyId: number) {
    const agent = await this.getAgentCounter(agentId, companyId);
    const counter = agent.assignedCounter!;

    if (await this.payments.isAgentBlocked(agentId)) {
      throw new BadRequestException(
        'Service temporairement indisponible. Contactez l\'accueil.',
      );
    }

    const capacity = agent.dailyCapacity ?? 0;
    if (capacity > 0) {
      const todayCount = await this.countTodayTickets(counter.id, companyId);
      if (todayCount >= capacity) {
        throw new BadRequestException(
          "Quota atteint : cet agent ne peut plus recevoir de patients aujourd'hui.",
        );
      }
    }

    const nextTicket = await this.prisma.queueTicket.findFirst({
      where: {
        counterId: counter.id,
        companyId,
        status: TicketStatus.WAITING,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!nextTicket) {
      throw new NotFoundException('Aucun ticket en attente');
    }

    const ticket = await this.prisma.queueTicket.update({
      where: { id: nextTicket.id },
      data: {
        status: TicketStatus.CALLED,
        calledAt: new Date(),
        calledByUserId: agentId,
      },
    });

    this.logs.record({
      companyId,
      event: 'ticket_called',
      message: `Ticket ${ticket.ticketNumber} appelé au guichet ${counter.name}`,
      createdBy: agent.username,
    });

    // 1) Dashboard en temps réel
    this.gateway.broadcastToCompany(
      companyId,
      'ticket.called',
      {
        companyId,
        counterId: counter.id,
        type: 'ticket_called',
        data: { ticket, counter: { id: counter.id, name: counter.name } },
      },
    );

    // 1 bis) Rafraîchissement complet de la file (tous les clients refetchent)
    this.gateway.broadcastToCompany(companyId, 'queue_status', {
      companyId,
      type: 'queue_status',
      data: { event: 'ticket_called' },
    });

    // 1 ter) Temps réel vers l'appareil du patient concerné
    if (ticket.patientDeviceId) {
      this.gateway.broadcastToPatient(ticket.patientDeviceId, 'ticket_status', {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
      });
    }

    // 1 quater) Les patients encore en attente derrière rafraîchissent position + estimation
    await this.gateway.notifyWaitingPatients(counter.id);

    // 2) Notification "C'est votre tour" vers l'app mobile
    await this.notifier.notifyYourTurn(counter.name, ticket.ticketNumber, {
      patientDeviceId: ticket.patientDeviceId,
    });

    // 3) Rappels des tickets à 2 personnes (décalage de file)
    await this.notifier.processReminders(companyId, counter.id);

    return ticket;
  }

  /**
   * PATCH /tickets/:id/complete - termine le ticket (CALLED|IN_PROGRESS -> COMPLETED)
   */
  async complete(id: number, agentId: number, companyId: number) {
    const ticket = await this.getOwnedTicket(id, companyId);

    if (
      ticket.status !== TicketStatus.CALLED &&
      ticket.status !== TicketStatus.IN_PROGRESS
    ) {
      throw new BadRequestException('Ticket non appelé : impossible de le terminer');
    }

    const updated = await this.prisma.queueTicket.update({
      where: { id },
      data: { status: TicketStatus.COMPLETED, completedAt: new Date() },
    });

    this.logs.record({
      companyId,
      event: 'ticket_completed',
      message: `Ticket ${updated.ticketNumber} terminé`,
      createdBy: (await this.getAgentUsername(agentId)) ?? undefined,
    });

    this.gateway.broadcastToCompany(companyId, 'ticket.completed', {
      companyId,
      counterId: updated.counterId,
      type: 'ticket_completed',
      data: updated,
    });

    this.gateway.broadcastToCompany(companyId, 'queue_status', {
      companyId,
      type: 'queue_status',
      data: { event: 'ticket_completed' },
    });

    if (updated.patientDeviceId) {
      this.gateway.broadcastToPatient(updated.patientDeviceId, 'ticket_status', {
        ticketId: updated.id,
        ticketNumber: updated.ticketNumber,
        status: updated.status,
      });
    }

    await this.gateway.notifyWaitingPatients(updated.counterId);
    await this.notifier.processReminders(companyId, updated.counterId);
    return updated;
  }

  /**
   * PATCH /tickets/:id/absent - client absent (CALLED|IN_PROGRESS -> CANCELLED)
   */
  async markAbsent(id: number, agentId: number, companyId: number) {
    const ticket = await this.getOwnedTicket(id, companyId);
    if (
      ticket.status !== TicketStatus.CALLED &&
      ticket.status !== TicketStatus.IN_PROGRESS
    ) {
      throw new BadRequestException('Le ticket ne peut pas être marqué absent');
    }

    const updated = await this.prisma.queueTicket.update({
      where: { id },
      data: { status: TicketStatus.ABSENT },
    });

    this.logs.record({
      companyId,
      event: 'ticket_absent',
      message: `Ticket ${updated.ticketNumber} marqué absent`,
      level: 'WARN',
      createdBy: (await this.getAgentUsername(agentId)) ?? undefined,
    });

    this.gateway.broadcastToCompany(companyId, 'ticket.absent', {
      companyId,
      counterId: updated.counterId,
      type: 'ticket_absent',
      data: updated,
    });

    this.gateway.broadcastToCompany(companyId, 'queue_status', {
      companyId,
      type: 'queue_status',
      data: { event: 'ticket_absent' },
    });

    if (updated.patientDeviceId) {
      this.gateway.broadcastToPatient(updated.patientDeviceId, 'ticket_status', {
        ticketId: updated.id,
        ticketNumber: updated.ticketNumber,
        status: updated.status,
      });
    }

    await this.gateway.notifyWaitingPatients(updated.counterId);
    await this.notifier.processReminders(companyId, updated.counterId);
    return updated;
  }

  /**
   * GET /tickets/queue-status - état temps réel de la file de la société.
   * companyId null (superadmin) = vue globale sur toutes les sociétés.
   */
  async queueStatus(companyId: number | null) {
    const counters = await this.prisma.serviceCounter.findMany({
      where: companyId ? { companyId } : {},
      include: {
        _count: {
          select: {
            tickets: {
              where: { status: TicketStatus.WAITING },
            },
          },
        },
      },
    });

    const waitingPerCounter = await this.prisma.queueTicket.findMany({
      where: companyId
        ? {
            companyId,
            status: { in: [TicketStatus.WAITING, TicketStatus.CALLED] },
          }
        : {
            status: { in: [TicketStatus.WAITING, TicketStatus.CALLED] },
          },
      orderBy: { createdAt: 'asc' },
      include: { counter: true },
    });

    const usersPerCounter = await this.prisma.user.findMany({
      where: companyId ? { companyId, assignedCounterId: { not: null } } : { assignedCounterId: { not: null } },
      select: { id: true, username: true, role: true, assignedCounterId: true },
    });

    return counters.map(({ id, companyId: counterCompanyId, name, prefix, isActive, _count }) => {
      const waiting = waitingPerCounter.filter((t) => t.counterId === id);
      const current = waiting.find((t) => t.status !== TicketStatus.WAITING) ?? null;
      const users = usersPerCounter.filter((u) => u.assignedCounterId === id);
      return {
        counter: { id, companyId: counterCompanyId, name, prefix, isActive },
        waitingCount: _count.tickets,
        current,
        waiting,
        users: users.map((u) => ({ id: u.id, username: u.username, role: u.role })),
      };
    });
  }

  /**
   * GET /tickets/treated-count - nombre de tickets traités (COMPLETED) de la société
   */
  async treatedCount(companyId: number | null) {
    return this.prisma.queueTicket.count({
      where: companyId ? { companyId, status: TicketStatus.COMPLETED } : { status: TicketStatus.COMPLETED },
    });
  }

  /**
   * GET /tickets/wait-times - temps d'attente estimé (global et par guichet) en secondes.
   * Estimation dynamique = personnes devant × temps de service moyen du guichet
   * (secours : 5 min / personne si pas assez de tickets terminés).
   */
  async waitTimes(companyId: number | null) {
    const counters = await this.prisma.serviceCounter.findMany({
      where: companyId ? { companyId } : {},
      select: { id: true, name: true },
    });

    const byCounter = await Promise.all(
      counters.map(async (c) => {
        const est = await this.estimation.estimateForCounter(companyId, c.id);
        return {
          counterId: c.id,
          name: c.name,
          avgSeconds: est.seconds,
          sampleCount: est.sampleCount,
        };
      }),
    );

    const overall =
      byCounter.length > 0
        ? Math.round(byCounter.reduce((sum, c) => sum + c.avgSeconds, 0) / byCounter.length)
        : 0;

    return { overall, byCounter };
  }

  /**
   * GET /tickets/absent - liste des clients absents (ABSENT) pour le guichet assigné de l'agent
   */
  async listAbsent(agentId: number, companyId: number) {
    const agent = await this.prisma.user.findFirst({
      where: { id: agentId, companyId },
      include: { assignedCounter: true },
    });
    if (!agent?.assignedCounter) return [];

    return this.prisma.queueTicket.findMany({
      where: {
        companyId,
        counterId: agent.assignedCounter.id,
        status: TicketStatus.ABSENT,
      },
      orderBy: { calledAt: 'desc' },
      include: { counter: true },
    });
  }

  /**
   * PATCH /tickets/:id/re-call - rappelle à nouveau un client absent (ABSENT -> CALLED)
   */
  async reCallTicket(id: number, agentId: number, companyId: number) {
    const ticket = await this.getOwnedTicket(id, companyId);
    if (ticket.status !== TicketStatus.ABSENT) {
      throw new BadRequestException('Seul un ticket absent peut être rappelé');
    }

    const counter = await this.prisma.serviceCounter.findUnique({
      where: { id: ticket.counterId },
    });

    const updated = await this.prisma.queueTicket.update({
      where: { id },
      data: {
        status: TicketStatus.CALLED,
        calledAt: new Date(),
        calledByUserId: agentId,
      },
    });

    this.logs.record({
      companyId,
      event: 'ticket_recalled',
      message: `Ticket ${updated.ticketNumber} rappelé (client absent de retour)`,
      createdBy: (await this.getAgentUsername(agentId)) ?? undefined,
    });

    this.gateway.broadcastToCompany(companyId, 'ticket.called', {
      companyId,
      counterId: ticket.counterId,
      type: 'ticket_called',
      data: { ticket: updated, counter: counter ? { id: counter.id, name: counter.name } : null },
    });

    this.gateway.broadcastToCompany(companyId, 'queue_status', {
      companyId,
      type: 'queue_status',
      data: { event: 'ticket_recalled' },
    });

    if (updated.patientDeviceId) {
      this.gateway.broadcastToPatient(updated.patientDeviceId, 'ticket_status', {
        ticketId: updated.id,
        ticketNumber: updated.ticketNumber,
        status: updated.status,
      });
    }

    await this.gateway.notifyWaitingPatients(ticket.counterId);

    await this.notifier.notifyYourTurn(counter?.name ?? 'guichet', updated.ticketNumber, {
      patientDeviceId: updated.patientDeviceId,
    });

    await this.notifier.processReminders(companyId, ticket.counterId);
    return updated;
  }

  private async getOwnedTicket(id: number, companyId: number) {
    const ticket = await this.prisma.queueTicket.findFirst({
      where: { id, companyId },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable');
    return ticket;
  }

  private async getAgentUsername(agentId: number): Promise<string | null> {
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { username: true },
    });
    return agent?.username ?? null;
  }

  /**
   * GET /tickets/quota - quota journalier et tickets reçus aujourd'hui de l'agent
   */
  async getMyQuota(agentId: number, companyId: number) {
    const agent = await this.getAgentCounter(agentId, companyId);
    const counter = agent.assignedCounter!;
    const dailyCapacity = agent.dailyCapacity ?? 0;
    const todayCount = await this.countTodayTickets(counter.id, companyId);

    return {
      dailyCapacity,
      todayCount,
      quotaReached: dailyCapacity > 0 && todayCount >= dailyCapacity,
    };
  }

  /**
   * PATCH /tickets/quota - définit le quota journalier (null ou 0 = illimité)
   */
  async setMyQuota(agentId: number, companyId: number, dailyCapacity: number | null) {
    const agent = await this.getAgentCounter(agentId, companyId);
    const value = dailyCapacity == null || dailyCapacity <= 0 ? null : dailyCapacity;

    await this.prisma.user.update({
      where: { id: agent.id },
      data: { dailyCapacity: value },
    });

    this.logs.record({
      companyId,
      event: 'agent_quota_updated',
      message:
        value == null
          ? `Quota de ${agent.username} passé à illimité`
          : `Quota de ${agent.username} fixé à ${value} patients/jour`,
      createdBy: agent.username,
    });

    return this.getMyQuota(agent.id, companyId);
  }

  private async countTodayTickets(counterId: number, companyId: number): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.queueTicket.count({
      where: {
        companyId,
        counterId,
        createdAt: { gte: start },
        status: { not: TicketStatus.CANCELLED },
      },
    });
  }

  /**
   * GET /tickets/stats - statistiques temps réel pour le dashboard admin.
   */
  async getStats(companyId: number) {
    // Madagascar = UTC+3 toute l'année (pas d'heure d'été).
    // Toutes les stats journalières sont calculées en heure de Tana,
    // pas en heure locale du serveur.
    const TANA_OFFSET_MS = 3 * 60 * 60 * 1000;
    // On parle d'heure de pointe uniquement à partir de ce seuil
    const PEAK_MIN_COUNT = 10;
    const pad = (n: number) => String(n).padStart(2, '0');
    const toTana = (d: Date) => new Date(d.getTime() + TANA_OFFSET_MS);
    const tanaDayKey = (d: Date) => {
      const t = toTana(d);
      return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
    };
    const tanaHour = (d: Date) => toTana(d).getUTCHours();

    const tanaNow = toTana(new Date());
    // Minuit à Tana, exprimé en timestamp UTC
    const todayStart = new Date(
      Date.UTC(tanaNow.getUTCFullYear(), tanaNow.getUTCMonth(), tanaNow.getUTCDate()) - TANA_OFFSET_MS,
    );

    const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 3600 * 1000);

    const todayTickets = await this.prisma.queueTicket.findMany({
      where: { companyId, createdAt: { gte: todayStart } },
      select: { createdAt: true, completedAt: true, status: true },
    });

    const weekTickets = await this.prisma.queueTicket.findMany({
      where: { companyId, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, status: true },
    });

    const createdToday = todayTickets.length;
    const completedToday = todayTickets.filter((t) => t.status === TicketStatus.COMPLETED).length;
    const cancelledToday = todayTickets.filter((t) => t.status === TicketStatus.CANCELLED).length;
    const absentToday = todayTickets.filter((t) => t.status === TicketStatus.ABSENT).length;

    // Heures de pointe aujourd'hui (tickets créés par heure, en heure de Tana,
    // tickets annulés exclus). On parle de pointe uniquement à partir de PEAK_MIN_COUNT.
    const peakHours: { hour: number; count: number }[] = [];
    for (let h = 0; h < 24; h++) {
      const count = todayTickets.filter(
        (t) => t.status !== TicketStatus.CANCELLED && tanaHour(t.createdAt) === h,
      ).length;
      if (count >= PEAK_MIN_COUNT) peakHours.push({ hour: h, count });
    }
    peakHours.sort((a, b) => b.count - a.count);

    // 7 derniers jours (découpés en jours de Tana)
    const last7Days: { date: string; created: number; completed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart.getTime() + (6 - i) * 24 * 3600 * 1000);
      const dayStr = tanaDayKey(d);
      const dayTickets = weekTickets.filter((t) => tanaDayKey(t.createdAt) === dayStr);
      last7Days.push({
        date: dayStr,
        created: dayTickets.length,
        completed: dayTickets.filter((t) => t.status === TicketStatus.COMPLETED).length,
      });
    }

    // Temps d'attente moyen aujourd'hui (created -> calledAt)
    const waitTimesToday = todayTickets
      .filter((t) => t.completedAt)
      .map((t) => {
        const created = t.createdAt.getTime();
        const completed = t.completedAt!.getTime();
        return Math.round((completed - created) / 1000);
      });
    const avgWaitSeconds =
      waitTimesToday.length > 0
        ? Math.round(waitTimesToday.reduce((s, v) => s + v, 0) / waitTimesToday.length)
        : 0;

    return {
      today: { created: createdToday, completed: completedToday, cancelled: cancelledToday, absent: absentToday },
      peakHours,
      last7Days,
      avgWaitSeconds,
    };
  }

  /**
   * GET /tickets/superadmin-stats - stats globales pour le dashboard superadmin.
   */
  async getSuperAdminStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // --- Tickets today (global) ---
    const todayTickets = await this.prisma.queueTicket.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { createdAt: true, completedAt: true, status: true, companyId: true },
    });

    const createdToday = todayTickets.length;
    const completedToday = todayTickets.filter((t) => t.status === TicketStatus.COMPLETED).length;
    const cancelledToday = todayTickets.filter((t) => t.status === TicketStatus.CANCELLED).length;
    const absentToday = todayTickets.filter((t) => t.status === TicketStatus.ABSENT).length;
    const waitingNow = await this.prisma.queueTicket.count({
      where: { status: TicketStatus.WAITING },
    });

    // --- Companies ---
    const totalCompanies = await this.prisma.company.count();
    const totalAgents = await this.prisma.user.count({ where: { role: { in: ['AGENT', 'COMPANY_ADMIN'] } } });
    const totalCounters = await this.prisma.serviceCounter.count();
    const activeCounters = await this.prisma.serviceCounter.count({ where: { isActive: true } });
    const activeAgents = await this.prisma.user.count({
      where: { role: { in: ['AGENT', 'COMPANY_ADMIN'] }, isActive: true },
    });

    // --- Blocked companies ---
    const now = new Date();
    const allCompanyIds = await this.prisma.company.findMany({ select: { id: true } });
    const blockedCompanyIds: number[] = [];
    for (const { id } of allCompanyIds) {
      if (await this.payments.isCompanyBlocked(id, now)) {
        blockedCompanyIds.push(id);
      }
    }

    // --- Average wait time today ---
    const waitTimesToday = todayTickets
      .filter((t) => t.completedAt)
      .map((t) => {
        const created = t.createdAt.getTime();
        const completed = t.completedAt!.getTime();
        return Math.round((completed - created) / 1000);
      });
    const avgWaitSeconds =
      waitTimesToday.length > 0
        ? Math.round(waitTimesToday.reduce((s, v) => s + v, 0) / waitTimesToday.length)
        : 0;

    // --- Per-company today stats ---
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        name: true,
        paymentMode: true,
        _count: { select: { serviceCounters: true, users: { where: { role: { in: ['AGENT', 'COMPANY_ADMIN'] } } } } },
      },
      orderBy: { name: 'asc' },
    });

    const companyStats = await Promise.all(
      companies.map(async (c) => {
        const cTickets = todayTickets.filter((t) => t.companyId === c.id);
        const cCreated = cTickets.length;
        const cCompleted = cTickets.filter((t) => t.status === TicketStatus.COMPLETED).length;
        const cAbsent = cTickets.filter((t) => t.status === TicketStatus.ABSENT).length;
        const cWaiting = await this.prisma.queueTicket.count({
          where: { companyId: c.id, status: TicketStatus.WAITING },
        });
        const blocked = await this.payments.isCompanyBlocked(c.id, now);
        const activeCounters = await this.prisma.serviceCounter.count({
          where: { companyId: c.id, isActive: true },
        });
        const activeAgents = await this.prisma.user.count({
          where: { companyId: c.id, role: { in: ['AGENT', 'COMPANY_ADMIN'] }, isActive: true },
        });

        return {
          id: c.id,
          name: c.name,
          paymentMode: c.paymentMode,
          blocked,
          counters: c._count.serviceCounters,
          activeCounters,
          agents: c._count.users,
          activeAgents,
          today: { created: cCreated, completed: cCompleted, absent: cAbsent },
          waiting: cWaiting,
        };
      }),
    );

    return {
      today: { created: createdToday, completed: completedToday, cancelled: cancelledToday, absent: absentToday },
      waitingNow,
      avgWaitSeconds,
      companies: {
        total: totalCompanies,
        blocked: blockedCompanyIds.length,
      },
      agents: {
        total: totalAgents,
        active: activeAgents,
      },
      counters: {
        total: totalCounters,
        active: activeCounters,
      },
      companyStats,
    };
  }

  /**
   * GET /tickets/agent-stats - métriques de performance par agent.
   */
  async getAgentStats(companyId: number) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const agents = await this.prisma.user.findMany({
      where: { companyId, role: { in: ['AGENT', 'COMPANY_ADMIN'] } },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        assignedCounter: { select: { id: true, name: true } },
      },
    });

    const allTickets = await this.prisma.queueTicket.findMany({
      where: { companyId, calledByUserId: { not: null } },
      select: {
        calledByUserId: true,
        status: true,
        createdAt: true,
        calledAt: true,
        completedAt: true,
      },
    });

    const todayTickets = allTickets.filter((t) => t.createdAt >= todayStart);

    return agents.map((agent) => {
      const agentAll = allTickets.filter((t) => t.calledByUserId === agent.id);
      const agentToday = todayTickets.filter((t) => t.calledByUserId === agent.id);

      const completedAll = agentAll.filter((t) => t.status === TicketStatus.COMPLETED).length;
      const completedToday = agentToday.filter((t) => t.status === TicketStatus.COMPLETED).length;
      const absentAll = agentAll.filter((t) => t.status === TicketStatus.ABSENT).length;
      const absentToday = agentToday.filter((t) => t.status === TicketStatus.ABSENT).length;
      const calledAll = agentAll.length;
      const calledToday = agentToday.length;

      // Temps de service moyen (calledAt -> completedAt)
      const serviceTimes = agentAll
        .filter((t) => t.completedAt && t.calledAt)
        .map((t) => Math.round((t.completedAt!.getTime() - t.calledAt!.getTime()) / 1000));
      const avgServiceSeconds =
        serviceTimes.length > 0
          ? Math.round(serviceTimes.reduce((s, v) => s + v, 0) / serviceTimes.length)
          : 0;

      // Temps d'attente moyen pour les patients de cet agent (createdAt -> calledAt)
      const waitTimes = agentAll
        .filter((t) => t.calledAt)
        .map((t) => Math.round((t.calledAt!.getTime() - t.createdAt.getTime()) / 1000));
      const avgWaitSeconds =
        waitTimes.length > 0
          ? Math.round(waitTimes.reduce((s, v) => s + v, 0) / waitTimes.length)
          : 0;

      const absentRate = calledAll > 0 ? Math.round((absentAll / calledAll) * 100) : 0;

      return {
        agent: { id: agent.id, username: agent.username, role: agent.role, isActive: agent.isActive, counter: agent.assignedCounter },
        today: { called: calledToday, completed: completedToday, absent: absentToday },
        total: { called: calledAll, completed: completedAll, absent: absentAll },
        avgServiceSeconds,
        avgWaitSeconds,
        absentRate,
      };
    });
  }
}
