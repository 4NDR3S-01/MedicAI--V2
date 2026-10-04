import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { isValidTimeZone, stockUnitsForDose } from '../../common/dose-schedule';
import { isRecordNotFoundError } from '../../infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PushService } from '../push/push.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import type { ScheduleFieldsDto } from './dto/schedule-fields';
import { UpdateMedicationDto } from './dto/update-medication.dto';

// Cota de seguridad para /medications/logs: un día normal son pocas decenas
// de filas; esto solo evita respuestas enormes si `since` es muy antiguo.
const MAX_LOGS_PER_QUERY = 1000;

/** Quién agregó o cambió el registro (para mostrar "Agregado por Ana"). */
const AUDIT_INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} as const;
const LOG_INCLUDE = { loggedBy: { select: { id: true, fullName: true } } } as const;

/** Mismo canal que los recordatorios de medicamentos de la app. */
const MEDICATION_REMINDERS_CHANNEL = 'medicai_medication_reminders';

const formatUnits = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');

/**
 * Horario flexible y existencias → datos de Prisma. Lo que no viene queda sin
 * tocar; `null` lo borra. Comprueba que cada tipo de horario tenga lo suyo.
 */
function scheduleData(dto: ScheduleFieldsDto, times: string[] | undefined) {
  const type = dto.scheduleType;
  if (type === 'WEEKDAYS' && !dto.weekDays?.length) {
    throw new BadRequestException('Elige al menos un día de la semana.');
  }
  if (type === 'INTERVAL' && (!dto.dayInterval || dto.dayInterval < 2 || !dto.startDate)) {
    throw new BadRequestException('Indica cada cuántos días y desde qué día.');
  }
  if (dto.dosageSteps?.length && !dto.startDate) {
    throw new BadRequestException('Una dosis que cambia necesita una fecha de inicio.');
  }
  if (type && type !== 'AS_NEEDED' && times !== undefined && !times.length) {
    throw new BadRequestException('Indica la hora de las tomas.');
  }
  const asNeeded = type === 'AS_NEEDED';
  let dosageSteps: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined;
  if (asNeeded || dto.dosageSteps === null) dosageSteps = Prisma.DbNull;
  else if (dto.dosageSteps) dosageSteps = dto.dosageSteps.map(({ days, dosage }) => ({ days, dosage: dosage.trim() }));

  return {
    scheduleType: type,
    // Cada tipo usa solo sus campos: se limpian los del tipo anterior.
    weekDays: type ? (type === 'WEEKDAYS' ? [...new Set(dto.weekDays)].sort() : []) : undefined,
    dayInterval: type ? (type === 'INTERVAL' ? dto.dayInterval : null) : undefined,
    startDate: dto.startDate,
    dosageSteps,
    maxDailyDoses: type ? (asNeeded ? dto.maxDailyDoses ?? null : null) : dto.maxDailyDoses,
    minHoursBetween: type ? (asNeeded ? dto.minHoursBetween ?? null : null) : dto.minHoursBetween,
    times: asNeeded ? [] : times,
    stockQuantity: dto.stockQuantity,
    stockPerDose: dto.stockPerDose,
    stockAlertAt: dto.stockAlertAt,
  };
}

@Injectable()
export class MedicationsService {
  private readonly logger = new Logger(MedicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async findAll(userId: string) {
    const medications = await this.prisma.medication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: AUDIT_INCLUDE,
    });

