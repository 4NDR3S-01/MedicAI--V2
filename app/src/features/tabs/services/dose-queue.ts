import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { appStorage } from '../../../shared/storage';
import { emitDoseAction } from '../../../shared/services/dose-refresh-bus';
import { isNetworkError } from '../../../shared/services/network-error';
import { getStoredSession, SessionExpiredError } from '../../auth';
import { logMedicationAction, type MedicationLog } from './medications.service';

/**
 * Cola de tomas registradas sin conexión.
 *
 * Si alguien marca "La tomé" sin internet (en el metro, en el campo…), la toma
 * no se pierde: se guarda en el teléfono, se muestra como registrada y se
 * envía sola en cuanto vuelve la red o se abre la app. Solo se reintentan los
 * fallos de conexión; si el servidor la rechaza (p. ej. el medicamento se
 * borró o ya no hay permiso), se descarta.
 */

type DoseAction = 'TAKEN' | 'SKIPPED' | 'SNOOZED';

type QueuedDose = {
  id: string;
  medicationId: string;
  /** Medicamento de otra persona del Círculo. */
  ownerId?: string;
  action: DoseAction;
  scheduledFor?: string;
  queuedAt: string;
};

export const DOSE_QUEUE_STORAGE_KEY = 'medicai_pending_dose_actions_v1';
const MAX_QUEUE = 200;

let flushing: Promise<number> | null = null;

async function readQueue(): Promise<QueuedDose[]> {
  try {
    const raw = await appStorage.getItem(DOSE_QUEUE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedDose[]) : [];
  } catch {
    return [];
  }
}

const writeQueue = (queue: QueuedDose[]) => appStorage.setItem(DOSE_QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));

const toLog = (item: QueuedDose): MedicationLog => ({
  id: `pending:${item.id}`,
  medicationId: item.medicationId,
  action: item.action,
  takenAt: item.queuedAt,
  scheduledFor: item.scheduledFor ?? null,
  loggedBy: null,
  pending: true,
});

/**
 * Registra una toma. Con conexión, como siempre; sin conexión, la deja en
 * cola y devuelve un registro provisional (pending) para mostrarla ya.
 */
export async function logDose(
  medicationId: string,
  action: DoseAction,
  scheduledFor?: string,
  ownerId?: string,
): Promise<MedicationLog> {
  const session = await getStoredSession();
  if (!session?.accessToken) throw new SessionExpiredError();
  try {
    return await logMedicationAction(medicationId, session.accessToken, action, scheduledFor, ownerId);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const item: QueuedDose = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      medicationId,
      ownerId,
      action,
      scheduledFor,
      queuedAt: new Date().toISOString(),
    };
    const queue = await readQueue();
    // La misma toma marcada dos veces sin red: cuenta la última respuesta.
    const next = queue.filter((queued) => !(queued.medicationId === medicationId && queued.scheduledFor && queued.scheduledFor === scheduledFor));
    await writeQueue([...next, item]);
    return toLog(item);
  }
}

/** Registros provisionales de un dueño (undefined = los míos), para mostrarlos. */
export async function pendingDoseLogs(ownerId?: string): Promise<MedicationLog[]> {
  return (await readQueue()).filter((item) => item.ownerId === ownerId).map(toLog);
}

/** Deshacer una toma que aún no se envió: basta con sacarla de la cola. */
export async function removeQueuedDose(logId: string): Promise<boolean> {
  if (!logId.startsWith('pending:')) return false;
  const id = logId.slice('pending:'.length);
  const queue = await readQueue();
  await writeQueue(queue.filter((item) => item.id !== id));
  return true;
}

/** Envía lo pendiente. Devuelve cuántas tomas se enviaron. */
export function flushDoseQueue(): Promise<number> {
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function runFlush(): Promise<number> {
  const queue = await readQueue();
  if (!queue.length) return 0;
  const session = await getStoredSession();
  if (!session?.accessToken) return 0;

  const remaining: QueuedDose[] = [];
  let sent = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    try {
      await logMedicationAction(item.medicationId, session.accessToken, item.action, item.scheduledFor, item.ownerId);
      sent += 1;
    } catch (error) {
      if (isNetworkError(error)) {
        // Sigue sin red: se conserva esta y las siguientes para más tarde.
        remaining.push(...queue.slice(index));
        break;
      }
      if (error instanceof SessionExpiredError) {
        remaining.push(...queue.slice(index));
        break;
      }
      // Rechazada por el servidor (medicamento borrado, sin permiso…): se descarta.
    }
  }
  // Pudieron añadirse tomas mientras se enviaba: se conservan.
  const added = (await readQueue()).filter((item) => !queue.some((queued) => queued.id === item.id));
  await writeQueue([...remaining, ...added]);
  if (sent) emitDoseAction();
  return sent;
}

/** Reintenta al recuperar la red y al volver a la app. Devuelve cómo dejar de escuchar. */
export function startDoseQueueSync(): () => void {
  void flushDoseQueue();
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void flushDoseQueue();
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void flushDoseQueue();
  });
  return () => {
    unsubscribeNet();
    appState.remove();
  };
}
