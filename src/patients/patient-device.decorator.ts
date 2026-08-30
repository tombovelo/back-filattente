import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedPatient } from './patient.strategy';

export const PatientDeviceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    return (request.user as AuthenticatedPatient).deviceId;
  },
);

export type { AuthenticatedPatient };