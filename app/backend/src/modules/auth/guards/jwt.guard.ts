import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AccessTokenService } from '../access-token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accessTokenService: AccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (!this.accessTokenService.hasBearerToken(request)) {
      throw new UnauthorizedException('Token requerido.');
    }

    // Firma válida y sesión (dispositivo) todavía abierta.
    const payload = await this.accessTokenService.verifyActiveSession(request);
    if (!payload) {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    (request as any).user = payload;
    return true;
  }
}
