import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
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

  @Post(':id/logs')
  logAction(
    @Param('id') medicationId: string,
    @Body('action') action: string,
    @Request() req: any,
  ) {
    const userId = req.user?.sub;
    return this.medicationsService.logAction(medicationId, userId, action);
  }
}
