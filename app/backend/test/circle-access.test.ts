import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { CircleAccessService } from '../src/modules/circle/circle-access.service';
import { NO_PERMISSIONS, normalizePermissions, type CirclePermissions } from '../src/modules/circle/circle.constants';

type Grant = Partial<CirclePermissions> & { ownerId: string; granteeId: string; active: boolean };

/** Prisma falso: solo lo que usa CircleAccessService. */
function accessWith(grants: Grant[]) {
  const prisma = {
    circleGrant: {
      findFirst: async ({ where }: { where: { ownerId: string; granteeId: string } }) =>
        grants.find((grant) => grant.ownerId === where.ownerId && grant.granteeId === where.granteeId && grant.active) ?? null,
    },
  };
  return new CircleAccessService(prisma as never);
}

describe('normalizePermissions', () => {
  it('gestionar implica poder ver', () => {
    const permissions = normalizePermissions({ logDoses: true, manageAppointments: true });
    assert.equal(permissions.viewMedications, true);
    assert.equal(permissions.viewAppointments, true);
    assert.equal(permissions.viewHealth, false);
  });

  it('ignora valores que no son exactamente true y claves desconocidas', () => {
    const permissions = normalizePermissions({ viewMedications: 'true', hack: true } as never);
    assert.deepEqual(permissions, NO_PERMISSIONS);
  });
});

describe('CircleAccessService.resolveOwner', () => {
  const access = accessWith([
    { ownerId: 'mama', granteeId: 'hijo', active: true, viewMedications: true, logDoses: true },
    { ownerId: 'ana', granteeId: 'hijo', active: false, viewMedications: true },
  ]);

  it('cada uno puede todo sobre lo suyo', async () => {
    assert.equal(await access.resolveOwner('hijo', undefined, 'deleteMedications'), 'hijo');
    assert.equal(await access.resolveOwner('hijo', 'hijo', 'manageCircle'), 'hijo');
  });

  it('sin sesión no hay acceso', async () => {
    await assert.rejects(access.resolveOwner(undefined, 'mama', 'viewMedications'), UnauthorizedException);
  });

  it('con el permiso concedido, actúa sobre la información del dueño', async () => {
    assert.equal(await access.resolveOwner('hijo', 'mama', 'viewMedications'), 'mama');
    assert.equal(await access.resolveOwner('hijo', 'mama', ['viewMedications', 'logDoses']), 'mama');
  });

  it('sin el permiso concreto, se rechaza con un mensaje claro', async () => {
    await assert.rejects(access.resolveOwner('hijo', 'mama', 'editMedications'), (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.match(error.message, /editar los medicamentos/);
      return true;
    });
  });

  it('basta con que falte uno de los permisos pedidos', async () => {
    await assert.rejects(access.resolveOwner('hijo', 'mama', ['viewMedications', 'manageReminders']), ForbiddenException);
  });

  it('un vínculo revocado no da acceso', async () => {
    await assert.rejects(access.resolveOwner('hijo', 'ana', 'viewMedications'), ForbiddenException);
  });

  it('los permisos van en un solo sentido', async () => {
    await assert.rejects(access.resolveOwner('mama', 'hijo', 'viewMedications'), ForbiddenException);
  });
});
