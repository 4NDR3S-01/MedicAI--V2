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
  /**
   * Zona horaria del DUEÑO del medicamento. Las horas ("08:00") son de su
   * hora local. Sin ella (o si es la del teléfono) se usa la del teléfono.
   */
  timeZone?: string | null;
  /** DAILY (por defecto), WEEKDAYS, INTERVAL o AS_NEEDED (sin horario). */
  scheduleType?: ScheduleType | null;
  /** 0 = domingo … 6 = sábado (WEEKDAYS). */
  weekDays?: number[] | null;
  /** Cada cuántos días (INTERVAL). */
  dayInterval?: number | null;
  /** Primer día ("YYYY-MM-DD", calendario del dueño): antes no hay tomas. */
  startDate?: string | null;
};

export type ScheduleType = 'DAILY' | 'WEEKDAYS' | 'INTERVAL' | 'AS_NEEDED';
export type DosageStep = { days: number; dosage: string };

// ─── Zonas horarias ──────────────────────────────────────────────────────────

export const deviceTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };
const formatters = new Map<string, Intl.DateTimeFormat | null>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat | null => {
  if (!formatters.has(timeZone)) {
    try {
      formatters.set(
        timeZone,
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          hourCycle: 'h23',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
        }),
      );
    } catch {
      formatters.set(timeZone, null);
    }
  }
  return formatters.get(timeZone) ?? null;
};

/** ¿Hay que calcular en otra zona? (no, si es la del teléfono o no es válida). */
export const isForeignTimeZone = (timeZone: string | null | undefined): timeZone is string =>
  Boolean(timeZone && timeZone !== deviceTimeZone() && formatterFor(timeZone));

