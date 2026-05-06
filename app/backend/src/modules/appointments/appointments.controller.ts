import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(@Request() req: any) {
    const userId = req.user?.sub;
    return this.appointmentsService.findAll(userId);
  }

  @Get(':id')
  findById(@Param('id') appointmentId: string, @Request() req: any) {
    const userId = req.user?.sub;
    return this.appointmentsService.findById(appointmentId, userId);
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto, @Request() req: any) {
    const userId = req.user?.sub;
    return this.appointmentsService.create(userId, dto);
  }

  @Put(':id')
  update(
    @Param('id') appointmentId: string,
    @Body() dto: Partial<CreateAppointmentDto>,
    @Request() req: any,
  ) {
    const userId = req.user?.sub;
    return this.appointmentsService.update(appointmentId, userId, dto);
  }

  @Delete(':id')
  delete(@Param('id') appointmentId: string, @Request() req: any) {
    const userId = req.user?.sub;
    return this.appointmentsService.delete(appointmentId, userId);
  }
}
