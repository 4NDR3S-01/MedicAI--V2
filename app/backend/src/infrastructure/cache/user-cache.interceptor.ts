import { ExecutionContext, Injectable } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';

/**
 * Interceptor de caché que aísla las entradas por usuario.
 *
 * El CacheInterceptor por defecto de NestJS usa la URL como clave. Eso hace
 * que dos usuarios distintos compartan la misma entrada de caché en endpoints
 * como /appointments o /medications, lo que es un fallo de seguridad/privacidad.
 * Este interceptor añade el userId del JWT a la clave de seguimiento.
 */
@Injectable()
export class UserCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    const baseKey = super.trackBy(context);
    if (!baseKey) {
      return undefined;
    }

    const request = context.switchToHttp().getRequest<{ user?: { sub?: string } }>();
    const userId = request.user?.sub;

    if (!userId) {
      return undefined;
    }

    return `${userId}:${baseKey}`;
  }
}
