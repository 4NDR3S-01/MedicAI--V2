import { NativeModules, Platform } from 'react-native';

/**
 * Promise-based bridge to the native AlarmModule (Android only).
 *
 * The Java side uses `@ReactMethod` with `Promise` parameters,
 * which is fully compatible with both the old bridge and the
 * New Architecture interop layer (RN 0.81+, bridgeless mode).
 */

type PromiseAlarmModule = {
  scheduleAlarm: (
    id: string,
    timestampMs: number,
    title: string,
    body: string,
  ) => Promise<string>;
  cancelAlarm: (id: string) => Promise<string>;
};

const getModule = (): PromiseAlarmModule | null => {
  if (Platform.OS !== 'android') return null;
  const mod = (NativeModules as Record<string, unknown>).AlarmModule as PromiseAlarmModule | undefined;
  if (mod && typeof mod.scheduleAlarm === 'function' && typeof mod.cancelAlarm === 'function') {
    return mod;
  }
  return null;
};

export default {
  isAvailable: (): boolean => getModule() !== null,

  scheduleAlarm: async (
    id: string,
    timestampMs: number,
    title: string,
    body: string,
  ): Promise<string> => {
    const mod = getModule();
    if (!mod) throw new Error('Native AlarmModule not available');
    return mod.scheduleAlarm(id, timestampMs, title, body);
  },

  cancelAlarm: async (id: string): Promise<string> => {
    const mod = getModule();
    if (!mod) throw new Error('Native AlarmModule not available');
    return mod.cancelAlarm(id);
  },
};
