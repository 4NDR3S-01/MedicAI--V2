import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme } from './palette';
import type { AppTheme } from './types';

export function useAppTheme(): AppTheme {
  const systemMode = useColorScheme();
  return systemMode === 'dark' ? darkTheme : lightTheme;
}
