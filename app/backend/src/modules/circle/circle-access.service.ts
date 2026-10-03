import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  PERMISSION_DENIED_MESSAGES,
  pickPermissions,
  type CirclePermissions,
  type PermissionKey,
} from './circle.constants';

/**
 * Punto único de decisión: ¿puede `actorId` hacer X con la información de
 * `ownerId`? Cada uno siempre puede todo sobre lo suyo. Sobre lo de otra
 * persona, solo lo que esa persona le haya concedido en un vínculo ACTIVO
 * (al revocar, los permisos se borran y el acceso desaparece al instante).
 */
@Injectable()
export class CircleAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Permisos de actor sobre owner, o null si no hay vínculo activo. */
  async getPermissions(actorId: string, ownerId: string): Promise<CirclePermissions | null> {
    const grant = await this.prisma.circleGrant.findFirst({
      where: { ownerId, granteeId: actorId, link: { status: 'ACTIVE' } },
    });
    return grant ? pickPermissions(grant) : null;
  }

  /**
   * Devuelve el usuario sobre el que se actúa (el propio actor si no se indica
   * otro) tras comprobar que el actor tiene TODOS los permisos pedidos.
   */
  async resolveOwner(
    actorId: string | undefined,
    ownerId: string | undefined,
    required: PermissionKey | PermissionKey[],
  ): Promise<string> {
    if (!actorId) throw new UnauthorizedException('Usuario no autenticado.');
    if (!ownerId || ownerId === actorId) return actorId;

    const permissions = await this.getPermissions(actorId, ownerId);
    const keys = Array.isArray(required) ? required : [required];
    const missing = keys.find((key) => !permissions?.[key]);
    if (missing) throw new ForbiddenException(PERMISSION_DENIED_MESSAGES[missing]);
    return ownerId;
  }
}
