import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards, UnauthorizedException } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { LogMedicationActionDto } from './dto/log-medication-action.dto';
import { MedicationLogsQueryDto } from './dto/medication-logs-query.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

@Controller('medications')
@UseGuards(JwtAuthGuard)
export class MedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @Get()
  findAll(@Request() req: any) {
    const userId = req.user?.sub;
    return this.medicationsService.findAll(userId);
  }

  /**
   * Logs de todos los medicamentos del usuario desde `since` en una sola
   * consulta. Sustituye el patrón de pedir /:id/logs por cada medicamento.
   * Debe declararse antes de `:id` para que Express no lo capture como id.
   */
  @Get('logs')
  findLogsSince(@Query() query: MedicationLogsQueryDto, @Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    return this.medicationsService.findLogsSince(userId, new Date(query.since));
  }

  @Get(':id')
  findById(@Param('id') medicationId: string, @Request() req: any) {
    const userId = req.user?.sub;
    return this.medicationsService.findById(medicationId, userId);
  }

  @Post()
  create(@Body() dto: CreateMedicationDto, @Request() req: any) {
    const userId = req.user?.sub;
    return this.medicationsService.create(userId, dto);
  }

  @Put(':id')
  update(
    @Param('id') medicationId: string,
    @Body() dto: UpdateMedicationDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub;
    return this.medicationsService.update(medicationId, userId, dto);
  }

  @Delete(':id')
  delete(@Param('id') medicationId: string, @Request() req: any) {
    const userId = req.user?.sub;
    return this.medicationsService.delete(medicationId, userId);
  }

  @Get(':id/logs')
  getLogs(
    @Param('id') medicationId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    return this.medicationsService.getLogs(medicationId, userId);
  }

  @Post(':id/logs')
  logAction(
    @Param('id') medicationId: string,
    @Body() dto: LogMedicationActionDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    return this.medicationsService.logAction(medicationId, userId, dto.action, dto.scheduledFor);
  }
}
