import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

import { AiController } from '../src/modules/ai/ai.controller';

function controller() {
  const received: { mimetype: string; size: number; originalname: string }[] = [];
  const service = { transcribe: async (audio: { mimetype: string; buffer: Buffer; originalname: string }) => {
    received.push({ mimetype: audio.mimetype, size: audio.buffer.length, originalname: audio.originalname });
    return { text: 'hola' };
  } };
  return { ctrl: new AiController(service as never), received };
}
const req = { user: { sub: 'u' } };

describe('transcribir voz', () => {
  it('acepta el audio en base64 dentro de JSON', async () => {
    const { ctrl, received } = controller();
    const audio = Buffer.from('audio-de-prueba').toString('base64');
    assert.deepEqual(await ctrl.transcribe(undefined, { audio, format: 'm4a' }, req), { text: 'hola' });
    assert.deepEqual(received[0], { mimetype: 'audio/m4a', size: 15, originalname: 'voz.m4a' });
  });

  it('sigue aceptando un archivo adjunto', async () => {
    const { ctrl, received } = controller();
    const file = { buffer: Buffer.from('x'), mimetype: 'audio/m4a', originalname: 'voz.m4a', size: 1 };
    await ctrl.transcribe(file, {}, req);
    assert.equal(received.length, 1);
  });

  it('sin audio: error claro', () => {
    const { ctrl } = controller();
    assert.throws(() => ctrl.transcribe(undefined, {}, req), BadRequestException);
  });
});
