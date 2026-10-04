import { BadGatewayException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { buildAiContext, todayKey } from './ai-context';
import { resolveDoseProposal, type DoseProposal } from './ai-doses';
import { AI_TOOLS, LOG_DOSE_TOOL, parseProposal, type Proposal } from './ai-proposals';
import { ChatMessageDto, ChatRequestDto } from './chat-message.dto';

type GroqToolCall = { type?: string; function?: { name?: string; arguments?: string } };
type GroqChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: GroqToolCall[] } }>;
  error?: { message?: string };
};

const SYSTEM_PROMPT = [
  'Eres el asistente de MedicAI, una app que ayuda a las personas a llevar sus medicamentos y citas médicas.',
  'Responde siempre en español, con tono cálido, claro y breve (máximo unos 6-8 renglones salvo que pidan detalle).',
  'Puedes usar **negritas** y listas con "- " para ordenar; nada de tablas ni encabezados.',
  '',
  'Seguridad (obligatorio):',
  '- No eres médico ni reemplazas a uno. Das orientación general, no diagnósticos.',
  '- Nunca indiques empezar, suspender o cambiar la dosis de un medicamento recetado: eso lo decide su médico o farmacéutico.',
  '- Si describe una emergencia (dolor de pecho, dificultad para respirar, signos de ACV, sangrado abundante, pérdida de conciencia, reacción alérgica grave, sobredosis o ideas de hacerse daño), dile que llame de inmediato al 123 (Colombia) o al número de emergencias de su país, o que vaya a urgencias. Sé directo y breve.',
  '- Si hay una posible interacción, alergia o contraindicación con lo que toma, adviértelo con claridad y recomienda confirmarlo con su médico o farmacéutico.',
  '- No inventes datos. Si no sabes algo o falta información, dilo o pregunta.',
  '- No hables de temas ajenos a la salud y a MedicAI; redirige con amabilidad.',
  '',
  'Acciones: puedes PREPARAR el registro de una toma (propose_dose_log) cuando diga que ya se tomó un medicamento; después pregúntale en una frase corta si la registras. También puedes PREPARAR un medicamento (propose_medication) o una cita (propose_appointment) solo cuando el usuario lo pida y dé los datos necesarios. Si falta algo (dosis, frecuencia, hora, día), pregúntalo antes. Nunca propongas un medicamento que no le hayan recetado. El usuario siempre revisa y confirma antes de guardar; cuando prepares algo, dilo en una frase corta.',
].join('\n');

const VOICE_PROMPT =
  'Esta conversación es POR VOZ: tu respuesta se leerá en voz alta. Responde en máximo 3 frases cortas y naturales, sin listas, negritas, emojis ni símbolos. Di las horas como "a las 8 de la noche".';

