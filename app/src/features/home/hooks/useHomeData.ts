import { useCallback, useEffect, useMemo, useState } from 'react';

import { refreshOwnData, useOwnData } from '../../tabs/data/own-data-store';
import type { MedicationData } from '../../tabs/services/medications.service';
import { bucketAppointments, getAppointmentState } from '../../tabs/utils/appointment-status';
import { getTodayDoseSlots, type DoseSlot } from '../../tabs/utils/dose-status';
import { isLowStock } from '../../tabs/utils/medication-form';
import { isAsNeeded } from '../../../shared/services/dose-schedule';

const CLOCK_TICK_MS = 30_000;

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export type TodayDose = { medication: MedicationData; slot: DoseSlot };

/**
 * Resumen del día para la pantalla de inicio: tomas de hoy (con su estado),
 * la toma más relevante ahora, próximas citas y lo que requiere atención.
 */
export function useHomeData() {
  // Los mismos datos que Medicinas y Citas (guardados en el teléfono): se ven al instante.
  const own = useOwnData();
  const { medications, logs, appointments } = own;
  const status: 'loading' | 'ready' | 'error' = own.hasData ? 'ready' : own.loadError ? 'error' : 'loading';
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => refreshOwnData({ force: true }), []);

  // Reloj: estados "es la hora" / "sin registrar" y cambio de día.
  useEffect(() => {
    let lastDay = dayKey(new Date());
    const timer = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (dayKey(current) !== lastDay) {
        lastDay = dayKey(current);
        void refreshOwnData({ force: true });
      }
    }, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

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

  return { status, now, medications, logs, appointments, summary, load };
}
