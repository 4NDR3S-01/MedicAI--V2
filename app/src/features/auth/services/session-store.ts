import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { appStorage } from '../../../shared/storage';

/**
 * Dónde vive la sesión:
 * - Los TOKENS (lo que da acceso a la cuenta) en el almacén cifrado del
 *   sistema: Keystore en Android, Keychain en iOS. Nunca en texto plano.
 * - Los datos del perfil (nombre, avatar…) en el almacenamiento normal: no dan
 *   acceso y pueden ser grandes (el Keychain limita el tamaño).
 *
 * En iOS el Keychain sobrevive a desinstalar la app: sin cuidado, al
 * reinstalar se "recuperaría" la sesión. Por eso se guarda una marca de
 * instalación en el almacenamiento normal (que sí se borra al desinstalar): si
 * falta y no hay perfil guardado, los tokens que queden son de una instalación
 * anterior y se descartan.
 */

type Tokens = { accessToken: string; refreshToken: string };

const PROFILE_KEY = 'medicai_auth_session_v1';
const TOKENS_KEY = 'medicai_auth_tokens_v2';
const INSTALL_MARKER_KEY = 'medicai_install_marker_v1';

// Disponible tras el primer desbloqueo (las alarmas registran tomas con el
// teléfono bloqueado) y nunca se copia a otro dispositivo en una restauración.
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const secureAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

const readTokens = async (): Promise<Tokens | null> => {
  try {
    const raw = secureAvailable
      ? await SecureStore.getItemAsync(TOKENS_KEY, SECURE_OPTIONS)
      : await appStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
};

const writeTokens = async (tokens: Tokens) => {
  const raw = JSON.stringify(tokens);
  if (secureAvailable) await SecureStore.setItemAsync(TOKENS_KEY, raw, SECURE_OPTIONS);
  else await appStorage.setItem(TOKENS_KEY, raw);
};

const deleteTokens = async () => {
  try {
    if (secureAvailable) await SecureStore.deleteItemAsync(TOKENS_KEY, SECURE_OPTIONS);
    else await appStorage.removeItem(TOKENS_KEY);
  } catch {
    // no-op
  }
};

// Se lee la sesión en cada petición: caché en memoria para no ir al almacén
// cifrado cada vez. `undefined` = aún no cargada.
let cache: Record<string, unknown> | null | undefined;
let loading: Promise<Record<string, unknown> | null> | null = null;
// Si se guarda o borra la sesión mientras se cargaba, la carga ya es vieja.
let version = 0;

async function load<T extends Tokens>(): Promise<T | null> {
  const [rawProfile, marker] = await Promise.all([appStorage.getItem(PROFILE_KEY), appStorage.getItem(INSTALL_MARKER_KEY)]);

  let profile: Record<string, unknown> | null = null;
  try {
    profile = rawProfile ? (JSON.parse(rawProfile) as Record<string, unknown>) : null;
  } catch {
    await appStorage.removeItem(PROFILE_KEY);
  }

  if (!marker) {
    // Instalación nueva: tokens que hubiera son de una instalación anterior.
    if (!profile) await deleteTokens();
    await appStorage.setItem(INSTALL_MARKER_KEY, String(Date.now()));
  }
  if (!profile) return null;

  // Versión anterior: los tokens estaban en texto plano junto al perfil.
  if (typeof profile.accessToken === 'string' && typeof profile.refreshToken === 'string') {
    const { accessToken, refreshToken, ...rest } = profile;
    await writeTokens({ accessToken, refreshToken });
    await appStorage.setItem(PROFILE_KEY, JSON.stringify(rest));
    return { ...rest, accessToken, refreshToken } as unknown as T;
  }

  const tokens = await readTokens();
  if (!tokens) {
    // Perfil sin tokens (borrados o inaccesibles): no hay sesión.
    await appStorage.removeItem(PROFILE_KEY);
    return null;
  }
  return { ...profile, ...tokens } as unknown as T;
}

export async function loadSession<T extends Tokens>(): Promise<T | null> {
  if (cache !== undefined) return cache as T | null;
  if (!loading) {
    const startedAt = version;
    loading = load<T>().then((value) => {
      loading = null;
      if (startedAt !== version) return (cache ?? null) as Record<string, unknown> | null;
      cache = value;
      return value;
    });
  }
  return (await loading) as T | null;
}

export async function saveSession<T extends Tokens>(session: T): Promise<void> {
  const { accessToken, refreshToken, ...profile } = session;
  await writeTokens({ accessToken, refreshToken });
  await appStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  await appStorage.setItem(INSTALL_MARKER_KEY, String(Date.now()));
  version += 1;
  cache = session as unknown as Record<string, unknown>;
}

export async function clearSession(): Promise<void> {
  version += 1;
  cache = null;
  await Promise.all([deleteTokens(), appStorage.removeItem(PROFILE_KEY)]);
}
