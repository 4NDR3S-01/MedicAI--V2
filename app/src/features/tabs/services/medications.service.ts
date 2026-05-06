type MedicationData = {
  id: string;
  userId: string;
  name: string;
  dosage: string;
  frequency: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CreateMedicationPayload = {
  name: string;
  dosage: string;
  frequency: string;
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

export async function fetchMedications(accessToken: string): Promise<MedicationData[]> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/medications`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    throw new Error('No se pudo conectar con el backend. Verifica que este activo.');
  }

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

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/medications`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('No se pudo conectar con el backend. Verifica que este activo.');
  }

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo crear el medicamento'));
  }

  return readResponseBody<MedicationData>(response);
}

export async function updateMedication(
  medicationId: string,
  accessToken: string,
  payload: Partial<CreateMedicationPayload>,
): Promise<MedicationData> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/medications/${medicationId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('No se pudo conectar con el backend. Verifica que este activo.');
  }

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo actualizar el medicamento'));
  }

  return readResponseBody<MedicationData>(response);
}

export async function deleteMedication(medicationId: string, accessToken: string): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/medications/${medicationId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch {
    throw new Error('No se pudo conectar con el backend. Verifica que este activo.');
  }

  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No se pudo eliminar el medicamento'));
  }
}

export type { MedicationData, CreateMedicationPayload };
