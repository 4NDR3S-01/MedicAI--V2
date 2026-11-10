/**
 * Datos propios (medicamentos, tomas de hoy y citas) compartidos por toda la
 * app y disponibles sin conexión.
 *
 * - Una sola copia en memoria para Inicio, Medicinas y Citas: cambiar de
 *   pestaña no recarga ni hace "saltar" nada.
 * - Cada cambio se guarda en el teléfono al instante: al abrir la app sin red
 *   se ve el último estado real (nunca un medicamento ya desactivado).
 * - Los cambios van a una cola persistente y se envían en orden cuando hay
 *   red; lo que se muestra es replay(servidor, cola), así un cambio pendiente
 *   no se pierde cuando llegan datos del servidor que aún no lo conocen.
 * - Si el servidor rechaza un cambio (p. ej. alguien del Círculo lo borró),
 *   se quita de la cola, la vista vuelve a lo real y se avisa.
 */
import { useEffect, useSyncExternalStore } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AccessibilityInfo, AppState, LayoutAnimation } from 'react-native';

import { appStorage } from '../../../shared/storage';
import { isNetworkError } from '../../../shared/services/network-error';
import { onDoseAction } from '../../../shared/services/dose-refresh-bus';
import { rescheduleAppointmentsAfterLaunch, syncMedicationAlarms } from '../../../shared/services/notifications.service';
import { getStoredSession } from '../../auth';
import type { AppointmentData, CreateAppointmentPayload, SeriesScope, UpdateAppointmentPayload } from '../services/appointments.service';
import { createAppointment as apiCreateAppointment } from '../services/appointments.service';
import { pendingDoseLogs, pendingUndoLogIds, remapQueuedDoseMedication } from '../services/dose-queue';
import { abortStalledRequests, preferShortTimeouts, parseApiErrorMessage, readResponseBody, requestWithAutoRefresh, ensureApiBaseUrl } from '../services/http';
import {
  fetchMedications,
  fetchTodayMedicationLogs,
  type CreateMedicationPayload,
  type MedicationData,
  type MedicationLog,
} from '../services/medications.service';
import { fetchAppointments } from '../services/appointments.service';
import { getHandledDoseKeys, getTodayDoseSlots, withStockChange } from '../utils/dose-status';
import {
  enqueueOp,
  newOpId,
  newTempId,
  remapTempId,
  replay,
  targetId,
  type MedicationPatch,
  type OfflineOp,
  type OwnData,
} from './offline-ops';

// ─── Estado ──────────────────────────────────────────────────────────────────

type Base = OwnData & { logs: MedicationLog[]; logsDay: string };

export type OwnDataSnapshot = {
  medications: MedicationData[];
  appointments: AppointmentData[];
  logs: MedicationLog[];
  /** Ya se leyó lo guardado en el teléfono. */
  hydrated: boolean;
  /** Hay datos que mostrar (del teléfono o del servidor). */
  hasData: boolean;
  /** La última petición falló por falta de conexión. */
  offline: boolean;
  /** Cambios guardados en el teléfono que aún no llegaron al servidor. */
  pendingCount: number;
  /** Error al cargar sin datos que mostrar (primera vez sin red). */
  loadError: string | null;
  alarmStatus: 'ok' | 'no-permission' | 'error';
};

const BASE_KEY = 'medicai_own_data_v1';
const OUTBOX_KEY = 'medicai_outbox_v1';
const LEGACY_MEDS_KEY = 'medicai_medications_cache_v2';
const LEGACY_APPTS_KEY = 'medicai_appointments_cache_v1';
/** Volver a una pestaña no vuelve a pedir datos si se pidieron hace poco. */
const REFRESH_MIN_INTERVAL_MS = 20_000;
/** Lo máximo que una acción espera al servidor antes de seguir (queda guardada igual). */
const MUTATION_WAIT_MS = 6_000;

