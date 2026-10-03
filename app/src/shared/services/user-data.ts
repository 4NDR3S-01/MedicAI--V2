import AsyncStorage from '@react-native-async-storage/async-storage';

import { appStorage } from '../storage';
import { cancelAllUserReminders } from './notifications.service';

/**
 * Datos guardados en el teléfono que pertenecen al usuario con sesión
 * iniciada. Las preferencias del dispositivo (avisos de batería, minutos de
 * antelación) se conservan.
 */
const USER_DATA_KEYS = [
  'medicai_medications_cache_v2',
  'medicai_appointments_cache_v1',
  'medicai_circle_cache_v2',
  'medicai_pending_circle_invite_v1',
];
const LEGACY_AVATAR_KEY = 'user_avatar_data';

/**
 * Al cerrar sesión (o si el servidor la invalida): nada del usuario anterior
 * debe quedar visible ni sonar en este teléfono.
 */
export async function clearUserData(): Promise<void> {
  await cancelAllUserReminders().catch(() => undefined);
  await Promise.all(USER_DATA_KEYS.map((key) => appStorage.removeItem(key).catch(() => undefined)));
  await AsyncStorage.removeItem(LEGACY_AVATAR_KEY).catch(() => undefined);
}
