import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getAlarmSetupSnapshot, onAlarmSetupChanged } from './alarm-setup.service';
import { alarmReadiness, type AlarmReadiness } from './alarm-setup-steps';

/**
 * Si la alarma sonará en este teléfono. Se vuelve a leer al volver de los
 * ajustes del sistema y al cerrar "Prepara tus alarmas". `null` mientras se lee.
 */
export function useAlarmReadiness(): AlarmReadiness | null {
  const [readiness, setReadiness] = useState<AlarmReadiness | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { steps } = await getAlarmSetupSnapshot();
      setReadiness(alarmReadiness(steps));
    } catch {
      setReadiness(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const unsubscribe = onAlarmSetupChanged(() => void refresh());
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [refresh]);

  return readiness;
}