export const OWN_DATA_STORAGE_KEYS = [BASE_KEY, OUTBOX_KEY];

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const emptyBase = (): Base => ({ medications: [], appointments: [], logs: [], logsDay: dayKey(new Date()) });

let base: Base = emptyBase();
let outbox: OfflineOp[] = [];
let hydrated = false;
let hasData = false;
let offline = false;
let loadError: string | null = null;
let alarmStatus: OwnDataSnapshot['alarmStatus'] = 'ok';
let lastRefreshAt = 0;
/** Sube con cada cambio confirmado: una descarga iniciada antes no lo pisa. */
let baseVersion = 0;

/** Id provisional → id real, para devolver lo creado una vez confirmado. */
const confirmedIds = new Map<string, string>();

/** Cambios cuyo resultado espera ahora mismo quien los hizo (él muestra el error). */
const awaitedOps = new Set<string>();

const listeners = new Set<() => void>();
const errorListeners = new Set<(message: string) => void>();

function buildSnapshot(): OwnDataSnapshot {
  const view = replay(base, outbox);
  const today = dayKey(new Date());
  return {
    medications: view.medications,
    appointments: view.appointments,
    logs: base.logsDay === today ? base.logs : [],
    hydrated,
    hasData,
    offline,
    pendingCount: outbox.length,
    loadError,
    alarmStatus,
  };
}

let snapshot: OwnDataSnapshot = buildSnapshot();

function emit() {
  snapshot = buildSnapshot();
  listeners.forEach((listener) => listener());
  scheduleReminderSync();
}

export const getOwnData = () => snapshot;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Avisos de cambios que el servidor rechazó al enviarlos más tarde. */
export function onOwnDataError(listener: (message: string) => void): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

// ─── Persistencia ────────────────────────────────────────────────────────────

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistBase() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void appStorage.setItem(BASE_KEY, JSON.stringify(base)).catch(() => undefined);
  }, 250);
}

/** La cola se guarda antes de enviar: un cambio no se pierde aunque se cierre la app. */
const persistOutbox = () => appStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox)).catch(() => undefined);

let hydrating: Promise<void> | null = null;

export function hydrateOwnData(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = (async () => {
      try {
        const [rawBase, rawOutbox] = await Promise.all([appStorage.getItem(BASE_KEY), appStorage.getItem(OUTBOX_KEY)]);
        if (rawBase) {
          base = { ...emptyBase(), ...(JSON.parse(rawBase) as Base) };
          hasData = true;
        } else {
          // Primera vez con esta versión: se aprovechan las cachés anteriores.
          const [legacyMeds, legacyAppts] = await Promise.all([appStorage.getItem(LEGACY_MEDS_KEY), appStorage.getItem(LEGACY_APPTS_KEY)]);
          const meds = legacyMeds ? (JSON.parse(legacyMeds) as { day?: string; medications?: MedicationData[]; logs?: MedicationLog[] }) : null;
          const appts = legacyAppts ? (JSON.parse(legacyAppts) as AppointmentData[]) : null;
          if (meds?.medications || Array.isArray(appts)) {
            base = {
              medications: meds?.medications ?? [],
              appointments: Array.isArray(appts) ? appts : [],
              logs: meds?.logs ?? [],
              logsDay: meds?.day ?? dayKey(new Date()),
            };
            hasData = true;
          }
        }
        outbox = rawOutbox ? (JSON.parse(rawOutbox) as OfflineOp[]) : [];
      } catch {
        // Datos guardados dañados: se empieza de cero y el servidor los repone.
      }
      hydrated = true;
      emit();
    })();
  }
  return hydrating;
}

/** Al cerrar sesión: nada del usuario anterior queda en memoria. */
export function resetOwnData() {
  base = emptyBase();
  outbox = [];
  hasData = false;
  offline = false;
  loadError = null;
  lastRefreshAt = 0;
  baseVersion += 1;
  emit();
}

// ─── Envío de la cola ────────────────────────────────────────────────────────

