import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  /** Sesión (dispositivo) que emitió el token. */
  sid?: string;
};

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

  constructor(
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
      });
    } catch {
      payload = null;
    }

    this.verifiedByRequest.set(request, { token, payload });
    return payload;
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
