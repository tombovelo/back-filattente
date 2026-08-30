import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMode, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';
import { LogsService } from '../logs/logs.service';
import { RecordCompanyPaymentDto } from './dto/record-company-payment.dto';
import { RecordAgentPaymentDto } from './dto/record-agent-payment.dto';
import { UpdatePaymentConfigDto } from './dto/update-payment-config.dto';
import {
  PaymentAgentGroup,
  PaymentCompanyGroup,
  PaymentReportPayload,
} from './payment-report.types';

/**
 * Système de paiement mensuel.
 * - BY_COMPANY : la société paie une fois par mois (couvre tous ses médecins).
 * - BY_AGENT : chaque médecin (agent) paie individuellement.
 *
 * Le paiement doit être effectué entre le 1er et le 5 du mois (mois courant).
 * À partir du 6, toute entité impayée est bloquée (scan refusé + callNext bloqué).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  periodMonth(now: Date = new Date()): string {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private isPastDeadline(now: Date): boolean {
    return now.getUTCDate() > 5;
  }

  /**
   * Vrai si la société est bloquée (mode BY_COMPANY + aucun paiement du mois + délai dépassé).
   * En mode BY_AGENT, la société n'est jamais bloquée en tant que telle.
   */
  async isCompanyBlocked(companyId: number, now: Date = new Date()): Promise<boolean> {
    if (!this.isPastDeadline(now)) return false;

    const payment = await this.prisma.payment.findFirst({
      where: {
        companyId,
        scope: PaymentMode.BY_COMPANY,
        periodMonth: this.periodMonth(now),
      },
      select: { id: true },
    });
    return !payment;
  }

  /**
   * Vrai si le médecin (agent) est bloqué.
   * Nouvelle stratégie :
   *  - Si la société a payé → agent jamais bloqué
   *  - Si la société n'a pas payé + agent n'a pas payé → bloqué
   *  - Si la société n'a pas payé + agent payé → autorisé
   */
  async isAgentBlocked(agentId: number, now: Date = new Date()): Promise<boolean> {
    if (!this.isPastDeadline(now)) return false;

    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      include: {
        company: { select: { id: true } },
      },
    });
    if (!agent || !agent.company) return false;

    const companyPaid = await this.prisma.payment.findFirst({
      where: {
        companyId: agent.company.id,
        scope: PaymentMode.BY_COMPANY,
        periodMonth: this.periodMonth(now),
      },
      select: { id: true },
    });
    if (companyPaid) return false;

    const agentPayment = await this.prisma.payment.findFirst({
      where: { agentId, periodMonth: this.periodMonth(now) },
      select: { id: true },
    });
    return !agentPayment;
  }

  /**
   * Vue d'ensemble pour le SUPER_ADMIN : mode de paiement, statut de paiement et blocage par société/agent.
   */
  async getStatus(now: Date = new Date()) {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        name: true,
        paymentMode: true,
        users: {
          where: { role: { in: [Role.AGENT, Role.COMPANY_ADMIN] } },
          select: {
            id: true,
            username: true,
            role: true,
            assignedCounter: { select: { id: true, name: true } },
          },
          orderBy: { username: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const yearMonth = this.periodMonth(now);

    return Promise.all(
      companies.map(async (company) => {
        let companyPayment: {
          id: number;
          amount: Prisma.Decimal;
          paidAt: Date;
        } | null = null;

        companyPayment = await this.prisma.payment.findFirst({
          where: {
            companyId: company.id,
            scope: PaymentMode.BY_COMPANY,
            periodMonth: yearMonth,
          },
          select: { id: true, amount: true, paidAt: true },
        });

        const agents = await Promise.all(
          company.users.map(async (user) => {
            const agentPayment = await this.prisma.payment.findFirst({
              where: { agentId: user.id, periodMonth: yearMonth },
              select: { id: true, amount: true, paidAt: true },
            });

            return {
              id: user.id,
              username: user.username,
              role: user.role,
              assignedCounter: user.assignedCounter,
              paidThisMonth: Boolean(agentPayment),
              amount: agentPayment ? Number(agentPayment.amount) : 0,
              paidAt: agentPayment?.paidAt ?? null,
              paymentId: agentPayment?.id ?? null,
              blocked: await this.isAgentBlocked(user.id, now),
            };
          }),
        );

        return {
          id: company.id,
          name: company.name,
          paymentMode: company.paymentMode,
          paidThisMonth: Boolean(companyPayment),
          amount: companyPayment ? Number(companyPayment.amount) : 0,
          paidAt: companyPayment?.paidAt ?? null,
          paymentId: companyPayment?.id ?? null,
          companyBlocked: await this.isCompanyBlocked(company.id, now),
          agents,
        };
      }),
    );
  }

  /**
   * Enregistre un paiement société (mode BY_COMPANY) pour le mois courant.
   */
  async recordCompanyPayment(dto: RecordCompanyPaymentDto, recordedById: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const periodMonth = dto.periodMonth ?? this.periodMonth();

    const existing = await this.prisma.payment.findFirst({
      where: {
        companyId: dto.companyId,
        scope: PaymentMode.BY_COMPANY,
        periodMonth,
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `Cette societe a deja paye pour le mois ${periodMonth}`,
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        companyId: dto.companyId,
        scope: PaymentMode.BY_COMPANY,
        amount: new Prisma.Decimal(dto.amount ?? 0),
        periodMonth,
        note: dto.note,
        recordedById,
      },
    });

    await this.logs.record({
      companyId: dto.companyId,
      event: 'payment_recorded',
      message: `Paiement société enregistré pour ${company.name} (mois ${payment.periodMonth})`,
      level: 'INFO',
      createdBy: null,
    });

    return payment;
  }

  /**
   * Enregistre un paiement médecin (mode BY_AGENT) pour le mois courant.
   */
  async recordAgentPayment(dto: RecordAgentPaymentDto, recordedById: number) {
    const agent = await this.prisma.user.findUnique({
      where: { id: dto.agentId },
      select: { id: true, username: true, companyId: true, company: { select: { name: true } } },
    });
    if (!agent || !agent.companyId) throw new NotFoundException('Agent introuvable');

    const periodMonth = dto.periodMonth ?? this.periodMonth();

    const existing = await this.prisma.payment.findFirst({
      where: { agentId: dto.agentId, periodMonth },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `Cet agent a deja paye pour le mois ${periodMonth}`,
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        companyId: agent.companyId,
        agentId: dto.agentId,
        scope: PaymentMode.BY_AGENT,
        amount: new Prisma.Decimal(dto.amount ?? 0),
        periodMonth,
        note: dto.note,
        recordedById,
      },
    });

    await this.logs.record({
      companyId: agent.companyId,
      event: 'payment_recorded',
      message: `Paiement agent enregistré pour ${agent.username} (mois ${payment.periodMonth})`,
      level: 'INFO',
      createdBy: null,
    });

    return payment;
  }

  /**
   * Change le mode de paiement d'une société.
   */
  async setCompanyPaymentMode(companyId: number, paymentMode: PaymentMode) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { paymentMode },
      select: { id: true, name: true, paymentMode: true },
    });

    await this.logs.record({
      companyId,
      event: 'payment_mode_changed',
      message: `Mode de paiement de ${company.name} modifié : ${paymentMode}`,
      level: 'INFO',
      createdBy: null,
    });

    return updated;
  }

  /**
   * Annule (supprime) un paiement. La société/l'agent repasse « à payer ».
   */
  async cancelPayment(paymentId: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Paiement introuvable');

    await this.prisma.payment.delete({ where: { id: paymentId } });

    await this.logs.record({
      companyId: payment.companyId,
      event: 'payment_cancelled',
      message: `Paiement annulé (${
        payment.scope === PaymentMode.BY_AGENT ? 'agent' : 'société'
      }, mois ${payment.periodMonth})`,
      level: 'WARN',
      createdBy: null,
    });

    return { id: payment.id };
  }

  /**
   * GET /payments/report - comptabilité : paiements par société et par agent,
   * filtrables par année (req) et mois (opt). Retourne les totaux.
   */
  async getReport(year: number, month?: number): Promise<PaymentReportPayload> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Année invalide');
    }
    if (month != null && (month < 1 || month > 12)) {
      throw new BadRequestException('Mois invalide');
    }

    const prefix =
      month != null ? `${year}-${String(month).padStart(2, '0')}` : `${year}`;

    const payments = await this.prisma.payment.findMany({
      where: { periodMonth: { startsWith: prefix } },
      orderBy: { paidAt: 'desc' },
      include: {
        company: { select: { name: true } },
        agent: { select: { username: true } },
      },
    });

    const companyMap = new Map<number, PaymentCompanyGroup>();
    const agentMap = new Map<number, PaymentAgentGroup>();

    let total = 0;
    for (const payment of payments) {
      const amount = Number(payment.amount);
      total += amount;
      const item: PaymentReportPayload['byCompany'][number]['payments'][number] = {
        id: payment.id,
        amount,
        periodMonth: payment.periodMonth,
        paidAt: payment.paidAt,
        note: payment.note,
      };

      if (payment.agentId != null) {
        const entry: PaymentAgentGroup =
          agentMap.get(payment.agentId) ?? {
            agentId: payment.agentId,
            agentUsername: payment.agent?.username ?? 'Inconnu',
            subtotal: 0,
            payments: [],
          };
        entry.subtotal += amount;
        entry.payments.push(item);
        agentMap.set(payment.agentId, entry);
      } else if (payment.companyId != null) {
        const entry: PaymentCompanyGroup =
          companyMap.get(payment.companyId) ?? {
            companyId: payment.companyId,
            companyName: payment.company?.name ?? 'Inconnue',
            subtotal: 0,
            payments: [],
          };
        entry.subtotal += amount;
        entry.payments.push(item);
        companyMap.set(payment.companyId, entry);
      }
    }

    return {
      year,
      month: month ?? null,
      total,
      byCompany: [...companyMap.values()].sort((a, b) => b.subtotal - a.subtotal),
      byAgent: [...agentMap.values()].sort((a, b) => b.subtotal - a.subtotal),
    };
  }

  async getMyReport(year: number, month: number | undefined, user: { id: number; role: string; companyId?: number | null }): Promise<PaymentReportPayload> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('Année invalide');
    }
    if (month != null && (month < 1 || month > 12)) {
      throw new BadRequestException('Mois invalide');
    }

    const prefix = month != null ? `${year}-${String(month).padStart(2, '0')}` : `${year}`;

    const where: Prisma.PaymentWhereInput = { periodMonth: { startsWith: prefix } };

    if (user.role === Role.COMPANY_ADMIN && user.companyId) {
      where.companyId = user.companyId;
    } else if (user.role === Role.AGENT) {
      where.agentId = user.id;
    }

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      include: {
        company: { select: { name: true } },
        agent: { select: { username: true } },
      },
    });

    const companyMap = new Map<number, PaymentCompanyGroup>();
    const agentMap = new Map<number, PaymentAgentGroup>();

    let total = 0;
    for (const payment of payments) {
      const amount = Number(payment.amount);
      total += amount;
      const item: PaymentReportPayload['byCompany'][number]['payments'][number] = {
        id: payment.id,
        amount,
        periodMonth: payment.periodMonth,
        paidAt: payment.paidAt,
        note: payment.note,
      };

      if (payment.agentId != null) {
        const entry: PaymentAgentGroup =
          agentMap.get(payment.agentId) ?? {
            agentId: payment.agentId,
            agentUsername: payment.agent?.username ?? 'Inconnu',
            subtotal: 0,
            payments: [],
          };
        entry.subtotal += amount;
        entry.payments.push(item);
        agentMap.set(payment.agentId, entry);
      } else if (payment.companyId != null) {
        const entry: PaymentCompanyGroup =
          companyMap.get(payment.companyId) ?? {
            companyId: payment.companyId,
            companyName: payment.company?.name ?? 'Inconnue',
            subtotal: 0,
            payments: [],
          };
        entry.subtotal += amount;
        entry.payments.push(item);
        companyMap.set(payment.companyId, entry);
      }
    }

    return {
      year,
      month: month ?? null,
      total,
      byCompany: [...companyMap.values()].sort((a, b) => b.subtotal - a.subtotal),
      byAgent: [...agentMap.values()].sort((a, b) => b.subtotal - a.subtotal),
    };
  }

  /**
   * GET /payments/config - montants mensuels par défaut (agent et société) de chaque société.
   */
  async getConfig() {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        name: true,
        monthlyAgentAmount: true,
        monthlyCompanyAmount: true,
      },
      orderBy: { name: 'asc' },
    });

    return {
      items: companies.map((c) => ({
        companyId: c.id,
        companyName: c.name,
        monthlyAgentAmount: c.monthlyAgentAmount != null ? Number(c.monthlyAgentAmount) : null,
        monthlyCompanyAmount:
          c.monthlyCompanyAmount != null ? Number(c.monthlyCompanyAmount) : null,
      })),
    };
  }

  /**
   * PATCH /payments/config/:companyId - définit les montants mensuels (null = non défini).
   */
  async updateConfig(companyId: number, dto: UpdatePaymentConfigDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const data: Prisma.CompanyUpdateInput = {};
    if ('monthlyAgentAmount' in dto) {
      data.monthlyAgentAmount =
        dto.monthlyAgentAmount != null ? new Prisma.Decimal(dto.monthlyAgentAmount) : null;
    }
    if ('monthlyCompanyAmount' in dto) {
      data.monthlyCompanyAmount =
        dto.monthlyCompanyAmount != null ? new Prisma.Decimal(dto.monthlyCompanyAmount) : null;
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data,
      select: {
        id: true,
        name: true,
        monthlyAgentAmount: true,
        monthlyCompanyAmount: true,
      },
    });

    await this.logs.record({
      companyId,
      event: 'payment_config_updated',
      message: `Montants de paiement mis à jour pour ${company.name}`,
      level: 'INFO',
      createdBy: null,
    });

    return {
      companyId: updated.id,
      companyName: updated.name,
      monthlyAgentAmount: updated.monthlyAgentAmount != null ? Number(updated.monthlyAgentAmount) : null,
      monthlyCompanyAmount:
        updated.monthlyCompanyAmount != null ? Number(updated.monthlyCompanyAmount) : null,
    };
  }
}