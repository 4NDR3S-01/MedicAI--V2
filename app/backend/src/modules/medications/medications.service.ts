import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';

@Injectable()
export class MedicationsService {
  private readonly logger = new Logger(MedicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const medications = await this.prisma.medication.findMany({
      where: { userId, active: true },
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
        notes: dto.notes?.trim() || null,
      },
    });

    this.logger.log('Medication created', { userId, medicationId: medication.id });

    return medication;
  }

  async update(medicationId: string, userId: string, dto: Partial<CreateMedicationDto>) {
    const medication = await this.findById(medicationId, userId);

    const updated = await this.prisma.medication.update({
      where: { id: medication.id },
      data: {
        name: dto.name?.trim() || medication.name,
        dosage: dto.dosage?.trim() || medication.dosage,
        frequency: dto.frequency?.trim() || medication.frequency,
        notes: dto.notes?.trim() || medication.notes,
      },
    });

    this.logger.log('Medication updated', { userId, medicationId: updated.id });

    return updated;
  }

  async delete(medicationId: string, userId: string) {
    const medication = await this.findById(medicationId, userId);

    await this.prisma.medication.update({
      where: { id: medication.id },
      data: { active: false },
    });

    this.logger.log('Medication deleted', { userId, medicationId });

    return { message: 'Medicamento eliminado correctamente.' };
  }
}
