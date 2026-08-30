import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre un événement dans le journal
   */
  async record(params: {
    companyId?: number | null;
    event: string;
    message: string;
    level?: string;
    createdBy?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.eventLog.create({
        data: {
          companyId: params.companyId ?? null,
          event: params.event,
          message: params.message,
          level: params.level ?? 'INFO',
          createdBy: params.createdBy ?? null,
        },
      });
    } catch {
      // Ne doit jamais bloquer le flux métier
    }
  }

/**
   * Liste les derniers AcvAcnements (SuperAdmin)
   */
  async list(limit = 100, companyId?: number, from?: Date) {
    const where =
      companyId || from
        ? {
            ...(companyId ? { companyId } : {}),
            ...(from ? { createdAt: { gte: from } } : {}),
          }
        : {};
    return this.prisma.eventLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        company: { select: { id: true, name: true } },
      },
    });
  }
}