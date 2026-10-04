import { parseDayKey, zonedParts, zonedToDate } from '../../common/dose-schedule';
import { MAX_SERIES_OCCURRENCES, type RepeatDto } from './dto/repeat.dto';

/** Una serie no se extiende más de un año. */
const MAX_SERIES_DAYS = 366;

const dayNumber = (year: number, month: number, day: number) => Math.round(Date.UTC(year, month - 1, day) / 86_400_000);

/**
 * Fechas de una serie de citas a partir de la primera, a la misma hora de
 * pared en la zona del dueño (no se corre con el horario de verano).
 */
export function seriesDates(first: Date, repeat: RepeatDto, timeZone: string): Date[] {
  const p = zonedParts(first, timeZone);
  const startDay = dayNumber(p.year, p.month, p.day);
  const untilDay = Math.min(parseDayKey(repeat.until) ?? Infinity, startDay + MAX_SERIES_DAYS);
  // Sin `count`, una de más: así quien llama sabe que la serie no cabe.
  const limit = repeat.count ? Math.min(repeat.count, MAX_SERIES_OCCURRENCES) : MAX_SERIES_OCCURRENCES + 1;
  const interval = repeat.interval ?? 1;
  const at = (offsetDays: number, monthOffset = 0) => {
    const date = new Date(Date.UTC(p.year, p.month - 1 + monthOffset, p.day + offsetDays));
    return { date, day: dayNumber(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()) };
  };
  const result: Date[] = [];
  const push = (date: Date) =>
    result.push(zonedToDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), p.hour, p.minute, timeZone));

  if (repeat.frequency === 'MONTHLY') {
    for (let months = 0; result.length < limit; months += interval) {
      const { date, day } = at(0, months);
      if (day > untilDay) break;
      // El 31 no existe en todos los meses: ese mes no hay cita.
      if (date.getUTCDate() === p.day) push(date);
    }
    return result;
  }

  if (repeat.frequency === 'DAILY') {
    for (let offset = 0; result.length < limit; offset += interval) {
      const { date, day } = at(offset);
      if (day > untilDay) break;
      push(date);
    }
    return result;
  }

  // Semanal: los días elegidos, cada `interval` semanas (semanas de lunes a domingo).
  const firstWeekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  const weekDays = new Set(repeat.weekDays?.length ? repeat.weekDays : [firstWeekday]);
  const weekStart = startDay - ((firstWeekday + 6) % 7);
  for (let offset = 0; result.length < limit; offset += 1) {
    const { date, day } = at(offset);
    if (day > untilDay) break;
    const week = Math.floor((day - weekStart) / 7);
    if (week % interval === 0 && weekDays.has(date.getUTCDay())) push(date);
  }
  return result;
}
