import { Platform } from "react-native";
import * as Device from "expo-device";

import { NetworkError } from "../../../shared/services/network-error";
import { clearSession, loadSession, saveSession } from "./session-store";

import type { RegisterWizardPayload } from "../models/register.types";
import {
  getPhoneCountry,
  serializeMedicalSelection,
  toE164,
} from "../utils/register.utils";
import { mapAuthError } from "./authErrors";

const LOGOUT_TIMEOUT_MS = 4000;

/** Error de la API con su código HTTP (para distinguir "sin red" de "sesión inválida"). */
class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** La sesión guardada ya no es válida en el servidor (revocada o vencida). */
export class SessionExpiredError extends Error {
  constructor() {
    super("Tu sesión expiró. Vuelve a iniciar sesión.");
  }
}

type SessionExpiredListener = () => void;
let sessionExpiredListeners: SessionExpiredListener[] = [];

/** Avisa cuando el servidor rechaza la sesión: la app debe volver al login. */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.push(listener);
  return () => {
    sessionExpiredListeners = sessionExpiredListeners.filter((item) => item !== listener);
  };
}

export type AppAuthSession = {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    avatar?: string | null;
    birthDate?: string | null;
    phone?: string | null;
    conditions?: string | null;
    allergies?: string | null;
    pregnancy?: boolean;
    lactation?: boolean;
    recentSurgeries?: boolean;
    immunosuppression?: boolean;
    anticoagulantTreatment?: boolean;
    notificationLeadMinutes?: number;
    aiHealthContextConsent?: boolean;
  };
  accessToken: string;
  refreshToken: string;
};

export type ProfileUser = AppAuthSession["user"];

export type ProfileUpdatePayload = Partial<{
  fullName: string;
  birthDate: string;
  phone: string;
  conditions: string;
  allergies: string;
  pregnancy: boolean;
  lactation: boolean;
  recentSurgeries: boolean;
  immunosuppression: boolean;
  anticoagulantTreatment: boolean;
  notificationLeadMinutes: number;
  aiHealthContextConsent: boolean;
}>;

export type EmailAvailabilityResponse = {
  available: boolean;
  message: string;
};

export type AuthTokenValidationStatus =
  | "valid"
  | "used"
  | "expired"
  | "invalid"
  | "already_verified";

export type AuthTokenValidationResponse = {
  status: AuthTokenValidationStatus;
  message: string;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const ensureApiConfigured = () => {
  if (!API_BASE_URL) {
    throw new Error(
      "Falta configurar EXPO_PUBLIC_API_BASE_URL en variables de entorno.",
    );
  }

  // Validar HTTPS en producción
  if (
    process.env.NODE_ENV === "production" &&
    !API_BASE_URL.startsWith("https://")
  ) {
    throw new Error(
      "API_BASE_URL debe usar HTTPS en producción por seguridad.",
    );
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
      return body.message.join(". ");
    }

    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }

    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // no-op
  }

  if (response.status >= 500) {
    return "El backend está temporalmente no disponible. Intenta nuevamente en unos minutos.";
  }

  return fallback;
};

const apiRequest = async <T>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> => {
  ensureApiConfigured();

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError();
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new ApiError(mapAuthError(errorMessage), response.status);
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new Error(
      "Respuesta inválida del backend. Verifica que la API esté funcionando correctamente.",
    );
  }
};

const persistSession = (session: AppAuthSession) => saveSession(session);

const mergeStoredSessionUser = async (user: Partial<ProfileUser>) => {
  const session = await getStoredSession();
  if (!session) return null;

  const updatedSession: AppAuthSession = {
    ...session,
    user: {
      ...session.user,
      ...user,
    },
  };
  await persistSession(updatedSession);
  return updatedSession;
};

/** Sesión guardada: tokens del almacén cifrado + perfil (ver session-store). */
export const getStoredSession = (): Promise<AppAuthSession | null> => loadSession<AppAuthSession>();

