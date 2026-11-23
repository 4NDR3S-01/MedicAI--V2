import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  /** Sesión (dispositivo) que emitió el token. */
  sid?: string;
};

/**
 * Cuánto se confía en que una sesión sigue abierta sin volver a consultarla.
 * Al cerrar una sesión, restablecer la contraseña o borrar la cuenta, su
 * access token deja de servir en como mucho este tiempo (antes: hasta que
 * vencía, 15 min), con ~1 consulta por dispositivo cada 30 s.
 */
export const SESSION_CHECK_TTL_MS = 30_000;
const MAX_CACHED_SESSIONS = 5_000;

type VerificationResult = {
  token: string;
  payload: AccessTokenPayload | null;
};

/**
 * Verifica el access token una sola vez por request.
 *
 * Tanto el rate limiter global (para identificar al usuario) como JwtAuthGuard
 * necesitan el payload; verificar la firma dos veces costaba ~15 % de
 * throughput. El resultado se memoriza por objeto request en un WeakMap, así
 * que no se muta el request ni puede inyectarse desde fuera.
 */
@Injectable()
export class AccessTokenService {
  private readonly verifiedByRequest = new WeakMap<object, VerificationResult>();
  /** sid → hasta cuándo se da por abierta sin consultar la base de datos. */
  private readonly openSessions = new Map<string, { userId: string; until: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  verifyRequest(request: { headers?: Record<string, unknown> }): AccessTokenPayload | null {
    const token = this.extractBearerToken(request.headers?.authorization);
    if (!token) {
      return null;
    }

    const cached = this.verifiedByRequest.get(request);
    if (cached && cached.token === token) {
      return cached.payload;
    }

    let payload: AccessTokenPayload | null;
    try {
      payload = this.jwtService.verify<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      payload = null;
    }

    this.verifiedByRequest.set(request, { token, payload });
    return payload;
  }

  /**
   * Como verifyRequest, pero además exige que la sesión (dispositivo) del token
   * siga abierta. Lo usa JwtAuthGuard; el rate limiter solo necesita la firma.
   */
  async verifyActiveSession(request: { headers?: Record<string, unknown> }): Promise<AccessTokenPayload | null> {
    const payload = this.verifyRequest(request);
    if (!payload?.sid) return null;
    return (await this.isSessionOpen(payload.sid, payload.sub)) ? payload : null;
  }

  private async isSessionOpen(sessionId: string, userId: string) {
    const now = Date.now();
    const cached = this.openSessions.get(sessionId);
    if (cached && cached.until > now) return cached.userId === userId;

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, expiresAt: true },
    });
    if (!session || session.userId !== userId || session.expiresAt.getTime() <= now) {
      this.openSessions.delete(sessionId);
      return false;
    }
    if (this.openSessions.size >= MAX_CACHED_SESSIONS) this.openSessions.clear();
    this.openSessions.set(sessionId, { userId, until: now + SESSION_CHECK_TTL_MS });
    return true;
  }

  hasBearerToken(request: { headers?: Record<string, unknown> }) {
    return Boolean(this.extractBearerToken(request.headers?.authorization));
  }

  private extractBearerToken(authorization: unknown): string | undefined {
    if (typeof authorization !== 'string') {
      return undefined;
    }
    const [type, token] = authorization.split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }
}
