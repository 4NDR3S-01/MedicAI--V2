import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.appointment.findMany({
      where: { userId, active: true },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findById(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Cita no encontrada.');
    }

    if (appointment.userId !== userId) {
      throw new ForbiddenException('No tienes acceso a esta cita.');
    }

    return appointment;
  }

  async create(userId: string, dto: CreateAppointmentDto) {
    const appointment = await this.prisma.appointment.create({
      data: {
        userId,
        title: dto.title.trim(),
        doctorName: dto.doctorName.trim(),
        scheduledAt: dto.scheduledAt,
        location: dto.location?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });

    this.logger.log('Appointment created', { userId, appointmentId: appointment.id });
    return appointment;
  }

  async update(appointmentId: string, userId: string, dto: Partial<CreateAppointmentDto>) {
    const appointment = await this.findById(appointmentId, userId);

    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        title: dto.title?.trim() || appointment.title,
        doctorName: dto.doctorName?.trim() || appointment.doctorName,
        scheduledAt: dto.scheduledAt || appointment.scheduledAt,
        location: dto.location?.trim() || appointment.location,
        notes: dto.notes?.trim() || appointment.notes,
      },
    });

    this.logger.log('Appointment updated', { userId, appointmentId: updated.id });
    return updated;
  }

  async delete(appointmentId: string, userId: string) {
    const appointment = await this.findById(appointmentId, userId);

    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { active: false },
    });

    this.logger.log('Appointment deleted', { userId, appointmentId });
    return { message: 'Cita eliminada correctamente.' };
  }
}