/** Nombre legible del dispositivo para "Sesiones abiertas". */
const deviceInfo = () => ({
  deviceName: [Device.manufacturer, Device.modelName].filter(Boolean).join(" ").slice(0, 80) || undefined,
  platform: Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web" ? Platform.OS : undefined,
});

export const flushPendingProfileSync = async () => {
  return;
};

export const signInWithEmail = async (email: string, password: string) => {
  const session = await apiRequest<AppAuthSession>("/auth/login", {
    email,
    password,
    ...deviceInfo(),
  });

  await persistSession(session);
  return session;
};

export const requestPasswordReset = async (email: string) => {
  await apiRequest<{ message: string }>("/auth/forgot-password", {
    email: email.trim(),
  });
};

export const signUpWithProfile = async (payload: RegisterWizardPayload) => {
  const { personalData, medicalInfo } = payload;
  await apiRequest<{ message: string }>("/auth/register", {
    email: personalData.email.trim().toLowerCase(),
    password: personalData.password,
    fullName: personalData.fullName.trim().replace(/\s+/g, " ") || undefined,
    birthDate: personalData.birthDate || undefined,
    phone: toE164(personalData.phone, getPhoneCountry(personalData.phoneCountryIso)),
    conditions: serializeMedicalSelection(medicalInfo.conditions),
    allergies: serializeMedicalSelection(medicalInfo.allergies),
    specialConditions: medicalInfo.specialConditions,
    aiHealthContextConsent: medicalInfo.aiHealthContextConsent,
  });
};

export const checkEmailAvailability = async (email: string) => {
  return apiRequest<EmailAvailabilityResponse>("/auth/check-email", {
    email: email.trim(),
  });
};

/**
 * Cierra la sesión también en el servidor (invalida el refresh token), así
 * una copia antigua de los datos de la app no puede volver a entrar. Si no hay
 * red, se cierra igualmente en el teléfono.
 */
export const signOut = async () => {
  const session = await getStoredSession();
  await clearSession();
  if (!session?.accessToken || !session.refreshToken || !API_BASE_URL) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGOUT_TIMEOUT_MS);
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
      signal: controller.signal,
    });
  } catch {
    // Sin red o servidor caído: la sesión local ya se borró.
  } finally {
    clearTimeout(timeout);
  }
};

/** El servidor rechazó la sesión: se borra y se avisa a la app. */
const expireSession = async () => {
  await clearSession();
  sessionExpiredListeners.forEach((listener) => listener());
};

/**
 * Comprueba con el servidor que la sesión guardada sigue siendo válida (p. ej.
 * al abrir la app). Sin red no hace nada: se puede seguir usando sin conexión.
 */
