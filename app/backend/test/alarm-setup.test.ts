/**
 * "Prepara tus alarmas": qué pasos ve la persona según el estado del teléfono
 * (app/src/shared/services/alarm-setup-steps.ts) y la guía de cada marca.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAlarmSetupSteps,
  needsAlarmSetup,
  type AlarmSetupInput,
} from '../../src/shared/services/alarm-setup-steps';
import { oemAlarmGuide } from '../../src/shared/services/oem-alarm-guides';

const ready: AlarmSetupInput['status'] = {
  notifications: 'granted',
  alarmChannelBlocked: false,
  shouldPromptExactAlarmPermission: false,
  shouldPromptFullScreenIntent: false,
  shouldPromptBatteryOptimization: false,
};

const input = (overrides: Partial<AlarmSetupInput> = {}): AlarmSetupInput => ({
  platform: 'android',
  status: ready,
  autostartNeeded: false,
  autostartConfirmed: false,
  testPassed: false,
  ...overrides,
});

const pending = (steps: ReturnType<typeof buildAlarmSetupSteps>) => steps.filter((s) => !s.done).map((s) => s.id);

test('Android con todo concedido: solo falta probar la alarma', () => {
  const steps = buildAlarmSetupSteps(input());
  assert.deepEqual(steps.map((s) => s.id), ['notifications', 'exactAlarms', 'lockScreen', 'battery', 'test']);
  assert.deepEqual(pending(steps), ['test']);
  assert.equal(needsAlarmSetup(steps), true);
});

test('alarma probada y todo concedido: no hay nada que preparar', () => {
  assert.equal(needsAlarmSetup(buildAlarmSetupSteps(input({ testPassed: true }))), false);
});

test('un permiso retirado después de la prueba vuelve a aparecer', () => {
  const steps = buildAlarmSetupSteps(
    input({ testPassed: true, status: { ...ready, shouldPromptFullScreenIntent: true } }),
  );
  assert.deepEqual(pending(steps), ['lockScreen']);
  assert.equal(needsAlarmSetup(steps), true);
});

test('inicio automático solo en las marcas que lo necesitan, marcado por la persona', () => {
  assert.deepEqual(pending(buildAlarmSetupSteps(input({ autostartNeeded: true, testPassed: true }))), ['autostart']);
  const confirmed = buildAlarmSetupSteps(input({ autostartNeeded: true, autostartConfirmed: true, testPassed: true }));
  assert.equal(confirmed.find((s) => s.id === 'autostart')?.done, true);
});

test('canal de alarmas silenciado cuenta como notificaciones pendientes', () => {
  const steps = buildAlarmSetupSteps(input({ testPassed: true, status: { ...ready, alarmChannelBlocked: true } }));
  assert.deepEqual(pending(steps), ['notifications']);
});

test('cada paso pendiente tiene título y explicación', () => {
  const steps = buildAlarmSetupSteps(
    input({
      autostartNeeded: true,
      status: {
        notifications: 'denied',
        alarmChannelBlocked: false,
        shouldPromptExactAlarmPermission: true,
        shouldPromptFullScreenIntent: true,
        shouldPromptBatteryOptimization: true,
      },
    }),
  );
  assert.equal(pending(steps).length, 6);
  for (const step of steps) {
    assert.ok(step.title.length > 0 && step.description.length > 0, step.id);
  }
});

test('iPhone: solo notificaciones', () => {
  assert.deepEqual(buildAlarmSetupSteps(input({ platform: 'ios' })).map((s) => s.id), ['notifications']);
});

test('guía por marca, con una genérica para las demás', () => {
  assert.equal(oemAlarmGuide('HONOR').brand, 'Honor');
  assert.equal(oemAlarmGuide('Redmi').brand, 'Xiaomi');
  assert.equal(oemAlarmGuide('nokia').brand, 'tu teléfono');
  assert.ok(oemAlarmGuide(null).steps.length > 0);
});
