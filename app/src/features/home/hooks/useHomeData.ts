import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { appStorage } from '../../../shared/storage';
import { onDoseAction } from '../../../shared/services/dose-refresh-bus';
import { getStoredSession } from '../../auth';
import { fetchAppointments, type AppointmentData } from '../../tabs/services/appointments.service';
import { pendingDoseLogs } from '../../tabs/services/dose-queue';
import {
  fetchMedications,
  fetchTodayMedicationLogs,
  type MedicationData,
  type MedicationLog,
} from '../../tabs/services/medications.service';
import { bucketAppointments, getAppointmentState } from '../../tabs/utils/appointment-status';
import { getTodayDoseSlots, type DoseSlot } from '../../tabs/utils/dose-status';
import { isLowStock } from '../../tabs/utils/medication-form';
import { isAsNeeded } from '../../../shared/services/dose-schedule';

// Mismas cachés que Medicamentos y Citas: el inicio se ve al instante.
const MEDICATIONS_CACHE = 'medicai_medications_cache_v2';
const APPOINTMENTS_CACHE = 'medicai_appointments_cache_v1';
const CLOCK_TICK_MS = 30_000;

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export type TodayDose = { medication: MedicationData; slot: DoseSlot };

/**
 * Resumen del día para la pantalla de inicio: tomas de hoy (con su estado),
 * la toma más relevante ahora, próximas citas y lo que requiere atención.
 */
export function useHomeData() {
  const [medications, setMedications] = useState<MedicationData[]>([]);
  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [now, setNow] = useState(() => new Date());
  const loaded = useRef(false);

  const load = useCallback(async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) return;
    const [meds, dayLogs, pending, appts] = await Promise.allSettled([
      fetchMedications(session.accessToken),
      fetchTodayMedicationLogs(session.accessToken),
      pendingDoseLogs(),
      fetchAppointments(session.accessToken),
    ]);
    if (meds.status === 'fulfilled') setMedications(meds.value ?? []);
    if (dayLogs.status === 'fulfilled') {
      setLogs([...(pending.status === 'fulfilled' ? pending.value : []), ...(dayLogs.value ?? [])]);
    }
    if (appts.status === 'fulfilled') setAppointments(appts.value ?? []);
    setNow(new Date());
    if (meds.status === 'fulfilled' || appts.status === 'fulfilled') {
      loaded.current = true;
      setStatus('ready');
    } else if (!loaded.current) {
      setStatus('error');
    }
  }, []);

  // Primero la caché (sin esqueleto si ya se abrió la app antes), luego el servidor.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rawMeds, rawAppts] = await Promise.all([appStorage.getItem(MEDICATIONS_CACHE), appStorage.getItem(APPOINTMENTS_CACHE)]);
        const medsCache = rawMeds ? (JSON.parse(rawMeds) as { day: string; medications: MedicationData[]; logs: MedicationLog[] }) : null;
        const apptsCache = rawAppts ? (JSON.parse(rawAppts) as AppointmentData[]) : null;
        if (!cancelled && (medsCache?.medications || Array.isArray(apptsCache))) {
          if (medsCache?.medications) {
            setMedications(medsCache.medications);
            setLogs(medsCache.day === dayKey(new Date()) ? medsCache.logs ?? [] : []);
          }
          if (Array.isArray(apptsCache)) setAppointments(apptsCache);
          loaded.current = true;
          setStatus('ready');
        }
      } catch {
        // caché dañada: se ignora
      }
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Reloj (estados "es la hora" / "sin registrar"), volver a la app y acciones desde alarmas.
  useEffect(() => {
    let lastDay = dayKey(new Date());
    const timer = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (dayKey(current) !== lastDay) {
        lastDay = dayKey(current);
        setLogs([]);
        void load();
      }
    }, CLOCK_TICK_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    const unsubscribe = onDoseAction(() => void load());
    return () => {
      clearInterval(timer);
      appState.remove();
      unsubscribe();
    };
  }, [load]);

  const summary = useMemo(() => {
    const active = medications.filter((medication) => medication.active);
    const doses: TodayDose[] = active
      .filter((medication) => !isAsNeeded(medication))
      .flatMap((medication) => getTodayDoseSlots(medication, logs, now).map((slot) => ({ medication, slot })))
      .sort((a, b) => a.slot.at.getTime() - b.slot.at.getTime());
    const taken = doses.filter(({ slot }) => slot.state === 'taken').length;
    const skipped = doses.filter(({ slot }) => slot.state === 'skipped').length;
    const missed = doses.filter(({ slot }) => slot.state === 'missed');
    const due = doses.filter(({ slot }) => slot.state === 'due');
    const upcoming = doses.filter(({ slot }) => slot.state === 'upcoming');
    // Lo más urgente primero: es la hora, luego olvidadas, luego la próxima.
    const focus = due[0] ?? missed[missed.length - 1] ?? upcoming[0] ?? null;

    const buckets = bucketAppointments(appointments.filter((appointment) => appointment.active !== false), now);
    const awaiting = appointments.filter((appointment) => appointment.active !== false && getAppointmentState(appointment, now) === 'awaiting');

    return {
      hasMedications: active.length > 0,
      doses,
      taken,
      handled: taken + skipped,
      missedCount: missed.length,
      focus,
      nextAppointment: buckets.upcoming[0] ?? null,
      upcomingAppointments: buckets.upcoming.length,
      awaiting,
      lowStock: active.filter(isLowStock),
    };
  }, [medications, logs, appointments, now]);

  return { status, now, medications, setMedications, logs, setLogs, appointments, summary, load };
}
