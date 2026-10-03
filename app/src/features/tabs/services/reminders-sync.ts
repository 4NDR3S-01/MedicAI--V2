import { getStoredSession } from '../../auth';
import * as circleAPI from '../../circle/services/circle.service';
import {
  cancelDoseAlarm,
  rescheduleAppointmentsAfterLaunch,
  setCareAlarmPlan,
  syncCareAppointmentReminders,
  syncMedicationAlarms,
  type CareAppointmentInput,
  type MedicationScheduleInput,
} from '../../../shared/services/notifications.service';
import { getHandledDoseKeys, getTodayDoseSlots } from '../utils/dose-status';
import { fetchAppointments } from './appointments.service';
import { fetchMedications, fetchTodayMedicationLogs } from './medications.service';

const firstName = (person: { fullName: string | null; email: string }) =>
  (person.fullName?.trim() || person.email.split('@')[0]).split(/\s+/)[0];

/**
 * Recordatorios de las personas que cuido: guarda sus medicamentos en el plan
 * de alarmas (lo programa syncMedicationAlarms junto a los míos) y sincroniza
 * los avisos de sus citas. Si el Círculo no carga, se conserva lo anterior.
 */
async function syncCareReminders(accessToken: string): Promise<void> {
  let overview: circleAPI.CircleOverview;
  let careData: circleAPI.CareData[];
  try {
    // Dos peticiones en total, sin importar cuántas personas cuides.
    [overview, careData] = await Promise.all([circleAPI.fetchCircle(accessToken), circleAPI.fetchCareData(accessToken)]);
  } catch {
    return;
  }

  const now = new Date();
  const items: MedicationScheduleInput[] = [];
  const handled = new Set<string>();
  const appointments: CareAppointmentInput[] = [];
  const loggedFutureDoses: { medicationId: string; at: Date }[] = [];
  const dataByOwner = new Map(careData.map((entry) => [entry.ownerId, entry]));

  for (const member of overview.members) {
    if (member.reminders === 'OFF') continue;
    const data = dataByOwner.get(member.person.id);
    if (!data) continue;
    const ownerId = member.person.id;
    const ownerName = firstName(member.person);
    const careMode = member.reminders === 'ALARM' ? 'ALARM' : 'NOTIFY';

    for (const raw of data.medications ?? []) {
      // Las alarmas suenan cuando son sus 08:00, aunque este teléfono esté en otra zona.
      const medication = { ...raw, timeZone: member.person.timezone };
      items.push({ ...medication, ownerId, ownerName, careMode });
      const slots = getTodayDoseSlots(medication, data.logs ?? [], now);
      getHandledDoseKeys(slots, now).forEach((key) => handled.add(key));
      slots
        .filter((slot) => slot.log && slot.at.getTime() > now.getTime())
        .forEach((slot) => loggedFutureDoses.push({ medicationId: medication.id, at: slot.at }));
    }
    for (const appointment of data.appointments ?? []) appointments.push({ ...appointment, ownerId, ownerName });
  }

  await setCareAlarmPlan(items, handled);
  // Una toma que otro cuidador ya registró no debe sonar en este teléfono.
  await Promise.all(loggedFutureDoses.map(({ medicationId, at }) => cancelDoseAlarm(medicationId, at).catch(() => undefined)));
  await syncCareAppointmentReminders(appointments).catch(() => undefined);
}

/**
 * Pone al día las alarmas y recordatorios de ESTE teléfono: los propios y los
 * de las personas del Círculo de las que recibo recordatorios. Necesario
 * porque cualquiera del Círculo puede cambiar medicamentos o citas desde su
 * teléfono. Es barato si nada cambió (el plan se compara por firma).
 */
const MIN_SYNC_INTERVAL_MS = 2 * 60_000;
let lastSyncAt = 0;
let syncInFlight: Promise<void> | null = null;

export async function syncOwnReminders(options: { force?: boolean } = {}): Promise<void> {
  // Volver a la app muchas veces seguidas no debe disparar decenas de
  // peticiones: sin `force`, como mucho una vez cada 2 minutos.
  if (!options.force && (syncInFlight || Date.now() - lastSyncAt < MIN_SYNC_INTERVAL_MS)) return syncInFlight ?? undefined;
  lastSyncAt = Date.now();
  syncInFlight = runSync(options).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function runSync(options: { force?: boolean }): Promise<void> {
  const session = await getStoredSession();
  if (!session?.accessToken) return;

  const [medications, logs, appointments] = await Promise.allSettled([
    fetchMedications(session.accessToken),
    fetchTodayMedicationLogs(session.accessToken),
    fetchAppointments(session.accessToken),
    syncCareReminders(session.accessToken),
  ]);

  if (medications.status === 'fulfilled') {
    const now = new Date();
    const dayLogs = logs.status === 'fulfilled' ? logs.value ?? [] : [];
    const handled = new Set<string>();
    for (const medication of medications.value ?? []) {
      getHandledDoseKeys(getTodayDoseSlots(medication, dayLogs, now), now).forEach((key) => handled.add(key));
    }
    await syncMedicationAlarms(medications.value ?? [], { handledDoseKeys: handled, force: options.force }).catch(() => undefined);
  }

  if (appointments.status === 'fulfilled') {
    await rescheduleAppointmentsAfterLaunch(appointments.value ?? []).catch(() => undefined);
  }
}
