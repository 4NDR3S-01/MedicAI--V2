import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AttemptLimiter } from '../src/common/attempt-limiter';
import { AccessTokenService, SESSION_CHECK_TTL_MS } from '../src/modules/auth/access-token.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt.guard';

const config = new ConfigService({
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '90d',
  APP_BASE_URL: 'https://medicai.lat',
});

// ─── AttemptLimiter ──────────────────────────────────────────────────────────

test('AttemptLimiter: permite hasta el máximo en la ventana y luego indica cuánto esperar', () => {
  let now = 1_000_000;
  const limiter = new AttemptLimiter(3, 60_000, () => now);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(limiter.retryAfterMs('a'), 0);
    limiter.record('a');
    now += 1_000;
  }
  // Primer intento a t=1 000 000; ahora t=1 003 000 → faltan 57 s.
  assert.equal(limiter.retryAfterMs('a'), 57_000);
  assert.equal(limiter.retryAfterMs('b'), 0, 'otra clave no se ve afectada');
  now += 57_000;
  assert.equal(limiter.retryAfterMs('a'), 0, 'al salir de la ventana el intento más antiguo deja de contar');
});

test('AttemptLimiter: reset borra los intentos y el número de claves está acotado', () => {
  let now = 0;
  const limiter = new AttemptLimiter(1, 60_000, () => now, 100);
  limiter.record('x');
  assert.ok(limiter.retryAfterMs('x') > 0);
  limiter.reset('x');
  assert.equal(limiter.retryAfterMs('x'), 0);
  for (let i = 0; i < 1_000; i += 1) {
    now += 1;
    limiter.record(`k${i}`);
  }
  const size = (limiter as unknown as { hits: Map<string, number[]> }).hits.size;
  assert.ok(size <= 101, `claves en memoria: ${size}`);
});

// ─── Login: bloqueo por cuenta ───────────────────────────────────────────────

