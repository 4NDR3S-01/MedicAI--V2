import { appStorage } from '../../../services';

import type { RegisterWizardPayload } from '../models/register.types';
import { mapAuthError } from './authErrors';

const AUTH_SESSION_KEY = 'medicai_auth_session_v1';

export type AppAuthSession = {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
  };
  accessToken: string;
  refreshToken: string;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const ensureApiConfigured = () => {
  if (!API_BASE_URL) {
    throw new Error('Falta configurar EXPO_PUBLIC_API_BASE_URL en variables de entorno.');
  }
  
  // Validar HTTPS en producción
  if (process.env.NODE_ENV === 'production' && !API_BASE_URL.startsWith('https://')) {
    throw new Error('API_BASE_URL debe usar HTTPS en producción por seguridad.');
  }
};

const parseApiError = async (response: Response) => {
  let fallback = `Request failed with status ${response.status}`;

  try {
    const body = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };

    if (Array.isArray(body.message)) {
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

  return fallback;
};

const apiRequest = async <T>(path: string, body?: Record<string, unknown>): Promise<T> => {
  ensureApiConfigured();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(mapAuthError(errorMessage));
  }

  return (await response.json()) as T;
};

const persistSession = async (session: AppAuthSession) => {
  await appStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
};

export const getStoredSession = async (): Promise<AppAuthSession | null> => {
  const raw = await appStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppAuthSession;
  } catch {
    await appStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
};

export const flushPendingProfileSync = async () => {
  return;
};

export const signInWithEmail = async (email: string, password: string) => {
  const session = await apiRequest<AppAuthSession>('/auth/login', {
    email,
    password,
  });

  await persistSession(session);
  return session;
};

export const requestPasswordReset = async (_email: string) => {
  throw new Error('El flujo de recuperacion de contrasena aun no esta habilitado en el backend propio.');
};

export const signUpWithProfile = async (payload: RegisterWizardPayload) => {
  await apiRequest<{ message: string }>('/auth/register', {
    email: payload.personalData.email.trim(),
    password: payload.personalData.password,
    fullName: payload.personalData.fullName.trim(),
  });
};

export const signOut = async () => {
  await appStorage.removeItem(AUTH_SESSION_KEY);
};

export const updatePassword = async (_password: string) => {
  throw new Error('La actualizacion de contrasena aun no esta habilitada en el backend propio.');
};

export const verifyEmailToken = async (token: string) => {
  return apiRequest<{ message: string }>('/auth/verify-email', { token });
};
