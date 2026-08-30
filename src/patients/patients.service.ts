import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PatientPushService } from '../notifications/patient-push.service';
import { TicketsGateway } from '../tickets/tickets.gateway';
import { WaitEstimationService } from '../tickets/wait-estimation.service';
import { LogsService } from '../logs/logs.service';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class PatientsService {
  private readonly logger = new Logger(PatientsService.name);

  /**
   * Dernier timestamp d'une notification « scan bloqué » par appareil,
   * pour garantir au plus 1 notification par tranche de 30 s.
   */
  private readonly lastBlockedPushAt = new Map<number, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly push: PatientPushService,
    private readonly gateway: TicketsGateway,
    private readonly estimation: WaitEstimationService,
    private readonly logs: LogsService,
    private readonly payments: PaymentsService,
  ) { }

  /**
   * Parse le ref du QR code : "COMPANY_1_SERVICE_2" (même format que l'ancien QR Messenger)
   */
  private parseRef(ref: string): { companyId: number; serviceId: number } | null {
    const match = ref.match(/COMPANY[_-]?(\d+)[_-]?SERVICE[_-]?(\d+)/i);
    if (!match) return null;
    return { companyId: Number(match[1]), serviceId: Number(match[2]) };
  }

  private async getDeviceToken(deviceId: number): Promise<string | null> {
    const device = await this.prisma.patientDevice.findUnique({
      where: { id: deviceId },
    });
    return device?.deviceToken ?? null;
  }

  /**
   * POST /patients/register - enregistre l'appareil et renvoie un JWT patient
   */
  async register(dto: RegisterDeviceDto) {
    const device = await this.prisma.patientDevice.upsert({
      where: { deviceToken: dto.deviceToken },
      update: { platform: dto.platform ?? 'expo', lastSeenAt: new Date() },
      create: {
        deviceToken: dto.deviceToken,
        platform: dto.platform ?? 'expo',
      },
    });

    const access_token = await this.jwt.signAsync(
      { sub: device.id, type: 'patient' },
      { expiresIn: '365d' },
    );

    return {
      access_token,
      patient: { id: device.id, platform: device.platform },
    };
  }

  /**
   * POST /patients/scan - scan QR -> création du ticket + confirmation push
   */
  async scan(deviceId: number, ref: string) {
    const parsed = this.parseRef(ref);
    if (!parsed) {
      throw new BadRequestException('Lien invalide. Scannez le QR code officiel.');
    }

    const { companyId, serviceId } = parsed;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new BadRequestException('Lien invalide. Scannez le QR code officiel.');
    }

    const counter = await this.prisma.serviceCounter.findFirst({
      where: { id: serviceId, companyId, isActive: true },
    });
    if (!counter) {
      throw new BadRequestException(
        'Ce guichet est momentanément indisponible. Réessayez plus tard.',
      );
    }

    const assignedAgent = await this.prisma.user.findFirst({
      where: { companyId, assignedCounterId: counter.id },
      select: { id: true, dailyCapacity: true, isActive: true },
    });

    if (!assignedAgent || !assignedAgent.isActive) {
      await this.sendScanBlockedPush(
        deviceId,
        "L'agent affecté au guichet est indisponible. Réessayez plus tard.",
      );
      throw new BadRequestException(
        "L'agent affecté au guichet est indisponible. Réessayez plus tard.",
      );
    }

    if (await this.payments.isAgentBlocked(assignedAgent.id)) {
      await this.sendScanBlockedPush(
        deviceId,
        "L'agent de ce service est temporairement indisponible. Réessayez plus tard.",
      );
      throw new BadRequestException(
        "L'agent de ce service est temporairement indisponible. Réessayez plus tard.",
      );
    }

    const capacity = assignedAgent.dailyCapacity ?? 0;
    if (capacity > 0) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const todayCount = await this.prisma.queueTicket.count({
        where: {
          companyId,
          counterId: counter.id,
          createdAt: { gte: start },
          status: { not: TicketStatus.CANCELLED },
        },
      });
      if (todayCount >= capacity) {
        await this.sendScanBlockedPush(
          deviceId,
          "L'agent a atteint son quota et ne peut plus recevoir de patients aujourd'hui.",
        );
        throw new BadRequestException(
          "L'agent a atteint son quota et ne peut plus recevoir de patients aujourd'hui.",
        );
      }
    }

    const { ticket, ticketNumber } = await this.prisma.$transaction(async (tx) => {
      const updatedCounter = await tx.serviceCounter.update({
        where: { id: counter.id },
        data: { ticketCounter: { increment: 1 } },
      });
      const number = `${updatedCounter.prefix}-${String(
        updatedCounter.ticketCounter,
      ).padStart(3, '0')}`;
      const created = await tx.queueTicket.create({
        data: {
          companyId,
          counterId: counter.id,
          ticketNumber: number,
          status: TicketStatus.WAITING,
          patientDeviceId: deviceId,
        },
      });
      return { ticket: created, ticketNumber: number };
    });

    const position = await this.prisma.queueTicket.count({
      where: {
        counterId: counter.id,
        status: TicketStatus.WAITING,
        createdAt: { lt: ticket.createdAt },
      },
    });

    const est = await this.estimation.estimateForTicket(
      companyId,
      counter.id,
      ticket.createdAt,
    );

    this.logger.log(`Ticket ${ticketNumber} créé (app mobile) pour device ${deviceId}`);
    this.logs.record({
      companyId,
      event: 'ticket_created',
      message: `Ticket ${ticketNumber} créé via l'app mobile`,
    });

    this.gateway.broadcastToCompany(companyId, 'ticket.created', {
      companyId,
      counterId: counter.id,
      type: 'ticket_created',
      data: { ticket, counter: { id: counter.id, name: counter.name } },
    });
    this.gateway.broadcastToCompany(companyId, 'queue_status', {
      companyId,
      type: 'queue_status',
      data: { event: 'ticket_created' },
    });

    const token = await this.getDeviceToken(deviceId);
    if (token) {
      await this.push.send({
        to: token,
        channelId: 'default',
        title: `Votre numéro est le ${ticketNumber}`,
        body: `Position actuelle : ${position} personne(s) avant vous.\nTemps d'attente estimé : ${this.estimation.formatRange(est.minSeconds, est.maxSeconds)}.`,
        data: { type: 'ticket_created', ticketId: ticket.id, ticketNumber },
      });
    }

    return {
      ticket: {
        id: ticket.id,
        ticketNumber,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
      position,
      estimateSeconds: est.seconds,
      estimateMinSeconds: est.minSeconds,
      estimateMaxSeconds: est.maxSeconds,
      sampleCount: est.sampleCount,
      counter: { id: counter.id, name: counter.name },
    };
  }

  /**
   * GET /patients/ticket - ticket actif courant de l'appareil
   */
  async myTicket(deviceId: number) {
    const ticket = await this.prisma.queueTicket.findFirst({
      where: {
        patientDeviceId: deviceId,
        status: { in: [TicketStatus.WAITING, TicketStatus.CALLED] },
      },
      orderBy: { createdAt: 'desc' },
      include: { counter: true, company: true },
    });

    if (!ticket) return { ticket: null };

    const position = await this.prisma.queueTicket.count({
      where: {
        counterId: ticket.counterId,
        status: TicketStatus.WAITING,
        createdAt: { lt: ticket.createdAt },
      },
    });
    const est = await this.estimation.estimateForTicket(
      ticket.companyId,
      ticket.counterId,
      ticket.createdAt,
    );

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        createdAt: ticket.createdAt,
        calledAt: ticket.calledAt,
      },
      position: ticket.status === TicketStatus.CALLED ? 0 : position,
      estimateSeconds: est.seconds,
      estimateMinSeconds: est.minSeconds,
      estimateMaxSeconds: est.maxSeconds,
      sampleCount: est.sampleCount,
      counter: { id: ticket.counter.id, name: ticket.counter.name },
      company: { id: ticket.company.id, name: ticket.company.name },
    };
  }

  /**
   * GET /patients/tickets/:id/position - position + estimation d'un ticket
   */
  async ticketPosition(deviceId: number, ticketId: number) {
    const ticket = await this.prisma.queueTicket.findFirst({
      where: {
        id: ticketId,
        patientDeviceId: deviceId,
        status: { in: [TicketStatus.WAITING, TicketStatus.CALLED] },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket introuvable ou déjà traité.');
    }

    const position = await this.prisma.queueTicket.count({
      where: {
        counterId: ticket.counterId,
        status: TicketStatus.WAITING,
        createdAt: { lt: ticket.createdAt },
      },
    });
    const est = await this.estimation.estimateForTicket(
      ticket.companyId,
      ticket.counterId,
      ticket.createdAt,
    );

    return {
      position: ticket.status === TicketStatus.CALLED ? 0 : position,
      estimateSeconds: est.seconds,
      estimateMinSeconds: est.minSeconds,
      estimateMaxSeconds: est.maxSeconds,
      sampleCount: est.sampleCount,
      status: ticket.status,
    };
  }

  /**
   * POST /patients/tickets/:id/cancel - annulation du ticket
   */
  async cancelTicket(deviceId: number, ticketId: number) {
    const ticket = await this.prisma.queueTicket.findFirst({
      where: {
        id: ticketId,
        patientDeviceId: deviceId,
        status: { in: [TicketStatus.WAITING, TicketStatus.CALLED] },
      },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket introuvable ou déjà traité.');
    }

    const updated = await this.prisma.queueTicket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.CANCELLED },
    });

    this.logs.record({
      companyId: ticket.companyId,
      event: 'ticket_cancelled',
      message: `Ticket ${ticket.ticketNumber} annulé par le client (app mobile)`,
      level: 'WARN',
    });

    this.gateway.broadcastToCompany(ticket.companyId, 'ticket.cancelled', {
      companyId: ticket.companyId,
      counterId: ticket.counterId,
      type: 'ticket_cancelled',
      data: updated,
    });
    this.gateway.broadcastToCompany(ticket.companyId, 'queue_status', {
      companyId: ticket.companyId,
      type: 'queue_status',
      data: { event: 'ticket_cancelled' },
    });

    const token = await this.getDeviceToken(deviceId);
    if (token) {
      await this.push.send({
        to: token,
        channelId: 'default',
        title: 'Ticket annulé',
        body: `Votre ticket ${ticket.ticketNumber} a été annulé. À bientôt !`,
        data: { type: 'ticket_cancelled', ticketId: ticket.id, ticketNumber: ticket.ticketNumber },
      });
    }

    // Les patients encore en attente derrière avancent d'une place
    await this.gateway.notifyWaitingPatients(ticket.counterId);

    return updated;
  }

  private async sendScanBlockedPush(deviceId: number, body: string): Promise<void> {
    const now = Date.now();
    const last = this.lastBlockedPushAt.get(deviceId);
    if (last != null && now - last < 30_000) return;

    const token = await this.getDeviceToken(deviceId);
    if (!token) return;
    await this.push.send({
      to: token,
      channelId: 'default',
      title: 'Service indisponible',
      body,
      data: { type: 'scan_blocked' },
    });
    this.lastBlockedPushAt.set(deviceId, now);
    if (this.lastBlockedPushAt.size > 1000) this.lastBlockedPushAt.clear();
  }
}