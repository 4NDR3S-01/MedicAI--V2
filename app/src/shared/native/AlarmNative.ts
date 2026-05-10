import { NativeModules, Platform } from 'react-native';

type NativeAlarmCallback = (err: any, res: any) => void;

type NativeAlarmModule = {
  scheduleAlarm: (
    id: string,
    timestampMs: number,
    title: string,
    body: string,
    callback: NativeAlarmCallback,
  ) => void;
  cancelAlarm: (id: string, callback: NativeAlarmCallback) => void;
};

const alarmModule = NativeModules.AlarmModule as NativeAlarmModule | undefined;

const invokeAlarmModule = <T>(
  invoke: (
    module: NativeAlarmModule,
    resolve: (value: T) => void,
    reject: (reason: unknown) => void,
  ) => void,
  unavailableMessage: string,
): Promise<T> =>
  new Promise((resolve, reject) => {
    if (!alarmModule) {
      reject(new Error(unavailableMessage));
      return;
    }

    try {
      invoke(alarmModule, resolve, reject);
    } catch (error) {
      reject(error);
    }
  });

export default {
  scheduleAlarm: async (id: string, timestampMs: number, title: string, body: string) => {
    if (Platform.OS !== 'android' || typeof (NativeModules as any).AlarmModule?.scheduleAlarm !== 'function') {
      throw new Error('Native AlarmModule not available');
    }

    return invokeAlarmModule(
      (module, resolve, reject) => {
        module.scheduleAlarm(id, timestampMs, title, body, (err: any, res: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(res);
        });
      },
      'Native AlarmModule not available',
    );
  },

  cancelAlarm: async (id: string) => {
    if (Platform.OS !== 'android' || typeof (NativeModules as any).AlarmModule?.cancelAlarm !== 'function') {
      throw new Error('Native AlarmModule not available');
    }

    return invokeAlarmModule(
      (module, resolve, reject) => {
        module.cancelAlarm(id, (err: any, res: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(res);
        });
      },
      'Native AlarmModule not available',
    );
  },

  isAvailable: () =>
    Platform.OS === 'android' &&
    typeof (NativeModules as any).AlarmModule?.scheduleAlarm === 'function' &&
    typeof (NativeModules as any).AlarmModule?.cancelAlarm === 'function',
};
