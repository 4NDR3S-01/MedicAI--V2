import {
  ensureApiBaseUrl,
  parseApiErrorMessage,
  readResponseBody,
  requestWithAutoRefresh,
  withOwner,
} from './http';

type AppointmentData = {
  id: string;
  userId: string;
  title: string;
  doctorName: string;
  scheduledAt: string;
  location: string | null;
  notes: string | null;
  active: boolean;
  attendanceStatus: AppointmentAttendanceStatus;
  attendanceMarkedAt: string | null;
  createdBy?: { id: string; fullName: string | null } | null;
  updatedBy?: { id: string; fullName: string | null } | null;
  /** Cita de una serie que se repite (cada repetición es una cita propia). */
  seriesId?: string | null;
  repeatRule?: RepeatRule | null;
  /** Solo en la respuesta de crear: cuántas citas se crearon. */
  seriesCount?: number;
  /** Solo en la respuesta de editar "esta y las siguientes". */
  seriesUpdated?: number;
  createdAt: string;
  updatedAt: string;
};

type RepeatFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type RepeatRule = { frequency: RepeatFrequency; interval: number; weekDays: number[] | null };
type RepeatPayload = {
  frequency: RepeatFrequency;
  interval?: number;
  weekDays?: number[];
  /** Último día (incluido), "YYYY-MM-DD". */
  until?: string;
  count?: number;
};
/** En una serie: solo esta cita, o esta y las siguientes. */
type SeriesScope = 'ONE' | 'FOLLOWING';

const withScope = (path: string, scope?: SeriesScope) =>
  scope ? `${path}${path.includes('?') ? '&' : '?'}scope=${scope}` : path;

type AppointmentAttendanceStatus = 'PENDING' | 'ATTENDED' | 'MISSED';

type CreateAppointmentPayload = {
  title: string;
  doctorName: string;
  scheduledAt: string;
  location?: string;
  notes?: string;
  repeat?: RepeatPayload;
};

type UpdateAppointmentPayload = Partial<Omit<CreateAppointmentPayload, 'repeat'>> & {
  active?: boolean;
  attendanceStatus?: AppointmentAttendanceStatus;
};

export async function fetchAppointments(accessToken: string, ownerId?: string): Promise<AppointmentData[]> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(withOwner('/appointments', ownerId), 'GET', accessToken);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudieron cargar las citas'));
  }

  return readResponseBody<AppointmentData[]>(response);
}

export async function createAppointment(
  accessToken: string,
  payload: CreateAppointmentPayload,
  ownerId?: string,
): Promise<AppointmentData> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(withOwner('/appointments', ownerId), 'POST', accessToken, payload);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo crear la cita'));
  }

  return readResponseBody<AppointmentData>(response);
}

export async function deleteAppointment(
  appointmentId: string,
  accessToken: string,
  ownerId?: string,
  scope?: SeriesScope,
): Promise<void> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(
    withScope(withOwner(`/appointments/${appointmentId}`, ownerId), scope),
    'DELETE',
    accessToken,
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo eliminar la cita'));
  }
}

export async function updateAppointment(
  appointmentId: string,
  accessToken: string,
  payload: UpdateAppointmentPayload,
  ownerId?: string,
  scope?: SeriesScope,
): Promise<AppointmentData> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(
    withScope(withOwner(`/appointments/${appointmentId}`, ownerId), scope),
    'PUT',
    accessToken,
    payload,
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo actualizar la cita'));
  }

  return readResponseBody<AppointmentData>(response);
}

export type {
  AppointmentAttendanceStatus,
  AppointmentData,
  CreateAppointmentPayload,
  RepeatFrequency,
  RepeatPayload,
  RepeatRule,
  SeriesScope,
  UpdateAppointmentPayload,
};
