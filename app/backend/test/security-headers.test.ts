import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import express from 'express';

import {
  API_SECURITY_HEADERS,
  authBridgeCsp,
  createCspNonce,
  securityHeadersMiddleware,
} from '../src/infrastructure/http/security-headers';

async function withServer(app: express.Express, run: (base: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  // Como el GlobalExceptionFilter de Nest: los errores también salen con las cabeceras.
  app.get('/missing', (_req, res) => {
    res.status(404).json({ statusCode: 404, message: 'Not Found' });
  });
  app.get('/bridge', (_req, res) => {
    const nonce = createCspNonce();
    res.status(200).type('html').setHeader('Content-Security-Policy', authBridgeCsp(nonce));
    res.send(`<style nonce="${nonce}"></style><script nonce="${nonce}"></script>`);
  });
  return app;
}

test('la API envía las cabeceras de seguridad y no revela Express', async () => {
  await withServer(buildApp(), async (base) => {
    for (const path of ['/health', '/missing']) {
      const res = await fetch(base + path);
      assert.equal(res.headers.get('x-powered-by'), null, path);
      for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
        assert.equal(res.headers.get(name), value, `${path} ${name}`);
      }
    }
  });
});

test('HSTS de al menos un año e incluye subdominios', () => {
  const hsts = API_SECURITY_HEADERS['Strict-Transport-Security'];
  const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1]);
  assert.ok(maxAge >= 31536000);
  assert.match(hsts, /includeSubDomains/);
});

test('las páginas puente usan una CSP con nonce único que coincide con su HTML', async () => {
  await withServer(buildApp(), async (base) => {
    const first = await fetch(base + '/bridge');
    const second = await fetch(base + '/bridge');
    const csp = first.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    assert.ok(nonce, csp);
    assert.ok((await first.text()).includes(`nonce="${nonce}"`));
    assert.notEqual(second.headers.get('content-security-policy'), csp);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(first.headers.get('x-frame-options'), 'DENY');
  });
});
