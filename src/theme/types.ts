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
  };
  blobs: {
    one: string;
    two: string;
    three: string;
  };
};
