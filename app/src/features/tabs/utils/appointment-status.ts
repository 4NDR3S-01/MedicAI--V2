import type { AppointmentData } from '../services/appointments.service';

/**
 * Estado de una cita desde el punto de vista del usuario:
 * - upcoming: aún no empieza (o empezó hace poco y sigue pendiente).
 * - awaiting: ya pasó y no se ha marcado la asistencia → hay que preguntar.
 * - attended / missed: asistencia marcada.
 *
 * Una cita pasada sin marcar NUNCA desaparece: queda en el historial como
 * "por confirmar" hasta que el usuario indique si asistió.
 */
export type AppointmentState = 'upcoming' | 'awaiting' | 'attended' | 'missed';

/** Tras la hora de inicio, la cita sigue en "Próximas" durante este margen. */
export const IN_PROGRESS_WINDOW_MS = 60 * 60_000;
/** Se puede marcar la asistencia desde poco antes de la hora de la cita. */
export const ATTENDANCE_OPENS_BEFORE_MS = 30 * 60_000;

export const appointmentDate = (appointment: AppointmentData): Date | null => {
  const date = new Date(appointment.scheduledAt);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function getAppointmentState(appointment: AppointmentData, now: Date): AppointmentState {
  if (appointment.attendanceStatus === 'ATTENDED') return 'attended';
  if (appointment.attendanceStatus === 'MISSED') return 'missed';
  const date = appointmentDate(appointment);
  if (!date) return 'awaiting';
  return date.getTime() + IN_PROGRESS_WINDOW_MS > now.getTime() ? 'upcoming' : 'awaiting';
}

/** La cita está ocurriendo ahora (empezó hace menos de IN_PROGRESS_WINDOW_MS). */
export function isInProgress(appointment: AppointmentData, now: Date): boolean {
  const date = appointmentDate(appointment);
  if (!date || appointment.attendanceStatus !== 'PENDING') return false;
  const elapsed = now.getTime() - date.getTime();
  return elapsed >= 0 && elapsed < IN_PROGRESS_WINDOW_MS;
}

/** Tiene sentido preguntar "¿asististe?" (no para citas que aún están lejos). */
export function canMarkAttendance(appointment: AppointmentData, now: Date): boolean {
  const date = appointmentDate(appointment);
  return Boolean(date && date.getTime() - ATTENDANCE_OPENS_BEFORE_MS <= now.getTime());
}

export type AppointmentBuckets = {
  upcoming: AppointmentData[];
  history: AppointmentData[];
  awaitingCount: number;
  attendedCount: number;
  missedCount: number;
};

/** Próximas en orden cronológico; historial de la más reciente a la más antigua. */
export function bucketAppointments(appointments: AppointmentData[], now: Date): AppointmentBuckets {
  const upcoming: AppointmentData[] = [];
  const history: AppointmentData[] = [];
  let awaitingCount = 0;
  let attendedCount = 0;
  let missedCount = 0;

  for (const appointment of appointments) {
    const state = getAppointmentState(appointment, now);
    if (state === 'upcoming') {
      upcoming.push(appointment);
      continue;
    }
    history.push(appointment);
    if (state === 'awaiting') awaitingCount += 1;
    else if (state === 'attended') attendedCount += 1;
    else missedCount += 1;
  }

  const time = (appointment: AppointmentData) => appointmentDate(appointment)?.getTime() ?? 0;
  upcoming.sort((a, b) => time(a) - time(b));
  history.sort((a, b) => time(b) - time(a));
  return { upcoming, history, awaitingCount, attendedCount, missedCount };
}

// ─── Textos ─────────────────────────────────────────────────────────────────

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const formatClock = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** "Hoy", "Mañana", "En 3 días", "Ayer", "Hace 5 días", "12 mar 2025". */
export function relativeDayLabel(date: Date, now: Date): string {
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days === -1) return 'Ayer';
  if (days > 1 && days <= 6) return `En ${days} días`;
  if (days < -1 && days >= -6) return `Hace ${Math.abs(days)} días`;
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Cuenta atrás corta para la próxima cita: "en 25 min", "en 3 h", "mañana". */
export function countdownLabel(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return 'ahora';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return `en ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && startOfDay(date).getTime() === startOfDay(now).getTime()) {
    const rest = minutes % 60;
    return rest ? `en ${hours} h ${rest} min` : `en ${hours} h`;
  }
  return relativeDayLabel(date, now).toLowerCase();
}

export const dateParts = (date: Date) => ({
  day: String(date.getDate()).padStart(2, '0'),
  month: date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toUpperCase(),
  weekday: date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''),
});
