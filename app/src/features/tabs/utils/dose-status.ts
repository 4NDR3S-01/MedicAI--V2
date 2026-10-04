import {
  dayBoundsIn,
  doseKey,
  formatClockIn,
  getDoseDatesBetween,
  isAsNeeded,
  isForeignTimeZone,
  type DoseScheduleInput,
} from '../../../shared/services/dose-schedule';
import type { MedicationLog } from '../services/medications.service';

/**
 * - taken / skipped: registrada por el usuario (o por una alarma ignorada).
 * - due: es la hora (desde 60 min antes hasta 60 min después): se puede registrar.
 * - missed: pasó la hora y no hay registro. NO se marca como omitida: el
 *   usuario puede registrarla tarde si la tomó.
 * - upcoming: aún falta.
 */
export type DoseState = 'taken' | 'skipped' | 'due' | 'missed' | 'upcoming';

export type DoseSlot = {
  key: string;
  medicationId: string;
  at: Date;
  /** Hora de la toma en la zona del dueño ("08:00"). */
  time: string;
  /** Si el dueño está en otra zona: la misma toma en la hora de este teléfono. */
  viewerTime?: string;
  state: DoseState;
  log?: MedicationLog;
};

export const DOSE_EARLY_WINDOW_MS = 60 * 60_000;
export const DOSE_LATE_WINDOW_MS = 60 * 60_000;

const sameMinute = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate()
  && a.getHours() === b.getHours()
  && a.getMinutes() === b.getMinutes();

const formatHHmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** El registro más reciente que corresponde a esa toma (mismo día y hora). */
export function findLogForDose(logs: MedicationLog[], medicationId: string, at: Date): MedicationLog | undefined {
  let match: MedicationLog | undefined;
  for (const log of logs) {
    if (log.medicationId !== medicationId || !log.scheduledFor) continue;
    if (log.action !== 'TAKEN' && log.action !== 'SKIPPED') continue;
    if (!sameMinute(new Date(log.scheduledFor), at)) continue;
    if (!match || new Date(log.takenAt).getTime() > new Date(match.takenAt).getTime()) match = log;
  }
  return match;
}

export function getDoseState(at: Date, log: MedicationLog | undefined, now: Date): DoseState {
  if (log?.action === 'TAKEN') return 'taken';
  if (log?.action === 'SKIPPED') return 'skipped';
  const diff = at.getTime() - now.getTime();
  if (diff > DOSE_EARLY_WINDOW_MS) return 'upcoming';
  if (diff >= -DOSE_LATE_WINDOW_MS) return 'due';
  return 'missed';
}

/** Tomas de hoy de un medicamento con su estado. */
export function getTodayDoseSlots(
  medication: DoseScheduleInput,
  logs: MedicationLog[],
  now: Date,
): DoseSlot[] {
  // "Hoy" es el día del dueño del medicamento (puede ser otro en otra zona).
  const { start, end } = dayBoundsIn(now, medication.timeZone);
  const foreign = isForeignTimeZone(medication.timeZone);
  return getDoseDatesBetween(medication, start, end).map((at) => {
    const log = findLogForDose(logs, medication.id, at);
    return {
      key: doseKey(medication.id, at),
      medicationId: medication.id,
      at,
      time: formatClockIn(at, medication.timeZone),
      viewerTime: foreign ? formatHHmm(at) : undefined,
      state: getDoseState(at, log, now),
      log,
    };
  });
}

export const canRegisterDose = (slot: DoseSlot) => slot.state !== 'upcoming';

/** Claves de tomas futuras ya registradas (no deben sonar). */
export function getHandledDoseKeys(slots: DoseSlot[], now: Date): Set<string> {
  return new Set(slots.filter((slot) => slot.log && slot.at.getTime() > now.getTime()).map((slot) => slot.key));
}

/**
 * Según necesidad: las tomas de hoy son las registradas (sin hora fija). Se
 * devuelven como tomas "tomadas" para poder verlas y deshacerlas.
 */
export function getAsNeededSlots(medication: DoseScheduleInput, logs: MedicationLog[], now: Date): DoseSlot[] {
  if (!isAsNeeded(medication)) return [];
  const { start, end } = dayBoundsIn(now, medication.timeZone);
  const foreign = isForeignTimeZone(medication.timeZone);
  return logs
    .filter((log) => log.medicationId === medication.id && log.action === 'TAKEN' && !log.scheduledFor)
    .map((log) => ({ log, at: new Date(log.takenAt) }))
    .filter(({ at }) => at >= start && at <= end)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map(({ log, at }) => ({
      key: log.id,
      medicationId: medication.id,
      at,
      time: formatClockIn(at, medication.timeZone),
      viewerTime: foreign ? formatHHmm(at) : undefined,
      state: 'taken' as const,
      log,
    }));
}

/** ¿Se puede tomar otra ahora? Si no, por qué (máximo diario o tiempo mínimo). */
export function asNeededWarning(
  medication: { maxDailyDoses?: number | null; minHoursBetween?: number | null },
  slots: DoseSlot[],
  now: Date,
): string | null {
  if (medication.maxDailyDoses && slots.length >= medication.maxDailyDoses) {
    return `Hoy ya se registraron ${slots.length} tomas y el máximo indicado es ${medication.maxDailyDoses} al día.`;
  }
  const last = slots[slots.length - 1];
  if (last && medication.minHoursBetween) {
    const nextAt = last.at.getTime() + medication.minHoursBetween * 3_600_000;
    if (nextAt > now.getTime()) {
      const minutes = Math.ceil((nextAt - now.getTime()) / 60_000);
      const wait = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim() : `${minutes} min`;
      return `La última fue a las ${last.time} y deben pasar al menos ${medication.minHoursBetween} h entre tomas (faltan ${wait}).`;
    }
  }
  return null;
}

/** Slots de hoy de un medicamento: con horario, o las tomas registradas si es según necesidad. */
export const getDaySlots = (medication: DoseScheduleInput, logs: MedicationLog[], now: Date): DoseSlot[] =>
  isAsNeeded(medication) ? getAsNeededSlots(medication, logs, now) : getTodayDoseSlots(medication, logs, now);

/**
 * Existencias tras registrar (+1) o deshacer (-1) una toma, sin esperar a
 * recargar: el servidor ya descontó o devolvió `log.stockUnits`.
 */
export function withStockChange<T extends { id: string; stockQuantity?: number | null }>(
  medications: T[],
  log: MedicationLog,
  direction: 1 | -1,
): T[] {
  if (!log.stockUnits) return medications;
  return medications.map((medication) =>
    medication.id === log.medicationId && medication.stockQuantity != null
      ? { ...medication, stockQuantity: Math.max(0, medication.stockQuantity - direction * log.stockUnits!) }
      : medication,
  );
}
