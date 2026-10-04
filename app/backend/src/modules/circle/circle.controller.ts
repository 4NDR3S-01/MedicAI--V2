import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CircleService } from './circle.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CareDataQueryDto } from './dto/care-data-query.dto';
import { CreateGroupDto, SetLinkGroupsDto, UpdateGroupDto } from './dto/group.dto';
import { CreateDependentDto } from './dto/create-dependent.dto';
import { HandoverDependentDto } from './dto/handover-dependent.dto';
import { UpdateDependentDto } from './dto/update-dependent.dto';
import { UpdateRemindersDto } from './dto/update-reminders.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { LookupCodeDto } from './dto/lookup-code.dto';
import { OwnerQueryDto } from './dto/owner-query.dto';
import { UpdateLinkDto } from './dto/update-link.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@Controller('circle')
@UseGuards(JwtAuthGuard)
export class CircleController {
  constructor(private readonly circleService: CircleService) {}

  @Get()
  overview(@Query() query: OwnerQueryDto, @Request() req: any) {
    return this.circleService.overview(req.user?.sub, query.ownerId);
  }

  @Post('invitations')
  createInvitation(@Body() dto: CreateInvitationDto, @Request() req: any) {
    return this.circleService.createInvitation(req.user?.sub, dto);
  }

  /** Abre (y asocia a la cuenta) una invitación compartida por código o enlace. */
  @Post('invitations/open')
  openByCode(@Body() dto: LookupCodeDto, @Request() req: any) {
    return this.circleService.openByCode(req.user?.sub, dto.code);
  }

  @Post('invitations/:id/accept')
  accept(@Param('id') invitationId: string, @Body() dto: AcceptInvitationDto, @Request() req: any) {
    return this.circleService.acceptInvitation(req.user?.sub, invitationId, dto);
  }

  @Post('invitations/:id/decline')
  decline(@Param('id') invitationId: string, @Request() req: any) {
    return this.circleService.declineInvitation(req.user?.sub, invitationId);
  }

  @Post('invitations/:id/resend')
  resend(@Param('id') invitationId: string, @Request() req: any) {
    return this.circleService.resendInvitation(req.user?.sub, invitationId);
  }

  @Delete('invitations/:id')
  cancel(@Param('id') invitationId: string, @Request() req: any) {
    return this.circleService.cancelInvitation(req.user?.sub, invitationId);
  }

  @Patch('links/:id')
  updateLink(@Param('id') linkId: string, @Body() dto: UpdateLinkDto, @Request() req: any) {
    return this.circleService.updateLink(req.user?.sub, linkId, dto);
  }

  @Put('links/:id/permissions')
  updatePermissions(@Param('id') linkId: string, @Body() dto: UpdatePermissionsDto, @Request() req: any) {
    return this.circleService.updatePermissions(req.user?.sub, linkId, dto);
  }

  @Delete('links/:id')
  revoke(@Param('id') linkId: string, @Query() query: OwnerQueryDto, @Request() req: any) {
    return this.circleService.revokeLink(req.user?.sub, linkId, query.ownerId);
  }

  /** Recibir en mi teléfono los recordatorios de la otra persona del vínculo. */
  @Put('links/:id/reminders')
  updateReminders(@Param('id') linkId: string, @Body() dto: UpdateRemindersDto, @Request() req: any) {
    return this.circleService.updateReminders(req.user?.sub, linkId, dto.mode);
  }

  /** Perfiles a cargo: personas sin cuenta propia (p. ej. un hijo pequeño). */
  @Post('dependents')
  createDependent(@Body() dto: CreateDependentDto, @Request() req: any) {
    return this.circleService.createDependent(req.user?.sub, dto);
  }

  @Patch('dependents/:id')
  updateDependent(@Param('id') dependentId: string, @Body() dto: UpdateDependentDto, @Request() req: any) {
    return this.circleService.updateDependent(req.user?.sub, dependentId, dto);
  }

  @Delete('dependents/:id')
  deleteDependent(@Param('id') dependentId: string, @Request() req: any) {
    return this.circleService.deleteDependent(req.user?.sub, dependentId);
  }

  @Post('dependents/:id/handover')
  handover(@Param('id') dependentId: string, @Body() dto: HandoverDependentDto, @Request() req: any) {
    return this.circleService.handoverDependent(req.user?.sub, dependentId, dto.email);
  }

  /** Datos de seguimiento de todas las personas que comparten conmigo. */
  /** Historial de permisos (propio, o de un perfil a cargo con ?ownerId=). */
  @Get('history')
  history(@Query() query: OwnerQueryDto, @Request() req: any) {
    return this.circleService.history(req.user?.sub, query.ownerId);
  }

  @Get('care-data')
  careData(@Query() query: CareDataQueryDto, @Request() req: any) {
    return this.circleService.careData(req.user?.sub, new Date(query.since));
  }

  @Post('groups')
  createGroup(@Body() dto: CreateGroupDto, @Request() req: any) {
    return this.circleService.createGroup(req.user?.sub, dto.name, dto.icon);
  }

  @Patch('groups/:id')
  updateGroup(@Param('id') groupId: string, @Body() dto: UpdateGroupDto, @Request() req: any) {
    return this.circleService.updateGroup(req.user?.sub, groupId, dto);
  }

  @Delete('groups/:id')
  deleteGroup(@Param('id') groupId: string, @Request() req: any) {
    return this.circleService.deleteGroup(req.user?.sub, groupId);
  }

  @Put('links/:id/groups')
  setLinkGroups(@Param('id') linkId: string, @Body() dto: SetLinkGroupsDto, @Request() req: any) {
    return this.circleService.setLinkGroups(req.user?.sub, linkId, dto.groupIds);
  }

  @Get('people/:userId/health')
  health(@Param('userId') userId: string, @Request() req: any) {
    return this.circleService.healthInfo(req.user?.sub, userId);
  }
}
