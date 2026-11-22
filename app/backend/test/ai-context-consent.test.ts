/**
 * RNF-06: sin `aiHealthContextConsent`, al modelo no le llega el perfil de
 * salud, los medicamentos ni las citas del usuario (ver ai-context.ts).
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
  dosage: '850mgZX',
  medicationNote: 'NotaMedicamentoZX',
  appointment: 'ControlEndocrinoZX',
  doctor: 'DraRamirezZX',
  location: 'ClinicaNorteZX',
  appointmentNote: 'NotaCitaZX',
};
const SENSITIVE_PATTERNS: RegExp[] = [
  ...Object.values(SECRET).map((value) => new RegExp(value)),
  /Edad:/, /embarazo/, /lactancia/, /anticoagulante/, /inmunosupresi/, /cirug/,
];

function fakePrisma(consent: boolean) {
  const calls = { medication: 0, appointment: 0 };
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
        return [{
          name: SECRET.medication, dosage: SECRET.dosage, dosageSteps: null, startDate: '2026-11-01', frequency: 'DAILY',
          times: ['08:00'], scheduleType: 'DAILY', weekDays: [], dayInterval: null, maxDailyDoses: null,
          minHoursBetween: null, customEndDate: null, notes: SECRET.medicationNote,
        }];
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
  return { prisma, calls };
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
  it('buildAiContext: sin consentimiento no consulta medicamentos ni citas y no incluye datos de salud', async () => {
    const { prisma, calls } = fakePrisma(false);
    const context = await buildAiContext(prisma as never, 'user-a', NOW);
    assert.equal(context.personal, false);
    assert.deepEqual(calls, { medication: 0, appointment: 0 });
    assert.deepEqual(leaks(context.text), []);
    assert.match(context.text, /NO autorizó compartir/);
    assert.match(context.text, /Fecha y hora actual/);
  });

  it('control positivo: con consentimiento sí aparecen (la prueba detecta la fuga)', async () => {
    const { prisma, calls } = fakePrisma(true);
    const context = await buildAiContext(prisma as never, 'user-a', NOW);
    assert.equal(context.personal, true);
    assert.deepEqual(calls, { medication: 1, appointment: 1 });
    for (const value of [SECRET.conditions, SECRET.allergies, SECRET.medication, SECRET.appointment, SECRET.doctor]) {
      assert.match(context.text, new RegExp(value));
    }
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
    assert.deepEqual(calls, { medication: 0, appointment: 0 });
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
    assert.deepEqual(leaks(sent.join('\n')), []);
  });
});
