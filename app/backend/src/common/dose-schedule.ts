/**
 * Cálculo de tomas en el servidor (mismo criterio que la app,
 * app/src/shared/services/dose-schedule.ts): las horas "08:00" son la hora
 * local del DUEÑO del medicamento, en su zona horaria.
 */

export type ServerDoseInput = {
  id: string;
  times: string[];
  active: boolean;
  activeSince: Date | null;
  createdAt: Date;
  customEndDate: Date | null;
  scheduleType?: string | null;
  weekDays?: number[] | null;
  dayInterval?: number | null;
  startDate?: string | null;
};

export type DosageStep = { days: number; dosage: string };

/** Número de día de una fecha de calendario (independiente de la zona). */
const dayNumber = (year: number, month: number, day: number) => Math.round(Date.UTC(year, month - 1, day) / 86_400_000);

/** "2026-10-06" → número de día, o null. */
export const parseDayKey = (value: string | null | undefined): number | null => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? dayNumber(Number(match[1]), Number(match[2]), Number(match[3])) : null;
};

/** ¿Hay tomas ese día (del calendario del dueño)? */
function isDoseDay(medication: ServerDoseInput, year: number, month: number, day: number, anchor: number | null): boolean {
  const n = dayNumber(year, month, day);
  const start = parseDayKey(medication.startDate);
  if (start !== null && n < start) return false;
  if (medication.scheduleType === 'WEEKDAYS') {
    return (medication.weekDays ?? []).includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
  }
  if (medication.scheduleType === 'INTERVAL' && (medication.dayInterval ?? 1) > 1 && anchor !== null) {
    const interval = medication.dayInterval!;
    return (((n - anchor) % interval) + interval) % interval === 0;
  }
  return true;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string) => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

export function zonedParts(date: Date, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute };
}

const offsetMs = (date: Date, timeZone: string) => {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(date.getTime() / 60_000) * 60_000;
};

export function zonedToDate(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

export const isValidTimeZone = (timeZone: string | null | undefined): timeZone is string => {
  if (!timeZone) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
};

/** Tomas de un medicamento en [from, to], en la zona de su dueño. */
export function doseDatesBetween(medication: ServerDoseInput, from: Date, to: Date, timeZone: string): Date[] {
  if (!medication.active || !medication.times.length || medication.scheduleType === 'AS_NEEDED') return [];
  const start = medication.activeSince ?? medication.createdAt;
  let end = Infinity;
  if (medication.customEndDate) {
    const p = zonedParts(medication.customEndDate, timeZone);
    end = zonedToDate(p.year, p.month, p.day + 1, 0, 0, timeZone).getTime() - 1;
  }
  const lower = Math.max(from.getTime(), start.getTime());
  const upper = Math.min(to.getTime(), end);
  if (lower > upper) return [];

  const times = medication.times
    .map((time) => time.split(':').map(Number))
    .filter(([hour, minute]) => Number.isInteger(hour) && Number.isInteger(minute));
  const first = zonedParts(new Date(lower), timeZone);
  const startParts = zonedParts(start, timeZone);
  const anchor = parseDayKey(medication.startDate) ?? dayNumber(startParts.year, startParts.month, startParts.day);
  const result: Date[] = [];
  for (let offset = 0; ; offset += 1) {
    if (zonedToDate(first.year, first.month, first.day + offset, 0, 0, timeZone).getTime() > upper) break;
    const date = new Date(Date.UTC(first.year, first.month - 1, first.day + offset));
    if (!isDoseDay(medication, date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), anchor)) continue;
    for (const [hour, minute] of times) {
      const dose = zonedToDate(first.year, first.month, first.day + offset, hour, minute, timeZone);
      if (dose.getTime() >= lower && dose.getTime() <= upper) result.push(dose);
    }
  }
  return result.sort((a, b) => a.getTime() - b.getTime());
}

/** Pasos de dosis válidos (o null): [{ days, dosage }]. */
export function readDosageSteps(raw: unknown): DosageStep[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const steps = raw.filter(
    (step): step is DosageStep =>
      !!step && typeof step === 'object' && Number.isInteger((step as DosageStep).days) && typeof (step as DosageStep).dosage === 'string',
  );
  return steps.length ? steps : null;
}

/**
 * Dosis del día de esa toma: la del paso de dosageSteps que corresponde (el
 * último, una vez terminados), o la dosis fija.
 */
export function dosageOnDay(
  medication: { dosage: string; dosageSteps?: unknown; startDate?: string | null },
  at: Date,
  timeZone: string,
): string {
  const steps = readDosageSteps(medication.dosageSteps);
  const start = parseDayKey(medication.startDate);
  if (!steps || start === null) return medication.dosage;
  const p = zonedParts(at, timeZone);
  let index = dayNumber(p.year, p.month, p.day) - start;
  for (const step of steps) {
    if (index < step.days) return step.dosage;
    index -= step.days;
  }
  return steps[steps.length - 1].dosage;
}

/** Cantidad numérica al inicio de una dosis ("2.5 mg" → 2.5). */
const amountOf = (dosage: string) => {
  const value = Number.parseFloat(dosage.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Unidades de las existencias que gasta una toma. Con dosis cambiante, en
 * proporción a la dosis de ese día (40 mg = 2 comprimidos → 20 mg = 1).
 */
export function stockUnitsForDose(
  medication: { dosage: string; dosageSteps?: unknown; startDate?: string | null; stockPerDose: number | null },
  at: Date,
  timeZone: string,
): number {
  const perDose = medication.stockPerDose && medication.stockPerDose > 0 ? medication.stockPerDose : 1;
  const base = amountOf(medication.dosage);
  const today = amountOf(dosageOnDay(medication, at, timeZone));
  if (!base || !today || base === today) return perDose;
  return Math.round(perDose * (today / base) * 100) / 100;
}
