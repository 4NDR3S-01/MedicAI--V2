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

export async function fetchMedications(accessToken: string): Promise<MedicationData[]> {
  if (!API_BASE_URL) {
    throw new Error('API base URL not configured');
  }

  const response = await fetch(`${API_BASE_URL}/medications`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error fetching medications');
  }

  return response.json();
}

export async function createMedication(
  accessToken: string,
  payload: CreateMedicationPayload,
): Promise<MedicationData> {
  if (!API_BASE_URL) {
    throw new Error('API base URL not configured');
  }

  const response = await fetch(`${API_BASE_URL}/medications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error creating medication');
  }

  return response.json();
}

export async function updateMedication(
  medicationId: string,
  accessToken: string,
  payload: Partial<CreateMedicationPayload>,
): Promise<MedicationData> {
  if (!API_BASE_URL) {
    throw new Error('API base URL not configured');
  }

  const response = await fetch(`${API_BASE_URL}/medications/${medicationId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error updating medication');
  }

  return response.json();
}

export async function deleteMedication(medicationId: string, accessToken: string): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('API base URL not configured');
  }

  const response = await fetch(`${API_BASE_URL}/medications/${medicationId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Error deleting medication');
  }
}

export type { MedicationData, CreateMedicationPayload };
