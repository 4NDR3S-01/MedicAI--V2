import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { isRecordNotFoundError } from '../../infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

// Cota de seguridad para /medications/logs: un día normal son pocas decenas
// de filas; esto solo evita respuestas enormes si `since` es muy antiguo.
const MAX_LOGS_PER_QUERY = 1000;

@Injectable()
export class MedicationsService {
  private readonly logger = new Logger(MedicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const medications = await this.prisma.medication.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
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

  async create(userId: string, dto: CreateMedicationDto) {
    const medication = await this.prisma.medication.create({
      data: {
        userId,
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

  async update(medicationId: string, userId: string, dto: UpdateMedicationDto) {
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

    try {
      const updated = await this.prisma.medication.update({
        where: { id: medicationId, userId },
        data: {
          name: dto.name?.trim(),
          dosage: dto.dosage?.trim(),
          frequency: dto.frequency?.trim(),
          firstDoseTime: dto.firstDoseTime,
          times: dto.times,
          notes: nextNotes,
          active: dto.active,
          customIntervalHours: dto.customIntervalHours,
          customEndDate: nextCustomEndDate,
        },
      });

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
    });
  }

  async logAction(medicationId: string, userId: string, action: string, scheduledFor?: string) {
    await this.assertOwnership(medicationId, userId);
    const log = await this.prisma.medicationLog.create({
      data: {
        medicationId,
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
