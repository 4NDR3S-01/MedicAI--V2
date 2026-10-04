import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AccountExportService } from '../src/modules/auth/account-export.service';

const now = new Date('2026-10-03T12:00:00Z');

/** Prisma falso que devuelve filas con campos secretos: no deben salir en la copia. */
function service(email = 'ana@example.com') {
  const sent: { to: string; json: string }[] = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        email, fullName: 'Ana Pérez', birthDate: '1990-05-01', phone: null, conditions: 'Diabetes', allergies: 'Penicilina',
        pregnancy: false, lactation: false, recentSurgeries: false, immunosuppression: false, anticoagulantTreatment: false,
        aiHealthContextConsent: true, timezone: 'America/Bogota', createdAt: now,
      }),
    },
    medication: {
      findMany: async () => [{
        name: 'Metformina', dosage: '850 mg', frequency: 'Dos veces al dia', times: ['08:00', '20:00'], scheduleType: 'DAILY',
        weekDays: [], dayInterval: null, startDate: null, customEndDate: null, dosageSteps: null, maxDailyDoses: null,
        minHoursBetween: null, stockQuantity: 20, active: true, notes: null, createdAt: now, createdBy: { id: 'u1', fullName: 'Ana Pérez' },
        logs: [{ action: 'TAKEN', scheduledFor: now, takenAt: now, loggedBy: null }],
      }],
    },
    appointment: { findMany: async () => [] },
    circleLink: {
      findMany: async () => [{
        userAId: 'u1', userBId: 'u2', relationA: 'MOTHER', relationALabel: null, relationB: 'SON', relationBLabel: null,
        status: 'ACTIVE', createdAt: now, revokedAt: null, userA: { fullName: 'Ana Pérez' }, userB: { fullName: 'Mateo' },
        grants: [{ ownerId: 'u1', granteeId: 'u2', viewMedications: true }],
      }],
    },
    circleGroup: { findMany: async () => [{ name: 'Familia', createdAt: now }] },
    circleAuditEvent: { findMany: async () => [] },
    userSession: { findMany: async () => [{ deviceName: 'Pixel 8', platform: 'android', createdAt: now, lastUsedAt: now, refreshTokenHash: 'secreto' }] },
  };
  const mail = { sendDataExportEmail: async (params: { to: string; json: string }) => void sent.push(params) };
  return { exporter: new AccountExportService(prisma as never, mail as never), sent };
}

describe('descargar mis datos', () => {
  it('reúne la información de la cuenta sin secretos', async () => {
    const { exporter } = service();
    const data = await exporter.collect('u1');
    const json = JSON.stringify(data);
    assert.equal(data.medicamentos[0].tomas.length, 1);
    assert.equal(data.circulo.vinculos[0].persona, 'Mateo');
    assert.equal(data.circulo.vinculos[0].permisosQueLeDas?.viewMedications, true);
    assert.doesNotMatch(json, /secreto|passwordHash|refreshToken|tokenHash/);
  });

  it('se envía al correo de la cuenta y no más de una vez por hora', async () => {
    const { exporter, sent } = service();
    await exporter.sendExport('u1');
    assert.equal(sent[0].to, 'ana@example.com');
    await assert.rejects(exporter.sendExport('u1'), /hace poco/);
  });

  it('un perfil a cargo (sin correo real) no puede pedir la copia', async () => {
    const { exporter } = service('abc@perfil.medicai.invalid');
    await assert.rejects(exporter.sendExport('u1'), /no tiene un correo/);
  });
});
