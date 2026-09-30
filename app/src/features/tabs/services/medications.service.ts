import {
  ensureApiBaseUrl,
  parseApiErrorMessage,
  readResponseBody,
  requestWithAutoRefresh,
} from './http';

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

export async function fetchMedications(accessToken: string): Promise<MedicationData[]> {
  ensureApiBaseUrl();

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
  ensureApiBaseUrl();

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
  ensureApiBaseUrl();

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
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(`/medications/${medicationId}`, 'DELETE', accessToken);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo eliminar el medicamento'));
  }
}

/**
 * Logs de hoy de todos los medicamentos del usuario en una sola petición.
 *
 * Desde el inicio del día local o del día UTC, el que sea anterior: quienes
 * consumen estos logs filtran "hoy" en una u otra referencia.
 */
export async function fetchTodayMedicationLogs(accessToken: string): Promise<MedicationLog[]> {
  ensureApiBaseUrl();

  const localStart = new Date();
  localStart.setHours(0, 0, 0, 0);
  const utcStart = new Date();
  utcStart.setUTCHours(0, 0, 0, 0);
  const since = new Date(Math.min(localStart.getTime(), utcStart.getTime())).toISOString();

  const response = await requestWithAutoRefresh(
    `/medications/logs?since=${encodeURIComponent(since)}`,
    'GET',
    accessToken,
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudieron cargar los registros'));
  }

  return readResponseBody<MedicationLog[]>(response);
}

export async function logMedicationAction(
  medicationId: string,
  accessToken: string,
  action: 'TAKEN' | 'SKIPPED' | 'SNOOZED',
  scheduledFor?: string,
): Promise<void> {
  ensureApiBaseUrl();

  const body: Record<string, unknown> = { action };
  if (scheduledFor) {
    body.scheduledFor = scheduledFor;
  }

  const response = await requestWithAutoRefresh(
    `/medications/${medicationId}/logs`,
    'POST',
    accessToken,
    body,
  );

  if (!response.ok) {
    const errorMsg = await parseApiErrorMessage(response, 'No se pudo registrar la accion');
    throw new Error(errorMsg);
  }
}

export type MedicationLog = {
  id: string;
  medicationId: string;
  action: 'TAKEN' | 'SKIPPED' | 'SNOOZED';
  takenAt: string;
  scheduledFor: string | null;
};

export type { MedicationData, CreateMedicationPayload };
