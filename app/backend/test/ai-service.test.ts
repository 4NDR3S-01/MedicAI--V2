import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { AiService } from '../src/modules/ai/ai.service';

type Call = { model: string; tools: boolean; content: unknown };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Groq falso: responde según el modelo y si van herramientas. */
function fakeGroq(respond: (call: Call) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const payload = JSON.parse(init.body) as { model: string; tools?: unknown; messages: { content: unknown }[] };
    const call = { model: payload.model, tools: Boolean(payload.tools), content: payload.messages[payload.messages.length - 1].content };
    calls.push(call);
    const { status, body } = respond(call);
    return { ok: status < 400, status, json: async () => body } as Response;
  }) as typeof fetch;
  return calls;
}

const reply = (content: string) => ({ status: 200, body: { choices: [{ message: { content } }] } });
const config = { get: () => undefined, getOrThrow: () => 'key' };
const prisma = { user: { findUnique: async () => ({ timezone: 'America/Bogota', aiHealthContextConsent: false }) } };
const service = () => new AiService(config as never, prisma as never);

describe('asistente: modelos', () => {
  it('usa el modelo que entiende imágenes y le envía la foto', async () => {
    const calls = fakeGroq(() => reply('Es una caja de paracetamol.'));
    const result = await service().chat({ message: '¿Qué es?', images: ['data:image/jpeg;base64,AAAA'] }, 'u');
    assert.equal(calls[0].model, 'qwen/qwen3.8-27b');
    assert.ok(Array.isArray(calls[0].content));
    assert.equal(result.reply, 'Es una caja de paracetamol.');
  });

  it('si el modelo no está disponible, responde con el de respaldo (sin la foto)', async () => {
    const calls = fakeGroq((call) =>
      call.model.startsWith('qwen')
        ? { status: 404, body: { error: { message: 'The model does not exist', code: 'model_not_found' } } }
        : reply('Respuesta de respaldo'));
    const result = await service().chat({ message: 'Hola', images: ['data:image/jpeg;base64,AAAA'] }, 'u');
    assert.deepEqual(calls.map((call) => call.model), ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']);
    assert.equal(typeof calls[1].content, 'string');
    assert.match(String(calls[1].content), /no puedes verlas/);
    assert.equal(result.model, 'openai/gpt-oss-120b');
  });

  it('si genera mal una herramienta, repite sin herramientas', async () => {
    const calls = fakeGroq((call) =>
      call.tools ? { status: 400, body: { error: { message: 'Failed to call a function', code: 'tool_use_failed' } } } : reply('Ok'));
    const result = await service().chat({ message: 'Hola' }, 'u');
    assert.deepEqual(calls.map((call) => call.tools), [true, false]);
    assert.equal(result.reply, 'Ok');
  });

  it('quita el razonamiento <think> de la respuesta', async () => {
    fakeGroq(() => reply('<think>pensando…</think>Tómalo con comida.'));
    assert.equal((await service().chat({ message: 'Hola' }, 'u')).reply, 'Tómalo con comida.');
  });

  it('límite del plan gratuito: mensaje claro', async () => {
    fakeGroq(() => ({ status: 429, body: { error: { message: 'Rate limit reached' } } }));
    await assert.rejects(service().chat({ message: 'Hola' }, 'u'), /muchas consultas/);
  });

  it('clave de Groq inválida: no reintenta con el respaldo y lo dice claro', async () => {
    const calls = fakeGroq(() => ({ status: 401, body: { error: { message: 'Invalid API Key', code: 'invalid_api_key' } } }));
    await assert.rejects(service().chat({ message: 'Hola' }, 'u'), /configuración del servidor/);
    assert.equal(calls.length, 1);
  });
});
