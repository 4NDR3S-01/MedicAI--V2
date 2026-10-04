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
  error?: { message?: string; code?: string; type?: string };
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

/** Hasta dónde se recuerda la conversación (el plan gratuito permite ~8K tokens por minuto). */
export const MAX_HISTORY = 12;

/** Entiende texto e imágenes y usa herramientas (plan gratuito de Groq). */
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';
/** Respaldo de solo texto si el principal no está disponible. */
const FALLBACK_MODEL = 'openai/gpt-oss-120b';

const IMAGE_PROMPT =
  'Si el usuario envía una foto (caja o etiqueta de un medicamento, receta, fórmula médica, orden de cita), describe solo lo relevante para su salud. Si es un medicamento o una receta y quiere registrarlo, usa propose_medication con lo que se lea con claridad y pregunta lo que no se lea bien; nunca inventes una dosis ilegible. No interpretes exámenes ni imágenes clínicas como diagnóstico: sugiere revisarlos con su médico.';

type GroqResult =
  | { ok: true; data: GroqChatCompletionResponse }
  | { ok: false; status: number; code?: string; message: string; modelUnavailable: boolean };

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
  private readonly GROQ_MAX_TOKENS = 700;

  async chat(dto: ChatRequestDto, userId: string) {
    const primary = this.configService.get<string>('GROQ_MODEL') || DEFAULT_MODEL;
    const fallback = this.configService.get<string>('GROQ_FALLBACK_MODEL') || FALLBACK_MODEL;
    const context = await buildAiContext(this.prisma, userId);
    const images = dto.images ?? [];
    const voice = dto.mode === 'voice';

    // 1) Modelo principal, con herramientas (y fotos si las hay).
    let model = primary;
    let result = await this.callGroq(model, this.buildMessages(dto.message, dto.history, context.text, voice, images), true);

    // 2) Generó mal una herramienta: se repite sin herramientas.
    if (!result.ok && result.code === 'tool_use_failed') {
      this.logger.warn('Groq tool call failed, retrying without tools', { model });
      result = await this.callGroq(model, this.buildMessages(dto.message, dto.history, context.text, voice, images), false);
    }

    // 3) El modelo no está disponible (retirado, sin acceso en el plan…): el de respaldo, sin fotos.
    if (!result.ok && result.modelUnavailable && fallback !== model) {
      this.logger.warn('Groq model unavailable, using fallback', { model, fallback, status: result.status, message: result.message });
      model = fallback;
      const text = images.length
        ? `${dto.message}\n\n(El usuario adjuntó ${images.length === 1 ? 'una foto' : 'fotos'}, pero ahora no puedes verlas: díselo y pídele que escriba lo que dice.)`
        : dto.message;
      result = await this.callGroq(model, this.buildMessages(text, dto.history, context.text, voice, []), true);
    }

    if (!result.ok) {
      this.logger.warn('Groq request rejected', { model, status: result.status, code: result.code, message: result.message });
      if (result.status === 429) {
        throw new HttpException('El asistente está atendiendo muchas consultas. Inténtalo en un minuto.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (result.status === 0) {
        throw new ServiceUnavailableException(result.message);
      }
      throw new BadGatewayException('El asistente no pudo responder. Inténtalo de nuevo.');
    }
    const data = result.data;

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

    // Algunos modelos razonan entre <think>…</think>: eso no es para el usuario.
    let reply = (message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
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

  /** Una llamada a Groq. Nunca lanza: devuelve el error para decidir si se reintenta. */
  private async callGroq(model: string, messages: unknown[], withTools: boolean): Promise<GroqResult> {
    const apiKey = this.configService.getOrThrow<string>('GROQ_API_KEY');
    const baseUrl = (this.configService.get<string>('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    const payload: Record<string, unknown> = {
      model,
      temperature: 0.3,
      max_tokens: this.GROQ_MAX_TOKENS,
      messages,
      ...(withTools ? { tools: AI_TOOLS, tool_choice: 'auto' } : {}),
    };
    // Sin "pensar en voz alta": respuestas más rápidas y que no gastan cupo.
    if (model.startsWith('qwen/')) {
      payload.reasoning_effort = 'none';
      payload.reasoning_format = 'hidden';
    } else if (model.startsWith('openai/gpt-oss')) {
      payload.reasoning_effort = 'low';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.GROQ_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as GroqChatCompletionResponse;
      if (response.ok) return { ok: true, data };
      const message = data.error?.message ?? `HTTP ${response.status}`;
      const code = data.error?.code;
      const modelUnavailable =
        response.status === 404
        || (response.status === 403 && /model/i.test(message))
        || code === 'model_not_found'
        || code === 'model_decommissioned'
        || (response.status === 400 && /model.*(not (found|exist|available|supported))|decommission|does not support/i.test(message));
      return { ok: false, status: response.status, code, message, modelUnavailable };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      if (!timedOut) this.logger.error('Groq request failed', error as Error);
      return {
        ok: false,
        status: 0,
        message: timedOut ? 'La respuesta tardó demasiado. Inténtalo de nuevo.' : 'No fue posible conectar con el asistente. Inténtalo en un momento.',
        modelUnavailable: false,
      };
    } finally {
      clearTimeout(timeout);
    }
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

  private buildMessages(message: string, history: ChatMessageDto[] | undefined, context: string, voice = false, images: string[] = []) {
    const previousMessages = (history || [])
      .filter((entry) => entry.content.trim().length > 0)
      .slice(-MAX_HISTORY)
      .map((entry) => ({ role: entry.role || 'user', content: entry.content.trim() }));

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: context },
      ...(voice ? [{ role: 'system', content: VOICE_PROMPT }] : []),
      ...(images.length ? [{ role: 'system', content: IMAGE_PROMPT }] : []),
      ...previousMessages,
      images.length
        ? {
          role: 'user',
          content: [
            { type: 'text', text: message.trim() },
            ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        }
        : { role: 'user', content: message.trim() },
    ];
  }
}
