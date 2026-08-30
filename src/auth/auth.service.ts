import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enums/role.enum';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async listCompanies() {
    return this.prisma.company.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async login(dto: LoginDto) {
    const user = await this.findUser(dto);

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (user.isActive === false) {
      throw new UnauthorizedException('Compte désactivé. Contactez votre administrateur');
    }

    return this.signToken(user);
  }

  /**
   * SUPER_ADMIN : companyId null (login sans companyId)
   * COMPANY_ADMIN / AGENT : login sur (companyId, username)
   */
  private async findUser(dto: LoginDto) {
    if (dto.companyId == null) {
      return this.prisma.user.findFirst({
        where: { companyId: null, username: dto.username },
        include: { assignedCounter: true },
      });
    }

    return this.prisma.user.findUnique({
      where: {
        companyId_username: {
          companyId: dto.companyId,
          username: dto.username,
        },
      },
      include: { assignedCounter: true },
    });
  }

  private async signToken(user: {
    id: number;
    companyId: number | null;
    username: string;
    role: Role;
    assignedCounter?: { id: number; name: string } | null;
  }) {
    const payload = {
      sub: user.id,
      companyId: user.companyId,
      username: user.username,
      role: user.role,
    };
    const access_token = await this.jwt.signAsync(payload);

    return {
      access_token,
      user: {
        id: user.id,
        username: user.username,
        companyId: user.companyId,
        role: user.role,
        assignedCounter: user.assignedCounter ?? null,
      },
    };
  }

  async updateProfile(userId: number, companyId: number | null, dto: UpdateProfileDto) {
    if (dto.username) {
      const existing = companyId
        ? await this.prisma.user.findUnique({ where: { companyId_username: { companyId, username: dto.username } } })
        : await this.prisma.user.findFirst({ where: { companyId: null, username: dto.username } });

      if (existing && existing.id !== userId) {
        throw new BadRequestException("Ce nom d'utilisateur est déjà pris");
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { ...(dto.username ? { username: dto.username } : {}) },
      include: { assignedCounter: true },
    });

    return this.signToken(updated);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Mot de passe actuel incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return { success: true };
  }
}