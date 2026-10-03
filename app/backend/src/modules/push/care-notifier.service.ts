import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PushService } from './push.service';

const DEBOUNCE_MS = 3000;

/**
 * Cuando cambian los medicamentos, tomas o citas de alguien, avisa (en
 * silencio) a los teléfonos que deben reprogramar sus alarmas: el del dueño
 * (si el cambio lo hizo otra persona) y los de quienes reciben sus
 * recordatorios. Agrupa ráfagas de cambios en un solo aviso.
 */
@Injectable()
export class CareNotifierService {
  private readonly pending = new Map<string, { actors: Set<string>; timer: NodeJS.Timeout; reasons: Set<string> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  dataChanged(ownerId: string, actorId: string | undefined, reason: string) {
    const current = this.pending.get(ownerId);
    if (current) {
      if (actorId) current.actors.add(actorId);
      current.reasons.add(reason);
      return;
    }
    const entry = {
      actors: new Set(actorId ? [actorId] : []),
      reasons: new Set([reason]),
      timer: setTimeout(() => void this.flush(ownerId), DEBOUNCE_MS),
    };
    entry.timer.unref?.();
    this.pending.set(ownerId, entry);
  }

  private async flush(ownerId: string) {
    const entry = this.pending.get(ownerId);
    this.pending.delete(ownerId);
    if (!entry) return;
    const caregivers = await this.prisma.circleGrant.findMany({
      where: { ownerId, reminderMode: { not: 'OFF' }, link: { status: 'ACTIVE' } },
      select: { granteeId: true },
    });
    // Quien hizo el único cambio ya tiene su teléfono al día.
    const soleActor = entry.actors.size === 1 ? [...entry.actors][0] : null;
    const targets = [ownerId, ...caregivers.map((grant) => grant.granteeId)].filter((id) => id !== soleActor);
    await this.push.requestSync(targets, [...entry.reasons].join(','));
  }
}
