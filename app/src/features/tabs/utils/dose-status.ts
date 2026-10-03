import {
  dayBoundsIn,
  doseKey,
  formatClockIn,
  getDoseDatesBetween,
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
