import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface PatientJwtPayload {
  sub: number;
  type: string;
}

export interface AuthenticatedPatient {
  deviceId: number;
}

@Injectable()
export class PatientStrategy extends PassportStrategy(Strategy, 'patient') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: PatientJwtPayload): Promise<AuthenticatedPatient> {
    if (payload.type !== 'patient' || payload.sub == null) {
      throw new UnauthorizedException('Token patient invalide');
    }
    return { deviceId: payload.sub };
  }
}