import { getStoredSession } from '../../auth';
import {
  rescheduleAppointmentsAfterLaunch,
  syncMedicationAlarms,
} from '../../../shared/services/notifications.service';
import { getHandledDoseKeys, getTodayDoseSlots } from '../utils/dose-status';
import { fetchAppointments } from './appointments.service';
import { fetchMedications, fetchTodayMedicationLogs } from './medications.service';

/**
 * Pone al día las alarmas y recordatorios de ESTE teléfono con lo que hay en
 * el servidor. Necesario porque alguien del Círculo puede haber cambiado los
 * medicamentos o las citas desde su propio teléfono. Es barato si nada cambió
 * (las alarmas se comparan por firma).
 */
export async function syncOwnReminders(): Promise<void> {
  const session = await getStoredSession();
  if (!session?.accessToken) return;

  const [medications, logs, appointments] = await Promise.allSettled([
    fetchMedications(session.accessToken),
    fetchTodayMedicationLogs(session.accessToken),
    fetchAppointments(session.accessToken),
  ]);

  if (medications.status === 'fulfilled') {
    const now = new Date();
    const dayLogs = logs.status === 'fulfilled' ? logs.value ?? [] : [];
    const handled = new Set<string>();
    for (const medication of medications.value ?? []) {
      getHandledDoseKeys(getTodayDoseSlots(medication, dayLogs, now), now).forEach((key) => handled.add(key));
    }
    await syncMedicationAlarms(medications.value ?? [], { handledDoseKeys: handled }).catch(() => undefined);
  }

  if (appointments.status === 'fulfilled') {
    await rescheduleAppointmentsAfterLaunch(appointments.value ?? []).catch(() => undefined);
  }
}
