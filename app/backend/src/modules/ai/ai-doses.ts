import { doseDatesBetween, dosageOnDay, isValidTimeZone, zonedParts, zonedToDate } from '../../common/dose-schedule';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Una toma que el asistente propone registrar ("ya me tomé la metformina"). */
export type DoseProposal = {
  kind: 'dose';
  medicationId: string;
  medicationName: string;
  dosage: string;
  /** Instante programado de la toma, o null si es "según necesidad". */
  scheduledFor: string | null;
  /** Hora de la toma ("20:00") en la zona del usuario, o null. */
  time: string | null;
};

/** Se puede registrar una toma hasta 60 min antes de su hora (igual que en la app). */
const EARLY_WINDOW_MS = 60 * 60_000;

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * "Ya me tomé la metformina" → la toma de hoy de ese medicamento que toca
 * registrar: la que es la hora o la más reciente sin registrar. Null si no hay
 * ninguna (o el nombre no coincide con un único medicamento).
 */
export async function resolveDoseProposal(
  prisma: PrismaService,
  userId: string,
  medicationName: string,
  now = new Date(),
): Promise<DoseProposal | null> {
  const wanted = normalize(medicationName);
  if (!wanted) return null;

  const [user, medications] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.medication.findMany({
      where: { userId, active: true },
      select: {
        id: true, name: true, dosage: true, dosageSteps: true, startDate: true, times: true, active: true,
        activeSince: true, createdAt: true, customEndDate: true, scheduleType: true, weekDays: true, dayInterval: true,
      },
    }),
  ]);
  const timeZone = isValidTimeZone(user?.timezone) ? user!.timezone! : 'America/Bogota';

  // Coincidencia exacta primero; si no, la única que contenga lo dicho (o al revés).
  const exact = medications.filter((medication) => normalize(medication.name) === wanted);
  const partial = medications.filter((medication) => {
    const name = normalize(medication.name);
    return name.includes(wanted) || wanted.includes(name.split(' ')[0]);
  });
  const candidates = exact.length ? exact : partial;
  if (candidates.length !== 1) return null;
  const medication = candidates[0];

  const clock = (date: Date) => {
    const p = zonedParts(date, timeZone);
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  };

  if (medication.scheduleType === 'AS_NEEDED') {
    return {
      kind: 'dose',
      medicationId: medication.id,
      medicationName: medication.name,
      dosage: medication.dosage,
      scheduledFor: null,
      time: null,
    };
  }

  const today = zonedParts(now, timeZone);
  const dayStart = zonedToDate(today.year, today.month, today.day, 0, 0, timeZone);
  const doses = doseDatesBetween(medication, dayStart, new Date(now.getTime() + EARLY_WINDOW_MS), timeZone);
  if (!doses.length) return null;
  const logs = await prisma.medicationLog.findMany({
    where: { medicationId: medication.id, scheduledFor: { gte: dayStart }, action: { in: ['TAKEN', 'SKIPPED'] } },
    select: { scheduledFor: true },
  });
  const handled = new Set(logs.map((log) => Math.floor(log.scheduledFor!.getTime() / 60_000)));
  const pending = doses.filter((dose) => !handled.has(Math.floor(dose.getTime() / 60_000)));
  if (!pending.length) return null;
  // La más cercana a ahora: la de esta hora, o la última que pasó sin registrar.
  const dose = pending.reduce((best, current) =>
    Math.abs(current.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime()) ? current : best);

  return {
    kind: 'dose',
    medicationId: medication.id,
    medicationName: medication.name,
    dosage: dosageOnDay(medication, dose, timeZone),
    scheduledFor: dose.toISOString(),
    time: clock(dose),
  };
}
