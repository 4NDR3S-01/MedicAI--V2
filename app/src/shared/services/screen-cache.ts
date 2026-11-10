import { appStorage } from '../storage';

/**
 * Última copia conocida de datos que vienen del servidor (perfil, Círculo,
 * seguimiento de personas que cuido) para que las pantallas se pinten al
 * instante y se pongan al día en segundo plano. En memoria para que volver a
 * una pestaña no espere ni al disco; en disco para que abrir la app tampoco.
 */
export const SCREEN_CACHE_KEYS = {
  circle: 'medicai_circle_cache_v2',
  careData: 'medicai_care_data_v1',
  profile: 'medicai_profile_cache_v1',
} as const;

type CacheKey = (typeof SCREEN_CACHE_KEYS)[keyof typeof SCREEN_CACHE_KEYS];

const memory = new Map<CacheKey, unknown>();

/** Lo que ya está en memoria (síncrono, para el primer render). */
export function peekCache<T>(key: CacheKey): T | null {
  return (memory.get(key) as T | undefined) ?? null;
}

export async function readCache<T>(key: CacheKey): Promise<T | null> {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = await appStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as T;
    // Si mientras se leía llegó un dato nuevo, ese gana.
    if (!memory.has(key)) memory.set(key, value);
    return memory.get(key) as T;
  } catch {
    return null; // caché corrupta: se ignora
  }
}

export function writeCache<T>(key: CacheKey, value: T): void {
  memory.set(key, value);
  void appStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
}

/** Al abrir la app: deja todo en memoria antes de que se abra cualquier pestaña. */
export function warmScreenCaches(): void {
  Object.values(SCREEN_CACHE_KEYS).forEach((key) => void readCache(key));
}

/** Al cerrar sesión (el disco lo limpia `clearUserData`). */
export function clearScreenCaches(): void {
  memory.clear();
}
