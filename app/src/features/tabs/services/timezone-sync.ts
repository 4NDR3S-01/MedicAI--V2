import { appStorage } from '../../../shared/storage';
import { deviceTimeZone } from '../../../shared/services/dose-schedule';
import { getStoredSession } from '../../auth';
import { ensureApiBaseUrl, requestWithAutoRefresh } from './http';

/** Clave antigua (ya no se usa): se borra al cerrar sesión. */
export const REPORTED_TIMEZONE_KEY = 'medicai_reported_timezone_v1';

/** Usuario y zona informados en esta ejecución de la app. */
let reported: string | null = null;

/**
 * Informa al servidor la zona horaria del teléfono: una vez cada vez que se
 * abre la app y otra si cambia (p. ej. al viajar). Así quien te cuida desde
 * otra zona ve tus tomas a tu hora, y tus perfiles a cargo la siguen.
 *
 * No basta con recordar lo último enviado desde este teléfono: si la cuenta
 * se abrió en otro dispositivo con otra zona, el servidor quedó con esa y
 * tus perfiles a cargo aparecerían "en otra zona horaria".
 */
export async function reportTimeZoneIfChanged(): Promise<void> {
  const timezone = deviceTimeZone();
  const session = await getStoredSession();
  if (!session?.accessToken || !session.user?.id) return;
  const key = `${session.user.id}|${timezone}`;
  if (reported === key) return;
  try {
    ensureApiBaseUrl();
    const response = await requestWithAutoRefresh('/auth/timezone', 'PUT', session.accessToken, { timezone });
    if (response.ok) {
      reported = key;
      void appStorage.removeItem(REPORTED_TIMEZONE_KEY).catch(() => undefined);
    }
  } catch {
    // Sin red: se reintenta al volver a la app.
  }
}
