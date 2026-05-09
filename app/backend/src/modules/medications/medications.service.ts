import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

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
      where: { id: medicationId },
    });

    if (!medication) {
      throw new NotFoundException('Medicamento no encontrado.');
    }

    if (medication.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a este medicamento.');
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
        times: dto.times || [],
        notes: dto.notes?.trim() || null,
      },
    });

    this.logger.log('Medication created', { userId, medicationId: medication.id });

    return medication;
  }

  async update(medicationId: string, userId: string, dto: UpdateMedicationDto) {
    const medication = await this.findById(medicationId, userId);

    const updated = await this.prisma.medication.update({
      where: { id: medication.id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : medication.name,
        dosage: dto.dosage !== undefined ? dto.dosage.trim() : medication.dosage,
        frequency: dto.frequency !== undefined ? dto.frequency.trim() : medication.frequency,
        times: dto.times !== undefined ? dto.times : medication.times,
        notes: dto.notes !== undefined ? dto.notes?.trim() || null : medication.notes,
        active: dto.active !== undefined ? dto.active : medication.active,
      },
    });

    this.logger.log('Medication updated', { userId, medicationId: updated.id });

    return updated;
  }

  async delete(medicationId: string, userId: string) {
    const medication = await this.findById(medicationId, userId);

    await this.prisma.medication.delete({
      where: { id: medication.id },
    });

    this.logger.log('Medication deleted', { userId, medicationId });

    return { message: 'Medicamento eliminado correctamente.' };
  }

  async logAction(medicationId: string, userId: string, action: string) {
    const medication = await this.findById(medicationId, userId);

    const log = await this.prisma.medicationLog.create({
      data: {
        medicationId: medication.id,
        action: action.toUpperCase(),
      },
    });

    this.logger.log('Medication action logged', { userId, medicationId, action });

    return log;
  }
}
