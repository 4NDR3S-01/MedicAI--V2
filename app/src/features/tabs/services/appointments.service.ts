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
  createdAt: string;
  updatedAt: string;
};

type AppointmentAttendanceStatus = 'PENDING' | 'ATTENDED' | 'MISSED';

type CreateAppointmentPayload = {
  title: string;
  doctorName: string;
  scheduledAt: string;
  location?: string;
  notes?: string;
};

type UpdateAppointmentPayload = Partial<CreateAppointmentPayload> & {
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

export async function deleteAppointment(appointmentId: string, accessToken: string, ownerId?: string): Promise<void> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(withOwner(`/appointments/${appointmentId}`, ownerId), 'DELETE', accessToken);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo eliminar la cita'));
  }
}

export async function updateAppointment(
  appointmentId: string,
  accessToken: string,
  payload: UpdateAppointmentPayload,
  ownerId?: string,
): Promise<AppointmentData> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(
    withOwner(`/appointments/${appointmentId}`, ownerId),
    'PUT',
    accessToken,
    payload,
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo actualizar la cita'));
  }

  return readResponseBody<AppointmentData>(response);
}

export type { AppointmentAttendanceStatus, AppointmentData, CreateAppointmentPayload, UpdateAppointmentPayload };
