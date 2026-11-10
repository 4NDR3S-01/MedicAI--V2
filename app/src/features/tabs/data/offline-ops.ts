/**
 * Cambios hechos sin conexión (o aún sin confirmar por el servidor) sobre los
 * datos propios: medicamentos y citas. Lógica pura (sin red ni almacenamiento)
 * para poder probarla: la vista que se muestra es siempre
 *
 *     replay(últimos datos del servidor, cola de cambios pendientes)
 *
 * así un cambio pendiente nunca "desaparece" cuando llegan datos del servidor
 * que todavía no lo conocen, y deshacer un cambio rechazado es quitarlo de la cola.
 */
import type {
  AppointmentData,
  CreateAppointmentPayload,
  SeriesScope,
  UpdateAppointmentPayload,
} from '../services/appointments.service';
import type { CreateMedicationPayload, MedicationData } from '../services/medications.service';

export type MedicationPatch = Partial<CreateMedicationPayload> & { active?: boolean };

export type OfflineOp =
  | { id: string; at: string; kind: 'medCreate'; tempId: string; payload: CreateMedicationPayload }
  | { id: string; at: string; kind: 'medUpdate'; medicationId: string; patch: MedicationPatch }
  | { id: string; at: string; kind: 'medDelete'; medicationId: string }
  | { id: string; at: string; kind: 'apptCreate'; tempId: string; payload: Omit<CreateAppointmentPayload, 'repeat'> }
  | { id: string; at: string; kind: 'apptUpdate'; appointmentId: string; patch: UpdateAppointmentPayload; scope?: SeriesScope }
  | { id: string; at: string; kind: 'apptDelete'; appointmentId: string; scope?: SeriesScope };

export type OwnData = { medications: MedicationData[]; appointments: AppointmentData[] };

/** Identificador provisional de algo creado sin conexión (el servidor dará el real). */
export const TEMP_ID_PREFIX = 'local-';
export const isTempId = (id: string | null | undefined): boolean => Boolean(id?.startsWith(TEMP_ID_PREFIX));
export const newTempId = () => `${TEMP_ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const newOpId = () => `op-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Id de la entidad sobre la que actúa un cambio. */
export function targetId(op: OfflineOp): string {
  switch (op.kind) {
    case 'medCreate':
    case 'apptCreate':
      return op.tempId;
    case 'medUpdate':
    case 'medDelete':
      return op.medicationId;
    default:
      return op.appointmentId;
  }
}

const isMedOp = (op: OfflineOp) => op.kind.startsWith('med');

function applyMedication(list: MedicationData[], op: OfflineOp): MedicationData[] {
  switch (op.kind) {
    case 'medCreate': {
      if (list.some((item) => item.id === op.tempId)) return list;
      const { payload } = op;
      const created: MedicationData = {
        ...payload,
        id: op.tempId,
        userId: '',
        notes: payload.notes ?? null,
        firstDoseTime: payload.firstDoseTime ?? null,
        active: true,
        activeSince: op.at,
        createdAt: op.at,
        updatedAt: op.at,
        pendingSync: true,
      };
      return [created, ...list];
    }
    case 'medUpdate':
      return list.map((item) => {
        if (item.id !== op.medicationId) return item;
        const reactivated = op.patch.active === true && !item.active;
        return {
          ...item,
          ...op.patch,
          notes: op.patch.notes !== undefined ? op.patch.notes || null : item.notes,
          // Como el servidor: al reactivar, las tomas anteriores ya no cuentan.
          activeSince: reactivated ? op.at : item.activeSince,
          updatedAt: op.at,
          pendingSync: true,
        };
      });
    case 'medDelete':
      return list.filter((item) => item.id !== op.medicationId);
    default:
      return list;
  }
}

function applyAppointment(list: AppointmentData[], op: OfflineOp): AppointmentData[] {
  switch (op.kind) {
    case 'apptCreate': {
      if (list.some((item) => item.id === op.tempId)) return list;
      const { payload } = op;
      const created: AppointmentData = {
        id: op.tempId,
        userId: '',
        title: payload.title,
        doctorName: payload.doctorName,
        scheduledAt: payload.scheduledAt,
        location: payload.location ?? null,
        notes: payload.notes ?? null,
        active: true,
        attendanceStatus: 'PENDING',
        attendanceMarkedAt: null,
        createdAt: op.at,
        updatedAt: op.at,
        pendingSync: true,
      };
      return [...list, created].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    }
    case 'apptUpdate': {
      const target = list.find((item) => item.id === op.appointmentId);
      if (!target) return list;
      const following = op.scope === 'FOLLOWING' && target.seriesId;
      // En "esta y las siguientes" la fecha de cada repetición la recalcula el servidor:
      // localmente solo se copian los demás campos.
      const { scheduledAt, ...shared } = op.patch;
      const attendance = op.patch.attendanceStatus;
      return list.map((item) => {
        const isTarget = item.id === op.appointmentId;
        const inSeries = Boolean(following) && item.seriesId === target.seriesId && item.scheduledAt >= target.scheduledAt;
        if (!isTarget && !inSeries) return item;
        return {
          ...item,
          ...(isTarget ? op.patch : shared),
          scheduledAt: isTarget && scheduledAt ? scheduledAt : item.scheduledAt,
          location: op.patch.location !== undefined ? op.patch.location || null : item.location,
          notes: op.patch.notes !== undefined ? op.patch.notes || null : item.notes,
          attendanceMarkedAt:
            attendance === undefined ? item.attendanceMarkedAt : attendance === 'PENDING' ? null : op.at,
          updatedAt: op.at,
          pendingSync: true,
        };
      });
    }
    case 'apptDelete': {
      const target = list.find((item) => item.id === op.appointmentId);
      if (!target) return list;
      if (op.scope === 'FOLLOWING' && target.seriesId) {
        return list.filter((item) => !(item.seriesId === target.seriesId && item.scheduledAt >= target.scheduledAt));
      }
      return list.filter((item) => item.id !== op.appointmentId);
    }
    default:
      return list;
  }
}

export function applyOp(data: OwnData, op: OfflineOp): OwnData {
  return isMedOp(op)
    ? { ...data, medications: applyMedication(data.medications, op) }
    : { ...data, appointments: applyAppointment(data.appointments, op) };
}

/** Lo que se muestra: los datos del servidor con los cambios pendientes encima, en orden. */
export function replay(base: OwnData, queue: OfflineOp[]): OwnData {
  return queue.reduce(applyOp, base);
}

/**
 * Añade un cambio a la cola. Borrar algo que solo existe en el teléfono
 * (creado sin conexión y aún no enviado) no necesita al servidor: se quitan
 * su creación y sus cambios, y no se añade nada.
 */
export function enqueueOp(queue: OfflineOp[], op: OfflineOp): OfflineOp[] {
  if ((op.kind === 'medDelete' || op.kind === 'apptDelete') && isTempId(targetId(op))) {
    const id = targetId(op);
    return queue.filter((queued) => targetId(queued) !== id);
  }
  return [...queue, op];
}

/** El servidor creó la entidad: los cambios que esperaban usan ya su id real. */
export function remapTempId(queue: OfflineOp[], tempId: string, realId: string): OfflineOp[] {
  return queue.map((op) => {
    if (op.kind === 'medUpdate' || op.kind === 'medDelete') {
      return op.medicationId === tempId ? { ...op, medicationId: realId } : op;
    }
    if (op.kind === 'apptUpdate' || op.kind === 'apptDelete') {
      return op.appointmentId === tempId ? { ...op, appointmentId: realId } : op;
    }
    return op;
  });
}
