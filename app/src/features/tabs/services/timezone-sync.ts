import { appStorage } from '../../../shared/storage';
import { deviceTimeZone } from '../../../shared/services/dose-schedule';
import { getStoredSession } from '../../auth';
import { ensureApiBaseUrl, requestWithAutoRefresh } from './http';

export const REPORTED_TIMEZONE_KEY = 'medicai_reported_timezone_v1';

/**
 * Informa al servidor la zona horaria del teléfono si cambió (p. ej. al
 * viajar). Así quien te cuida desde otra zona ve tus tomas a tu hora, y tus
 * perfiles a cargo la siguen.
 */
export async function reportTimeZoneIfChanged(): Promise<void> {
  const timezone = deviceTimeZone();
  if ((await appStorage.getItem(REPORTED_TIMEZONE_KEY)) === timezone) return;
  const session = await getStoredSession();
  if (!session?.accessToken) return;
  try {
    ensureApiBaseUrl();
    const response = await requestWithAutoRefresh('/auth/timezone', 'PUT', session.accessToken, { timezone });
    if (response.ok) await appStorage.setItem(REPORTED_TIMEZONE_KEY, timezone);
  } catch {
    // Sin red: se reintenta la próxima vez que se abra la app.
  }
}
