import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { isRecordNotFoundError } from '../../infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
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

@Injectable()
export class MedicationsService {
  private readonly logger = new Logger(MedicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        times: dto.times || [],
        notes: dto.notes?.trim() || null,
        customIntervalHours: dto.customIntervalHours || null,
        customEndDate: dto.customEndDate ? new Date(dto.customEndDate) : null,
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
      times: dto.times,
      notes: nextNotes,
      active: dto.active,
      customIntervalHours: dto.customIntervalHours,
      customEndDate: nextCustomEndDate,
      updatedById: actorId,
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
    const { count } = await this.prisma.medicationLog.deleteMany({
      where: { id: logId, medicationId, medication: { userId } },
    });
    if (!count) {
      throw new NotFoundException('Registro no encontrado.');
    }
    this.logger.log('Medication action undone', { userId, medicationId, logId });
    return { message: 'Registro eliminado.' };
  }

  async logAction(medicationId: string, userId: string, action: string, scheduledFor?: string, actorId: string = userId) {
    await this.assertOwnership(medicationId, userId);
    // Varias personas pueden recibir la misma alarma (la persona y sus
    // cuidadores): la primera respuesta cuenta y las demás no la duplican.
    if (scheduledFor && action !== 'SNOOZED') {
      const existing = await this.prisma.medicationLog.findFirst({
        where: { medicationId, scheduledFor: new Date(scheduledFor), action: { in: ['TAKEN', 'SKIPPED'] } },
        include: LOG_INCLUDE,
      });
      if (existing) return existing;
    }
    const log = await this.prisma.medicationLog.create({
      include: LOG_INCLUDE,
      data: {
        medicationId,
        loggedById: actorId,
        action,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      },
    });
    this.logger.log('Medication action logged', { userId, medicationId, action });
    return log;
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
