import { NativeModules, Platform } from 'react-native';

type NativeEnvironmentModule = {
  isIgnoringBatteryOptimizations: () => Promise<boolean>;
  canScheduleExactAlarms: () => Promise<boolean>;
};

const environmentModule = NativeModules.AlarmEnvironmentModule as NativeEnvironmentModule | undefined;

export const AlarmEnvironmentNative = {
  isAvailable: () =>
    Platform.OS === 'android' &&
    typeof (NativeModules as any).AlarmEnvironmentModule?.isIgnoringBatteryOptimizations === 'function' &&
    typeof (NativeModules as any).AlarmEnvironmentModule?.canScheduleExactAlarms === 'function',

  isIgnoringBatteryOptimizations: async (): Promise<boolean | null> => {
    if (Platform.OS !== 'android') return true;
    try {
      if (typeof (NativeModules as any).AlarmEnvironmentModule?.isIgnoringBatteryOptimizations !== 'function') return null;
      return await (NativeModules as any).AlarmEnvironmentModule.isIgnoringBatteryOptimizations();
    } catch {
      return null;
    }
  },

  canScheduleExactAlarms: async (): Promise<boolean | null> => {
    if (Platform.OS !== 'android') return null;
    try {
      if (typeof (NativeModules as any).AlarmEnvironmentModule?.canScheduleExactAlarms !== 'function') return null;
      return await (NativeModules as any).AlarmEnvironmentModule.canScheduleExactAlarms();
    } catch {
      return null;
    }
  },
};

export default AlarmEnvironmentNative;