/** Hasta dónde se recuerda la conversación (mensajes previos enviados al modelo). */
export const MAX_HISTORY = 20;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private readonly GROQ_TIMEOUT_MS = 30_000;
  // El tiempo de respuesta crece con los tokens generados; el prompt pide
  // respuestas breves, así que se acota para evitar colas largas.
  private readonly GROQ_MAX_TOKENS = 800;

  async chat(dto: ChatRequestDto, userId: string) {
    const apiKey = this.configService.getOrThrow<string>('GROQ_API_KEY');
    const baseUrl = (this.configService.get<string>('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const model = this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
    const context = await buildAiContext(this.prisma, userId);

    const payload = {
      model,
      temperature: 0.2,
      max_tokens: this.GROQ_MAX_TOKENS,
      messages: this.buildMessages(dto.message, dto.history, context.text, dto.mode === 'voice'),
      tools: AI_TOOLS,
      tool_choice: 'auto',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.GROQ_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn('Groq request timed out', { timeoutMs: this.GROQ_TIMEOUT_MS });
        throw new ServiceUnavailableException('La respuesta tardó demasiado. Inténtalo de nuevo.');
      }
      this.logger.error('Groq request failed', error as Error);
      throw new ServiceUnavailableException('No fue posible conectar con el asistente. Inténtalo en un momento.');
    } finally {
      clearTimeout(timeout);
    }

    const data = (await response.json().catch(() => ({}))) as GroqChatCompletionResponse;
    if (!response.ok) {
      this.logger.warn('Groq request rejected', { status: response.status, message: data.error?.message });
      if (response.status === 429) {
        throw new HttpException('El asistente está atendiendo muchas consultas. Inténtalo en un minuto.', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new BadGatewayException('El asistente no pudo responder. Inténtalo de nuevo.');
    }

    const message = data.choices?.[0]?.message;
    const today = todayKey(context.timeZone);
    const calls = message?.tool_calls ?? [];
    const proposals: (Proposal | DoseProposal)[] = calls
      .filter((call) => call.function?.name !== LOG_DOSE_TOOL)
      .map((call) => parseProposal(call.function?.name ?? '', call.function?.arguments ?? '', today))
      .filter((proposal): proposal is Proposal => proposal !== null);

    // "Ya me tomé…": se busca la toma real de hoy; si no hay, se dice.
    let doseNote = '';
    for (const call of calls.filter((item) => item.function?.name === LOG_DOSE_TOOL)) {
      let name = '';
      try {
        name = String((JSON.parse(call.function?.arguments ?? '{}') as { medicationName?: unknown }).medicationName ?? '');
      } catch {
        name = '';
      }
      const dose = await resolveDoseProposal(this.prisma, userId, name);
      if (dose) proposals.push(dose);
      else doseNote = `No encontré una toma pendiente de hoy${name ? ` de ${name.slice(0, 60)}` : ''} para registrar. Revisa el nombre en Medicamentos.`;
    }
    proposals.splice(3);

    let reply = message?.content?.trim() ?? '';
    if (doseNote) reply = proposals.length ? `${reply}\n\n${doseNote}`.trim() : doseNote;
    const firstDose = proposals.find((proposal): proposal is DoseProposal => proposal.kind === 'dose');
    if (!reply && firstDose) {
      reply = `¿Registro ${firstDose.medicationName}${firstDose.time ? ` de las ${firstDose.time}` : ''} como tomada?`;
    }
    if (!reply && proposals.length) {
      reply = proposals[0].kind === 'medication'
        ? 'Preparé el medicamento. Revísalo y, si está bien, guárdalo para activar sus recordatorios.'
        : 'Preparé la cita. Revísala y, si está bien, guárdala para recibir sus recordatorios.';
    }
    if (!reply) {
      throw new ServiceUnavailableException('El asistente no devolvió una respuesta. Inténtalo de nuevo.');
    }

    return { reply, model, proposals, usedPersonalContext: context.personal };
  }

  /**
   * Voz → texto con Whisper (Groq). El audio no se guarda. Con su permiso, los
   * nombres de sus medicamentos ayudan a reconocerlos ("metformina", no
   * "met formina").
   */
  async transcribe(audio: { buffer: Buffer; mimetype: string; originalname?: string }, userId: string) {
    const apiKey = this.configService.getOrThrow<string>('GROQ_API_KEY');
    const baseUrl = (this.configService.get<string>('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const model = this.configService.get<string>('GROQ_TRANSCRIPTION_MODEL') || 'whisper-large-v3-turbo';

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiHealthContextConsent: true } });
    const names = user?.aiHealthContextConsent
      ? (await this.prisma.medication.findMany({ where: { userId, active: true }, select: { name: true }, take: 20 })).map((item) => item.name)
      : [];

    const form = new FormData();
    const extension = audio.originalname?.split('.').pop() || 'm4a';
    form.append('file', new Blob([new Uint8Array(audio.buffer)], { type: audio.mimetype || 'audio/m4a' }), `voz.${extension}`);
    form.append('model', model);
    form.append('language', 'es');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append('prompt', `Conversación con un asistente de medicamentos y citas médicas.${names.length ? ` Medicamentos: ${names.join(', ')}.` : ''}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.GROQ_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      this.logger.error('Groq transcription failed', error as Error);
      throw new ServiceUnavailableException('No pude entender el audio. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      clearTimeout(timeout);
    }
    const data = (await response.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    if (!response.ok) {
      this.logger.warn('Groq transcription rejected', { status: response.status, message: data.error?.message });
      if (response.status === 429) {
        throw new HttpException('Hay muchas consultas en este momento. Inténtalo en un minuto.', HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new BadGatewayException('No pude entender el audio. Inténtalo de nuevo.');
    }
    return { text: (data.text ?? '').trim() };
  }

  private buildMessages(message: string, history: ChatMessageDto[] | undefined, context: string, voice = false) {
    const previousMessages = (history || [])
      .filter((entry) => entry.content.trim().length > 0)
      .slice(-MAX_HISTORY)
      .map((entry) => ({ role: entry.role || 'user', content: entry.content.trim() }));

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: context },
      ...(voice ? [{ role: 'system', content: VOICE_PROMPT }] : []),
      ...previousMessages,
      { role: 'user', content: message.trim() },
    ];
  }
}
