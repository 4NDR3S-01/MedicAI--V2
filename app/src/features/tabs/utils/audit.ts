type Actor = { id: string; fullName: string | null } | null | undefined;

const nameOf = (actor: NonNullable<Actor>) => actor.fullName?.trim().split(/\s+/)[0] || 'alguien de tu Círculo';

/**
 * "Agregado por Ana" / "Cambiado por Ana" cuando lo hizo otra persona (alguien
 * del Círculo), no el dueño. null si lo hizo el propio dueño o no se sabe.
 */
export function changedByNote(
  record: { userId: string; createdBy?: Actor; updatedBy?: Actor; createdAt: string; updatedAt: string },
  noun: { masculine: boolean },
): string | null {
  const suffix = noun.masculine ? 'o' : 'a';
  const updatedByOther = record.updatedBy && record.updatedBy.id !== record.userId;
  const createdByOther = record.createdBy && record.createdBy.id !== record.userId;
  const wasEdited = new Date(record.updatedAt).getTime() - new Date(record.createdAt).getTime() > 2000;
  if (updatedByOther && wasEdited) return `Cambiad${suffix} por ${nameOf(record.updatedBy!)}`;
  if (createdByOther) return `Agregad${suffix} por ${nameOf(record.createdBy!)}`;
  return null;
}

/** "por Ana" si la toma la registró alguien distinto del dueño. */
export function loggedByNote(loggedBy: Actor, ownerId: string): string | null {
  return loggedBy && loggedBy.id !== ownerId ? `por ${nameOf(loggedBy)}` : null;
}
