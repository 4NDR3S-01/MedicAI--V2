import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { seriesDates } from '../src/modules/appointments/appointment-series';
import { MAX_SERIES_OCCURRENCES } from '../src/modules/appointments/dto/repeat.dto';

const BOGOTA = 'America/Bogota';
const label = (date: Date, timeZone = BOGOTA) =>
  date.toLocaleString('es-ES', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const monday = new Date('2026-10-05T07:30:00-05:00');

describe('seriesDates', () => {
  it('diálisis lunes, miércoles y viernes hasta una fecha (incluida)', () => {
    const dates = seriesDates(monday, { frequency: 'WEEKLY', weekDays: [1, 3, 5], until: '2026-10-16' }, BOGOTA);
    assert.deepEqual(dates.map((date) => label(date)), [
      'lun, 5 oct, 07:30', 'mié, 7 oct, 07:30', 'vie, 9 oct, 07:30',
      'lun, 12 oct, 07:30', 'mié, 14 oct, 07:30', 'vie, 16 oct, 07:30',
    ]);
  });

  it('cada 2 semanas, 3 veces', () => {
    const dates = seriesDates(monday, { frequency: 'WEEKLY', interval: 2, count: 3 }, BOGOTA);
    assert.deepEqual(dates.map((date) => label(date)), ['lun, 5 oct, 07:30', 'lun, 19 oct, 07:30', 'lun, 2 nov, 07:30']);
  });

  it('cada mes el día 31 se salta los meses que no lo tienen', () => {
    const dates = seriesDates(new Date('2026-10-31T09:00:00-05:00'), { frequency: 'MONTHLY', until: '2027-03-31' }, BOGOTA);
    assert.deepEqual(dates.map((date) => label(date)), ['sáb, 31 oct, 09:00', 'jue, 31 dic, 09:00', 'dom, 31 ene, 09:00', 'mié, 31 mar, 09:00']);
  });

  it('mantiene la hora local aunque cambie el horario de verano', () => {
    const madrid = 'Europe/Madrid';
    const dates = seriesDates(new Date('2026-10-19T10:00:00+02:00'), { frequency: 'WEEKLY', count: 3 }, madrid);
    assert.deepEqual(dates.map((date) => label(date, madrid)), ['lun, 19 oct, 10:00', 'lun, 26 oct, 10:00', 'lun, 2 nov, 10:00']);
  });

  it('avisa cuando la serie no cabe (devuelve una de más)', () => {
    const dates = seriesDates(monday, { frequency: 'DAILY', until: '2027-10-01' }, BOGOTA);
    assert.equal(dates.length, MAX_SERIES_OCCURRENCES + 1);
  });

  it('nunca pasa de un año', () => {
    const dates = seriesDates(monday, { frequency: 'MONTHLY', until: '2030-01-01' }, BOGOTA);
    assert.equal(dates.length, 13);
  });
});
