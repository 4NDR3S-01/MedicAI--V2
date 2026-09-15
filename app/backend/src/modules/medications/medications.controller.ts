import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards, UnauthorizedException, UseInterceptors } from '@nestjs/common';
import { CacheKey, CacheTTL } from '@nestjs/cache-manager';

import { UserCacheInterceptor } from '../../infrastructure/cache/user-cache.interceptor';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { MedicationsService } from './medications.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

@Controller('medications')
@UseGuards(JwtAuthGuard)
export class MedicationsController {
  constructor(private readonly medicationsService: MedicationsService) {}

  @UseInterceptors(UserCacheInterceptor)
  @CacheKey('medications:all')
  @CacheTTL(30)
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

  @UseInterceptors(UserCacheInterceptor)
  @CacheKey('medications:logs')
  @CacheTTL(30)
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
    @Body() dto: { action: string; scheduledFor?: string },
    @Request() req: any,
  ) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException();
    return this.medicationsService.logAction(medicationId, userId, dto.action, dto.scheduledFor);
  }
}
