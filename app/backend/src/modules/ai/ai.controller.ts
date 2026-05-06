import { Body, Controller, Post } from '@nestjs/common';

import { AiService } from './ai.service';
import { ChatRequestDto } from './chat-message.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  chat(@Body() dto: ChatRequestDto) {
    return this.aiService.chat(dto);
  }
}
