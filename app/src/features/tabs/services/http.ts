import { getStoredSession, refreshStoredSession } from '../../auth';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

export const ensureApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
  }
};

export const readResponseBody = async <T>(response: Response): Promise<T> => {
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

export const parseApiErrorMessage = async (response: Response, fallback: string) => {
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
  method: HttpMethod,
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
    throw new Error('No hemos podido conectar con nuestros servidores. Por favor verifica tu conexión a internet e inténtalo de nuevo en unos momentos.');
  }
};

export const requestWithAutoRefresh = async (
  path: string,
  method: HttpMethod,
  accessToken: string,
  body?: unknown,
) => {
  let response = await executeAuthorizedRequest(path, method, accessToken, body);

  if (response.status === 401) {
    // Quien llama puede tener un token viejo (p. ej. guardado en estado de
    // React) aunque la sesión ya se haya renovado: se reintenta con el token
    // almacenado antes de forzar otra rotación.
    const stored = await getStoredSession();
    if (stored?.accessToken && stored.accessToken !== accessToken) {
      response = await executeAuthorizedRequest(path, method, stored.accessToken, body);
    }

    if (response.status === 401) {
      const refreshed = await refreshStoredSession();
      response = await executeAuthorizedRequest(path, method, refreshed.accessToken, body);
    }
  }

  return response;
};

/** Añade `ownerId` para actuar sobre la información de otra persona del Círculo. */
export const withOwner = (path: string, ownerId?: string | null): string =>
  ownerId ? `${path}${path.includes('?') ? '&' : '?'}ownerId=${encodeURIComponent(ownerId)}` : path;
