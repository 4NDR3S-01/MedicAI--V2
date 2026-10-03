import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { emitDoseAction } from '../shared/services/dose-refresh-bus';
import { syncOwnReminders } from '../features/tabs/services/reminders-sync';

/**
 * Avisos silenciosos del servidor ("alguien cambió tus medicamentos o los de
 * una persona que cuidas"): se reprograman las alarmas de este teléfono al
 * instante, aunque la app esté cerrada.
 *
 * Debe definirse al cargar el JavaScript (index.ts): Android puede despertar
 * la app solo para ejecutar esta tarea, sin abrir ninguna pantalla.
 */
export const PUSH_SYNC_TASK = 'medicai-push-sync';

const typeOf = (payload: unknown): string | undefined => {
  const value = payload as {
    data?: { dataString?: string; type?: string; body?: string };
    notification?: { request?: { content?: { data?: { type?: string } } } };
  } | undefined;
  const parse = (raw?: string) => {
    try {
      return raw ? (JSON.parse(raw) as { type?: string }).type : undefined;
    } catch {
      return undefined;
    }
  };
  return (
    value?.data?.type
    ?? parse(value?.data?.dataString)
    ?? parse(value?.data?.body)
    ?? value?.notification?.request?.content?.data?.type
  );
};

TaskManager.defineTask(PUSH_SYNC_TASK, async ({ data, error }) => {
  if (error || typeOf(data) !== 'SYNC') return;
  try {
    await syncOwnReminders({ force: true });
    // Si la app está abierta, las pantallas recargan sus datos.
    emitDoseAction();
  } catch {
    // Se volverá a sincronizar al abrir la app.
  }
});

/** Se registra una vez por arranque (idempotente). */
export function registerPushTasks(): void {
  void Notifications.registerTaskAsync(PUSH_SYNC_TASK).catch(() => undefined);
}
