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
