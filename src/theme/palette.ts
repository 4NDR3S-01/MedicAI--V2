import type { AppTheme } from './types';

export const lightTheme: AppTheme = {
  mode: 'light',
  colors: {
    background: '#F4F8FC',
    surface: 'rgba(255, 255, 255, 0.92)',
    surfaceBorder: 'rgba(41, 76, 110, 0.16)',
    textPrimary: '#10243A',
    textSecondary: '#32506F',
    textMuted: '#647A91',
    accentPrimary: '#12A594',
    accentSecondary: '#1B86E3',
    accentTertiary: '#F59A2E',
    inputBackground: '#FFFFFF',
    inputBorder: '#C8D9EA',
    inputPlaceholder: '#7790A8',
    buttonText: '#073730',
    success: '#10A85B',
  },
  blobs: {
    one: 'rgba(18, 165, 148, 0.20)',
    two: 'rgba(27, 134, 227, 0.18)',
    three: 'rgba(245, 154, 46, 0.16)',
  },
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  colors: {
    background: '#06121F',
    surface: 'rgba(10, 28, 45, 0.82)',
    surfaceBorder: 'rgba(175, 208, 230, 0.20)',
    textPrimary: '#F4FAFF',
    textSecondary: '#CBE0F3',
    textMuted: '#A8BBCD',
    accentPrimary: '#00BFA6',
    accentSecondary: '#23A6F0',
    accentTertiary: '#FFB242',
    inputBackground: '#0C2135',
    inputBorder: '#21435E',
    inputPlaceholder: '#7A879B',
    buttonText: '#03231F',
    success: '#26D366',
  },
  blobs: {
    one: 'rgba(0, 191, 166, 0.24)',
    two: 'rgba(34, 146, 255, 0.20)',
    three: 'rgba(255, 178, 66, 0.18)',
  },
};
