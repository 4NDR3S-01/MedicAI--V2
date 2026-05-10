import { refreshStoredSession } from '../../auth';

type MedicationData = {
  id: string;
  userId: string;
  name: string;
  dosage: string;
  frequency: string;
  firstDoseTime?: string | null;
  times: string[];
  notes: string | null;
  customIntervalHours?: number | null;
  customEndDate?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CreateMedicationPayload = {
  name: string;
  dosage: string;
  frequency: string;
  firstDoseTime?: string;
  times: string[];
  notes?: string;
  customIntervalHours?: number | null;
  customEndDate?: string | null;
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

export async function fetchMedications(accessToken: string): Promise<MedicationData[]> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh('/medications', 'GET', accessToken);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudieron cargar los medicamentos'));
  }

  return readResponseBody<MedicationData[]>(response);
}

export async function createMedication(
  accessToken: string,
  payload: CreateMedicationPayload,
): Promise<MedicationData> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh('/medications', 'POST', accessToken, payload);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo crear el medicamento'));
  }

  return readResponseBody<MedicationData>(response);
}

export async function updateMedication(
  medicationId: string,
  accessToken: string,
  payload: Partial<CreateMedicationPayload> & { active?: boolean },
): Promise<MedicationData> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh(
    `/medications/${medicationId}`,
    'PUT',
    accessToken,
    payload,
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo actualizar el medicamento'));
  }

  return readResponseBody<MedicationData>(response);
}

export async function deleteMedication(medicationId: string, accessToken: string): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh(`/medications/${medicationId}`, 'DELETE', accessToken);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo eliminar el medicamento'));
  }
}

export async function logMedicationAction(
  medicationId: string,
  accessToken: string,
  action: 'TAKEN' | 'SKIPPED' | 'SNOOZED',
): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  const response = await requestWithAutoRefresh(
    `/medications/${medicationId}/logs`,
    'POST',
    accessToken,
    { action },
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo registrar la accion'));
  }
}

export type { MedicationData, CreateMedicationPayload };