type SendOutcome = { kind: 'done'; result?: unknown } | { kind: 'retry'; network: boolean } | { kind: 'rejected'; message: string };

async function send(op: OfflineOp, token: string): Promise<SendOutcome> {
  ensureApiBaseUrl();
  let path: string;
  let method: 'POST' | 'PUT' | 'DELETE';
  let body: unknown;
  switch (op.kind) {
    case 'medCreate':
      [path, method, body] = ['/medications', 'POST', op.payload];
      break;
    case 'medUpdate':
      [path, method, body] = [`/medications/${op.medicationId}`, 'PUT', op.patch];
      break;
    case 'medDelete':
      [path, method] = [`/medications/${op.medicationId}`, 'DELETE'];
      break;
    case 'apptCreate':
      [path, method, body] = ['/appointments', 'POST', op.payload];
      break;
    case 'apptUpdate':
      [path, method, body] = [`/appointments/${op.appointmentId}${op.scope ? `?scope=${op.scope}` : ''}`, 'PUT', op.patch];
      break;
    default:
      [path, method] = [`/appointments/${op.appointmentId}${op.scope ? `?scope=${op.scope}` : ''}`, 'DELETE'];
  }

  let response: Response;
  try {
    response = await requestWithAutoRefresh(path, method, token, body);
  } catch (error) {
    // Sin red, o sin sesión válida por ahora: se reintenta más tarde.
    return { kind: 'retry', network: isNetworkError(error) };
  }
  if (response.ok) {
    return { kind: 'done', result: method === 'DELETE' ? undefined : await readResponseBody<unknown>(response).catch(() => undefined) };
  }
  // Borrar algo que ya no existe es lo que se quería.
  if (method === 'DELETE' && response.status === 404) return { kind: 'done' };
  if (response.status >= 500 || response.status === 408 || response.status === 429) return { kind: 'retry', network: false };
  const fallback = op.kind.startsWith('med') ? 'No se pudo guardar un cambio del medicamento' : 'No se pudo guardar un cambio de la cita';
  return { kind: 'rejected', message: await parseApiErrorMessage(response, fallback) };
}

/** El servidor confirmó un cambio: pasa de la cola a los datos reales. */
function commit(op: OfflineOp, result: unknown) {
  baseVersion += 1;
  switch (op.kind) {
    case 'medCreate': {
      const created = result as MedicationData;
      base = { ...base, medications: [created, ...base.medications.filter((item) => item.id !== created.id)] };
      outbox = remapTempId(outbox, op.tempId, created.id);
      confirmedIds.set(op.tempId, created.id);
      // Tomas registradas sin red para este medicamento: ya tienen a dónde ir.
      void remapQueuedDoseMedication(op.tempId, created.id);
      base = { ...base, logs: base.logs.map((log) => (log.medicationId === op.tempId ? { ...log, medicationId: created.id } : log)) };
      break;
    }
    case 'medUpdate': {
      const updated = result as MedicationData | undefined;
      if (updated?.id) base = { ...base, medications: base.medications.map((item) => (item.id === updated.id ? updated : item)) };
      break;
    }
    case 'medDelete':
      base = { ...base, medications: base.medications.filter((item) => item.id !== op.medicationId) };
      break;
    case 'apptCreate': {
      const created = result as AppointmentData;
      base = { ...base, appointments: [...base.appointments.filter((item) => item.id !== created.id), created] };
      outbox = remapTempId(outbox, op.tempId, created.id);
      confirmedIds.set(op.tempId, created.id);
      break;
    }
    case 'apptUpdate': {
      const updated = result as AppointmentData | undefined;
      if (updated?.id) base = { ...base, appointments: base.appointments.map((item) => (item.id === updated.id ? updated : item)) };
      break;
    }
    case 'apptDelete': {
      // Mismo efecto que en la vista (incluye "esta y las siguientes").
      base = { ...base, appointments: replay({ medications: [], appointments: base.appointments }, [op]).appointments };
      break;
    }
  }
}

