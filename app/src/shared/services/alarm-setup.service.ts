/**
 * "Prepara tus alarmas": estado vivo de los permisos + lo que la persona
 * confirmó en este teléfono (inicio automático, alarma de prueba vista), la
 * alarma de prueba y el lanzador de la pantalla (MainAppShell la muestra).
 *
 * Es del teléfono, no de la cuenta: no se borra al cerrar sesión.
 */
import { Platform } from 'react-native';

import AlarmNative from '../native/AlarmNative';
import { appStorage } from '../storage';
import { getAlarmPermissionsStatus, getDeviceManufacturer, isOemAutostartRequired } from './alarm-permissions.service';
import { buildAlarmSetupSteps, needsAlarmSetup, type AlarmSetupStep } from './alarm-setup-steps';

const TEST_PASSED_KEY = 'medicai_alarm_test_passed_v1';
const AUTOSTART_CONFIRMED_KEY = 'medicai_autostart_confirmed_v1';

/** No contiene `_dose_`/`_snooze_`: sus botones nunca registran tomas. */
export const TEST_ALARM_ID = 'medicai_alarm_test';
export const TEST_ALARM_DELAY_MS = 10_000;

export type AlarmSetupSnapshot = {
  steps: AlarmSetupStep[];
  needsSetup: boolean;
  manufacturer: string | null;
};

const readFlag = async (key: string): Promise<boolean> =>
  (await appStorage.getItem(key).catch(() => null)) === 'true';

export async function getAlarmSetupSnapshot(): Promise<AlarmSetupSnapshot> {
  const [status, autostartNeeded, autostartConfirmed, testPassed, manufacturer] = await Promise.all([
    getAlarmPermissionsStatus(),
    isOemAutostartRequired().catch(() => false),
    readFlag(AUTOSTART_CONFIRMED_KEY),
    readFlag(TEST_PASSED_KEY),
    Platform.OS === 'android' ? getDeviceManufacturer().catch(() => null) : Promise.resolve(null),
  ]);
  const steps = buildAlarmSetupSteps({
    platform: Platform.OS,
    status,
    autostartNeeded,
    autostartConfirmed,
    // Sin el módulo nativo (emulador, Expo Go) no hay alarma que probar.
    testPassed: testPassed || !AlarmNative.isAvailable(),
  });
  return { steps, needsSetup: needsAlarmSetup(steps), manufacturer };
}

export async function markAutostartConfirmed(): Promise<void> {
  await appStorage.setItem(AUTOSTART_CONFIRMED_KEY, 'true').catch(() => undefined);
}

export async function markAlarmTestPassed(passed: boolean): Promise<void> {
  await (passed ? appStorage.setItem(TEST_PASSED_KEY, 'true') : appStorage.removeItem(TEST_PASSED_KEY)).catch(
    () => undefined,
  );
}

/** Programa una alarma real dentro de 10 s. False si no hay módulo nativo. */
export async function scheduleTestAlarm(): Promise<boolean> {
  if (!AlarmNative.isAvailable()) return false;
  try {
    await AlarmNative.scheduleAlarm(
      TEST_ALARM_ID,
      Date.now() + TEST_ALARM_DELAY_MS,
      'Alarma de prueba',
      'Así te avisará MedicAI a la hora de tu medicamento',
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Lanzador (mismo patrón que assistant-launcher) ─────────────────────────

type Listener = () => void;
let listener: Listener | null = null;

export function openAlarmSetup(): void {
  listener?.();
}

export function onOpenAlarmSetup(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

/**
 * Tras guardar o activar un medicamento propio: abre la pantalla si falta algo.
 * Espera a que se cierre la hoja anterior para no encimar dos paneles.
 */
export async function promptAlarmSetupIfNeeded(): Promise<void> {
  try {
    const [{ needsSetup }] = await Promise.all([
      getAlarmSetupSnapshot(),
      new Promise((resolve) => setTimeout(resolve, 450)),
    ]);
    if (needsSetup) openAlarmSetup();
  } catch {
    // Nunca debe impedir guardar.
  }
}

// Avisa a Inicio y Perfil cuando se cierra la pantalla (pudo cambiar algo
// sin que la app pasara a segundo plano, p. ej. "Ya lo activé" o "Sí, la vi").
const changeListeners = new Set<Listener>();

export function notifyAlarmSetupChanged(): void {
  changeListeners.forEach((fn) => fn());
}

export function onAlarmSetupChanged(fn: Listener): () => void {
  changeListeners.add(fn);
  return () => {
    changeListeners.delete(fn);
  };
}

const LAUNCH_PROMPT_DAY_KEY = 'medicai_alarm_setup_prompt_day_v1';

/**
 * Al abrir la app o iniciar sesión con medicamentos que ya estaban activos:
 * si a este teléfono le falta algo, abre la pantalla. Como mucho una vez al
 * día (el aviso de Inicio sigue mientras tanto).
 */
export async function promptAlarmSetupOnLaunch(): Promise<void> {
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if ((await appStorage.getItem(LAUNCH_PROMPT_DAY_KEY).catch(() => null)) === today) return;
  try {
    const { needsSetup } = await getAlarmSetupSnapshot();
    if (!needsSetup) return;
    await appStorage.setItem(LAUNCH_PROMPT_DAY_KEY, today).catch(() => undefined);
    openAlarmSetup();
  } catch {
    // Nunca debe impedir usar la app.
  }
}
