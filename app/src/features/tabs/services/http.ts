import { NetworkError } from '../../../shared/services/network-error';
import { getStoredSession, refreshStoredSession } from '../../auth';

export { NetworkError };

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

const REQUEST_TIMEOUT_MS = 15_000;
/**
 * Justo después de recuperar (o cambiar) la red, la primera petición suele
 * quedarse colgada en la conexión de la red anterior: se corta pronto y se
 * reintenta, en vez de esperar los 15 s.
 */
const RECONNECT_TIMEOUT_MS = 4_000;
let fastTimeoutUntil = 0;
export function preferShortTimeouts(ms: number): void {
  fastTimeoutUntil = Date.now() + ms;
}
/** El asistente (respuestas de la IA, audios y fotos) tarda más. */
const UPLOAD_TIMEOUT_MS = 45_000;

const SERVER_DOWN_MESSAGE = 'El servidor de MedicAI no está disponible en este momento. Inténtalo en unos minutos.';

export const parseApiErrorMessage = async (response: Response, fallback: string) => {
  // Un 500 genérico de Nest ("Internal server error") o una página del proxy
  // no dicen nada útil; los errores 502/503 del backend sí traen un mensaje claro.
  if (response.status >= 500) {
    try {
      const body = await readResponseBody<{ message?: unknown }>(response);
      if (typeof body.message === 'string' && body.message.trim() && body.message !== 'Internal server error') {
        return body.message;
      }
    } catch {
      // respuesta que no es JSON (p. ej. del proxy)
    }
    return `${SERVER_DOWN_MESSAGE} (error ${response.status})`;
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
  // FormData (p. ej. un audio): fetch pone el Content-Type multipart con su boundary.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  // Con señal muy débil una petición puede quedarse colgada: pasado un tiempo
  // se trata como "sin conexión" (los cambios quedan en cola y se reintentan).
  const controller = new AbortController();
  const entry = { controller, startedAt: Date.now() };
  inFlight.add(entry);
  const slow = isForm || path.startsWith('/ai/');
  const normal = slow ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), Date.now() < fastTimeoutUntil && !slow ? RECONNECT_TIMEOUT_MS : normal);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      signal: controller.signal,
      method,
      headers: isForm
        ? { Authorization: `Bearer ${accessToken}` }
        : { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
    inFlight.delete(entry);
  }
};

/** Peticiones en curso, para poder cortar las que quedaron colgadas. */
const inFlight = new Set<{ controller: AbortController; startedAt: number }>();

/**
 * Al confirmarse que volvió internet, las peticiones que salieron mientras la
 * red cambiaba suelen quedar colgadas hasta su tiempo límite: se cortan (fallan
 * como "sin conexión") para reintentar enseguida por la red buena.
 */
export function abortStalledRequests(olderThanMs = 1500): void {
  const now = Date.now();
  inFlight.forEach((entry) => {
    if (now - entry.startedAt >= olderThanMs) entry.controller.abort();
  });
}

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
