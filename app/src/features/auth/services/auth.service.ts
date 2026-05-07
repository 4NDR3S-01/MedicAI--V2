import { appStorage } from '../../../shared/storage';

import type { RegisterWizardPayload } from '../models/register.types';
import { mapAuthError } from './authErrors';

const AUTH_SESSION_KEY = 'medicai_auth_session_v1';

export type AppAuthSession = {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    avatar?: string | null;
  };
  accessToken: string;
  refreshToken: string;
};

export type EmailAvailabilityResponse = {
  available: boolean;
  message: string;
};

export type AuthTokenValidationStatus = 'valid' | 'used' | 'expired' | 'invalid' | 'already_verified';

export type AuthTokenValidationResponse = {
  status: AuthTokenValidationStatus;
  message: string;
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
  let fallback = `Error del servidor (${response.status}).`;

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

  if (response.status >= 500) {
    return 'El backend esta temporalmente no disponible. Intenta nuevamente en unos minutos.';
  }

  return fallback;
};

const apiRequest = async <T>(path: string, body?: Record<string, unknown>): Promise<T> => {
  ensureApiConfigured();

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('No se pudo conectar con el backend. Verifica que el servidor este activo.');
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(mapAuthError(errorMessage));
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new Error('Respuesta invalida del backend. Verifica que la API este funcionando correctamente.');
  }
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

export const requestPasswordReset = async (email: string) => {
  await apiRequest<{ message: string }>('/auth/forgot-password', { email: email.trim() });
};

export const signUpWithProfile = async (payload: RegisterWizardPayload) => {
  await apiRequest<{ message: string }>('/auth/register', {
    email: payload.personalData.email.trim(),
    password: payload.personalData.password,
    fullName: payload.personalData.fullName.trim(),
  });
};

export const checkEmailAvailability = async (email: string) => {
  return apiRequest<EmailAvailabilityResponse>('/auth/check-email', {
    email: email.trim(),
  });
};

export const signOut = async () => {
  await appStorage.removeItem(AUTH_SESSION_KEY);
};

export const refreshStoredSession = async (): Promise<AppAuthSession> => {
  const currentSession = await getStoredSession();

  if (!currentSession?.refreshToken) {
    throw new Error('No hay sesion activa para renovar.');
  }

  const refreshedTokens = await apiRequest<{ accessToken: string; refreshToken: string }>(
    '/auth/refresh',
    { refreshToken: currentSession.refreshToken },
  );

  const updatedSession: AppAuthSession = {
    ...currentSession,
    accessToken: refreshedTokens.accessToken,
    refreshToken: refreshedTokens.refreshToken,
  };

  await persistSession(updatedSession);
  return updatedSession;
};

export const updatePassword = async (password: string, token: string) => {
  await apiRequest<{ message: string }>('/auth/reset-password', {
    token,
    password,
  });
};

export const validatePasswordResetToken = async (token: string) => {
  return apiRequest<AuthTokenValidationResponse>('/auth/reset-password/validate', { token });
};

export const verifyEmailToken = async (token: string) => {
  return apiRequest<{ message: string }>('/auth/verify-email', { token });
};

export const validateEmailVerificationToken = async (token: string) => {
  return apiRequest<AuthTokenValidationResponse>('/auth/verify-email/validate', { token });
};

export const updateAvatarOnBackend = async (avatarData: string) => {
  ensureApiConfigured();
  
  const session = await getStoredSession();
  if (!session) {
    throw new Error('No hay sesión activa. Por favor inicia sesión nuevamente.');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/avatar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ avatar: avatarData }),
    });
  } catch {
    throw new Error('No se pudo conectar con el backend. Verifica que el servidor este activo.');
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(mapAuthError(errorMessage));
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {} as { message: string; avatar: string };
  }

  try {
    return JSON.parse(rawBody) as { message: string; avatar: string };
  } catch {
    throw new Error('Respuesta invalida del backend. Verifica que la API este funcionando correctamente.');
  }
};
