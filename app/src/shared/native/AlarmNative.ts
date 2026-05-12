import { NativeModules, Platform } from 'react-native';

type PendingAction = {
  medicationId: string;
  action: 'TAKEN' | 'SKIPPED' | 'SNOOZED';
  timestamp: number;
  doseTimestamp?: number;
};

type PromiseAlarmModule = {
  scheduleAlarm: (
    id: string,
    timestampMs: number,
    title: string,
    body: string,
  ) => Promise<string>;
  cancelAlarm: (id: string) => Promise<string>;
  cancelAlarmsForMedication: (medicationId: string) => Promise<number>;
  stopAlarm: () => Promise<string>;
  getPendingAlarmActions: () => Promise<PendingAction[]>;
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

  cancelAlarmsForMedication: async (medicationId: string): Promise<number> => {
    const mod = getModule();
    if (!mod) throw new Error('Native AlarmModule not available');
    return mod.cancelAlarmsForMedication(medicationId);
  },

  stopAlarm: async (): Promise<void> => {
    const mod = getModule();
    if (!mod) return;
    await mod.stopAlarm();
  },

  getPendingAlarmActions: async (): Promise<PendingAction[]> => {
    const mod = getModule();
    if (!mod) return [];
    return mod.getPendingAlarmActions();
  },
};
