/**
 * RNF-06: sin `aiHealthContextConsent`, al modelo no le llega el perfil de
 * salud, los medicamentos (con sus existencias y tomas de hoy) ni las citas
 * del usuario (ver ai-context.ts). Con consentimiento sí (RF-07, RF-08).
 *
 * El usuario falso tiene TODOS los datos sensibles cargados; lo único que
 * cambia entre casos es el consentimiento. El control positivo (consentimiento
 * activado) demuestra que la prueba sí detectaría la fuga.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { buildAiContext } from '../src/modules/ai/ai-context';
import { AiService } from '../src/modules/ai/ai.service';

const NOW = new Date('2026-11-22T15:00:00Z');

/** Valores únicos para buscarlos en el texto enviado al modelo. */
const SECRET = {
  conditions: 'DiabetesTipoDosZX',
  allergies: 'PenicilinaZX',
  medication: 'MetforminaZX',
  stockedMedication: 'LosartanZX',
  dosage: '850mgZX',
  medicationNote: 'NotaMedicamentoZX',
  appointment: 'ControlEndocrinoZX',
  doctor: 'DraRamirezZX',
  location: 'ClinicaNorteZX',
  appointmentNote: 'NotaCitaZX',
};
const SENSITIVE_PATTERNS: RegExp[] = [
  ...Object.values(SECRET).map((value) => new RegExp(value)),
  /Edad:/, /Existencias:/, /Tomas de hoy:/, /quedan \d/, /tomada/, /omitida/, /pospuesta/, /embarazo/, /lactancia/, /anticoagulante/, /inmunosupresi/, /cirug/,
];

const baseMedication = {
  dosageSteps: null, startDate: '2026-11-01', frequency: 'DAILY', scheduleType: 'DAILY', weekDays: [], dayInterval: null,
  maxDailyDoses: null, minHoursBetween: null, customEndDate: null, notes: null,
  stockQuantity: null, stockPerDose: null, stockAlertAt: null,
};

/**
 * Metformina sin control de existencias (08:00 pospuesta y luego tomada; 20:00
 * pendiente) y losartán con 4 en existencias (aviso en 3), omitido hoy.
 * Las 08:00 de Bogotá son las 13:00 UTC.
 */
const MEDICATIONS = [
  { ...baseMedication, id: 'med-metformina', name: SECRET.medication, dosage: SECRET.dosage, times: ['08:00', '20:00'], notes: SECRET.medicationNote },
  { ...baseMedication, id: 'med-losartan', name: SECRET.stockedMedication, dosage: '50 mg', times: ['09:00'], stockQuantity: 4, stockPerDose: 1, stockAlertAt: 3 },
];
const TODAY_LOGS = [
  { medicationId: 'med-metformina', action: 'SNOOZED', takenAt: new Date('2026-11-22T13:00:00Z'), scheduledFor: new Date('2026-11-22T13:00:00Z') },
  { medicationId: 'med-metformina', action: 'TAKEN', takenAt: new Date('2026-11-22T13:12:00Z'), scheduledFor: new Date('2026-11-22T13:00:00Z') },
  { medicationId: 'med-losartan', action: 'SKIPPED', takenAt: new Date('2026-11-22T14:30:00Z'), scheduledFor: new Date('2026-11-22T14:00:00Z') },
];

function fakePrisma(consent: boolean, medications: unknown[] = MEDICATIONS, logs: unknown[] = TODAY_LOGS) {
  const calls = { medication: 0, appointment: 0, medicationLog: 0 };
  const logQueries: unknown[] = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        timezone: 'America/Bogota',
        aiHealthContextConsent: consent,
        birthDate: new Date('1960-05-10'),
        conditions: SECRET.conditions,
        allergies: SECRET.allergies,
        pregnancy: true,
        lactation: true,
        recentSurgeries: true,
        immunosuppression: true,
        anticoagulantTreatment: true,
      }),
    },
    medication: {
      findMany: async () => {
        calls.medication += 1;
        return medications;
      },
    },
    medicationLog: {
      findMany: async (query: unknown) => {
        calls.medicationLog += 1;
        logQueries.push(query);
        return logs;
      },
    },
    appointment: {
      findMany: async () => {
        calls.appointment += 1;
        return [{
          title: SECRET.appointment, doctorName: SECRET.doctor, scheduledAt: new Date('2026-11-25T14:00:00Z'),
          location: SECRET.location, notes: SECRET.appointmentNote,
        }];
      },
    },
  };
  return { prisma, calls, logQueries };
}

/** Las líneas del medicamento `name` (la principal y sus sublíneas). */
function medicationBlock(text: string, name: string) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`  • ${name}:`));
  assert.notEqual(start, -1, `no aparece ${name}`);
  const block = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('    - ')) break;
    block.push(line);
  }
  return block.join('\n');
}

const leaks = (text: string) => SENSITIVE_PATTERNS.filter((pattern) => pattern.test(text)).map(String);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Captura TODO lo que se envía a Groq (cuerpo JSON o FormData). */
function captureGroq(response: unknown) {
  const sent: string[] = [];
  globalThis.fetch = (async (_url: string, init: { body: unknown }) => {
    if (typeof init.body === 'string') sent.push(init.body);
    else if (init.body instanceof FormData) {
      for (const [key, value] of init.body.entries()) if (typeof value === 'string') sent.push(`${key}=${value}`);
    }
    return { ok: true, status: 200, json: async () => response } as Response;
  }) as typeof fetch;
  return sent;
}

