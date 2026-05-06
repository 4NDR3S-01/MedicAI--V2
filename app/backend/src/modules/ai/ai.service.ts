import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatMessageDto, ChatRequestDto } from './chat-message.dto';

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly configService: ConfigService) {}

  async chat(dto: ChatRequestDto) {
    const apiKey = this.configService.getOrThrow<string>('GROQ_API_KEY');
    const baseUrl = (this.configService.get<string>('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.1-70b-versatile';

    const payload = {
      model,
      temperature: 0.2,
      messages: this.buildMessages(dto.message, dto.history),
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as GroqChatCompletionResponse;

    if (!response.ok) {
      const message = data.error?.message || 'No fue posible generar la respuesta de IA.';
      this.logger.warn('Groq request rejected', { status: response.status, message });
      throw new BadGatewayException(message);
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new ServiceUnavailableException('Groq no devolvió contenido para la respuesta.');
    }

    return {
      reply: content,
      model,
    };
  }

  private buildMessages(message: string, history?: ChatMessageDto[]) {
    const systemPrompt = [
      'Eres un asistente de salud para MedicAI.',
      'Responde en español, con tono claro, breve y útil.',
      'No reemplazas a un profesional médico.',
      'Si el usuario describe una emergencia o un síntoma grave, recomienda buscar atención médica inmediata.',
      'Evita diagnósticos definitivos; orienta y sugiere pasos generales.',
    ].join(' ');

    const previousMessages = (history || [])
      .filter((entry) => entry.content.trim().length > 0)
      .map((entry) => ({
        role: entry.role || 'user',
        content: entry.content.trim(),
      }));

    return [
      { role: 'system', content: systemPrompt },
      ...previousMessages,
      { role: 'user', content: message.trim() },
    ];
  }
}
