import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CircleService } from './circle.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
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

  @Get('people/:userId/health')
  health(@Param('userId') userId: string, @Request() req: any) {
    return this.circleService.healthInfo(req.user?.sub, userId);
  }
}
