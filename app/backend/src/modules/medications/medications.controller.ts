import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CircleAccessService } from '../circle/circle-access.service';
import type { PermissionKey } from '../circle/circle.constants';
import { OwnerQueryDto } from '../circle/dto/owner-query.dto';
import { CareNotifierService } from '../push/care-notifier.service';
import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { LogMedicationActionDto } from './dto/log-medication-action.dto';
import { MedicationLogsQueryDto } from './dto/medication-logs-query.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

/** Campos que cambian los horarios o las alarmas (no la ficha del medicamento). */
const REMINDER_FIELDS: (keyof UpdateMedicationDto)[] = [
  'frequency',
  'firstDoseTime',
  'times',
  'customIntervalHours',
  'customEndDate',
  'active',
  'scheduleType',
  'weekDays',
  'dayInterval',
  'startDate',
  'maxDailyDoses',
  'minHoursBetween',
  // Una dosis que cambia con el tiempo es un plan de tratamiento, como el horario.
  'dosageSteps',
];
/** Las existencias son parte de la ficha, como el nombre y la dosis. */
const DETAIL_FIELDS: (keyof UpdateMedicationDto)[] = [
  'name',
  'dosage',
  'notes',
  'stockQuantity',
  'stockPerDose',
  'stockAlertAt',
];

/**
 * Todas las rutas aceptan `?ownerId=` para actuar sobre los medicamentos de
 * otra persona del Círculo; CircleAccessService comprueba el permiso concreto.
 */
@Controller('medications')
@UseGuards(JwtAuthGuard)
export class MedicationsController {
  constructor(
    private readonly medicationsService: MedicationsService,
    private readonly access: CircleAccessService,
    private readonly careNotifier: CareNotifierService,
  ) {}

  /** Tras un cambio: los teléfonos del dueño y de sus cuidadores se resincronizan. */
  private async changed<T>(ownerId: string, actorId: string, reason: string, result: Promise<T>): Promise<T> {
    const value = await result;
    this.careNotifier.dataChanged(ownerId, actorId, reason);
    return value;
  }

  @Get()
  async findAll(@Query() query: OwnerQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'viewMedications');
    return this.medicationsService.findAll(ownerId);
  }

  /**
   * Logs de todos los medicamentos del usuario desde `since` en una sola
   * consulta. Sustituye el patrón de pedir /:id/logs por cada medicamento.
   * Debe declararse antes de `:id` para que Express no lo capture como id.
   */
  @Get('logs')
  async findLogsSince(@Query() query: MedicationLogsQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'viewMedications');
    return this.medicationsService.findLogsSince(ownerId, new Date(query.since));
  }

  @Get(':id')
  async findById(@Param('id') medicationId: string, @Query() query: OwnerQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'viewMedications');
    return this.medicationsService.findById(medicationId, ownerId);
  }

  @Post()
  async create(@Body() dto: CreateMedicationDto, @Query() query: OwnerQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'addMedications');
    return this.changed(ownerId, req.user?.sub, 'medication', this.medicationsService.create(ownerId, dto, req.user?.sub));
  }

  @Put(':id')
  async update(
    @Param('id') medicationId: string,
    @Body() dto: UpdateMedicationDto,
    @Query() query: OwnerQueryDto,
    @Request() req: any,
  ) {
    const touches = (fields: (keyof UpdateMedicationDto)[]) => fields.some((field) => dto[field] !== undefined);
    const required: PermissionKey[] = ['viewMedications'];
    if (touches(DETAIL_FIELDS)) required.push('editMedications');
    if (touches(REMINDER_FIELDS)) required.push('manageReminders');
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, required);
    return this.changed(ownerId, req.user?.sub, 'medication', this.medicationsService.update(medicationId, ownerId, dto, req.user?.sub));
  }

  @Delete(':id')
  async delete(@Param('id') medicationId: string, @Query() query: OwnerQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'deleteMedications');
    return this.changed(ownerId, req.user?.sub, 'medication', this.medicationsService.delete(medicationId, ownerId));
  }

  @Get(':id/logs')
  async getLogs(@Param('id') medicationId: string, @Query() query: OwnerQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'viewMedications');
    return this.medicationsService.getLogs(medicationId, ownerId);
  }

  /** Deshace un registro de toma (p. ej. marcado por error). */
  @Delete(':id/logs/:logId')
  async deleteLog(
    @Param('id') medicationId: string,
    @Param('logId') logId: string,
    @Query() query: OwnerQueryDto,
    @Request() req: any,
  ) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'logDoses');
    return this.changed(ownerId, req.user?.sub, 'dose', this.medicationsService.deleteLog(medicationId, ownerId, logId));
  }

  @Post(':id/logs')
  async logAction(
    @Param('id') medicationId: string,
    @Body() dto: LogMedicationActionDto,
    @Query() query: OwnerQueryDto,
    @Request() req: any,
  ) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'logDoses');
    return this.changed(ownerId, req.user?.sub, 'dose', this.medicationsService.logAction(medicationId, ownerId, dto.action, dto.scheduledFor, req.user?.sub));
  }
}
