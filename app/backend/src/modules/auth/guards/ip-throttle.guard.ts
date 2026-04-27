import { Injectable, BadRequestException } from '@nestjs/common';
import { CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * Rate limiting guard específico para endpoint de registro.
 * Limita a 5 intentos de registro por IP cada hora.
 * Esto previene ataques de spam masivo sin bloquear usuarios legítimos.
 */
@Injectable()
export class IpThrottleGuard implements CanActivate {
  private requestCounts = new Map<string, { count: number; resetTime: number }>();
  private readonly MAX_REQUESTS = 5;
  private readonly WINDOW_MS = 60 * 60 * 1000; // 1 hora

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    // Obtener registro de la IP
    let record = this.requestCounts.get(ip);

    // Si la ventana expiró, reiniciar el contador
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + this.WINDOW_MS };
      this.requestCounts.set(ip, record);
    }

    // Incrementar contador
    record.count++;

    // Si se excedió el límite, lanzar error
    if (record.count > this.MAX_REQUESTS) {
      const remainingSeconds = Math.ceil((record.resetTime - now) / 1000);
      throw new BadRequestException(
        `Demasiados intentos de registro. Intenta de nuevo en ${remainingSeconds} segundos.`,
      );
    }

    // Limpiar registros antiguos cada cierto tiempo para evitar memory leak
    if (this.requestCounts.size > 1000) {
      for (const [key, value] of this.requestCounts.entries()) {
        if (now > value.resetTime) {
          this.requestCounts.delete(key);
        }
      }
    }

    return true;
  }
}