const config = { get: () => undefined, getOrThrow: () => 'key' };
const chatReply = { choices: [{ message: { content: 'Hola, ¿en qué te ayudo?' } }] };

describe('RNF-06: contexto del asistente sin consentimiento', () => {
  it('buildAiContext: sin consentimiento no consulta medicamentos, existencias, tomas ni citas y no incluye datos de salud', async () => {
    const { prisma, calls } = fakePrisma(false);
    const context = await buildAiContext(prisma as never, 'user-a', NOW);
    assert.equal(context.personal, false);
    assert.deepEqual(calls, { medication: 0, appointment: 0, medicationLog: 0 });
    assert.deepEqual(leaks(context.text), []);
    assert.match(context.text, /NO autorizó compartir/);
    assert.match(context.text, /Fecha y hora actual/);
  });

  it('control positivo: con consentimiento sí aparecen (la prueba detecta la fuga)', async () => {
    const { prisma, calls } = fakePrisma(true);
    const context = await buildAiContext(prisma as never, 'user-a', NOW);
    assert.equal(context.personal, true);
    assert.deepEqual(calls, { medication: 1, appointment: 1, medicationLog: 1 });
    for (const value of [SECRET.conditions, SECRET.allergies, SECRET.medication, SECRET.stockedMedication, SECRET.appointment, SECRET.doctor]) {
      assert.match(context.text, new RegExp(value));
    }
  });

  it('con consentimiento: existencias y tomas de hoy (estado y hora en su zona) de cada medicamento', async () => {
    const { prisma } = fakePrisma(true);
    const { text } = await buildAiContext(prisma as never, 'user-a', NOW);
    const losartan = medicationBlock(text, SECRET.stockedMedication);
    assert.match(losartan, /Existencias: quedan 4, 1 por toma \(aviso al llegar a 3\)\./);
    assert.match(losartan, /Tomas de hoy: toma de las 09:00: omitida a las 09:30\./);
    const metformina = medicationBlock(text, SECRET.medication);
    assert.match(metformina, /Tomas de hoy: toma de las 08:00: pospuesta a las 08:00; toma de las 08:00: tomada a las 08:12\./);
  });

  it('medicamento sin control de existencias: no inventa existencias', async () => {
    const { prisma } = fakePrisma(true);
    const { text } = await buildAiContext(prisma as never, 'user-a', NOW);
    assert.doesNotMatch(medicationBlock(text, SECRET.medication), /Existencias/);
    assert.match(text, /no muestra existencias, el usuario no lleva la cuenta/);
  });

  it('sin tomas hoy lo dice, y solo pide las tomas de hoy en la zona del usuario', async () => {
    const { prisma, logQueries } = fakePrisma(true, MEDICATIONS, []);
    const { text } = await buildAiContext(prisma as never, 'user-a', NOW);
    assert.match(medicationBlock(text, SECRET.medication), /Tomas de hoy: ninguna registrada\./);
    // 22 de nov. en Bogotá (UTC-5): de 05:00 UTC del 22 a 05:00 UTC del 23.
    const today = { gte: new Date('2026-11-22T05:00:00Z'), lt: new Date('2026-11-23T05:00:00Z') };
    assert.deepEqual((logQueries[0] as { where: unknown }).where, {
      medication: { userId: 'user-a', active: true },
      OR: [{ scheduledFor: today }, { scheduledFor: null, takenAt: today }],
    });
  });

  it('usuario inexistente / sin dato de consentimiento: se trata como no autorizado', async () => {
    const prisma = { user: { findUnique: async () => null } };
    const context = await buildAiContext(prisma as never, 'nadie', NOW);
    assert.equal(context.personal, false);
  });

  it('/ai/chat: el payload completo enviado a Groq no contiene datos de salud, medicamentos ni citas', async () => {
    const { prisma, calls } = fakePrisma(false);
    const sent = captureGroq(chatReply);
    const result = await new AiService(config as never, prisma as never).chat({ message: '¿Puedo tomar ibuprofeno?' }, 'user-a');
    assert.equal(result.usedPersonalContext, false);
    assert.equal(sent.length, 1);
    assert.deepEqual(leaks(sent.join('\n')), []);
    assert.deepEqual(calls, { medication: 0, appointment: 0, medicationLog: 0 });
  });

  it('/ai/chat control positivo: con consentimiento el payload sí los lleva', async () => {
    const { prisma } = fakePrisma(true);
    const sent = captureGroq(chatReply);
    const result = await new AiService(config as never, prisma as never).chat({ message: 'Hola' }, 'user-a');
    assert.equal(result.usedPersonalContext, true);
    assert.match(sent.join('\n'), new RegExp(SECRET.medication));
  });

  it('/ai/transcribe: sin consentimiento el prompt de Whisper no lleva nombres de medicamentos', async () => {
    const { prisma, calls } = fakePrisma(false);
    const sent = captureGroq({ text: 'hola' });
    await new AiService(config as never, prisma as never).transcribe({ buffer: Buffer.from('x'), mimetype: 'audio/m4a' }, 'user-a');
    assert.equal(calls.medication, 0);
    assert.equal(calls.medicationLog, 0);
    assert.deepEqual(leaks(sent.join('\n')), []);
  });
});