export const validateStoredSession = async (): Promise<void> => {
  const session = await getStoredSession();
  if (!session?.accessToken || !API_BASE_URL) return;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/profile`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
  } catch {
    return;
  }
  if (response.status !== 401) return;
  // Token de acceso vencido: la renovación decide si la sesión sigue viva.
  await refreshStoredSession().catch(() => undefined);
};

// Varias pantallas pueden recibir 401 a la vez cuando expira el access token.
// Compartimos una única renovación en curso: evita N llamadas a /auth/refresh
// y que una rotación invalide el refresh token que usan las demás.
let refreshInFlight: Promise<AppAuthSession> | null = null;

export const refreshStoredSession = (): Promise<AppAuthSession> => {
  if (!refreshInFlight) {
    refreshInFlight = refreshStoredSessionOnce().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

const refreshStoredSessionOnce = async (): Promise<AppAuthSession> => {
  const currentSession = await getStoredSession();

  if (!currentSession?.refreshToken) {
    throw new Error("No hay sesión activa para renovar.");
  }

  let refreshedTokens: { accessToken: string; refreshToken: string };
  try {
    refreshedTokens = await apiRequest<{
      accessToken: string;
      refreshToken: string;
    }>("/auth/refresh", { refreshToken: currentSession.refreshToken });
  } catch (error) {
    // 400/401/403 (no 429): el refresh token fue revocado (cierre de sesión en otro
    // lugar, copia restaurada...) o venció. Con errores de red o 5xx se
    // conserva la sesión para reintentar más tarde.
    if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
      await expireSession();
      throw new SessionExpiredError();
    }
    throw error;
  }

  const updatedSession: AppAuthSession = {
    ...currentSession,
    accessToken: refreshedTokens.accessToken,
    refreshToken: refreshedTokens.refreshToken,
  };

  await persistSession(updatedSession);
  return updatedSession;
};

export const updatePassword = async (password: string, token: string) => {
  await apiRequest<{ message: string }>("/auth/reset-password", {
    token,
    password,
  });
};

export const validatePasswordResetToken = async (token: string) => {
  return apiRequest<AuthTokenValidationResponse>(
    "/auth/reset-password/validate",
    { token },
  );
};

export const verifyEmailToken = async (token: string) => {
  return apiRequest<{ message: string }>("/auth/verify-email", { token });
};

export const validateEmailVerificationToken = async (token: string) => {
  return apiRequest<AuthTokenValidationResponse>(
    "/auth/verify-email/validate",
    { token },
  );
};

export const fetchProfileFromBackend = async () => {
  ensureApiConfigured();

  const session = await getStoredSession();
  if (!session) {
    throw new Error(
      "No hay sesión activa. Por favor inicia sesión nuevamente.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
  } catch {
    throw new Error(
      "No hemos podido conectar con nuestros servidores. Por favor verifica tu conexión a internet e inténtalo de nuevo en unos momentos.",
    );
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(mapAuthError(errorMessage));
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {} as { user: ProfileUser };
  }

  try {
    const payload = JSON.parse(rawBody) as { user: ProfileUser };
    if (payload.user) {
      await mergeStoredSessionUser(payload.user);
    }
    return payload;
  } catch {
    throw new Error(
      "Respuesta inválida del backend. Verifica que la API esté funcionando correctamente.",
    );
  }
};

export const updateProfileOnBackend = async (profileData: ProfileUpdatePayload) => {
  ensureApiConfigured();

  const session = await getStoredSession();
  if (!session) {
    throw new Error(
      "No hay sesión activa. Por favor inicia sesión nuevamente.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(profileData),
    });
  } catch {
    throw new Error(
      "No hemos podido conectar con nuestros servidores. Por favor verifica tu conexión a internet e inténtalo de nuevo en unos momentos.",
    );
  }

  if (!response.ok) {
    const errorMessage = await parseApiError(response);
    throw new Error(mapAuthError(errorMessage));
  }

  const rawBody = await response.text();
  if (!rawBody.trim()) {
    return {} as { message: string; user?: ProfileUser };
  }

  try {
    const payload = JSON.parse(rawBody) as { message: string; user?: ProfileUser };
    if (payload.user) {
      await mergeStoredSessionUser(payload.user);
    }
    return payload;
  } catch {
    throw new Error(
      "Respuesta inválida del backend. Verifica que la API esté funcionando correctamente.",
    );
  }
};

export const updateAvatarOnBackend = async (avatarData: string) => {
  ensureApiConfigured();

  const session = await getStoredSession();
  if (!session) {
    throw new Error(
      "No hay sesión activa. Por favor inicia sesión nuevamente.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/avatar`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ avatar: avatarData }),
    });
  } catch {
    throw new Error(
      "No hemos podido conectar con nuestros servidores. Por favor verifica tu conexión a internet e inténtalo de nuevo en unos momentos.",
    );
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
    const payload = JSON.parse(rawBody) as { message: string; avatar: string };
    if (payload.avatar) {
      await mergeStoredSessionUser({ avatar: payload.avatar });
    }
    return payload;
  } catch {
    throw new Error(
      "Respuesta inválida del backend. Verifica que la API esté funcionando correctamente.",
    );
  }
};