async function buildAuth() {
  const passwordHash = await bcrypt.hash('Correcta-123', 4);
  const user = {
    id: 'u1',
    email: 'ana@example.com',
    fullName: 'Ana',
    passwordHash,
    isManaged: false,
    isEmailVerified: true,
    birthDate: null,
    avatar: null,
  };
  const sent: string[] = [];
  const prisma = {
    user: { findUnique: async ({ where }: any) => (where.email === user.email || where.id === user.id ? user : null) },
    userSession: {
      deleteMany: async () => ({ count: 0 }),
      create: async () => ({}),
      findMany: async () => [],
    },
    emailVerificationToken: { create: async () => ({}) },
    passwordResetToken: { create: async () => ({}) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  const mail = {
    sendPasswordResetEmail: async ({ to }: any) => void sent.push(`reset:${to}`),
    sendVerificationEmail: async ({ to }: any) => void sent.push(`verify:${to}`),
  };
  const auth = new AuthService(prisma as any, new JwtService({}), config, mail as any);
  return { auth, user, sent };
}

async function loginStatus(auth: AuthService, email: string, password: string) {
  try {
    await auth.login({ email, password } as any);
    return 200;
  } catch (error) {
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
}

test('login: tras 10 contraseñas fallidas la cuenta se bloquea, incluso con la contraseña correcta', async () => {
  const { auth, user } = await buildAuth();
  for (let i = 0; i < 10; i += 1) {
    assert.equal(await loginStatus(auth, user.email, 'mala'), HttpStatus.UNAUTHORIZED);
  }
  assert.equal(await loginStatus(auth, user.email, 'Correcta-123'), HttpStatus.TOO_MANY_REQUESTS);
  assert.equal(await loginStatus(auth, ' ANA@example.com ', 'Correcta-123'), HttpStatus.TOO_MANY_REQUESTS, 'mayúsculas/espacios no lo saltan');
});

test('login: un acierto antes del límite reinicia el contador', async () => {
  const { auth, user } = await buildAuth();
  for (let i = 0; i < 9; i += 1) await loginStatus(auth, user.email, 'mala');
  assert.equal(await loginStatus(auth, user.email, 'Correcta-123'), 200);
  for (let i = 0; i < 9; i += 1) {
    assert.equal(await loginStatus(auth, user.email, 'mala'), HttpStatus.UNAUTHORIZED);
  }
});

test('login: un correo sin cuenta se bloquea igual (no revela qué correos existen)', async () => {
  const { auth } = await buildAuth();
  for (let i = 0; i < 10; i += 1) {
    assert.equal(await loginStatus(auth, 'nadie@example.com', 'x'), HttpStatus.UNAUTHORIZED);
  }
  assert.equal(await loginStatus(auth, 'nadie@example.com', 'x'), HttpStatus.TOO_MANY_REQUESTS);
});

// ─── Correos de autenticación: 1 por minuto por cuenta ───────────────────────

test('olvidé mi contraseña: no se puede usar para llenar de correos el buzón de alguien', async () => {
  const { auth, user, sent } = await buildAuth();
  const first = await auth.requestPasswordReset(user.email);
  const second = await auth.requestPasswordReset(user.email);
  const third = await auth.requestPasswordReset(user.email.toUpperCase());
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, [`reset:${user.email}`]);
  assert.deepEqual(second, first, 'la respuesta es la misma se envíe o no');
  assert.deepEqual(third, first);
});

// ─── Access token: la sesión debe seguir abierta ─────────────────────────────

test('access token: deja de servir cuando su sesión se cierra y no sirve sin sesión', async () => {
  const jwt = new JwtService({});
  const sessions = new Map<string, { userId: string; expiresAt: Date }>([
    ['s1', { userId: 'u1', expiresAt: new Date(Date.now() + 86_400_000) }],
  ]);
  let queries = 0;
  const prisma = {
    userSession: {
      findUnique: async ({ where }: any) => {
        queries += 1;
        return sessions.get(where.id) ?? null;
      },
    },
  };
  const service = new AccessTokenService(prisma as any, jwt, config);
  const sign = (payload: object) =>
    jwt.sign(payload, { secret: config.get('JWT_ACCESS_SECRET'), algorithm: 'HS256', expiresIn: '15m' });
  const request = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

  const token = sign({ sub: 'u1', email: 'a@b.c', sid: 's1' });
  assert.equal((await service.verifyActiveSession(request(token)))?.sub, 'u1');
  await service.verifyActiveSession(request(token));
  assert.equal(queries, 1, 'la sesión abierta se recuerda unos segundos (una consulta)');

  assert.equal(await service.verifyActiveSession(request(sign({ sub: 'u2', email: 'x@y.z', sid: 's1' }))), null, 'sid de otra persona');
  assert.equal(await service.verifyActiveSession(request(sign({ sub: 'u1', email: 'a@b.c' }))), null, 'token sin sesión');
  assert.equal(await service.verifyActiveSession(request(sign({ sub: 'u1', email: 'a@b.c', sid: 'nope' }))), null);

  // Se cierra la sesión: en cuanto vence la caché, el token deja de servir.
  sessions.delete('s1');
  const cache = (service as unknown as { openSessions: Map<string, { until: number }> }).openSessions;
  const entry = cache.get('s1');
  assert.ok(entry && entry.until - Date.now() <= SESSION_CHECK_TTL_MS);
  entry.until = Date.now() - 1;
  assert.equal(await service.verifyActiveSession(request(token)), null);
});

test('access token: rechaza tokens firmados con otro secreto o con alg "none"', async () => {
  const jwt = new JwtService({});
  const prisma = { userSession: { findUnique: async () => ({ userId: 'u1', expiresAt: new Date(Date.now() + 60_000) }) } };
  const service = new AccessTokenService(prisma as any, jwt, config);
  const request = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

  const refreshLike = jwt.sign({ sub: 'u1', email: 'a@b.c', sid: 's1' }, { secret: config.get('JWT_REFRESH_SECRET') });
  assert.equal(await service.verifyActiveSession(request(refreshLike)), null, 'un refresh token no sirve como access token');

  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'u1', sid: 's1', exp: Math.floor(Date.now() / 1000) + 600 })}.`;
  assert.equal(await service.verifyActiveSession(request(unsigned)), null);
});

test('JwtAuthGuard: responde 401 si la sesión ya no existe', async () => {
  const service = { hasBearerToken: () => true, verifyActiveSession: async () => null } as any;
  const guard = new JwtAuthGuard(service);
  const context = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer x' } }) }) } as any;
  await assert.rejects(guard.canActivate(context), UnauthorizedException);
});