    return medications;
  }

  async findById(medicationId: string, userId: string) {
    const medication = await this.prisma.medication.findUnique({
      where: { id: medicationId, userId },
    });

    if (!medication) {
      throw new NotFoundException('Medicamento no encontrado.');
    }

    return medication;
  }

  /** `actorId`: quien hace el cambio (el dueño o alguien de su Círculo). */
  async create(userId: string, dto: CreateMedicationDto, actorId: string = userId) {
    const medication = await this.prisma.medication.create({
      include: AUDIT_INCLUDE,
      data: {
        userId,
        createdById: actorId,
        updatedById: actorId,
        name: dto.name.trim(),
        dosage: dto.dosage.trim(),
        frequency: dto.frequency.trim(),
        firstDoseTime: dto.firstDoseTime || dto.times?.[0] || null,
        notes: dto.notes?.trim() || null,
        customIntervalHours: dto.customIntervalHours || null,
        customEndDate: dto.customEndDate ? new Date(dto.customEndDate) : null,
        ...scheduleData({ ...dto, scheduleType: dto.scheduleType ?? 'DAILY' }, dto.times ?? []),
      },
    });

    this.logger.log('Medication created', { userId, medicationId: medication.id });

    return medication;
  }

  async update(medicationId: string, userId: string, dto: UpdateMedicationDto, actorId: string = userId) {
    // Un único UPDATE filtrado por dueño: los campos `undefined` no se tocan,
    // así que no hace falta leer antes el registro.
    let nextCustomEndDate: Date | null | undefined;
    if (dto.customEndDate === null) {
      nextCustomEndDate = null;
    } else if (typeof dto.customEndDate === 'string') {
      nextCustomEndDate = new Date(dto.customEndDate);
    }

    let nextNotes: string | null | undefined;
    if (typeof dto.notes === 'string') {
      nextNotes = dto.notes.trim() || null;
    } else if (dto.notes === null) {
      nextNotes = null;
    }

    const data = {
      name: dto.name?.trim(),
      dosage: dto.dosage?.trim(),
      frequency: dto.frequency?.trim(),
      firstDoseTime: dto.firstDoseTime,
      notes: nextNotes,
      active: dto.active,
      customIntervalHours: dto.customIntervalHours,
      customEndDate: nextCustomEndDate,
      updatedById: actorId,
      ...scheduleData(dto, dto.times),
    };

    try {
      let updated;
      if (dto.active === true) {
        // Reactivación: las tomas anteriores a este momento no cuentan.
        // El updateMany con active=false solo actúa si de verdad estaba inactivo.
        [, updated] = await this.prisma.$transaction([
          this.prisma.medication.updateMany({
            where: { id: medicationId, userId, active: false },
            data: { activeSince: new Date() },
          }),
          this.prisma.medication.update({ where: { id: medicationId, userId }, data, include: AUDIT_INCLUDE }),
        ]);
      } else {
        updated = await this.prisma.medication.update({ where: { id: medicationId, userId }, data, include: AUDIT_INCLUDE });
      }

      this.logger.log('Medication updated', { userId, medicationId: updated.id });

      return updated;
    } catch (error) {
      throw this.mapNotFound(error);
    }
  }

  async delete(medicationId: string, userId: string) {
    try {
      await this.prisma.medication.delete({
        where: { id: medicationId, userId },
      });
    } catch (error) {
      throw this.mapNotFound(error);
    }

    this.logger.log('Medication deleted', { userId, medicationId });

    return { message: 'Medicamento eliminado correctamente.' };
  }

  async getLogs(medicationId: string, userId: string) {
    await this.assertOwnership(medicationId, userId);
    return this.prisma.medicationLog.findMany({
      where: { medicationId },
      orderBy: { takenAt: 'desc' },
      take: 200,
      include: LOG_INCLUDE,
    });
  }

  async findLogsSince(userId: string, since: Date) {
    return this.prisma.medicationLog.findMany({
      where: {
        medication: { userId },
        OR: [{ takenAt: { gte: since } }, { scheduledFor: { gte: since } }],
      },
      orderBy: { takenAt: 'desc' },
      take: MAX_LOGS_PER_QUERY,
      include: LOG_INCLUDE,
    });
  }

  async deleteLog(medicationId: string, userId: string, logId: string) {
    const log = await this.prisma.medicationLog.findFirst({
      where: { id: logId, medicationId, medication: { userId } },
      select: { stockUnits: true },
    });
    if (!log) {
      throw new NotFoundException('Registro no encontrado.');
    }
    // Deshacer una toma devuelve a las existencias lo que se descontó.
    const ops: Prisma.PrismaPromise<unknown>[] = [this.prisma.medicationLog.deleteMany({ where: { id: logId, medicationId } })];
    if (log.stockUnits) {
      ops.push(this.prisma.medication.updateMany({
        where: { id: medicationId, stockQuantity: { not: null } },
        data: { stockQuantity: { increment: log.stockUnits } },
      }));
    }
    const [{ count }] = (await this.prisma.$transaction(ops)) as [{ count: number }];
    if (!count) {
      throw new NotFoundException('Registro no encontrado.');
    }
    this.logger.log('Medication action undone', { userId, medicationId, logId });
    return { message: 'Registro eliminado.' };
  }

  async logAction(medicationId: string, userId: string, action: string, scheduledFor?: string, actorId: string = userId) {
    const medication = await this.prisma.medication.findUnique({
      where: { id: medicationId, userId },
      select: {
        name: true,
        dosage: true,
        dosageSteps: true,
        startDate: true,
        stockQuantity: true,
        stockPerDose: true,
        stockAlertAt: true,
        user: { select: { fullName: true, timezone: true } },
      },
    });
    if (!medication) {
      throw new NotFoundException('Medicamento no encontrado.');
    }
    // Varias personas pueden recibir la misma alarma (la persona y sus
    // cuidadores): la primera respuesta cuenta y las demás no la duplican.
    if (scheduledFor && action !== 'SNOOZED') {
      const existing = await this.prisma.medicationLog.findFirst({
        where: { medicationId, scheduledFor: new Date(scheduledFor), action: { in: ['TAKEN', 'SKIPPED'] } },
        include: LOG_INCLUDE,
      });
      if (existing) return existing;
    }
    const doseAt = scheduledFor ? new Date(scheduledFor) : new Date();
    const timeZone = isValidTimeZone(medication.user.timezone) ? medication.user.timezone : 'UTC';
    // Solo "la tomé" gasta existencias, y solo si se lleva la cuenta.
    const stockUnits = action === 'TAKEN' && medication.stockQuantity !== null
      ? stockUnitsForDose(medication, doseAt, timeZone)
      : null;

    const data = {
      medicationId,
      loggedById: actorId,
      action,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      stockUnits,
    };
    if (!stockUnits) {
      const log = await this.prisma.medicationLog.create({ include: LOG_INCLUDE, data });
      this.logger.log('Medication action logged', { userId, medicationId, action });
      return log;
    }

    // El descuento es atómico: dos personas registrando a la vez no se pisan.
    let [log, { stockQuantity: remaining }] = await this.prisma.$transaction([
      this.prisma.medicationLog.create({ include: LOG_INCLUDE, data }),
      this.prisma.medication.update({
        where: { id: medicationId },
        data: { stockQuantity: { decrement: stockUnits } },
        select: { stockQuantity: true },
      }),
    ]);
    this.logger.log('Medication action logged', { userId, medicationId, action });
    if (remaining === null) return log;
    const before = remaining + stockUnits;
    if (remaining < 0) {
      // Se contó de menos al cargar las existencias: nunca por debajo de cero,
      // y deshacer la toma devuelve solo lo que de verdad se descontó.
      const deducted = Math.max(0, before);
      [log] = await this.prisma.$transaction([
        this.prisma.medicationLog.update({ where: { id: log.id }, data: { stockUnits: deducted }, include: LOG_INCLUDE }),
        this.prisma.medication.update({ where: { id: medicationId }, data: { stockQuantity: { increment: -remaining } } }),
      ]);
      remaining = 0;
    }

    const alertAt = medication.stockAlertAt;
    const crossedAlert = alertAt !== null && before > alertAt && remaining <= alertAt;
    const ranOut = before > 0 && remaining <= 0;
    if (crossedAlert || ranOut) {
      this.notifyLowStock(userId, medication, remaining).catch((error) => this.logger.warn('Low stock alert failed', error));
    }
    return log;
  }

  /** "Quedan 5 de Ibuprofeno": a la persona y a quienes reciben sus recordatorios. */
  private async notifyLowStock(
    userId: string,
    medication: { name: string; user: { fullName: string | null } },
    remaining: number,
  ) {
    const caregivers = await this.prisma.circleGrant.findMany({
      where: { ownerId: userId, viewMedications: true, reminderMode: { not: 'OFF' }, link: { status: 'ACTIVE' } },
      select: { granteeId: true },
    });
    const left = remaining <= 0 ? 'Se acabó' : `Quedan ${formatUnits(remaining)}`;
    await this.push.notify([userId], {
      title: remaining <= 0 ? `Se acabó ${medication.name}` : `Queda poco ${medication.name}`,
      body: `${left}. Compra más para no interrumpir el tratamiento y actualiza las existencias en MedicAI.`,
      data: { type: 'LOW_STOCK' },
      channelId: MEDICATION_REMINDERS_CHANNEL,
    });
    if (caregivers.length) {
      const name = medication.user.fullName?.trim().split(/\s+/)[0] || 'Una persona de tu Círculo';
      await this.push.notify(caregivers.map((grant) => grant.granteeId), {
        title: `A ${name} le queda poco ${medication.name}`,
        body: `${left}. Quizás necesite ayuda para conseguir más.`,
        data: { type: 'CARE_LOW_STOCK', ownerId: userId },
      });
    }
  }

  private async assertOwnership(medicationId: string, userId: string) {
    const medication = await this.prisma.medication.findUnique({
      where: { id: medicationId, userId },
      select: { id: true },
    });

    if (!medication) {
      throw new NotFoundException('Medicamento no encontrado.');
    }
  }

  private mapNotFound(error: unknown) {
    return isRecordNotFoundError(error)
      ? new NotFoundException('Medicamento no encontrado.')
      : error;
  }
}
