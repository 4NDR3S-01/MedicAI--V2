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
};

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
  if (!medication.active || !medication.times.length) return [];
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
  const result: Date[] = [];
  for (let offset = 0; ; offset += 1) {
    if (zonedToDate(first.year, first.month, first.day + offset, 0, 0, timeZone).getTime() > upper) break;
    for (const [hour, minute] of times) {
      const dose = zonedToDate(first.year, first.month, first.day + offset, hour, minute, timeZone);
      if (dose.getTime() >= lower && dose.getTime() <= upper) result.push(dose);
    }
  }
  return result.sort((a, b) => a.getTime() - b.getTime());
}
