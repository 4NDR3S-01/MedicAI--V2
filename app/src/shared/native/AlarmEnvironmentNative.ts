import { NativeModules, Platform } from 'react-native';

type NativeEnvironmentModule = {
  isIgnoringBatteryOptimizations: () => Promise<boolean>;
  canScheduleExactAlarms: () => Promise<boolean>;
};

const environmentModule = NativeModules.AlarmEnvironmentModule as NativeEnvironmentModule | undefined;

const isAndroidEnvironmentAvailable =
  Platform.OS === 'android' &&
  typeof environmentModule?.isIgnoringBatteryOptimizations === 'function' &&
  typeof environmentModule?.canScheduleExactAlarms === 'function';

export const AlarmEnvironmentNative = {
  isAvailable: () => isAndroidEnvironmentAvailable,

  isIgnoringBatteryOptimizations: async (): Promise<boolean | null> => {
    if (!isAndroidEnvironmentAvailable) return null;
    try {
      return await environmentModule.isIgnoringBatteryOptimizations();
    } catch {
      return null;
    }
  },

  canScheduleExactAlarms: async (): Promise<boolean | null> => {
    if (!isAndroidEnvironmentAvailable) return null;
    try {
      return await environmentModule.canScheduleExactAlarms();
    } catch {
      return null;
    }
  },
};

export default AlarmEnvironmentNative;
