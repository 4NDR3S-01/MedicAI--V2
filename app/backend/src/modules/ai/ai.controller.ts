import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Request,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { AiService } from './ai.service';
import { ChatRequestDto } from './chat-message.dto';

/** Lo que deja FileInterceptor (multer, en memoria). */
type UploadedAudio = { buffer: Buffer; mimetype: string; originalname: string; size: number };
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Máximo 8 mensajes por minuto por usuario autenticado.
   * Groq consume crédito de API y el Celeron no tolera picos de concurrencia.
   */
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('chat')
  chat(@Body() dto: ChatRequestDto, @Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Inicia sesión para usar el asistente.');
    return this.aiService.chat(dto, userId);
  }

  /**
   * Voz → texto para el asistente. Audio de hasta ~2 MB (un minuto sobra);
   * no se guarda en ningún lado.
   */
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }))
  transcribe(@UploadedFile() audio: UploadedAudio | undefined, @Request() req: any) {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('Inicia sesión para usar el asistente.');
    if (!audio?.buffer?.length) throw new BadRequestException('No llegó el audio.');
    if (!/^audio\/|^video\/(mp4|3gpp)|^application\/octet-stream$/.test(audio.mimetype)) {
      throw new BadRequestException('Formato de audio no válido.');
    }
    return this.aiService.transcribe(audio, userId);
  }
}
