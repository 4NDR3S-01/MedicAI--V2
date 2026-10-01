import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { calculateAge } from '../../common/birth-date';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ChatMessageDto, ChatRequestDto } from './chat-message.dto';

// Valores que significan "sin datos" y no aportan nada al modelo.
const EMPTY_MEDICAL_VALUES = new Set(['', 'ninguno', 'ninguna']);

const SPECIAL_CONDITION_LABELS = {
  pregnancy: 'embarazo',
  lactation: 'lactancia',
  recentSurgeries: 'cirugía reciente',
  immunosuppression: 'inmunosupresión',
  anticoagulantTreatment: 'tratamiento anticoagulante',
} as const;

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

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly GROQ_TIMEOUT_MS = 25_000;
  // El tiempo de respuesta crece linealmente con los tokens generados; el
  // prompt pide respuestas breves, así que se acota para evitar colas largas.
  private readonly GROQ_MAX_TOKENS = 700;

  async chat(dto: ChatRequestDto, userId?: string) {
    const apiKey = this.configService.getOrThrow<string>('GROQ_API_KEY');
    const baseUrl = (this.configService.get<string>('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';

    const payload = {
      model,
      temperature: 0.2,
      max_tokens: this.GROQ_MAX_TOKENS,
      messages: this.buildMessages(dto.message, dto.history, await this.buildHealthContext(userId)),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.GROQ_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn('Groq request timed out', { timeoutMs: this.GROQ_TIMEOUT_MS });
        throw new ServiceUnavailableException('La respuesta de IA tardó demasiado. Intenta de nuevo.');
      }
      this.logger.error('Groq request failed', error as Error);
      throw new ServiceUnavailableException('No fue posible conectar con el servicio de IA.');
    } finally {
      clearTimeout(timeout);
    }

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

  /**
   * Contexto de salud del usuario, solo si dio consentimiento explícito.
   * Minimización: sin nombre, correo ni teléfono, y edad en vez de fecha de
   * nacimiento. Son datos autodeclarados que pueden estar incompletos.
   */
  private async buildHealthContext(userId?: string): Promise<string | null> {
    if (!userId) return null;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        aiHealthContextConsent: true,
        birthDate: true,
        conditions: true,
        allergies: true,
        pregnancy: true,
        lactation: true,
        recentSurgeries: true,
        immunosuppression: true,
        anticoagulantTreatment: true,
      },
    });
    if (!user?.aiHealthContextConsent) return null;

    const lines: string[] = [];
    const age = user.birthDate ? calculateAge(user.birthDate) : null;
    if (age !== null) lines.push(`Edad: ${age} años.`);
    if (user.conditions && !EMPTY_MEDICAL_VALUES.has(user.conditions.trim().toLowerCase())) {
      lines.push(`Condiciones de salud: ${user.conditions.trim()}.`);
    }
    if (user.allergies) {
      const allergies = user.allergies.trim();
      lines.push(
        EMPTY_MEDICAL_VALUES.has(allergies.toLowerCase())
          ? 'Alergias: declara no tener alergias conocidas.'
          : `Alergias: ${allergies}.`,
      );
    }
    const special = (Object.keys(SPECIAL_CONDITION_LABELS) as Array<keyof typeof SPECIAL_CONDITION_LABELS>)
      .filter((key) => user[key])
      .map((key) => SPECIAL_CONDITION_LABELS[key]);
    if (special.length) lines.push(`Situaciones especiales: ${special.join(', ')}.`);

    if (!lines.length) return null;

    return [
      'Contexto de salud que el usuario autorizó compartir (autodeclarado, puede estar incompleto o desactualizado):',
      ...lines,
      'Úsalo solo cuando sea relevante, por ejemplo para advertir de alergias, interacciones o contraindicaciones.',
      'No lo repitas si no hace falta, no asumas diagnósticos que no aparezcan y, ante cualquier duda, remite a un profesional de la salud.',
    ].join('\n');
  }

  private buildMessages(message: string, history?: ChatMessageDto[], healthContext?: string | null) {
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
      ...(healthContext ? [{ role: 'system', content: healthContext }] : []),
      ...previousMessages,
      { role: 'user', content: message.trim() },
    ];
  }
}
