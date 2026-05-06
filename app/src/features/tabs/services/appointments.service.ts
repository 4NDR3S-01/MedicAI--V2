import { refreshStoredSession } from '../../auth';

type AppointmentData = {
  id: string;
  userId: string;
  title: string;
  doctorName: string;
  scheduledAt: string;
  location: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CreateAppointmentPayload = {
  title: string;
  doctorName: string;
  scheduledAt: string;
  location?: string;
  notes?: string;
};

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

const readResponseBody = async <T>(response: Response): Promise<T> => {
  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new Error('Respuesta invalida del backend.');
  }
};

const parseApiErrorMessage = async (response: Response, fallback: string) => {
  if (response.status >= 500) {
    return 'El backend de MedicAI no esta disponible en este momento.';
  }

  try {
    const body = await readResponseBody<{ message?: string | string[]; error?: string }>(response);
    if (Array.isArray(body.message) && body.message.length > 0) {
      return body.message.join('. ');
    }

    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }

    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
  } catch {
    // no-op
  }

  return `${fallback} (HTTP ${response.status})`;
};

const executeAuthorizedRequest = async (
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  accessToken: string,
  body?: unknown,
) => {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con el backend. Verifica que este activo.');
  }
};

const requestWithAutoRefresh = async (
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  accessToken: string,
  body?: unknown,
) => {
  let response = await executeAuthorizedRequest(path, method, accessToken, body);

  if (response.status === 401) {
    const refreshedSession = await refreshStoredSession();
    response = await executeAuthorizedRequest(path, method, refreshedSession.accessToken, body);
  }

  return response;
};

export async function fetchAppointments(accessToken: string): Promise<AppointmentData[]> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh('/appointments', 'GET', accessToken);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudieron cargar las citas'));
  }

  return readResponseBody<AppointmentData[]>(response);
}

export async function createAppointment(
  accessToken: string,
  payload: CreateAppointmentPayload,
): Promise<AppointmentData> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh('/appointments', 'POST', accessToken, payload);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo crear la cita'));
  }

  return readResponseBody<AppointmentData>(response);
}

export async function deleteAppointment(appointmentId: string, accessToken: string): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh(`/appointments/${appointmentId}`, 'DELETE', accessToken);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo eliminar la cita'));
  }
}

export async function updateAppointment(
  appointmentId: string,
  accessToken: string,
  payload: Partial<CreateAppointmentPayload> & { active?: boolean },
): Promise<AppointmentData> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh(
    `/appointments/${appointmentId}`,
    'PUT',
    accessToken,
    payload,
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo actualizar la cita'));
  }

  return readResponseBody<AppointmentData>(response);
}

export type { AppointmentData, CreateAppointmentPayload };
