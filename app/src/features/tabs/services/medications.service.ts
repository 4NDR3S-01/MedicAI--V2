import {
  ensureApiBaseUrl,
  parseApiErrorMessage,
  readResponseBody,
  requestWithAutoRefresh,
  withOwner,
} from './http';

/** Quién agregó/cambió/registró algo (la persona o alguien de su Círculo). */
export type ActorRef = { id: string; fullName: string | null } | null;

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
  /** Última activación: las tomas anteriores no cuentan. */
  activeSince?: string | null;
  createdBy?: ActorRef;
  updatedBy?: ActorRef;
  /** Solo en la app: zona horaria del dueño (si es otra persona del Círculo). */
  timeZone?: string | null;
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

export async function fetchMedications(accessToken: string, ownerId?: string): Promise<MedicationData[]> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(withOwner('/medications', ownerId), 'GET', accessToken);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudieron cargar los medicamentos'));
  }

  return readResponseBody<MedicationData[]>(response);
}

export async function createMedication(
  accessToken: string,
  payload: CreateMedicationPayload,
  ownerId?: string,
): Promise<MedicationData> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(withOwner('/medications', ownerId), 'POST', accessToken, payload);

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo crear el medicamento'));
  }

  return readResponseBody<MedicationData>(response);
}

export async function updateMedication(
  medicationId: string,
  accessToken: string,
  payload: Partial<CreateMedicationPayload> & { active?: boolean },
  ownerId?: string,
): Promise<MedicationData> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(
    withOwner(`/medications/${medicationId}`, ownerId),
    'PUT',
    accessToken,
    payload,
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo actualizar el medicamento'));
  }

  return readResponseBody<MedicationData>(response);
}

export async function deleteMedication(medicationId: string, accessToken: string, ownerId?: string): Promise<void> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(withOwner(`/medications/${medicationId}`, ownerId), 'DELETE', accessToken);

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
export async function fetchTodayMedicationLogs(accessToken: string, ownerId?: string): Promise<MedicationLog[]> {
  ensureApiBaseUrl();

  const localStart = new Date();
  localStart.setHours(0, 0, 0, 0);
  const utcStart = new Date();
  utcStart.setUTCHours(0, 0, 0, 0);
  const since = new Date(Math.min(localStart.getTime(), utcStart.getTime())).toISOString();

  const response = await requestWithAutoRefresh(
    withOwner(`/medications/logs?since=${encodeURIComponent(since)}`, ownerId),
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
  ownerId?: string,
): Promise<MedicationLog> {
  ensureApiBaseUrl();

  const body: Record<string, unknown> = { action };
  if (scheduledFor) {
    body.scheduledFor = scheduledFor;
  }

  const response = await requestWithAutoRefresh(
    withOwner(`/medications/${medicationId}/logs`, ownerId),
    'POST',
    accessToken,
    body,
  );

  if (!response.ok) {
    const errorMsg = await parseApiErrorMessage(response, 'No se pudo registrar la acción');
    throw new Error(errorMsg);
  }

  return readResponseBody<MedicationLog>(response);
}

export async function deleteMedicationLog(
  medicationId: string,
  logId: string,
  accessToken: string,
  ownerId?: string,
): Promise<void> {
  ensureApiBaseUrl();

  const response = await requestWithAutoRefresh(
    withOwner(`/medications/${medicationId}/logs/${logId}`, ownerId),
    'DELETE',
    accessToken,
  );

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo deshacer el registro'));
  }
}

export type MedicationLog = {
  id: string;
  medicationId: string;
  action: 'TAKEN' | 'SKIPPED' | 'SNOOZED';
  takenAt: string;
  scheduledFor: string | null;
  loggedBy?: ActorRef;
  /** Registrada sin conexión: se enviará al servidor cuando vuelva la red. */
  pending?: boolean;
};

export type { MedicationData, CreateMedicationPayload };
