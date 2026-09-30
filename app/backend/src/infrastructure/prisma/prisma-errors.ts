import { Prisma } from '@prisma/client';

/** P2025: el registro a actualizar/borrar no existe (o no cumple el filtro). */
export function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}
