import { Body, Controller, Delete, Post, Request, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { PushService } from './push.service';

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /** La app registra el token de este dispositivo (ligado a la sesión). */
  @Post('tokens')
  register(@Body() dto: RegisterPushTokenDto, @Request() req: any) {
    return this.pushService.registerToken(req.user?.sub, req.user?.sid, dto.token, dto.platform);
  }

  @Delete('tokens')
  unregister(@Body() dto: RegisterPushTokenDto, @Request() req: any) {
    return this.pushService.unregisterToken(req.user?.sub, dto.token);
  }
}