type OpResult = { kind: 'done' } | { kind: 'pending' } | { kind: 'rejected'; message: string };
let flushing: Promise<Map<string, OpResult>> | null = null;

/** Envía la cola en orden. Para en el primer fallo de red (lo demás espera). */
export function flushOutbox(): Promise<Map<string, OpResult>> {
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function runFlush(): Promise<Map<string, OpResult>> {
  await hydrateOwnData();
  const results = new Map<string, OpResult>();
  if (!outbox.length) return results;
  const session = await getStoredSession();
  if (!session?.accessToken) return results;

  let needsReload = false;
  while (outbox.length) {
    const op = outbox[0];
    const outcome = await send(op, session.accessToken);
    if (outcome.kind === 'retry') {
      if (outcome.network) offline = true;
      break;
    }
    offline = false;
    // Mientras se enviaba pudo borrarse (algo creado sin red se borra quitándolo de la cola).
    const stillQueued = outbox.some((queued) => queued.id === op.id);
    outbox = outbox.filter((queued) => queued.id !== op.id);
    if (outcome.kind === 'done') {
      commit(op, outcome.result);
      if (!stillQueued && (op.kind === 'medCreate' || op.kind === 'apptCreate')) {
        // Ya existía en el servidor cuando se borró aquí: se borra también allí.
        const realId = confirmedIds.get(op.tempId);
        if (realId) {
          outbox = [
            ...outbox,
            op.kind === 'medCreate'
              ? { id: newOpId(), at: new Date().toISOString(), kind: 'medDelete', medicationId: realId }
              : { id: newOpId(), at: new Date().toISOString(), kind: 'apptDelete', appointmentId: realId },
          ];
        }
      }
      results.set(op.id, { kind: 'done' });
      // Cambios de una serie entera: el servidor recalcula las demás citas.
      if ((op.kind === 'apptUpdate' || op.kind === 'apptDelete') && op.scope === 'FOLLOWING') needsReload = true;
    } else {
      // Rechazado: se descarta junto con lo que dependía de algo que no se creó.
      if (op.kind === 'medCreate' || op.kind === 'apptCreate') {
        outbox = outbox.filter((queued) => targetId(queued) !== op.tempId);
      }
      results.set(op.id, outcome);
      // Nadie lo está esperando (se envió más tarde, p. ej. al volver la red): se avisa.
      if (!awaitedOps.has(op.id)) errorListeners.forEach((listener) => listener(outcome.message));
      needsReload = true;
    }
    await persistOutbox();
    persistBase();
    emit();
  }
  outbox.forEach((op) => results.set(op.id, { kind: 'pending' }));
  emit();
  if (needsReload) void refreshOwnData({ force: true, skipFlush: true });
  return results;
}

// ─── Descarga ────────────────────────────────────────────────────────────────

let refreshing: Promise<void> | null = null;
/** Se pidió una puesta al día urgente mientras otra seguía en curso. */
let rerunRefresh = false;

/**
 * Pone al día con el servidor (antes envía lo pendiente). Sin `force`, no
 * repite si se hizo hace poco: cambiar de pestaña no vuelve a descargar.
 */
export function refreshOwnData(options: { force?: boolean; skipFlush?: boolean } = {}): Promise<void> {
  if (!options.force && Date.now() - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return refreshing ?? Promise.resolve();
  if (refreshing) {
    // La que está en curso pudo empezar sin red: al terminar se repite una vez.
    if (options.force) rerunRefresh = true;
    return refreshing;
  }
  refreshing = runRefresh(options.skipFlush ?? false).finally(() => {
    refreshing = null;
    if (rerunRefresh) {
      rerunRefresh = false;
      void refreshOwnData({ force: true });
    }
  });
  return refreshing;
}

async function runRefresh(skipFlush: boolean): Promise<void> {
  await hydrateOwnData();
  lastRefreshAt = Date.now();
  if (!skipFlush) await flushOutbox();
  const session = await getStoredSession();
  if (!session?.accessToken) return;

  const startedAt = baseVersion;
  const [meds, dayLogs, pending, appts, undone] = await Promise.allSettled([
    fetchMedications(session.accessToken),
    fetchTodayMedicationLogs(session.accessToken),
    pendingDoseLogs(),
    fetchAppointments(session.accessToken),
    pendingUndoLogIds(),
  ]);

  const failures = [meds, appts].filter((result) => result.status === 'rejected') as PromiseRejectedResult[];
  offline = failures.some((failure) => isNetworkError(failure.reason));

  // Un cambio se confirmó mientras se descargaba: estos datos ya son viejos.
  if (baseVersion !== startedAt) {
    void refreshOwnData({ force: true, skipFlush: true });
    emit();
    return;
  }

  let next = base;
  if (meds.status === 'fulfilled') next = { ...next, medications: meds.value ?? [] };
  if (appts.status === 'fulfilled') next = { ...next, appointments: appts.value ?? [] };
  if (dayLogs.status === 'fulfilled') {
    const queued = pending.status === 'fulfilled' ? pending.value : [];
    // Deshechas sin conexión: el servidor aún las tiene, pero ya no cuentan.
    const undoneIds = undone.status === 'fulfilled' ? undone.value : new Set<string>();
    const serverLogs = (dayLogs.value ?? []).filter((log) => !undoneIds.has(log.id));
    next = { ...next, logs: [...queued, ...serverLogs], logsDay: dayKey(new Date()) };
  }
  if (meds.status === 'fulfilled' || appts.status === 'fulfilled') {
    hasData = true;
    loadError = null;
  } else if (!hasData) {
    const reason = failures[0]?.reason;
    loadError = reason instanceof Error ? reason.message : 'No pudimos cargar tus datos.';
  }
  // Llegaron datos distintos (p. ej. al recuperar la conexión): la pantalla
  // cambia con una transición suave, no de golpe.
  if (dataSignature(next) !== dataSignature(base)) animateNextChange();
  base = next;
  persistBase();
  emit();
}

const dataSignature = (data: Base) =>
  JSON.stringify([
    data.medications.map((item) => [item.id, item.updatedAt, item.active, item.stockQuantity]),
    data.appointments.map((item) => [item.id, item.updatedAt]),
    data.logs.map((item) => item.id),
  ]);

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
  reduceMotion = value;
}).catch(() => undefined);
AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
  reduceMotion = value;
});

