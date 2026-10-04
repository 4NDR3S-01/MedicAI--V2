import { randomUUID } from 'node:crypto';

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { isValidTimeZone } from '../../common/dose-schedule';
import { isRecordNotFoundError } from '../../infrastructure/prisma/prisma-errors';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { seriesDates } from './appointment-series';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { MAX_SERIES_OCCURRENCES, type SeriesScope } from './dto/repeat.dto';
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
    const base = {
      userId,
      createdById: actorId,
      updatedById: actorId,
      title: dto.title.trim(),
      doctorName: dto.doctorName.trim(),
      location: dto.location?.trim() || null,
      notes: dto.notes?.trim() || null,
      attendanceStatus: 'PENDING',
      attendanceMarkedAt: null,
    };

    if (!dto.repeat) {
      const appointment = await this.prisma.appointment.create({
        include: AUDIT_INCLUDE,
        data: { ...base, scheduledAt: dto.scheduledAt },
      });
      this.logger.log('Appointment created', { userId, appointmentId: appointment.id });
      return { ...appointment, seriesCount: 1 };
    }

    // Serie: las fechas se calculan en la zona del dueño (sus "08:00").
    if (!dto.repeat.until && !dto.repeat.count) {
      throw new BadRequestException('Indica hasta cuándo se repite la cita.');
    }
    const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const timeZone = isValidTimeZone(owner?.timezone) ? owner!.timezone! : 'UTC';
    const dates = seriesDates(dto.scheduledAt, dto.repeat, timeZone);
    if (dates.length > MAX_SERIES_OCCURRENCES) {
      throw new BadRequestException(
        `Serían demasiadas citas (máximo ${MAX_SERIES_OCCURRENCES}). Elige una fecha de fin más cercana.`,
      );
    }
    if (dates.length < 2) {
      throw new BadRequestException('Con esas opciones la cita no se repite. Revisa los días o la fecha de fin.');
    }
    const seriesId = randomUUID();
    const repeatRule = {
      frequency: dto.repeat.frequency,
      interval: dto.repeat.interval ?? 1,
      weekDays: dto.repeat.weekDays ?? null,
    };
    const [first] = await this.prisma.$transaction([
      this.prisma.appointment.create({
        include: AUDIT_INCLUDE,
        data: { ...base, scheduledAt: dates[0], seriesId, repeatRule },
      }),
      this.prisma.appointment.createMany({
        data: dates.slice(1).map((scheduledAt) => ({ ...base, scheduledAt, seriesId, repeatRule })),
      }),
    ]);
    this.logger.log('Appointment series created', { userId, seriesId, count: dates.length });
    return { ...first, seriesCount: dates.length };
  }

  /**
   * `scope: 'FOLLOWING'` en una cita de una serie: aplica los cambios (y el
   * mismo desplazamiento de fecha/hora) a esa y a las siguientes.
   */
  async update(
    appointmentId: string,
    userId: string,
    dto: UpdateAppointmentDto,
    actorId: string = userId,
    scope: SeriesScope = 'ONE',
  ) {
    if (scope === 'FOLLOWING') {
      const following = await this.updateFollowing(appointmentId, userId, dto, actorId);
      if (following) return following;
    }

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

  async delete(appointmentId: string, userId: string, scope: SeriesScope = 'ONE') {
    if (scope === 'FOLLOWING') {
      const target = await this.prisma.appointment.findUnique({
        where: { id: appointmentId, userId },
        select: { seriesId: true, scheduledAt: true },
      });
      if (!target) throw new NotFoundException('Cita no encontrada.');
      if (target.seriesId) {
        const { count } = await this.prisma.appointment.updateMany({
          where: { userId, seriesId: target.seriesId, active: true, scheduledAt: { gte: target.scheduledAt } },
          data: { active: false },
        });
        this.logger.log('Appointment series deleted', { userId, appointmentId, count });
        return { message: count === 1 ? 'Cita eliminada correctamente.' : `Se eliminaron ${count} citas.` };
      }
    }
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

  /** null si la cita no es de una serie (se edita sola). */
  private async updateFollowing(appointmentId: string, userId: string, dto: UpdateAppointmentDto, actorId: string) {
    const target = await this.prisma.appointment.findUnique({
      where: { id: appointmentId, userId },
      select: { seriesId: true, scheduledAt: true },
    });
    if (!target) throw new NotFoundException('Cita no encontrada.');
    if (!target.seriesId) return null;

    const occurrences = await this.prisma.appointment.findMany({
      where: { userId, seriesId: target.seriesId, active: true, scheduledAt: { gte: target.scheduledAt } },
      select: { id: true, scheduledAt: true },
    });
    const shift = dto.scheduledAt ? dto.scheduledAt.getTime() - target.scheduledAt.getTime() : 0;
    const shared = {
      title: dto.title?.trim(),
      doctorName: dto.doctorName?.trim(),
      location: dto.location !== undefined ? dto.location.trim() || null : undefined,
      notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
      updatedById: actorId,
    };
    await this.prisma.$transaction(
      occurrences.map((occurrence) =>
        this.prisma.appointment.update({
          where: { id: occurrence.id },
          data: {
            ...shared,
            // Moverlas reinicia su asistencia, como al reprogramar una sola.
            ...(shift
              ? { scheduledAt: new Date(occurrence.scheduledAt.getTime() + shift), attendanceStatus: 'PENDING', attendanceMarkedAt: null }
              : {}),
          },
        }),
      ),
    );
    this.logger.log('Appointment series updated', { userId, appointmentId, count: occurrences.length });
    const updated = await this.prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: AUDIT_INCLUDE });
    return { ...updated, seriesUpdated: occurrences.length };
  }

  private mapNotFound(error: unknown) {
    return isRecordNotFoundError(error)
      ? new NotFoundException('Cita no encontrada.')
      : error;
  }
}