/** Fecha y hora de pared de un instante en una zona horaria. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = formatterFor(timeZone);
  if (!formatter) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() };
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute };
}

const offsetMs = (date: Date, timeZone: string) => {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
};

/** Instante de "esa fecha a esa hora" en la zona indicada (con horario de verano). */
export function zonedToDate(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** "HH:mm" de un instante en una zona (o en la del teléfono). */
export function formatClockIn(date: Date, timeZone?: string | null): string {
  const p = isForeignTimeZone(timeZone) ? zonedParts(date, timeZone) : { hour: date.getHours(), minute: date.getMinutes() };
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Inicio y fin del día (de pared) que contiene `date` en una zona. */
export function dayBoundsIn(date: Date, timeZone?: string | null): { start: Date; end: Date } {
  if (!isForeignTimeZone(timeZone)) return { start: startOfDay(date), end: endOfDay(date) };
  const p = zonedParts(date, timeZone);
  const start = zonedToDate(p.year, p.month, p.day, 0, 0, timeZone);
  const next = zonedToDate(p.year, p.month, p.day + 1, 0, 0, timeZone);
  return { start, end: new Date(next.getTime() - 1) };
}

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

// ─── Días de toma ────────────────────────────────────────────────────────────

/** Número de día de una fecha de calendario (independiente de la zona). */
export const dayNumber = (year: number, month: number, day: number) =>
  Math.round(Date.UTC(year, month - 1, day) / 86_400_000);

/** "2026-10-06" → número de día, o null. */
export const parseDayKey = (value: string | null | undefined): number | null => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? dayNumber(Number(match[1]), Number(match[2]), Number(match[3])) : null;
};

/** Fecha local → "YYYY-MM-DD". */
export const toDayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** "YYYY-MM-DD" → fecha local a medianoche. */
export const fromDayKey = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

export const isAsNeeded = (medication: Pick<DoseScheduleInput, 'scheduleType'>) => medication.scheduleType === 'AS_NEEDED';

/** Número de día (calendario del dueño) de un instante. */
const ownerDayNumber = (date: Date, timeZone?: string | null) => {
  if (isForeignTimeZone(timeZone)) {
    const p = zonedParts(date, timeZone);
    return dayNumber(p.year, p.month, p.day);
  }
  return dayNumber(date.getFullYear(), date.getMonth() + 1, date.getDate());
};

/** ¿Hay tomas ese día del calendario del dueño? */
function isDoseDay(medication: DoseScheduleInput, year: number, month: number, day: number, anchor: number | null): boolean {
  const n = dayNumber(year, month, day);
  const start = parseDayKey(medication.startDate);
  if (start !== null && n < start) return false;
  if (medication.scheduleType === 'WEEKDAYS') {
    return (medication.weekDays ?? []).includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
  }
  const interval = medication.dayInterval ?? 1;
  if (medication.scheduleType === 'INTERVAL' && interval > 1 && anchor !== null) {
    return (((n - anchor) % interval) + interval) % interval === 0;
  }
  return true;
}

/**
 * Dosis de un día: la del tramo que toca de una dosis que cambia con el
 * tiempo (el último, una vez terminados), o la dosis fija.
 */
export function dosageOnDay(
  medication: { dosage: string; dosageSteps?: DosageStep[] | null; startDate?: string | null; timeZone?: string | null },
  at: Date,
): string {
  const steps = medication.dosageSteps;
  const start = parseDayKey(medication.startDate);
  if (!steps?.length || start === null) return medication.dosage;
  let index = ownerDayNumber(at, medication.timeZone) - start;
  for (const step of steps) {
    if (index < step.days) return step.dosage;
    index -= step.days;
  }
  return steps[steps.length - 1].dosage;
}

/** Desde cuándo cuentan las tomas (activación, o creación en datos antiguos). */
export const getDoseStart = (medication: DoseScheduleInput): Date | null => {
  const raw = medication.activeSince ?? medication.createdAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Fin del tratamiento (fin del día elegido, en la zona del dueño), o null. */
export const getDoseEnd = (medication: DoseScheduleInput): Date | null => {
  if (!medication.customEndDate) return null;
  const date = new Date(medication.customEndDate);
  return Number.isNaN(date.getTime()) ? null : dayBoundsIn(date, medication.timeZone).end;
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
  if (!medication.active || !medication.times?.length || isAsNeeded(medication)) return [];

  const doseStart = getDoseStart(medication);
  const doseEnd = getDoseEnd(medication);
  const lower = Math.max(from.getTime(), doseStart?.getTime() ?? -Infinity);
  const upper = Math.min(to.getTime(), doseEnd?.getTime() ?? Infinity);
  if (lower > upper) return [];

  const times = medication.times
    .map(parseTime)
    .filter((time): time is { hour: number; minute: number } => time !== null);

  // Ancla de "cada N días": el día de inicio o, en su defecto, el de activación.
  const anchor = parseDayKey(medication.startDate) ?? (doseStart ? ownerDayNumber(doseStart, medication.timeZone) : null);

  const result: Date[] = [];
  if (isForeignTimeZone(medication.timeZone)) {
    // Días de pared en la zona del dueño: sus "08:00" son 08:00 allí.
    const timeZone = medication.timeZone;
    const first = zonedParts(new Date(lower), timeZone);
    for (let offset = 0; ; offset += 1) {
      const dayStart = zonedToDate(first.year, first.month, first.day + offset, 0, 0, timeZone);
      if (dayStart.getTime() > upper) break;
      const date = new Date(Date.UTC(first.year, first.month - 1, first.day + offset));
      if (!isDoseDay(medication, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), anchor)) continue;
      for (const { hour, minute } of times) {
        const dose = zonedToDate(first.year, first.month, first.day + offset, hour, minute, timeZone);
        const ts = dose.getTime();
        if (ts >= lower && ts <= upper) result.push(dose);
      }
    }
    return result.sort((a, b) => a.getTime() - b.getTime());
  }

  for (let day = startOfDay(new Date(lower)); day.getTime() <= upper; day.setDate(day.getDate() + 1)) {
    if (!isDoseDay(medication, day.getFullYear(), day.getMonth() + 1, day.getDate(), anchor)) continue;
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
