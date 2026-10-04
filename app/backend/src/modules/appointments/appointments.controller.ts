import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CircleAccessService } from '../circle/circle-access.service';
import { OwnerQueryDto } from '../circle/dto/owner-query.dto';
import { CareNotifierService } from '../push/care-notifier.service';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { SeriesScopeQueryDto } from './dto/repeat.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

/**
 * Todas las rutas aceptan `?ownerId=` para actuar sobre las citas de otra
 * persona del Círculo; CircleAccessService comprueba el permiso concreto.
 */
@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly access: CircleAccessService,
    private readonly careNotifier: CareNotifierService,
  ) {}

  /** Tras un cambio: los teléfonos del dueño y de sus cuidadores se resincronizan. */
  private async changed<T>(ownerId: string, actorId: string, result: Promise<T>): Promise<T> {
    const value = await result;
    this.careNotifier.dataChanged(ownerId, actorId, 'appointment');
    return value;
  }

  @Get()
  async findAll(@Query() query: OwnerQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'viewAppointments');
    return this.appointmentsService.findAll(ownerId);
  }

  @Get(':id')
  async findById(@Param('id') appointmentId: string, @Query() query: OwnerQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'viewAppointments');
    return this.appointmentsService.findById(appointmentId, ownerId);
  }

  @Post()
  async create(@Body() dto: CreateAppointmentDto, @Query() query: OwnerQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'manageAppointments');
    return this.changed(ownerId, req.user?.sub, this.appointmentsService.create(ownerId, dto, req.user?.sub));
  }

  @Put(':id')
  async update(
    @Param('id') appointmentId: string,
    @Body() dto: UpdateAppointmentDto,
    @Query() query: SeriesScopeQueryDto,
    @Request() req: any,
  ) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'manageAppointments');
    return this.changed(
      ownerId,
      req.user?.sub,
      this.appointmentsService.update(appointmentId, ownerId, dto, req.user?.sub, query.scope),
    );
  }

  @Delete(':id')
  async delete(@Param('id') appointmentId: string, @Query() query: SeriesScopeQueryDto, @Request() req: any) {
    const ownerId = await this.access.resolveOwner(req.user?.sub, query.ownerId, 'manageAppointments');
    return this.changed(ownerId, req.user?.sub, this.appointmentsService.delete(appointmentId, ownerId, query.scope));
  }
}
