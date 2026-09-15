import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AiService } from './ai.service';
import { ChatRequestDto } from './chat-message.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Máximo 5 mensajes por minuto por usuario autenticado.
   * Groq consume crédito de API y el Celeron no tolera picos de concurrencia.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('chat')
  chat(@Body() dto: ChatRequestDto, @Request() _req: any) {
    return this.aiService.chat(dto);
  }
}
