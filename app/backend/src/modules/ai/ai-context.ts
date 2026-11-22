import { calculateAge } from '../../common/birth-date';
import { dosageOnDay, isValidTimeZone, stockUnitsForDose, zonedParts, zonedToDate } from '../../common/dose-schedule';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

const EMPTY_MEDICAL_VALUES = new Set(['', 'ninguno', 'ninguna']);
const MAX_MEDICATIONS = 30;
const MAX_APPOINTMENTS = 15;
const APPOINTMENT_WINDOW_DAYS = 60;
/** Tope de registros de hoy (todas las tomas, pospuestas incluidas). */
const MAX_TODAY_LOGS = 120;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const SPECIAL_CONDITION_LABELS = {
  pregnancy: 'embarazo',
  lactation: 'lactancia',
  recentSurgeries: 'cirugía reciente',
  immunosuppression: 'inmunosupresión',
  anticoagulantTreatment: 'tratamiento anticoagulante',
} as const;

const LOG_ACTION_LABELS: Record<string, string> = { TAKEN: 'tomada', SKIPPED: 'omitida', SNOOZED: 'pospuesta' };

/** 4 → "4", 2.5 → "2,5" (como lo escribe una persona). */
const amount = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');

const clockInZone = (date: Date, timeZone: string) => {
  const p = zonedParts(date, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

/** "quedan 4, 1 por toma (aviso al llegar a 3)", o null si no se lleva la cuenta. */
function stockText(
  medication: { dosage: string; dosageSteps: unknown; startDate: string | null; stockQuantity: number | null; stockPerDose: number | null; stockAlertAt: number | null },
  now: Date,
  timeZone: string,
): string | null {
  if (medication.stockQuantity === null || medication.stockQuantity === undefined) return null;
  const perDose = stockUnitsForDose(medication, now, timeZone);
  const alert = medication.stockAlertAt !== null && medication.stockAlertAt !== undefined ? ` (aviso al llegar a ${amount(medication.stockAlertAt)})` : '';
  return `quedan ${amount(Math.max(0, medication.stockQuantity))}, ${amount(perDose)} por toma${alert}`;
}

/** "toma de las 08:00: tomada a las 08:05; omitida a las 14:00", o "ninguna registrada". */
function todayLogsText(logs: Array<{ action: string; takenAt: Date; scheduledFor: Date | null }>, timeZone: string): string {
  if (!logs.length) return 'ninguna registrada';
  return logs
    .map((log) => {
      const label = LOG_ACTION_LABELS[log.action] ?? log.action.toLowerCase();
      const dose = log.scheduledFor ? `toma de las ${clockInZone(log.scheduledFor, timeZone)}: ` : '';
      return `${dose}${label} a las ${clockInZone(log.takenAt, timeZone)}`;
    })
    .join('; ');
}

const formatInZone = (date: Date, timeZone: string, withTime = true) =>
  date.toLocaleString('es-ES', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  });

function scheduleText(medication: {
  scheduleType: string;
  weekDays: number[];
  dayInterval: number | null;
  times: string[];
  frequency: string;
  maxDailyDoses: number | null;
  minHoursBetween: number | null;
}): string {
  if (medication.scheduleType === 'AS_NEEDED') {
    const limits = [
      medication.maxDailyDoses ? `máximo ${medication.maxDailyDoses} al día` : null,
      medication.minHoursBetween ? `al menos ${medication.minHoursBetween} h entre tomas` : null,
    ].filter(Boolean);
    return `según necesidad${limits.length ? ` (${limits.join(', ')})` : ''}`;
  }
  let days = 'todos los días';
  if (medication.scheduleType === 'WEEKDAYS') days = `los ${medication.weekDays.map((day) => WEEKDAYS[day]).join(', ')}`;
  else if (medication.scheduleType === 'INTERVAL' && medication.dayInterval) days = `cada ${medication.dayInterval} días`;
  return `${days} a las ${medication.times.join(', ')}`;
}

export type AiContext = {
  /** Mensaje de sistema con la fecha y, si lo autorizó, su información. */
  text: string;
  /** Si se compartió su información personal de salud. */
  personal: boolean;
  timeZone: string;
};

/**
 * Contexto para el asistente. La fecha y hora actuales siempre (no son datos
 * personales y hacen falta para entender "mañana" o "a las 8"). La salud,
 * medicamentos y citas solo con su consentimiento explícito, y minimizados:
 * sin nombre, correo, teléfono ni fecha de nacimiento (solo la edad).
 */
export async function buildAiContext(prisma: PrismaService, userId: string, now = new Date()): Promise<AiContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      aiHealthContextConsent: true,
      birthDate: true,
      conditions: true,
      allergies: true,
      pregnancy: true,
      lactation: true,
      recentSurgeries: true,
      immunosuppression: true,
      anticoagulantTreatment: true,
    },
  });
  const timeZone = isValidTimeZone(user?.timezone) ? user!.timezone! : 'America/Bogota';
  const lines = [`Fecha y hora actual del usuario: ${formatInZone(now, timeZone)} (zona horaria ${timeZone}).`];

  if (!user?.aiHealthContextConsent) {
    lines.push('El usuario NO autorizó compartir su información de salud, medicamentos ni citas: no la conoces. Si hace falta, pídele los datos o sugiere activar "Personalizar el asistente" en Perfil > Privacidad.');
    return { text: lines.join('\n'), personal: false, timeZone };
  }

  // Hoy en la zona del usuario: una toma es de hoy si estaba programada para
  // hoy o, sin hora programada ("según necesidad"), si se registró hoy.
  const today = zonedParts(now, timeZone);
  const dayStart = zonedToDate(today.year, today.month, today.day, 0, 0, timeZone);
  const tomorrow = zonedParts(new Date(dayStart.getTime() + 36 * 3_600_000), timeZone);
  const dayEnd = zonedToDate(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, timeZone);
  const todayRange = { gte: dayStart, lt: dayEnd };

  const [medications, appointments, todayLogs] = await Promise.all([
    prisma.medication.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_MEDICATIONS,
      select: {
        id: true, name: true, dosage: true, dosageSteps: true, startDate: true, frequency: true, times: true, scheduleType: true,
        weekDays: true, dayInterval: true, maxDailyDoses: true, minHoursBetween: true, customEndDate: true, notes: true,
        stockQuantity: true, stockPerDose: true, stockAlertAt: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        userId,
        active: true,
        attendanceStatus: 'PENDING',
        scheduledAt: { gte: new Date(now.getTime() - 2 * 3_600_000), lte: new Date(now.getTime() + APPOINTMENT_WINDOW_DAYS * 86_400_000) },
      },
      orderBy: { scheduledAt: 'asc' },
      take: MAX_APPOINTMENTS,
      select: { title: true, doctorName: true, scheduledAt: true, location: true, notes: true },
    }),
    prisma.medicationLog.findMany({
      where: {
        medication: { userId, active: true },
        OR: [{ scheduledFor: todayRange }, { scheduledFor: null, takenAt: todayRange }],
      },
      orderBy: { takenAt: 'asc' },
      take: MAX_TODAY_LOGS,
      select: { medicationId: true, action: true, takenAt: true, scheduledFor: true },
    }),
  ]);
  const logsByMedication = new Map<string, typeof todayLogs>();
  for (const log of todayLogs) logsByMedication.set(log.medicationId, [...(logsByMedication.get(log.medicationId) ?? []), log]);

  lines.push('', 'Información que el usuario autorizó compartir (autodeclarada, puede estar incompleta o desactualizada):');
  const age = user.birthDate ? calculateAge(user.birthDate) : null;
  if (age !== null) lines.push(`- Edad: ${age} años.`);
  if (user.conditions && !EMPTY_MEDICAL_VALUES.has(user.conditions.trim().toLowerCase())) lines.push(`- Condiciones de salud: ${user.conditions.trim()}.`);
  if (user.allergies) {
    const allergies = user.allergies.trim();
    lines.push(EMPTY_MEDICAL_VALUES.has(allergies.toLowerCase()) ? '- Alergias: ninguna conocida.' : `- Alergias: ${allergies}.`);
  }
  const special = (Object.keys(SPECIAL_CONDITION_LABELS) as Array<keyof typeof SPECIAL_CONDITION_LABELS>)
    .filter((key) => user[key])
    .map((key) => SPECIAL_CONDITION_LABELS[key]);
  if (special.length) lines.push(`- Situaciones especiales: ${special.join(', ')}.`);

  if (medications.length) {
    lines.push('- Medicamentos activos:');
    for (const medication of medications) {
      const end = medication.customEndDate ? `, hasta el ${formatInZone(medication.customEndDate, timeZone, false)}` : '';
      const changing = medication.dosageSteps ? ' (dosis que cambia por etapas; la indicada es la de hoy)' : '';
      const note = medication.notes ? `. Nota: ${medication.notes.slice(0, 120)}` : '';
      lines.push(`  • ${medication.name}: ${dosageOnDay(medication, now, timeZone)}${changing}, ${scheduleText(medication)}${end}${note}`);
      const stock = stockText(medication, now, timeZone);
      if (stock) lines.push(`    - Existencias: ${stock}.`);
      lines.push(`    - Tomas de hoy: ${todayLogsText(logsByMedication.get(medication.id) ?? [], timeZone)}.`);
    }
  } else {
    lines.push('- No tiene medicamentos registrados en MedicAI.');
  }

  if (appointments.length) {
    lines.push(`- Próximas citas (${APPOINTMENT_WINDOW_DAYS} días):`);
    for (const appointment of appointments) {
      const place = appointment.location ? ` en ${appointment.location}` : '';
      lines.push(`  • ${formatInZone(appointment.scheduledAt, timeZone)}: ${appointment.title} con ${appointment.doctorName}${place}`);
    }
  } else {
    lines.push('- No tiene citas próximas registradas.');
  }

  lines.push(
    'Las existencias y las tomas de hoy son las registradas en MedicAI: si un medicamento no muestra existencias, el usuario no lleva la cuenta en la app.',
    'Usa esta información solo cuando sea relevante (alergias, interacciones, contraindicaciones, horarios, existencias, tomas de hoy, preparar una cita).',
    'No la repites si no hace falta, no asumes diagnósticos que no aparezcan y, ante cualquier duda, remites a un profesional.',
  );
  return { text: lines.join('\n'), personal: true, timeZone };
}

/** "YYYY-MM-DD" de hoy en la zona del usuario (para validar propuestas). */
export function todayKey(timeZone: string, now = new Date()) {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