function animateNextChange() {
  if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}


// ─── Cambios ─────────────────────────────────────────────────────────────────

export type MutationResult<T> = { saved: boolean; item: T | null };

/**
 * Aplica el cambio al instante (y lo guarda), intenta enviarlo y responde:
 * `saved: true` si el servidor lo confirmó, `false` si quedó pendiente (sin
 * red). Si el servidor lo rechaza, se deshace y lanza el error.
 */
async function mutate(op: OfflineOp): Promise<{ saved: boolean }> {
  await hydrateOwnData();
  outbox = enqueueOp(outbox, op);
  // Se ve primero; guardarlo en el teléfono va justo detrás.
  emit();
  await persistOutbox();
  awaitedOps.add(op.id);
  // Con red lenta (o Wi-Fi sin internet) no se hace esperar: tras unos
  // segundos el cambio ya está guardado en el teléfono y sigue enviándose.
  const results = await Promise.race([
    flushOutbox(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), MUTATION_WAIT_MS)),
  ]);
  awaitedOps.delete(op.id);
  const result = results?.get(op.id);
  if (result?.kind === 'rejected') throw new Error(result.message);
  // Ya no está en la cola: confirmado (o anulado por un borrado posterior).
  return { saved: !outbox.some((queued) => queued.id === op.id) };
}

const stamp = () => ({ id: newOpId(), at: new Date().toISOString() });
const findMedication = (id: string) => snapshot.medications.find((item) => item.id === id) ?? null;
const findAppointment = (id: string) => snapshot.appointments.find((item) => item.id === id) ?? null;

