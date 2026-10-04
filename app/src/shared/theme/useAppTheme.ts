import { useEffect, useState } from 'react';
import { Appearance, AppState, useColorScheme, type ColorSchemeName } from 'react-native';

import { darkTheme, lightTheme } from './palette';
import { getThemePreference, loadThemePreference, onThemePreference, type ThemePreference } from './theme-preference';
import type { AppTheme } from './types';

/**
 * Tema según la apariencia elegida en Perfil ("sistema" por defecto) y el
 * modo del sistema. Además de useColorScheme, se escucha
 * Appearance directamente y se vuelve a leer al regresar a la app: en Android
 * el evento puede llegar tarde (o perderse) si el modo se cambia con la app en
 * segundo plano, y la interfaz quedaba un momento con el tema anterior.
 */
export function useAppTheme(): AppTheme {
  const hookMode = useColorScheme();
  const [mode, setMode] = useState<ColorSchemeName | null | undefined>(() => Appearance.getColorScheme() ?? hookMode);
  const [preference, setPreference] = useState<ThemePreference>(getThemePreference);

  useEffect(() => {
    const unsubscribe = onThemePreference(setPreference);
    void loadThemePreference().then(setPreference);
    return unsubscribe;
  }, []);

  useEffect(() => {
    setMode(hookMode);
  }, [hookMode]);

  useEffect(() => {
    const appearance = Appearance.addChangeListener(({ colorScheme }) => setMode(colorScheme));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') setMode(Appearance.getColorScheme());
    });
    return () => {
      appearance.remove();
      appState.remove();
    };
  }, []);

  const resolved = preference === 'system' ? mode : preference;
  return resolved === 'dark' ? darkTheme : lightTheme;
}
