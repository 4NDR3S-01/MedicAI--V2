/**
 * Cambios sin conexión de la app (app/src/features/tabs/data/offline-ops.ts):
 * lo que se muestra = datos del servidor + cola de cambios pendientes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  enqueueOp,
  isTempId,
  newTempId,
  remapTempId,
  replay,
  type OfflineOp,
  type OwnData,
} from '../../src/features/tabs/data/offline-ops';
import type { MedicationData } from '../../src/features/tabs/services/medications.service';
import type { AppointmentData } from '../../src/features/tabs/services/appointments.service';

const AT = '2026-11-09T12:00:00.000Z';

const med = (id: string, active = true): MedicationData => ({
  id,
  userId: 'u1',
  name: `Med ${id}`,
  dosage: '500 mg',
  frequency: 'Una vez al día',
  times: ['08:00'],
  notes: null,
  active,
  activeSince: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const appt = (id: string, scheduledAt: string, seriesId: string | null = null): AppointmentData => ({
  id,
  userId: 'u1',
  title: `Cita ${id}`,
  doctorName: 'Dra',
  scheduledAt,
  location: null,
  notes: null,
  active: true,
  attendanceStatus: 'PENDING',
  attendanceMarkedAt: null,
  seriesId,
  createdAt: AT,
  updatedAt: AT,
});

const base = (): OwnData => ({ medications: [med('m1'), med('m2')], appointments: [appt('a1', '2026-11-20T09:00:00.000Z')] });

describe('replay', () => {
  it('un medicamento desactivado sin conexión sigue desactivado aunque el servidor diga activo', () => {
    const queue: OfflineOp[] = [{ id: 'o1', at: AT, kind: 'medUpdate', medicationId: 'm1', patch: { active: false } }];
    const view = replay(base(), queue);
    const m1 = view.medications.find((item) => item.id === 'm1');
    assert.equal(m1?.active, false);
    assert.equal(m1?.pendingSync, true);
    // Los datos del servidor no se tocan.
    assert.equal(base().medications[0].active, true);
  });

  it('reactivar marca activeSince con la hora del cambio, como el servidor', () => {
    const data: OwnData = { medications: [med('m1', false)], appointments: [] };
    const view = replay(data, [{ id: 'o1', at: AT, kind: 'medUpdate', medicationId: 'm1', patch: { active: true } }]);
    assert.equal(view.medications[0].activeSince, AT);
  });

  it('crear sin conexión muestra el medicamento con id provisional', () => {
    const tempId = newTempId();
    const view = replay(base(), [
      {
        id: 'o1',
        at: AT,
        kind: 'medCreate',
        tempId,
        payload: { name: 'Ibuprofeno', dosage: '400 mg', frequency: 'Cada 8 horas', times: ['08:00', '16:00', '00:00'] },
      },
    ]);
    assert.equal(view.medications[0].id, tempId);
    assert.ok(isTempId(view.medications[0].id));
    assert.equal(view.medications[0].active, true);
    assert.equal(view.medications.length, 3);
  });

  it('borrar quita el medicamento o la cita', () => {
    const view = replay(base(), [
      { id: 'o1', at: AT, kind: 'medDelete', medicationId: 'm2' },
      { id: 'o2', at: AT, kind: 'apptDelete', appointmentId: 'a1' },
    ]);
    assert.deepEqual(view.medications.map((item) => item.id), ['m1']);
    assert.equal(view.appointments.length, 0);
  });

  it('marcar asistencia guarda la hora; volver a "sin marcar" la limpia', () => {
    const marked = replay(base(), [{ id: 'o1', at: AT, kind: 'apptUpdate', appointmentId: 'a1', patch: { attendanceStatus: 'ATTENDED' } }]);
    assert.equal(marked.appointments[0].attendanceStatus, 'ATTENDED');
    assert.equal(marked.appointments[0].attendanceMarkedAt, AT);
    const reset = replay(marked, [{ id: 'o2', at: AT, kind: 'apptUpdate', appointmentId: 'a1', patch: { attendanceStatus: 'PENDING' } }]);
    assert.equal(reset.appointments[0].attendanceMarkedAt, null);
  });

  it('"esta y las siguientes" de una serie: borra desde la elegida, no las anteriores', () => {
    const data: OwnData = {
      medications: [],
      appointments: [
        appt('s1', '2026-11-01T09:00:00.000Z', 'S'),
        appt('s2', '2026-11-08T09:00:00.000Z', 'S'),
        appt('s3', '2026-11-15T09:00:00.000Z', 'S'),
        appt('x', '2026-11-10T09:00:00.000Z'),
      ],
    };
    const view = replay(data, [{ id: 'o1', at: AT, kind: 'apptDelete', appointmentId: 's2', scope: 'FOLLOWING' }]);
    assert.deepEqual(view.appointments.map((item) => item.id).sort(), ['s1', 'x']);
  });

  it('editar "esta y las siguientes" copia el título pero no mueve las fechas de las demás', () => {
    const data: OwnData = {
      medications: [],
      appointments: [appt('s1', '2026-11-01T09:00:00.000Z', 'S'), appt('s2', '2026-11-08T09:00:00.000Z', 'S')],
    };
    const view = replay(data, [
      { id: 'o1', at: AT, kind: 'apptUpdate', appointmentId: 's1', scope: 'FOLLOWING', patch: { title: 'Control', scheduledAt: '2026-11-01T10:00:00.000Z' } },
    ]);
    assert.equal(view.appointments[0].scheduledAt, '2026-11-01T10:00:00.000Z');
    assert.equal(view.appointments[1].scheduledAt, '2026-11-08T09:00:00.000Z');
    assert.equal(view.appointments[1].title, 'Control');
  });
});

describe('enqueueOp / remapTempId', () => {
  it('borrar algo creado sin conexión lo quita de la cola sin enviar nada', () => {
    const tempId = newTempId();
    let queue: OfflineOp[] = [];
    queue = enqueueOp(queue, { id: 'o1', at: AT, kind: 'medCreate', tempId, payload: { name: 'X', dosage: '1', frequency: 'f', times: [] } });
    queue = enqueueOp(queue, { id: 'o2', at: AT, kind: 'medUpdate', medicationId: tempId, patch: { dosage: '2' } });
    queue = enqueueOp(queue, { id: 'o3', at: AT, kind: 'medUpdate', medicationId: 'm1', patch: { active: false } });
    queue = enqueueOp(queue, { id: 'o4', at: AT, kind: 'medDelete', medicationId: tempId });
    assert.deepEqual(queue.map((op) => op.id), ['o3']);
  });

  it('al crearse en el servidor, los cambios pendientes usan el id real', () => {
    const tempId = newTempId();
    const queue: OfflineOp[] = [
      { id: 'o2', at: AT, kind: 'medUpdate', medicationId: tempId, patch: { active: false } },
      { id: 'o3', at: AT, kind: 'apptDelete', appointmentId: 'a1' },
    ];
    const remapped = remapTempId(queue, tempId, 'real-1');
    assert.equal(remapped[0].kind === 'medUpdate' && remapped[0].medicationId, 'real-1');
    assert.equal(remapped[1].kind === 'apptDelete' && remapped[1].appointmentId, 'a1');
  });
});
