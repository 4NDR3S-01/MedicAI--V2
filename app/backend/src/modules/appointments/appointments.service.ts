import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { isRecordNotFoundError } from '../../infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';


/** Quién agregó o cambió el registro (para mostrar "Agregado por Ana"). */
const AUDIT_INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.appointment.findMany({
      where: { userId, active: true },
      orderBy: { scheduledAt: 'asc' },
      include: AUDIT_INCLUDE,
    });
  }

  async findById(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId, userId },
    });

    if (!appointment) {
      throw new NotFoundException('Cita no encontrada.');
    }

    return appointment;
  }

  /** `actorId`: quien hace el cambio (el dueño o alguien de su Círculo). */
  async create(userId: string, dto: CreateAppointmentDto, actorId: string = userId) {
    const appointment = await this.prisma.appointment.create({
      include: AUDIT_INCLUDE,
      data: {
        userId,
        createdById: actorId,
        updatedById: actorId,
        title: dto.title.trim(),
        doctorName: dto.doctorName.trim(),
        scheduledAt: dto.scheduledAt,
        location: dto.location?.trim() || null,
        notes: dto.notes?.trim() || null,
        attendanceStatus: 'PENDING',
        attendanceMarkedAt: null,
      },
    });

    this.logger.log('Appointment created', { userId, appointmentId: appointment.id });
    return appointment;
  }

  async update(appointmentId: string, userId: string, dto: UpdateAppointmentDto, actorId: string = userId) {
    // Un único UPDATE filtrado por dueño: los campos `undefined` no se tocan.
    // Reprogramar la cita (nuevo scheduledAt) reinicia la asistencia.
    const attendanceStatus = dto.attendanceStatus
      ?? (dto.scheduledAt ? 'PENDING' : undefined);
    let attendanceMarkedAt: Date | null | undefined;
    if (dto.attendanceStatus) {
      attendanceMarkedAt = dto.attendanceStatus === 'PENDING' ? null : new Date();
    } else if (dto.scheduledAt) {
      attendanceMarkedAt = null;
    }

    try {
      const updated = await this.prisma.appointment.update({
        where: { id: appointmentId, userId },
        data: {
          title: dto.title?.trim(),
          doctorName: dto.doctorName?.trim(),
          scheduledAt: dto.scheduledAt || undefined,
          location: dto.location !== undefined ? dto.location.trim() || null : undefined,
          notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
          active: dto.active,
          attendanceStatus,
          attendanceMarkedAt,
          updatedById: actorId,
        },
        include: AUDIT_INCLUDE,
      });

      this.logger.log('Appointment updated', { userId, appointmentId: updated.id });
      return updated;
    } catch (error) {
      throw this.mapNotFound(error);
    }
  }

  async delete(appointmentId: string, userId: string) {
    try {
      await this.prisma.appointment.update({
        where: { id: appointmentId, userId },
        data: { active: false },
      });
    } catch (error) {
      throw this.mapNotFound(error);
    }

    this.logger.log('Appointment deleted', { userId, appointmentId });
    return { message: 'Cita eliminada correctamente.' };
  }

  private mapNotFound(error: unknown) {
    return isRecordNotFoundError(error)
      ? new NotFoundException('Cita no encontrada.')
      : error;
  }
}
