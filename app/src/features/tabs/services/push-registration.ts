import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { appStorage } from '../../../shared/storage';
import { getStoredSession } from '../../auth';
import { ensureApiBaseUrl, requestWithAutoRefresh } from './http';

export const REGISTERED_PUSH_TOKEN_KEY = 'medicai_registered_push_token_v1';

const projectId = (): string | undefined =>
  Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;

/**
 * Registra este dispositivo para recibir notificaciones push del servidor
 * (avisos del Círculo, tomas sin registrar, sincronización al instante).
 * No pide permisos: usa los que la app ya solicita para las alarmas.
 */
export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice || Platform.OS === 'web') return; // emuladores sin Google Play / web
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  const id = projectId();
  if (!id) return;

  const session = await getStoredSession();
  if (!session?.accessToken) return;

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  } catch {
    return; // sin red o sin servicios de Google: se reintenta la próxima vez
  }
  // Se re-registra si cambió el token o la cuenta/sesión.
  const marker = `${token}|${session.user.id}|${session.refreshToken.slice(-16)}`;
  if ((await appStorage.getItem(REGISTERED_PUSH_TOKEN_KEY)) === marker) return;

  try {
    ensureApiBaseUrl();
    const response = await requestWithAutoRefresh('/push/tokens', 'POST', session.accessToken, {
      token,
      platform: Platform.OS,
    });
    if (response.ok) await appStorage.setItem(REGISTERED_PUSH_TOKEN_KEY, marker);
  } catch {
    // Sin red: se reintenta al volver a la app.
  }
}
