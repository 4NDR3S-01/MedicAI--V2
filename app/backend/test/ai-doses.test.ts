import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDoseProposal } from '../src/modules/ai/ai-doses';

const base = {
  dosageSteps: null, startDate: null, active: true, customEndDate: null, scheduleType: 'DAILY', weekDays: [], dayInterval: null,
  activeSince: new Date('2026-09-01T00:00:00-05:00'), createdAt: new Date('2026-09-01T00:00:00-05:00'),
};
const meds = [
  { ...base, id: 'm1', name: 'Metformina', dosage: '850 mg', times: ['08:00', '20:00'] },
  { ...base, id: 'm2', name: 'Losartán', dosage: '50 mg', times: ['08:00'] },
  { ...base, id: 'm3', name: 'Losartán potásico', dosage: '100 mg', times: ['21:00'] },
  { ...base, id: 'm4', name: 'Ibuprofeno', dosage: '400 mg', times: [], scheduleType: 'AS_NEEDED' },
];

function prisma(logged: Date[] = []) {
  return {
    user: { findUnique: async () => ({ timezone: 'America/Bogota' }) },
    medication: { findMany: async () => meds },
    medicationLog: { findMany: async () => logged.map((scheduledFor) => ({ scheduledFor })) },
  } as never;
}

describe('"ya me tomé…"', () => {
  const evening = new Date('2026-10-03T20:10:00-05:00');

  it('encuentra la toma de esta hora, sin importar tildes ni mayúsculas', async () => {
    const dose = await resolveDoseProposal(prisma(), 'u', 'la METFORMINA', evening);
    assert.equal(dose?.medicationId, 'm1');
    assert.equal(dose?.time, '20:00');
    assert.equal(dose?.scheduledFor, new Date('2026-10-03T20:00:00-05:00').toISOString());
  });

  it('si la de esta hora ya está registrada, propone la que quedó sin registrar', async () => {
    const dose = await resolveDoseProposal(prisma([new Date('2026-10-03T20:00:00-05:00')]), 'u', 'metformina', evening);
    assert.equal(dose?.time, '08:00');
  });

  it('no propone nada si todas las de hoy están registradas', async () => {
    const all = [new Date('2026-10-03T08:00:00-05:00'), new Date('2026-10-03T20:00:00-05:00')];
    assert.equal(await resolveDoseProposal(prisma(all), 'u', 'metformina', evening), null);
  });

  it('el nombre exacto gana; uno parcial que coincide con varios no se adivina', async () => {
    assert.equal((await resolveDoseProposal(prisma(), 'u', 'losartan', evening))?.medicationId, 'm2');
    assert.equal((await resolveDoseProposal(prisma(), 'u', 'losartán potásico', evening))?.medicationId, 'm3');
    assert.equal(await resolveDoseProposal(prisma(), 'u', 'losar', evening), null);
  });

  it('según necesidad: se registra ahora, sin hora programada', async () => {
    const dose = await resolveDoseProposal(prisma(), 'u', 'ibuprofeno', evening);
    assert.equal(dose?.medicationId, 'm4');
    assert.equal(dose?.scheduledFor, null);
  });

  it('un medicamento que no tiene no se registra', async () => {
    assert.equal(await resolveDoseProposal(prisma(), 'u', 'paracetamol', evening), null);
  });
});
