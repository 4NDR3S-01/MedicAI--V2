import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PermissionKey } from '../src/modules/circle/circle.constants';
import { MedicationsController } from '../src/modules/medications/medications.controller';

/** Qué permisos pide el controlador al editar el medicamento de otra persona. */
async function requiredFor(body: Record<string, unknown>): Promise<PermissionKey[]> {
  let required: PermissionKey[] = [];
  const access = {
    resolveOwner: async (_actor: string, ownerId: string, keys: PermissionKey | PermissionKey[]) => {
      required = Array.isArray(keys) ? keys : [keys];
      return ownerId;
    },
  };
  const service = { update: async () => ({}) };
  const notifier = { dataChanged: () => undefined };
  const controller = new MedicationsController(service as never, access as never, notifier as never);
  await controller.update('med', body as never, { ownerId: 'mama' }, { user: { sub: 'hijo' } });
  return required.sort();
}

describe('permisos al editar medicamentos de otra persona', () => {
  it('nombre, dosis y existencias: editar medicamentos', async () => {
    assert.deepEqual(await requiredFor({ name: 'X', stockQuantity: 10 }), ['editMedications', 'viewMedications']);
  });

  it('días, horario y dosis que cambia: recordatorios', async () => {
    assert.deepEqual(await requiredFor({ scheduleType: 'WEEKDAYS', weekDays: [1] }), ['manageReminders', 'viewMedications']);
    assert.deepEqual(await requiredFor({ dosageSteps: [{ days: 3, dosage: '20 mg' }] }), ['manageReminders', 'viewMedications']);
    assert.deepEqual(await requiredFor({ maxDailyDoses: 3 }), ['manageReminders', 'viewMedications']);
  });

  it('activar o pausar: recordatorios', async () => {
    assert.deepEqual(await requiredFor({ active: false }), ['manageReminders', 'viewMedications']);
  });

  it('cambiar ficha y horario a la vez pide ambos', async () => {
    assert.deepEqual(await requiredFor({ notes: 'con comida', times: ['08:00'] }), ['editMedications', 'manageReminders', 'viewMedications']);
  });
});
