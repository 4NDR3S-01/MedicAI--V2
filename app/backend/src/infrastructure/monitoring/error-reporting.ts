import * as Sentry from '@sentry/node';

/**
 * Reporte de errores a Sentry. Solo se activa con SENTRY_DSN; sin él no hace
 * nada. MedicAI maneja datos de salud: nunca se envían cuerpos de peticiones,
 * cabeceras, cookies, consultas ni datos del usuario, solo el error, su pila
 * y unas pocas etiquetas técnicas (ruta, método, código, requestId).
 */

let enabled = false;

/** Datos de los registros que sí se pueden adjuntar (nada personal). */
const SAFE_KEYS = ['requestId', 'method', 'path', 'statusCode'] as const;

export function initErrorReporting(): boolean {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || enabled) return enabled;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    // Solo errores: sin trazas de rendimiento (servidor con pocos recursos).
    tracesSampleRate: 0,
    skipOpenTelemetrySetup: true,
    // Los registros de consola pueden llevar correos u otros datos.
    integrations: (defaults) => defaults.filter((integration) => integration.name !== 'Console'),
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.query_string;
      }
      delete event.user;
      return event;
    },
  });
  enabled = true;
  return true;
}

export function reportError(
  error: unknown,
  info: { message?: string; context?: string; metadata?: Record<string, unknown> } = {},
): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (info.context) scope.setTag('context', info.context);
    for (const key of SAFE_KEYS) {
      const value = info.metadata?.[key];
      if (typeof value === 'string' || typeof value === 'number') scope.setTag(key, String(value));
    }
    if (error instanceof Error) {
      if (info.message) scope.setExtra('log', info.message);
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage(info.message ?? 'Error sin detalle', 'error');
    }
  });
}

/** Espera a que salgan los errores pendientes (antes de cerrar el proceso). */
export async function flushErrorReporting(timeoutMs = 2000): Promise<void> {
  if (enabled) await Sentry.flush(timeoutMs).catch(() => false);
}
