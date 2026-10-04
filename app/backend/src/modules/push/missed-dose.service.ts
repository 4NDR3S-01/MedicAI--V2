import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { doseDatesBetween, dosageOnDay, isValidTimeZone, zonedParts } from '../../common/dose-schedule';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PushService } from './push.service';

/** Una toma cuenta como "no registrada" una hora después de su hora (igual que en la app). */
const MISSED_AFTER_MS = 60 * 60_000;
/** Solo se revisan las tomas de las últimas horas (no se avisa de lo de ayer). */
const LOOKBACK_MS = 3 * 60 * 60_000;
const ALERT_RETENTION_MS = 7 * 24 * 60 * 60_000;

/**
 * "Mamá no ha registrado su toma de las 08:00": avisa a quienes reciben los
 * recordatorios de una persona cuando una toma suya lleva una hora sin
 * registrarse. Cada toma se avisa una sola vez (MissedDoseAlert).
 *
 * El backend corre en una sola instancia (pm2 fork): si se escalara a varias,
 * la clave primaria de MissedDoseAlert sigue evitando avisos duplicados.
 */
@Injectable()
export class MissedDoseService {
  private readonly logger = new Logger(MissedDoseService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.checkMissedDoses(new Date());
    } catch (error) {
      this.logger.error('Missed dose check failed', error as Error);
    } finally {
      this.running = false;
    }
  }

  async checkMissedDoses(now: Date) {
    const windowStart = new Date(now.getTime() - LOOKBACK_MS);
    const windowEnd = new Date(now.getTime() - MISSED_AFTER_MS);

    const grants = await this.prisma.circleGrant.findMany({
      where: { viewMedications: true, reminderMode: { not: 'OFF' }, link: { status: 'ACTIVE' } },
      select: { granteeId: true, owner: { select: { id: true, fullName: true, timezone: true } } },
    });
    const owners = new Map<string, { name: string; timezone: string; caregivers: string[] }>();
    for (const grant of grants) {
      // Sin zona horaria conocida no se puede saber qué hora es para esa persona.
      if (!isValidTimeZone(grant.owner.timezone)) continue;
      const entry = owners.get(grant.owner.id) ?? {
        name: grant.owner.fullName?.trim().split(/\s+/)[0] || 'Una persona de tu Círculo',
        timezone: grant.owner.timezone,
        caregivers: [],
      };
      entry.caregivers.push(grant.granteeId);
      owners.set(grant.owner.id, entry);
    }
    if (!owners.size) return;

    const medications = await this.prisma.medication.findMany({
      where: { userId: { in: [...owners.keys()] }, active: true },
      select: {
        id: true,
        userId: true,
        name: true,
        dosage: true,
        dosageSteps: true,
        times: true,
        active: true,
        activeSince: true,
        createdAt: true,
        customEndDate: true,
        scheduleType: true,
        weekDays: true,
        dayInterval: true,
        startDate: true,
      },
    });
    if (!medications.length) return;
    const medicationIds = medications.map((medication) => medication.id);
    const range = { gte: new Date(windowStart.getTime() - 60_000), lte: new Date(windowEnd.getTime() + 60_000) };
    const [logs, alerts] = await Promise.all([
      this.prisma.medicationLog.findMany({
        where: { medicationId: { in: medicationIds }, scheduledFor: range, action: { in: ['TAKEN', 'SKIPPED'] } },
        select: { medicationId: true, scheduledFor: true },
      }),
      this.prisma.missedDoseAlert.findMany({
        where: { medicationId: { in: medicationIds }, scheduledFor: range },
        select: { medicationId: true, scheduledFor: true },
      }),
    ]);
    const minuteKey = (medicationId: string, date: Date) => `${medicationId}@${Math.floor(date.getTime() / 60_000)}`;
    const handled = new Set([
      ...logs.filter((log) => log.scheduledFor).map((log) => minuteKey(log.medicationId, log.scheduledFor!)),
      ...alerts.map((alert) => minuteKey(alert.medicationId, alert.scheduledFor)),
    ]);

    const missedByOwner = new Map<string, { medication: (typeof medications)[number]; at: Date }[]>();
    for (const medication of medications) {
      const owner = owners.get(medication.userId)!;
      for (const at of doseDatesBetween(medication, windowStart, windowEnd, owner.timezone)) {
        if (handled.has(minuteKey(medication.id, at))) continue;
        const list = missedByOwner.get(medication.userId) ?? [];
        list.push({ medication, at });
        missedByOwner.set(medication.userId, list);
      }
    }
    if (!missedByOwner.size) return;

    // Primero se marca (clave única): si otra ejecución ya lo hizo, no se repite.
    const allMissed = [...missedByOwner.values()].flat();
    await this.prisma.missedDoseAlert.createMany({
      data: allMissed.map(({ medication, at }) => ({ medicationId: medication.id, scheduledFor: at })),
      skipDuplicates: true,
    });

    for (const [ownerId, missed] of missedByOwner) {
      const owner = owners.get(ownerId)!;
      const clock = (at: Date) => {
        const p = zonedParts(at, owner.timezone);
        return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
      };
      const first = missed[0];
      await this.push.notify(owner.caregivers, {
        title: missed.length === 1 ? `${owner.name} no ha registrado su toma` : `${owner.name} tiene ${missed.length} tomas sin registrar`,
        body: missed.length === 1
          ? `${first.medication.name} (${dosageOnDay(first.medication, first.at, owner.timezone)}) de las ${clock(first.at)}. Si ya la tomó, regístrala desde Círculo.`
          : missed.map(({ medication, at }) => `${medication.name} ${clock(at)}`).join(' · '),
        data: { type: 'MISSED_DOSE', ownerId },
      });
    }
    this.logger.log('Missed dose alerts sent', { owners: missedByOwner.size, doses: allMissed.length });

    // Limpieza ocasional de avisos viejos.
    await this.prisma.missedDoseAlert.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - ALERT_RETENTION_MS) } } });
  }
}
