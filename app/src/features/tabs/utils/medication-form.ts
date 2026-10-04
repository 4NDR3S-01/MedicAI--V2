import {
  getDoseDatesBetween,
  isAsNeeded,
  type DosageStep,
  type DoseScheduleInput,
} from '../../../shared/services/dose-schedule';

/**
 * Valores de frecuencia tal como se guardan en el backend (se mantienen sin
 * cambios por compatibilidad con medicamentos existentes) y su intervalo.
 */
export const FREQUENCY_OPTIONS = [
  { value: 'Una vez al dia', label: 'Una vez al día', hours: 24 },
  { value: 'Dos veces al dia', label: 'Dos veces al día', hours: 12 },
  { value: 'Cada 8 horas', label: 'Cada 8 horas', hours: 8 },
  { value: 'Cada 6 horas', label: 'Cada 6 horas', hours: 6 },
  { value: 'Cada 4 horas', label: 'Cada 4 horas', hours: 4 },
  { value: 'Cada 12 horas', label: 'Cada 12 horas', hours: 12 },
] as const;

export const DOSAGE_UNITS = ['mg', 'g', 'mcg', 'ml', 'gotas', 'comprimido', 'cápsula', 'UI'] as const;
export type DosageUnit = (typeof DOSAGE_UNITS)[number];

export const CUSTOM_INTERVAL_MIN = 1;
export const CUSTOM_INTERVAL_MAX = 23;

/** Texto legible de una frecuencia guardada (con tildes). */
export function frequencyLabel(value: string): string {
  return FREQUENCY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/**
 * Horarios diarios a partir de la primera toma y el intervalo: 08:00 cada 8 h
 * → ["00:00", "08:00", "16:00"]. Con 24 h, una sola toma.
 */
export function calculateDailyTimes(firstDoseTime: string, intervalHours: number): string[] {
  const match = /^(\d{2}):(\d{2})$/.exec(firstDoseTime);
  if (!match || intervalHours <= 0) return [];
  const startHour = Number(match[1]);
  const minute = match[2];

  const count = intervalHours >= 24 ? 1 : Math.floor(24 / intervalHours);
  const times = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const hour = (startHour + index * intervalHours) % 24;
    times.add(`${String(hour).padStart(2, '0')}:${minute}`);
  }
  return [...times].sort((a, b) => a.localeCompare(b));
}

/** "500 mg" → { amount: "500", unit: "mg" }. Unidades desconocidas → mg. */
export function parseDosage(dosage: string): { amount: string; unit: DosageUnit } {
  const [amount = '', ...rest] = dosage.trim().split(/\s+/);
  const rawUnit = rest.join(' ');
  const unit = DOSAGE_UNITS.find((candidate) => candidate.toLowerCase() === rawUnit.toLowerCase());
  return { amount, unit: unit ?? 'mg' };
}

export const formatTime = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export const timeToDate = (time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date;
};

// ─── Días de toma ────────────────────────────────────────────────────────────

/** Lunes primero, como en el calendario de Colombia/España. Valor = getDay(). */
export const WEEK_DAYS = [
  { value: 1, short: 'L', label: 'Lun', name: 'lunes' },
  { value: 2, short: 'M', label: 'Mar', name: 'martes' },
  { value: 3, short: 'X', label: 'Mié', name: 'miércoles' },
  { value: 4, short: 'J', label: 'Jue', name: 'jueves' },
  { value: 5, short: 'V', label: 'Vie', name: 'viernes' },
  { value: 6, short: 'S', label: 'Sáb', name: 'sábado' },
  { value: 0, short: 'D', label: 'Dom', name: 'domingo' },
] as const;

export const AS_NEEDED_FREQUENCY = 'Según necesidad';
export const DAY_INTERVAL_MIN = 2;
export const DAY_INTERVAL_MAX = 30;

type ScheduleLike = Pick<DoseScheduleInput, 'scheduleType' | 'weekDays' | 'dayInterval'> & { frequency: string };

