/**
 * "Prepara tus alarmas": convierte el estado del teléfono en los pasos que ve
 * la persona. Puro (sin react-native) para poder probarlo en
 * backend/test/alarm-setup.test.ts.
 */

export type AlarmSetupStepId = 'notifications' | 'exactAlarms' | 'lockScreen' | 'battery' | 'autostart' | 'test';

export type AlarmSetupStep = {
  id: AlarmSetupStepId;
  title: string;
  description: string;
  done: boolean;
};

export type AlarmSetupInput = {
  /** `Platform.OS`. */
  platform: string;
  /** Subconjunto de `AlarmPermissionsStatus` (alarm-permissions.service). */
  status: {
    notifications: 'granted' | 'denied' | 'undetermined' | 'unavailable';
    alarmChannelBlocked: boolean;
    shouldPromptExactAlarmPermission: boolean;
    shouldPromptFullScreenIntent: boolean;
    shouldPromptBatteryOptimization: boolean;
  };
  /** La marca necesita "inicio automático" (no se puede comprobar). */
  autostartNeeded: boolean;
  /** La persona dijo que ya lo activó. */
  autostartConfirmed: boolean;
  /** La alarma de prueba se vio en pantalla completa en este teléfono. */
  testPassed: boolean;
};

export function buildAlarmSetupSteps(input: AlarmSetupInput): AlarmSetupStep[] {
  const { status } = input;
  const steps: AlarmSetupStep[] = [
    {
      id: 'notifications',
      title: 'Notificaciones',
      description: status.alarmChannelBlocked
        ? 'Las alarmas de MedicAI están silenciadas en los ajustes del teléfono.'
        : 'Para avisarte a la hora de cada toma.',
      done: status.notifications === 'granted' && !status.alarmChannelBlocked,
    },
  ];
  // iPhone no tiene alarma a pantalla completa ni ahorro de batería que la apague.
  if (input.platform !== 'android') return steps;

  steps.push(
    {
      id: 'exactAlarms',
      title: 'Alarmas a la hora exacta',
      description: 'Sin esto pueden sonar con minutos de retraso.',
      done: !status.shouldPromptExactAlarmPermission,
    },
    {
      id: 'lockScreen',
      title: 'Mostrar sobre la pantalla bloqueada',
      description: 'Para que la alarma ocupe la pantalla aunque el teléfono esté bloqueado.',
      done: !status.shouldPromptFullScreenIntent,
    },
    {
      id: 'battery',
      title: 'Que no la apague el ahorro de batería',
      description: 'El ahorro de batería puede retrasar o silenciar las alarmas.',
      done: !status.shouldPromptBatteryOptimization,
    },
  );
  if (input.autostartNeeded) {
    steps.push({
      id: 'autostart',
      title: 'Inicio automático',
      description: 'Tu teléfono lo pide para que las alarmas suenen con la app cerrada.',
      done: input.autostartConfirmed,
    });
  }
  steps.push({
    id: 'test',
    title: 'Probar la alarma',
    description: 'Suena en 10 segundos: bloquea el teléfono y comprueba que se ve.',
    done: input.testPassed,
  });
  return steps;
}

export function needsAlarmSetup(steps: AlarmSetupStep[]): boolean {
  return steps.some((step) => !step.done);
}

/**
 * Cómo de lista está la alarma en este teléfono (para cada tarjeta):
 * - off: sin notificaciones, no sonará.
 * - incomplete: falta otro permiso o el inicio automático; podría no sonar.
 * - untested: todo concedido, solo falta probarla.
 */
export type AlarmReadiness = 'ready' | 'untested' | 'incomplete' | 'off';

export function alarmReadiness(steps: AlarmSetupStep[]): AlarmReadiness {
  const missing = steps.filter((step) => !step.done).map((step) => step.id);
  if (!missing.length) return 'ready';
  if (missing.includes('notifications')) return 'off';
  if (missing.some((id) => id !== 'test')) return 'incomplete';
  return 'untested';
}

export const ALARM_READINESS_LABEL: Record<Exclude<AlarmReadiness, 'ready'>, string> = {
  off: 'Sin alarma en este teléfono',
  incomplete: 'La alarma podría no sonar en este teléfono',
  untested: 'Alarma sin probar en este teléfono',
};
