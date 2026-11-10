import AsyncStorage from '@react-native-async-storage/async-storage';

import { appStorage } from '../storage';
import { cancelAllUserReminders } from './notifications.service';
import { OWN_DATA_STORAGE_KEYS, resetOwnData } from '../../features/tabs/data/own-data-store';
import { clearScreenCaches, SCREEN_CACHE_KEYS } from './screen-cache';

/**
 * Datos guardados en el teléfono que pertenecen al usuario con sesión
 * iniciada. Las preferencias del dispositivo (avisos de batería, minutos de
 * antelación) se conservan.
 */
const USER_DATA_KEYS = [
  'medicai_medications_cache_v2',
  'medicai_appointments_cache_v1',
  // Perfil, Círculo y seguimiento de las personas que cuido.
  ...Object.values(SCREEN_CACHE_KEYS),
  'medicai_pending_circle_invite_v1',
  // Tomas pendientes de enviar: son del usuario que cierra sesión.
  'medicai_pending_dose_actions_v1',
  // Zona horaria informada: el siguiente usuario debe informarla de nuevo.
  'medicai_reported_timezone_v1',
  // El dispositivo se vuelve a registrar para notificaciones con la nueva cuenta.
  'medicai_registered_push_token_v1',
  // Conversación con el asistente: es privada del usuario.
  'medicai_assistant_chat_v1',
  // Medicamentos, tomas y citas guardados para usar sin conexión, y cambios pendientes.
  ...OWN_DATA_STORAGE_KEYS,
];
const LEGACY_AVATAR_KEY = 'user_avatar_data';

/**
 * Al cerrar sesión (o si el servidor la invalida): nada del usuario anterior
 * debe quedar visible ni sonar en este teléfono.
 */
export async function clearUserData(): Promise<void> {
  resetOwnData();
  clearScreenCaches();
  await cancelAllUserReminders().catch(() => undefined);
  await Promise.all(USER_DATA_KEYS.map((key) => appStorage.removeItem(key).catch(() => undefined)));
  await AsyncStorage.removeItem(LEGACY_AVATAR_KEY).catch(() => undefined);
}
