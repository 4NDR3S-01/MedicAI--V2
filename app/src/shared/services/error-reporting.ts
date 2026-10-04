import * as Sentry from '@sentry/react-native';

/**
 * Reporte de fallos de la app a Sentry. Solo se activa con
 * EXPO_PUBLIC_SENTRY_DSN; sin él no hace nada.
 *
 * MedicAI maneja datos de salud: no se envían datos del usuario, capturas de
 * pantalla, jerarquía de vistas, toques (sus etiquetas pueden decir el nombre
 * de un medicamento), mensajes de consola ni cuerpos o parámetros de las
 * peticiones. Solo el error, su pila y el dispositivo.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
let enabled = false;

const stripQuery = (url: unknown) => (typeof url === 'string' ? url.split('?')[0] : url);

export function initErrorReporting(): void {
  if (!DSN || enabled) return;
  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableUserInteractionTracing: false,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' || breadcrumb.category === 'touch' || breadcrumb.category?.startsWith('ui.')) return null;
      if (breadcrumb.data?.url) breadcrumb.data = { ...breadcrumb.data, url: stripQuery(breadcrumb.data.url) };
      return breadcrumb;
    },
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.query_string;
        event.request.url = stripQuery(event.request.url) as string | undefined;
      }
      return event;
    },
  });
  enabled = true;
}

/** Un error atrapado que igual conviene conocer (p. ej. al programar alarmas). */
export function reportError(error: unknown, context?: string): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) scope.setTag('context', context);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}
