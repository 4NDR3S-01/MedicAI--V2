import { Appearance } from 'react-native';

import { appStorage } from '../storage';

/** Apariencia elegida: la del sistema, o siempre clara / oscura. */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'medicai_theme_preference_v1';
let current: ThemePreference = 'system';
let loaded = false;
const listeners = new Set<(preference: ThemePreference) => void>();

/** Los componentes nativos (alertas, selector de fecha) siguen la misma apariencia. */
const applyNative = (preference: ThemePreference) => {
  try {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  } catch {
    // Versiones sin soporte: solo cambia la interfaz propia.
  }
};

const isPreference = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark';

export const getThemePreference = () => current;

/** Lee la preferencia guardada (una vez) y avisa a quien escucha. */
export async function loadThemePreference(): Promise<ThemePreference> {
  if (loaded) return current;
  loaded = true;
  try {
    const stored = await appStorage.getItem(STORAGE_KEY);
    if (isPreference(stored) && stored !== current) {
      current = stored;
      applyNative(stored);
      listeners.forEach((listener) => listener(current));
    }
  } catch {
    // Sin almacenamiento: se queda la del sistema.
  }
  return current;
}

export function setThemePreference(preference: ThemePreference): void {
  current = preference;
  loaded = true;
  applyNative(preference);
  listeners.forEach((listener) => listener(preference));
  void appStorage.setItem(STORAGE_KEY, preference).catch(() => undefined);
}

export function onThemePreference(listener: (preference: ThemePreference) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
