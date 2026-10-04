import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseProposal } from '../src/modules/ai/ai-proposals';

const TODAY = '2026-10-03';
const med = (args: Record<string, unknown>) => parseProposal('propose_medication', JSON.stringify(args), TODAY);
const appt = (args: Record<string, unknown>) => parseProposal('propose_appointment', JSON.stringify(args), TODAY);

describe('propuestas del asistente', () => {
  it('acepta un medicamento completo y normaliza la hora', () => {
    assert.deepEqual(med({ name: ' Paracetamol ', dosageAmount: 500, dosageUnit: 'MG', intervalHours: 8, firstDoseTime: '8:00' }), {
      kind: 'medication', name: 'Paracetamol', dosageAmount: 500, dosageUnit: 'mg', intervalHours: 8, firstDoseTime: '08:00', durationDays: null, notes: null,
    });
  });

  it('descarta medicamentos con datos inválidos', () => {
    assert.equal(med({ name: 'X', dosageAmount: -1, dosageUnit: 'mg', intervalHours: 8, firstDoseTime: '08:00' }), null);
    assert.equal(med({ name: 'X', dosageAmount: 5, dosageUnit: 'cucharadas', intervalHours: 8, firstDoseTime: '08:00' }), null);
    assert.equal(med({ name: 'X', dosageAmount: 5, dosageUnit: 'mg', intervalHours: 48, firstDoseTime: '08:00' }), null);
    assert.equal(med({ name: 'X', dosageAmount: 5, dosageUnit: 'mg', intervalHours: 8, firstDoseTime: '25:00' }), null);
    assert.equal(parseProposal('propose_medication', '{no es json', TODAY), null);
  });

  it('acepta una cita futura y rechaza una pasada', () => {
    assert.equal(appt({ title: 'Cardiología', doctorName: 'Dra. Ruiz', date: '2026-10-05', time: '09:30' })?.kind, 'appointment');
    assert.equal(appt({ title: 'Cardiología', doctorName: 'Dra. Ruiz', date: '2026-10-01', time: '09:30' }), null);
  });

  it('ignora herramientas desconocidas', () => {
    assert.equal(parseProposal('delete_everything', '{}', TODAY), null);
  });
});
