import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { PrismaService } from '../prisma/prisma.service';

export interface CounterStats {
  avgServiceSeconds: number;
  sampleCount: number;
}

export interface WaitEstimate {
  /** personnes devant (WAITING avant + CALLED en cours) */
  peopleAhead: number;
  /** WAITING créés avant ce ticket uniquement */
  before: number;
  seconds: number;
  /** estimation basse (meilleur cas) */
  minSeconds: number;
  /** estimation haute (pire cas) */
  maxSeconds: number;
  /** nombre d'échantillons utilisés pour l'estimation */
  sampleCount: number;
}

@Injectable()
export class WaitEstimationService {
  /** Par défaut : 5 min par personne si pas assez de données */
  private readonly DEFAULT_PER_PERSON_SECONDS = 300;
  /** Nombre d'échantillons minimum pour faire confiance au temps de service calculé */
  private readonly MIN_SAMPLES = 5;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Temps de service moyen par guichet (en secondes) à partir des tickets terminés :
   * moyenne pondérée de (completedAt - calledAt).
   * Les 7 derniers jours pèsent 2x plus que les tickets plus anciens.
   */
  async serviceStatsByCounter(
    companyId: number | null,
  ): Promise<Map<number, CounterStats>> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const where: Prisma.QueueTicketWhereInput = {
      status: TicketStatus.COMPLETED,
    };
    if (companyId) where.companyId = companyId;

    const tickets = await this.prisma.queueTicket.findMany({
      where,
      select: { counterId: true, calledAt: true, completedAt: true, createdAt: true },
    });

    const acc = new Map<number, { totalWeightedMs: number; totalCount: number; totalMs: number; count: number }>();
    for (const t of tickets) {
      if (!t.calledAt || !t.completedAt) continue;
      const ms = t.completedAt.getTime() - t.calledAt.getTime();
      if (ms <= 0) continue;

      const isRecent = t.createdAt >= sevenDaysAgo;
      const weight = isRecent ? 2 : 1;

      const cur = acc.get(t.counterId) ?? { totalWeightedMs: 0, totalCount: 0, totalMs: 0, count: 0 };
      cur.totalWeightedMs += ms * weight;
      cur.totalCount += weight;
      cur.totalMs += ms;
      cur.count += 1;
      acc.set(t.counterId, cur);
    }

    const result = new Map<number, CounterStats>();
    for (const [counterId, s] of acc) {
      result.set(counterId, {
        avgServiceSeconds: Math.round(s.totalWeightedMs / s.totalCount / 1000),
        sampleCount: s.count,
      });
    }
    return result;
  }

  /**
   * Estimation du temps d'attente pour `peopleAhead` personnes devant.
   * Retourne une fourchette [min, max] basée sur la variance historique.
   */
  estimate(peopleAhead: number, stats: CounterStats | undefined): { seconds: number; minSeconds: number; maxSeconds: number } {
    if (peopleAhead <= 0) return { seconds: 0, minSeconds: 0, maxSeconds: 0 };
    const perPerson = this.serviceSeconds(stats);

    const seconds = Math.round(peopleAhead * perPerson);
    // Fourchette : -20% / +30% pour ten compte de la variabilité
    const minSeconds = Math.round(seconds * 0.8);
    const maxSeconds = Math.round(seconds * 1.3);

    return { seconds, minSeconds, maxSeconds };
  }

  private serviceSeconds(stats: CounterStats | undefined): number {
    if (!stats || stats.sampleCount === 0 || stats.avgServiceSeconds <= 0) {
      return this.DEFAULT_PER_PERSON_SECONDS;
    }

    const priorCount = this.MIN_SAMPLES;
    return Math.round(
      (this.DEFAULT_PER_PERSON_SECONDS * priorCount + stats.avgServiceSeconds * stats.sampleCount) /
        (priorCount + stats.sampleCount),
    );
  }

  /** Estimation pour un ticket précis dans la file de son guichet */
  async estimateForTicket(
    companyId: number,
    counterId: number,
    ticketCreatedAt: Date,
  ): Promise<WaitEstimate> {
    const [before, currentTickets, statsMap] = await Promise.all([
      this.prisma.queueTicket.count({
        where: {
          companyId,
          counterId,
          status: TicketStatus.WAITING,
          createdAt: { lt: ticketCreatedAt },
        },
      }),
      this.prisma.queueTicket.findMany({
        where: { companyId, counterId, status: TicketStatus.CALLED },
        select: { calledAt: true },
      }),
      this.serviceStatsByCounter(companyId),
    ]);
    const stats = statsMap.get(counterId);
    const serviceSeconds = this.serviceSeconds(stats);
    const now = Date.now();
    const currentRemaining = currentTickets.reduce((total, ticket) => {
      if (!ticket.calledAt) return total + serviceSeconds;
      const elapsed = Math.max(0, Math.round((now - ticket.calledAt.getTime()) / 1000));
      return total + Math.max(0, serviceSeconds - elapsed);
    }, 0);
    const seconds = Math.round(currentRemaining + before * serviceSeconds);
    const est = {
      seconds,
      minSeconds: Math.round(seconds * 0.8),
      maxSeconds: Math.round(seconds * 1.3),
    };
    return {
      peopleAhead: before + currentTickets.length,
      before,
      seconds: est.seconds,
      minSeconds: est.minSeconds,
      maxSeconds: est.maxSeconds,
      sampleCount: stats?.sampleCount ?? 0,
    };
  }

  /** Estimation "si un client prenait un ticket maintenant" pour un guichet */
  async estimateForCounter(
    companyId: number | null,
    counterId: number,
  ): Promise<{ peopleAhead: number; seconds: number; sampleCount: number }> {
    const [waiting, current, statsMap] = await Promise.all([
      this.prisma.queueTicket.count({
        where: { companyId: companyId ?? undefined, counterId, status: TicketStatus.WAITING },
      }),
      this.prisma.queueTicket.count({
        where: { companyId: companyId ?? undefined, counterId, status: TicketStatus.CALLED },
      }),
      this.serviceStatsByCounter(companyId),
    ]);
    const stats = statsMap.get(counterId);
    const est = this.estimate(waiting + current, stats);
    return {
      peopleAhead: waiting + current,
      seconds: est.seconds,
      sampleCount: stats?.sampleCount ?? 0,
    };
  }

  /** Formate un temps en secondes pour un message */
  format(seconds: number): string {
    const s = Math.max(0, seconds);
    if (s === 0) return 'à votre tour';
    if (s < 60) return 'moins d\'une minute';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `≈ ${h}h ${m} min`;
    return `≈ ${m} min`;
  }

  /** Formate une fourchette de temps */
  formatRange(minSeconds: number, maxSeconds: number): string {
    if (minSeconds === 0 && maxSeconds === 0) return 'à votre tour';
    const min = this.format(minSeconds);
    const max = this.format(maxSeconds);
    if (min === max) return min;
    return `${min} – ${max}`;
  }
}
