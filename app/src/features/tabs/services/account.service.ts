import { ensureApiBaseUrl, parseApiErrorMessage, readResponseBody, requestWithAutoRefresh } from './http';

/** Perfiles a cargo que se borrarían junto con la cuenta. */
export async function fetchDeleteAccountPreview(accessToken: string) {
  ensureApiBaseUrl();
  const response = await requestWithAutoRefresh('/auth/account/delete-preview', 'GET', accessToken);
  if (!response.ok) throw new Error(await parseApiErrorMessage(response, 'No se pudo preparar la eliminación'));
  return readResponseBody<{ dependents: { id: string; fullName: string | null }[] }>(response);
}

export async function deleteAccount(accessToken: string, password: string) {
  ensureApiBaseUrl();
  const response = await requestWithAutoRefresh('/auth/account/delete', 'POST', accessToken, { password });
  if (!response.ok) throw new Error(await parseApiErrorMessage(response, 'No se pudo eliminar la cuenta'));
  return readResponseBody<{ message: string }>(response);
}

export type DeviceSession = {
  id: string;
  deviceName: string | null;
  platform: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
};

export async function fetchSessions(accessToken: string) {
  ensureApiBaseUrl();
  const response = await requestWithAutoRefresh('/auth/sessions', 'GET', accessToken);
  if (!response.ok) throw new Error(await parseApiErrorMessage(response, 'No se pudieron cargar tus dispositivos'));
  return readResponseBody<DeviceSession[]>(response);
}

export async function closeSession(accessToken: string, sessionId: string) {
  ensureApiBaseUrl();
  const response = await requestWithAutoRefresh(`/auth/sessions/${sessionId}`, 'DELETE', accessToken);
  if (!response.ok) throw new Error(await parseApiErrorMessage(response, 'No se pudo cerrar la sesión'));
}

export async function closeOtherSessions(accessToken: string) {
  ensureApiBaseUrl();
  const response = await requestWithAutoRefresh('/auth/sessions/close-others', 'POST', accessToken);
  if (!response.ok) throw new Error(await parseApiErrorMessage(response, 'No se pudieron cerrar las sesiones'));
  return readResponseBody<{ message: string }>(response);
}
