import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PatientPushService } from '../notifications/patient-push.service';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { WaitEstimationService } from './wait-estimation.service';

export interface TicketRecipient {
  patientDeviceId?: number | null;
}

@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly estimation: WaitEstimationService,
    private readonly push: PatientPushService,
  ) {}

  private async getDeviceToken(deviceId: number): Promise<string | null> {
    const device = await this.prisma.patientDevice.findUnique({
      where: { id: deviceId },
    });
    return device?.deviceToken ?? null;
  }

  async notifyYourTurn(
    counterName: string,
    ticketNumber: string,
    recipient: TicketRecipient,
  ): Promise<void> {
    if (!recipient.patientDeviceId) return;

    const token = await this.getDeviceToken(recipient.patientDeviceId);
    if (!token) return;

    await this.push.send({
      to: token,
      channelId: 'default',
      title: "C'est à vous !",
      body: `Votre ticket ${ticketNumber} a été appelé au guichet ${counterName}. Veuillez vous présenter.`,
      data: { type: 'ticket_called', ticketNumber },
    });
    this.logger.log(`Push "votre tour" → ${ticketNumber}`);
  }

  async notifyTwoRemaining(
    ticketNumber: string,
    recipient: TicketRecipient,
    position: number,
    estimateSeconds: number,
  ): Promise<void> {
    if (!recipient.patientDeviceId) return;

    const token = await this.getDeviceToken(recipient.patientDeviceId);
    if (!token) return;

    await this.push.send({
      to: token,
      channelId: 'default',
      title: 'Votre tour approche',
      body: `Plus que ${position} personne(s) avant vous ! Votre ticket ${ticketNumber} approche.\nTemps d'attente estimé : ${this.estimation.format(estimateSeconds)}. Restez à proximité.`,
      data: { type: 'ticket_reminder', ticketNumber, position },
    });
    this.logger.log(`Push rappel "2 restantes" → ${ticketNumber}`);
  }

  async markReminded(ticketId: number): Promise<void> {
    await this.prisma.queueTicket.update({
      where: { id: ticketId },
      data: { remindedAt: new Date() },
    });
  }

  async processReminders(companyId: number, counterId: number): Promise<void> {
    const waiting = await this.prisma.queueTicket.findMany({
      where: {
        companyId,
        counterId,
        status: TicketStatus.WAITING,
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const [index, ticket] of waiting.entries()) {
      const position = index + 1;
      if (position <= 2 && !ticket.remindedAt) {
        const est = await this.estimation.estimateForTicket(
          companyId,
          counterId,
          ticket.createdAt,
        );
        await this.notifyTwoRemaining(
          ticket.ticketNumber,
          { patientDeviceId: ticket.patientDeviceId },
          position,
          est.seconds,
        );
        await this.markReminded(ticket.id);
      }
    }
  }
}
