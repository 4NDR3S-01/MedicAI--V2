/**
 * Cálculo de tomas en el servidor y su paridad con la app: lo que suena en el
 * teléfono (app/src/shared/services/dose-schedule.ts) y lo que el servidor da
 * por "no registrado" (common/dose-schedule.ts) deben coincidir siempre.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as app from '../../src/shared/services/dose-schedule';
import { doseDatesBetween, dosageOnDay, stockUnitsForDose, type ServerDoseInput } from '../src/common/dose-schedule';

const BOGOTA = 'America/Bogota';
const MADRID = 'Europe/Madrid';

const med = (overrides: Partial<ServerDoseInput> = {}): ServerDoseInput => ({
  id: 'med',
  times: ['08:00', '20:00'],
  active: true,
  activeSince: new Date('2026-10-01T00:00:00-05:00'),
  createdAt: new Date('2026-10-01T00:00:00-05:00'),
  customEndDate: null,
  ...overrides,
});

/** "lun 08:00" en la zona indicada. */
const label = (date: Date, timeZone: string) =>
  date.toLocaleString('es-ES', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const week = { from: new Date('2026-10-05T00:00:00-05:00'), to: new Date('2026-10-11T23:59:00-05:00') }; // lun 5 → dom 11

describe('doseDatesBetween (servidor)', () => {
  it('todos los días: dos tomas diarias a la hora local del dueño', () => {
    const doses = doseDatesBetween(med(), week.from, week.to, BOGOTA);
    assert.equal(doses.length, 14);
    assert.equal(label(doses[0], BOGOTA), 'lun, 08:00');
    assert.equal(label(doses[1], BOGOTA), 'lun, 20:00');
  });

  it('algunos días: solo lunes, miércoles y viernes', () => {
    const doses = doseDatesBetween(med({ scheduleType: 'WEEKDAYS', weekDays: [1, 3, 5], times: ['08:00'] }), week.from, week.to, BOGOTA);
    assert.deepEqual(doses.map((dose) => label(dose, BOGOTA)), ['lun, 08:00', 'mié, 08:00', 'vie, 08:00']);
  });

  it('cada 2 días desde la fecha de inicio', () => {
    const doses = doseDatesBetween(
      med({ scheduleType: 'INTERVAL', dayInterval: 2, startDate: '2026-10-06', times: ['08:00'] }),
      week.from,
      week.to,
      BOGOTA,
    );
    assert.deepEqual(doses.map((dose) => label(dose, BOGOTA)), ['mar, 08:00', 'jue, 08:00', 'sáb, 08:00']);
  });

  it('según necesidad: nunca hay tomas programadas', () => {
    assert.deepEqual(doseDatesBetween(med({ scheduleType: 'AS_NEEDED' }), week.from, week.to, BOGOTA), []);
  });

  it('no hay tomas antes de la activación ni después del último día', () => {
    const doses = doseDatesBetween(
      med({ activeSince: new Date('2026-10-07T12:00:00-05:00'), customEndDate: new Date('2026-10-09T23:59:00-05:00') }),
      week.from,
      week.to,
      BOGOTA,
    );
    // Mié 20:00, jue 08:00 y 20:00, vie 08:00 y 20:00 (el último día cuenta entero).
    assert.deepEqual(doses.map((dose) => label(dose, BOGOTA)), ['mié, 20:00', 'jue, 08:00', 'jue, 20:00', 'vie, 08:00', 'vie, 20:00']);
  });

  it('un medicamento inactivo no tiene tomas', () => {
    assert.deepEqual(doseDatesBetween(med({ active: false }), week.from, week.to, BOGOTA), []);
  });

  it('el cambio al horario de invierno no corre la hora de la toma', () => {
    // En Madrid el 25 de octubre de 2026 se atrasa la hora.
    const doses = doseDatesBetween(
      med({ times: ['08:00'], activeSince: new Date('2026-10-20T00:00:00+02:00') }),
      new Date('2026-10-24T00:00:00+02:00'),
      new Date('2026-10-26T23:00:00+01:00'),
      MADRID,
    );
    assert.deepEqual(doses.map((dose) => label(dose, MADRID)), ['sáb, 08:00', 'dom, 08:00', 'lun, 08:00']);
  });
});

describe('paridad app ↔ servidor', () => {
  const variants: Partial<ServerDoseInput>[] = [
    {},
    { times: ['00:00', '06:00', '12:00', '18:00'] },
    { scheduleType: 'WEEKDAYS', weekDays: [0, 6] },
    { scheduleType: 'WEEKDAYS', weekDays: [1, 2, 3, 4, 5] },
    { scheduleType: 'INTERVAL', dayInterval: 3, startDate: '2026-10-02' },
    { scheduleType: 'INTERVAL', dayInterval: 2 },
    { scheduleType: 'DAILY', startDate: '2026-10-20' },
    { customEndDate: new Date('2026-10-15T23:59:00-05:00') },
    { scheduleType: 'AS_NEEDED' },
  ];
  const zones = [BOGOTA, MADRID, 'Asia/Tokyo', 'America/New_York'];
  const from = new Date('2026-10-01T00:00:00Z');
  const to = new Date('2026-11-05T00:00:00Z');

  for (const timeZone of zones) {
    for (const [index, variant] of variants.entries()) {
      it(`${timeZone} · variante ${index}`, () => {
        const server = med(variant);
        // Si la zona del dueño no es la del teléfono, la app calcula en la del dueño.
        const client = {
          ...server,
          activeSince: server.activeSince?.toISOString() ?? null,
          createdAt: server.createdAt.toISOString(),
          customEndDate: server.customEndDate?.toISOString() ?? null,
          scheduleType: server.scheduleType as app.ScheduleType | undefined,
          timeZone,
        };
        const expected = doseDatesBetween(server, from, to, timeZone).map((date) => date.toISOString());
        const actual = app.getDoseDatesBetween(client, from, to).map((date) => date.toISOString());
        assert.deepEqual(actual, expected);
      });
    }
  }
});

describe('dosis que cambia con el tiempo', () => {
  const taper = {
    dosage: '40 mg',
    startDate: '2026-10-05',
    dosageSteps: [{ days: 3, dosage: '40 mg' }, { days: 3, dosage: '20 mg' }, { days: 2, dosage: '10 mg' }],
    stockPerDose: 2,
  };
  const on = (day: string) => new Date(`${day}T08:00:00-05:00`);

  it('cada día tiene la dosis de su etapa (y la última al terminar)', () => {
    const days = ['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-11', '2026-10-12', '2026-11-01'];
    assert.deepEqual(days.map((day) => dosageOnDay(taper, on(day), BOGOTA)), ['40 mg', '40 mg', '20 mg', '10 mg', '10 mg', '10 mg']);
  });

  it('la app y el servidor eligen la misma dosis', () => {
    for (const day of ['2026-10-04', '2026-10-05', '2026-10-08', '2026-10-12']) {
      assert.equal(app.dosageOnDay({ ...taper, timeZone: BOGOTA }, on(day)), dosageOnDay(taper, on(day), BOGOTA));
    }
  });

  it('las existencias bajan en proporción a la dosis del día', () => {
    // 40 mg = 2 comprimidos → 20 mg = 1 → 10 mg = medio.
    assert.equal(stockUnitsForDose(taper, on('2026-10-05'), BOGOTA), 2);
    assert.equal(stockUnitsForDose(taper, on('2026-10-08'), BOGOTA), 1);
    assert.equal(stockUnitsForDose(taper, on('2026-10-11'), BOGOTA), 0.5);
  });

  it('sin dosis cambiante se gasta lo indicado por toma (1 por defecto)', () => {
    assert.equal(stockUnitsForDose({ dosage: '500 mg', stockPerDose: null }, on('2026-10-05'), BOGOTA), 1);
    assert.equal(stockUnitsForDose({ dosage: '2 comprimido', stockPerDose: 2 }, on('2026-10-05'), BOGOTA), 2);
  });
});
