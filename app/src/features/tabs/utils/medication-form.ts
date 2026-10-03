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
