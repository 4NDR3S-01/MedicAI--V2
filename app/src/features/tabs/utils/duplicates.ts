import type { AppointmentData } from '../services/appointments.service';
import type { MedicationData } from '../services/medications.service';
import { scheduleLabel } from './medication-form';

/** "Ibuprofeno 400" ≈ "ibuprofeno"; sin tildes ni mayúsculas. */
const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Sin la dosis escrita en el nombre: "Ibuprofeno 400 mg" → "ibuprofeno". */
const baseName = (value: string) =>
  normalize(value)
    .replace(/\b\d+([.,]\d+)?\s*(mg|g|mcg|ml|ui|%)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Medicamento activo con el mismo nombre (sin contar la dosis escrita en él):
 * agregarlo otra vez haría sonar dos alarmas por la misma toma. "Vitamina C" y
 * "Vitamina D" son distintos; "Ibuprofeno" e "Ibuprofeno 400 mg", no.
 */
export function findDuplicateMedication(name: string, existing: MedicationData[], ignoreId?: string): MedicationData | null {
  const target = baseName(name);
  if (!target) return null;
  return existing.find((medication) => medication.id !== ignoreId && medication.active && baseName(medication.name) === target) ?? null;
}

export const describeMedication = (medication: MedicationData) =>
  `${medication.name} (${medication.dosage}, ${scheduleLabel(medication).toLowerCase()})`;

/** Cita activa el mismo día, a menos de 1 h y con el mismo profesional o motivo. */
export function findDuplicateAppointment(
  scheduledAt: Date,
  doctorName: string,
  title: string,
  existing: AppointmentData[],
  ignoreId?: string,
): AppointmentData | null {
  const doctor = normalize(doctorName);
  const reason = normalize(title);
  return (
    existing.find((appointment) => {
      if (appointment.id === ignoreId || appointment.active === false) return false;
      const at = new Date(appointment.scheduledAt).getTime();
      if (Number.isNaN(at) || Math.abs(at - scheduledAt.getTime()) > 60 * 60_000) return false;
      return normalize(appointment.doctorName) === doctor || normalize(appointment.title) === reason;
    }) ?? null
  );
}
