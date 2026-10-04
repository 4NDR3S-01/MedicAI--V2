import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MedicationsService } from '../src/modules/medications/medications.service';

type Med = {
  name: string;
  dosage: string;
  dosageSteps: unknown;
  startDate: string | null;
  stockQuantity: number | null;
  stockPerDose: number | null;
  stockAlertAt: number | null;
  user: { fullName: string; timezone: string };
};

/** Prisma falso en memoria: un medicamento y sus registros. */
function setup(medication: Partial<Med>) {
  const med: Med = {
    name: 'Ibuprofeno',
    dosage: '400 mg',
    dosageSteps: null,
    startDate: null,
    stockQuantity: 10,
    stockPerDose: 1,
    stockAlertAt: 3,
    user: { fullName: 'Ana Pérez', timezone: 'America/Bogota' },
    ...medication,
  };
  const logs: { id: string; stockUnits: number | null; scheduledFor: Date | null; action: string }[] = [];
  const pushes: { users: string[]; title: string }[] = [];
  const prisma = {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    medication: {
      findUnique: async () => med,
      update: async ({ data }: { data: { stockQuantity: number | { decrement?: number; increment?: number } } }) => {
        const change = data.stockQuantity;
        if (typeof change === 'number') med.stockQuantity = change;
        else med.stockQuantity = (med.stockQuantity ?? 0) - (change.decrement ?? 0) + (change.increment ?? 0);
        return { stockQuantity: med.stockQuantity };
      },
      updateMany: async ({ data }: { data: { stockQuantity: { increment: number } } }) => {
        if (med.stockQuantity !== null) med.stockQuantity += data.stockQuantity.increment;
        return { count: 1 };
      },
    },
    medicationLog: {
      findFirst: async ({ where }: { where: { id?: string; scheduledFor?: Date } }) =>
        where.id
          ? logs.find((log) => log.id === where.id) ?? null
          : logs.find((log) => log.scheduledFor?.getTime() === where.scheduledFor?.getTime()) ?? null,
      create: async ({ data }: { data: { stockUnits: number | null; scheduledFor: Date | null; action: string } }) => {
        const log = { id: `log${logs.length + 1}`, ...data };
        logs.push(log);
        return log;
      },
      update: async ({ where, data }: { where: { id: string }; data: { stockUnits: number } }) => {
        const log = logs.find((item) => item.id === where.id)!;
        log.stockUnits = data.stockUnits;
        return log;
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        const index = logs.findIndex((log) => log.id === where.id);
        if (index >= 0) logs.splice(index, 1);
        return { count: index >= 0 ? 1 : 0 };
      },
    },
    circleGrant: { findMany: async () => [{ granteeId: 'cuidador' }] },
  };
  const push = { notify: async (users: string[], message: { title: string }) => void pushes.push({ users, title: message.title }) };
  const service = new MedicationsService(prisma as never, push as never);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return { med, logs, pushes, service, flush };
}

describe('existencias', () => {
  it('"la tomé" descuenta y "deshacer" devuelve', async () => {
    const { med, service } = setup({ stockQuantity: 10, stockPerDose: 2 });
    const log = await service.logAction('m', 'ana', 'TAKEN', '2026-10-05T13:00:00.000Z');
    assert.equal(med.stockQuantity, 8);
    assert.equal(log.stockUnits, 2);
    await service.deleteLog('m', 'ana', log.id);
    assert.equal(med.stockQuantity, 10);
  });

  it('"la omití" no gasta existencias', async () => {
    const { med, service } = setup({ stockQuantity: 10 });
    await service.logAction('m', 'ana', 'SKIPPED', '2026-10-05T13:00:00.000Z');
    assert.equal(med.stockQuantity, 10);
  });

  it('la misma toma registrada dos veces (dos cuidadores) se descuenta una vez', async () => {
    const { med, service } = setup({ stockQuantity: 10 });
    await service.logAction('m', 'ana', 'TAKEN', '2026-10-05T13:00:00.000Z');
    await service.logAction('m', 'ana', 'TAKEN', '2026-10-05T13:00:00.000Z', 'cuidador');
    assert.equal(med.stockQuantity, 9);
  });

  it('sin llevar la cuenta no se toca nada', async () => {
    const { med, service } = setup({ stockQuantity: null });
    const log = await service.logAction('m', 'ana', 'TAKEN');
    assert.equal(med.stockQuantity, null);
    assert.equal(log.stockUnits, null);
  });

  it('avisa una sola vez al cruzar el umbral, a la persona y a sus cuidadores', async () => {
    const { service, pushes, flush } = setup({ stockQuantity: 4, stockAlertAt: 3 });
    await service.logAction('m', 'ana', 'TAKEN'); // 4 → 3: cruza
    await flush();
    await service.logAction('m', 'ana', 'TAKEN'); // 3 → 2: ya avisado
    await flush();
    assert.deepEqual(pushes.map((push) => push.users), [['ana'], ['cuidador']]);
    assert.match(pushes[0].title, /Queda poco Ibuprofeno/);
  });

  it('nunca baja de cero y deshacer devuelve solo lo descontado', async () => {
    const { med, service, pushes, flush } = setup({ stockQuantity: 1, stockPerDose: 2, stockAlertAt: null });
    const log = await service.logAction('m', 'ana', 'TAKEN');
    await flush();
    assert.equal(med.stockQuantity, 0);
    assert.equal(log.stockUnits, 1);
    assert.match(pushes[0].title, /Se acabó/);
    await service.deleteLog('m', 'ana', log.id);
    assert.equal(med.stockQuantity, 1);
  });
});
