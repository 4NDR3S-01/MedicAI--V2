import { NativeModules, Platform } from 'react-native';

type NativeEnvironmentModule = {
  isIgnoringBatteryOptimizations: () => Promise<boolean>;
  canScheduleExactAlarms: () => Promise<boolean>;
  getManufacturer: () => Promise<string>;
  openAutostartSettings: () => Promise<boolean>;
};

const getModule = (): NativeEnvironmentModule | null => {
  if (Platform.OS !== 'android') return null;
  const mod = (NativeModules as Record<string, unknown>).AlarmEnvironmentModule as NativeEnvironmentModule | undefined;
  if (mod && typeof mod.isIgnoringBatteryOptimizations === 'function') return mod;
  return null;
};

export const AlarmEnvironmentNative = {
  isAvailable: (): boolean => getModule() !== null,

  isIgnoringBatteryOptimizations: async (): Promise<boolean | null> => {
    if (Platform.OS !== 'android') return true;
    try {
      const mod = getModule();
      if (!mod) return null;
      return await mod.isIgnoringBatteryOptimizations();
    } catch {
      return null;
    }
  },

  canScheduleExactAlarms: async (): Promise<boolean | null> => {
    if (Platform.OS !== 'android') return null;
    try {
      const mod = getModule();
      if (!mod) return null;
      return await mod.canScheduleExactAlarms();
    } catch {
      return null;
    }
  },

  getManufacturer: async (): Promise<string | null> => {
    if (Platform.OS !== 'android') return null;
    try {
      const mod = getModule();
      if (!mod || typeof mod.getManufacturer !== 'function') return null;
      return await mod.getManufacturer();
    } catch {
      return null;
    }
  },

  openAutostartSettings: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    try {
      const mod = getModule();
      if (!mod || typeof mod.openAutostartSettings !== 'function') return false;
      return await mod.openAutostartSettings();
    } catch {
      return false;
    }
  },
};

export default AlarmEnvironmentNative;