/** "Lun, Mié, Vie", "Días laborables", "Fines de semana"… */
export function weekDaysLabel(days: number[] | null | undefined): string {
  const set = new Set(days ?? []);
  if (set.size === 7) return 'Todos los días';
  if (set.size === 5 && [1, 2, 3, 4, 5].every((day) => set.has(day))) return 'De lunes a viernes';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Fines de semana';
  return WEEK_DAYS.filter((day) => set.has(day.value)).map((day) => day.label).join(', ');
}

/** Frecuencia completa: "Dos veces al día · Lun, Mié, Vie". */
export function scheduleLabel(medication: ScheduleLike): string {
  if (medication.scheduleType === 'AS_NEEDED') return AS_NEEDED_FREQUENCY;
  const perDay = frequencyLabel(medication.frequency);
  if (medication.scheduleType === 'WEEKDAYS' && medication.weekDays?.length) {
    return `${perDay} · ${weekDaysLabel(medication.weekDays)}`;
  }
  if (medication.scheduleType === 'INTERVAL' && (medication.dayInterval ?? 1) > 1) {
    return `${perDay} · cada ${medication.dayInterval} días`;
  }
  return perDay;
}

// ─── Dosis que cambia con el tiempo ──────────────────────────────────────────

/** Último día (local) de una dosis escalonada que empieza en `startDate`. */
export function stepsEndDate(startDate: Date, steps: Pick<DosageStep, 'days'>[]): Date {
  const total = steps.reduce((sum, step) => sum + step.days, 0);
  const end = new Date(startDate);
  end.setDate(end.getDate() + Math.max(0, total - 1));
  return end;
}

// ─── Existencias ─────────────────────────────────────────────────────────────

/** Unidades que se cuentan tal cual (en mg, g o mcg se cuentan unidades). */
const COUNTABLE_UNITS: readonly string[] = ['comprimido', 'cápsula', 'gotas', 'ml', 'UI'];

/** En qué se cuentan las existencias según la unidad de la dosis. */
export function stockUnitLabel(dosage: string, count = 2): string {
  const { unit } = parseDosage(dosage);
  if (unit === 'comprimido') return count === 1 ? 'comprimido' : 'comprimidos';
  if (unit === 'cápsula') return count === 1 ? 'cápsula' : 'cápsulas';
  if (COUNTABLE_UNITS.includes(unit)) return unit;
  return count === 1 ? 'unidad' : 'unidades';
}

/** Por toma: la dosis misma si se cuenta en esa unidad (2 comprimidos), si no 1. */
export function defaultStockPerDose(dosage: string): number {
  const { amount, unit } = parseDosage(dosage);
  const value = Number(amount.replace(',', '.'));
  return COUNTABLE_UNITS.includes(unit) && Number.isFinite(value) && value > 0 ? value : 1;
}

export const formatQuantity = (value: number) =>
  String(Math.round(value * 100) / 100).replace('.', ',');

/**
 * Días que alcanzan las existencias según las tomas de las próximas dos
 * semanas, o null (según necesidad, sin tomas o sin cuenta).
 */
export function stockDaysLeft(
  medication: DoseScheduleInput & { stockQuantity?: number | null; stockPerDose?: number | null },
  now = new Date(),
): number | null {
  if (medication.stockQuantity == null || isAsNeeded(medication)) return null;
  const horizonDays = 14;
  const doses = getDoseDatesBetween(medication, now, new Date(now.getTime() + horizonDays * 86_400_000)).length;
  if (!doses) return null;
  const perDay = (doses / horizonDays) * (medication.stockPerDose || 1);
  return Math.floor(medication.stockQuantity / perDay);
}

/** Umbral de aviso por defecto: lo que se usa en 3 días (o 3 tomas). */
export function defaultStockAlert(perDose: number, dosesPerDay: number): number {
  return Math.max(1, Math.ceil(perDose * Math.max(1, dosesPerDay) * 3));
}

export const isLowStock = (medication: { stockQuantity?: number | null; stockAlertAt?: number | null }) =>
  medication.stockQuantity != null && medication.stockAlertAt != null && medication.stockQuantity <= medication.stockAlertAt;

