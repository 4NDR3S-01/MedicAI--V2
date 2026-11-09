export type ThemeMode = 'light' | 'dark';

export type AppTheme = {
  mode: ThemeMode;
  colors: {
    background: string;
    surface: string;
    surfaceBorder: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accentPrimary: string;
    accentSecondary: string;
    accentTertiary: string;
    inputBackground: string;
    inputBorder: string;
    inputPlaceholder: string;
    buttonText: string;
    success: string;
    /**
     * Variantes para TEXTO de los acentos (≥ 4.5:1 sobre surface/background).
     * Los acentos "puros" quedan para fondos, bordes e íconos.
     */
    accentPrimaryText: string;
    accentSecondaryText: string;
    warningText: string;
    successText: string;
  };
  blobs: {
    one: string;
    two: string;
    three: string;
  };
};