export async function createMedication(payload: CreateMedicationPayload): Promise<MutationResult<MedicationData>> {
  const tempId = newTempId();
  const op: OfflineOp = { ...stamp(), kind: 'medCreate', tempId, payload };
  const { saved } = await mutate(op);
  return { saved, item: findMedication(confirmedIds.get(tempId) ?? tempId) };
}

export async function updateMedication(id: string, patch: MedicationPatch): Promise<MutationResult<MedicationData>> {
  const { saved } = await mutate({ ...stamp(), kind: 'medUpdate', medicationId: id, patch });
  return { saved, item: findMedication(id) };
}

export async function deleteMedication(id: string): Promise<{ saved: boolean }> {
  return mutate({ ...stamp(), kind: 'medDelete', medicationId: id });
}

/**
 * Cita nueva. Las que se repiten las genera el servidor (en la zona del
 * usuario), así que necesitan conexión; una cita suelta se crea sin red.
 */
export async function createAppointment(payload: CreateAppointmentPayload): Promise<MutationResult<AppointmentData>> {
  if (payload.repeat) {
    const session = await getStoredSession();
    if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    try {
      const created = await apiCreateAppointment(session.accessToken, payload);
      await refreshOwnData({ force: true });
      return { saved: true, item: created };
    } catch (error) {
      if (isNetworkError(error)) {
        throw new Error('Sin conexión. Las citas que se repiten necesitan internet: guárdala como cita única o inténtalo con conexión.');
      }
      throw error;
    }
  }
  const tempId = newTempId();
  const { saved } = await mutate({ ...stamp(), kind: 'apptCreate', tempId, payload });
  return { saved, item: findAppointment(confirmedIds.get(tempId) ?? tempId) };
}

export async function updateAppointment(
  id: string,
  patch: UpdateAppointmentPayload,
  scope?: SeriesScope,
): Promise<MutationResult<AppointmentData>> {
  const { saved } = await mutate({ ...stamp(), kind: 'apptUpdate', appointmentId: id, patch, scope });
  return { saved, item: findAppointment(id) };
}

export async function deleteAppointment(id: string, scope?: SeriesScope): Promise<{ saved: boolean }> {
  return mutate({ ...stamp(), kind: 'apptDelete', appointmentId: id, scope });
}

// ─── Tomas ───────────────────────────────────────────────────────────────────

/** Una toma registrada (o deshecha): se ve al instante y ajusta las existencias. */
export function applyDoseLog(log: MedicationLog, direction: 1 | -1) {
  const today = dayKey(new Date());
  const logs = base.logsDay === today ? base.logs : [];
  base = {
    ...base,
    logsDay: today,
    logs: direction === 1 ? [log, ...logs.filter((item) => item.id !== log.id)] : logs.filter((item) => item.id !== log.id),
    medications: withStockChange(base.medications, log, direction),
  };
  persistBase();
  emit();
}

// ─── Alarmas y recordatorios ─────────────────────────────────────────────────

let reminderTimer: ReturnType<typeof setTimeout> | null = null;
let lastReminderSignature = '';

function scheduleReminderSync() {
  if (!hydrated) return;
  if (reminderTimer) clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => {
    reminderTimer = null;
    void syncOwnDataReminders({ onlyIfChanged: true });
  }, 700);
}

/**
 * Programa alarmas y avisos con lo que se muestra (incluidos los cambios
 * pendientes): desactivar sin red ya no deja sonando una alarma.
 */
