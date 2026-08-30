import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/enums/role.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { PrismaService } from '../prisma/prisma.service';

export interface TicketsGatewayPayload {
  companyId: number;
  counterId?: number;
  type:
    | 'ticket_created'
    | 'ticket_called'
    | 'ticket_completed'
    | 'ticket_cancelled'
    | 'ticket_absent'
    | 'queue_status'
    | 'company_changed';
  data: unknown;
}

const room = (prefix: string, id: number) => `${prefix}:${id}`;
const GLOBAL_ROOM = 'superadmin';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/tickets',
})
export class TicketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(TicketsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = (client.handshake.auth?.token ??
        client.handshake.headers.authorization?.replace('Bearer ', '')) as string;

      if (!token) throw new UnauthorizedException('Token manquant');

      const payload = this.jwt.verify<{
        sub: number;
        companyId: number | null;
        role?: Role;
        type?: string;
      }>(token);

      if (payload.type === 'patient') {
        client.data.patientDeviceId = payload.sub;
        await client.join(ROOM.patient(payload.sub));
        this.logger.log(`Patient device ${payload.sub} connecté au namespace /tickets`);
        return;
      }

      client.data.agentId = payload.sub;
      client.data.companyId = payload.companyId;
      client.data.role = payload.role;

      if (payload.companyId != null) {
        await client.join(ROOM.company(payload.companyId));
      } else if (payload.role === Role.SUPER_ADMIN) {
        await client.join(GLOBAL_ROOM);
      }

      this.logger.log(
        `Agent ${payload.sub} (société ${payload.companyId}) connecté au namespace /tickets`,
      );
    } catch {
      this.logger.warn('Connexion WebSocket refusée (token invalide)');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client ${client.data?.patientDeviceId ?? client.data?.agentId} déconnecté`);
  }

  /**
   * Event ciblé vers l'appareil d'un patient précis
   */
  broadcastToPatient(deviceId: number, event: string, payload: unknown): void {
    this.server.to(ROOM.patient(deviceId)).emit(event, payload);
  }

  /**
   * Notifie les patients encore en attente d'un guichet que la file a bougé
   * (appel/termine/absent/annulation devant eux) → ils rafraîchissent position + estimation.
   */
  async notifyWaitingPatients(counterId: number): Promise<void> {
    const waiting = await this.prisma.queueTicket.findMany({
      where: {
        counterId,
        status: TicketStatus.WAITING,
        patientDeviceId: { not: null },
      },
      select: { patientDeviceId: true },
    });
    for (const { patientDeviceId } of waiting) {
      if (patientDeviceId != null) {
        this.server.to(ROOM.patient(patientDeviceId)).emit('queue_update', {
          counterId,
          event: 'queue_update',
        });
      }
    }
  }

  /**
   * Broadcast vers tous les clients de la société et les superadmins
   */
  broadcastToCompany(
    companyId: number,
    event: string,
    payload: TicketsGatewayPayload,
  ): void {
    this.server.to(ROOM.company(companyId)).to(GLOBAL_ROOM).emit(event, payload);
  }

  /**
   * Broadcast ciblé à un guichet précis
   */
  broadcastToCounter(
    companyId: number,
    counterId: number,
    event: string,
    payload: TicketsGatewayPayload,
  ): void {
    this.server
      .to(ROOM.company(companyId))
      .to(ROOM.counter(counterId))
      .to(GLOBAL_ROOM)
      .emit(event, payload);
  }
}

export const ROOM = {
  company: (id: number) => `company:${id}`,
  counter: (id: number) => `counter:${id}`,
  patient: (id: number) => `patient:${id}`,
};
