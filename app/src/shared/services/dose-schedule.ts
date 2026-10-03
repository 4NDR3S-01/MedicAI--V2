/**
 * Cálculo de las tomas de un medicamento. Fuente única para la pantalla de
 * medicamentos y para la programación de alarmas, de modo que lo que se ve y lo
 * que suena siempre coincide.
 */

export type DoseScheduleInput = {
  id: string;
  times: string[];
  active: boolean;
  /** Momento de la última activación: las tomas anteriores no existen. */
  activeSince?: string | null;
  createdAt?: string;
  /** Último día de tratamiento (incluido). */
  customEndDate?: string | null;
};

export const parseTime = (time: string): { hour: number; minute: number } | null => {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
};

export const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Desde cuándo cuentan las tomas (activación, o creación en datos antiguos). */
export const getDoseStart = (medication: DoseScheduleInput): Date | null => {
  const raw = medication.activeSince ?? medication.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Fin del tratamiento (fin del día elegido), o null si no tiene. */
export const getDoseEnd = (medication: DoseScheduleInput): Date | null => {
  if (!medication.customEndDate) return null;
  const date = new Date(medication.customEndDate);
  return Number.isNaN(date.getTime()) ? null : endOfDay(date);
};

export const isTreatmentFinished = (medication: DoseScheduleInput, now = new Date()): boolean => {
  const end = getDoseEnd(medication);
  return end !== null && end.getTime() < now.getTime();
};

/**
 * Tomas en [from, to], ordenadas. Solo para medicamentos activos y dentro del
 * periodo de tratamiento (desde la activación hasta la fecha de fin).
 */
export function getDoseDatesBetween(medication: DoseScheduleInput, from: Date, to: Date): Date[] {
  if (!medication.active || !medication.times?.length) return [];

  const doseStart = getDoseStart(medication);
  const doseEnd = getDoseEnd(medication);
  const lower = Math.max(from.getTime(), doseStart?.getTime() ?? -Infinity);
  const upper = Math.min(to.getTime(), doseEnd?.getTime() ?? Infinity);
  if (lower > upper) return [];

  const times = medication.times
    .map(parseTime)
    .filter((time): time is { hour: number; minute: number } => time !== null);

  const result: Date[] = [];
  for (let day = startOfDay(new Date(lower)); day.getTime() <= upper; day.setDate(day.getDate() + 1)) {
    for (const { hour, minute } of times) {
      const dose = new Date(day);
      dose.setHours(hour, minute, 0, 0);
      const ts = dose.getTime();
      if (ts >= lower && ts <= upper) result.push(dose);
    }
  }
  return result.sort((a, b) => a.getTime() - b.getTime());
}

/** Clave estable de una toma concreta (medicamento + instante). */
export const doseKey = (medicationId: string, dose: Date): string => `${medicationId}@${dose.getTime()}`;