export async function syncOwnDataReminders(options: { force?: boolean; onlyIfChanged?: boolean } = {}): Promise<void> {
  if (!hydrated || !hasData) return;
  const { medications, logs, appointments } = snapshot;
  const now = new Date();
  const handled = new Set<string>();
  for (const medication of medications) {
    getHandledDoseKeys(getTodayDoseSlots(medication, logs, now), now).forEach((key) => handled.add(key));
  }
  const signature = JSON.stringify([
    medications.map((med) => [med.id, med.updatedAt, med.active]),
    [...handled].sort(),
    appointments.map((appt) => [appt.id, appt.updatedAt, appt.scheduledAt, appt.attendanceStatus]),
  ]);
  // Los cambios de la vista disparan esto a menudo: solo si cambió algo que suene.
  // Una llamada explícita (p. ej. tras cambiar el plan del Círculo) siempre pasa.
  if (options.onlyIfChanged && signature === lastReminderSignature) return;
  lastReminderSignature = signature;
  try {
    const result = await syncMedicationAlarms(medications, { force: options.force, handledDoseKeys: handled });
    const nextStatus = result.status === 'no-permission' && medications.some((med) => med.active) ? 'no-permission' : 'ok';
    if (nextStatus !== alarmStatus) {
      alarmStatus = nextStatus;
      snapshot = buildSnapshot();
      listeners.forEach((listener) => listener());
    }
  } catch {
    alarmStatus = 'error';
    snapshot = buildSnapshot();
    listeners.forEach((listener) => listener());
  }
  await rescheduleAppointmentsAfterLaunch(appointments).catch(() => undefined);
}

// ─── Arranque y React ────────────────────────────────────────────────────────

/**
 * Justo al volver la red, a veces el Wi-Fi ya está pero internet aún no
 * responde: se reintenta unas veces (1, 2, 4 y 8 s) en lugar de quedarse
 * "sin conexión" hasta la próxima acción.
 */
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
function syncAfterReconnect(attempt: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  void refreshOwnData({ force: true }).then(() => {
    if (offline && attempt < 4) reconnectTimer = setTimeout(() => syncAfterReconnect(attempt + 1), 1000 * 2 ** attempt);
  });
}

/** Envía y descarga al recuperar la red, al volver a la app y tras acciones de alarmas. */
export function startOwnDataSync(): () => void {
  void hydrateOwnData().then(() => refreshOwnData({ force: true }));
  // Se nota al instante cuando se pierde o vuelve la conexión, sin esperar a
  // que falle una petición. Al volver: envía lo pendiente y pone al día la
  // pantalla que esté abierta.
  let wasOnline: boolean | null = null;
  let wasReachable: boolean | null = null;
  let wasType: string | null = null;
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    // isInternetReachable es null mientras Android comprueba: solo cuenta un "no" claro.
    const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
    // Android avisa "conectado" segundos antes de que internet responda; el
    // momento bueno para sincronizar es cuando se confirma que responde.
    const reachableNow = state.isInternetReachable === true && wasReachable !== true;
    const cameBack = wasOnline === false && online;
    // De datos móviles a Wi-Fi (o al revés): lo que salió por la red anterior
    // puede quedarse colgado.
    const switched = online && wasType !== null && wasType !== state.type;
    wasOnline = online;
    wasReachable = state.isInternetReachable;
    wasType = state.type;
    if (!online) {
      if (!offline) {
        offline = true;
        emit();
      }
      return;
    }
    if (reachableNow || cameBack || switched) {
      // Internet confirmado: lo que se quedó colgado se corta y se reintenta ya.
      preferShortTimeouts(20_000);
      if (reachableNow || switched) abortStalledRequests(800);
      if (offline || outbox.length || cameBack || reachableNow || switched) syncAfterReconnect(0);
    }
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void refreshOwnData();
  });
  const unsubscribeDose = onDoseAction(() => void refreshOwnData({ force: true }));
  return () => {
    unsubscribeNet();
    appState.remove();
    unsubscribeDose();
  };
}

/** Los datos propios para una pantalla. Lee del teléfono y se pone al día sin bloquear. */
export function useOwnData(): OwnDataSnapshot {
  const data = useSyncExternalStore(subscribe, getOwnData, getOwnData);
  useEffect(() => {
    void hydrateOwnData().then(() => refreshOwnData());
  }, []);
  return data;
}
