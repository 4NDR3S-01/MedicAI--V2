import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AccessTokenService } from '../../modules/auth/access-token.service';

/**
 * Rate limiting por usuario autenticado en lugar de por IP.
 *
 * El backend escucha detrás de un reverse proxy, así que sin TRUST_PROXY todas
 * las peticiones llegan con la IP del proxy y el límite se volvía global para
 * toda la app. Además, en redes móviles (CGNAT) muchos usuarios comparten IP.
 *
 * Si el request trae un access token válido se limita por `sub`; si no (login,
 * registro, etc.), se cae al comportamiento por IP. Se exige firma válida para
 * que nadie pueda agotar el cupo de otro usuario falsificando un `sub`.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  @Inject(AccessTokenService)
  private readonly accessTokenService!: AccessTokenService;

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = this.accessTokenService.verifyRequest(req)?.sub;
    return userId ? `user:${userId}` : super.getTracker(req);
  }
}
