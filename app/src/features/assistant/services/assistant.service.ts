import { ensureApiBaseUrl, parseApiErrorMessage, readResponseBody, requestWithAutoRefresh } from '../../tabs/services/http';
import type { AppointmentDraft } from '../../tabs/components/AppointmentFormSheet';
import type { MedicationDraft } from '../../tabs/components/MedicationFormSheet';

/** Registrar una toma de hoy ("ya me tomé la metformina"). */
export type DoseDraft = {
  medicationId: string;
  medicationName: string;
  dosage: string;
  /** null: según necesidad (se registra ahora). */
  scheduledFor: string | null;
  time: string | null;
};

export type Proposal =
  | ({ kind: 'medication' } & MedicationDraft)
  | ({ kind: 'appointment' } & AppointmentDraft)
  | ({ kind: 'dose' } & DoseDraft);

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type AssistantReply = {
  reply: string;
  proposals: Proposal[];
  /** Si el asistente usó la información de salud, medicamentos y citas. */
  usedPersonalContext: boolean;
};

/** Mensajes previos que se envían (el servidor acepta 12; el plan gratuito tiene poco cupo por minuto). */
export const HISTORY_LIMIT = 10;

export async function askAssistant(
  accessToken: string,
  message: string,
  history: ChatTurn[],
  mode: 'text' | 'voice' = 'text',
  images: string[] = [],
): Promise<AssistantReply> {
  ensureApiBaseUrl();
  const response = await requestWithAutoRefresh('/ai/chat', 'POST', accessToken, {
    message,
    history: history.slice(-HISTORY_LIMIT),
    mode,
    ...(images.length ? { images } : {}),
  });
  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'El asistente no pudo responder. Inténtalo de nuevo.'));
  }
  const data = await readResponseBody<Partial<AssistantReply>>(response);
  return {
    reply: data.reply?.trim() || 'No recibí una respuesta. Inténtalo de nuevo.',
    proposals: Array.isArray(data.proposals) ? data.proposals : [],
    usedPersonalContext: Boolean(data.usedPersonalContext),
  };
}

/** Voz → texto (el servidor la transcribe con Whisper y no guarda el audio). */
export async function transcribeAudio(accessToken: string, uri: string): Promise<string> {
  ensureApiBaseUrl();
  const extension = uri.split('.').pop()?.toLowerCase() || 'm4a';
  const form = new FormData();
  // React Native acepta { uri, name, type } como archivo en FormData.
  form.append('audio', { uri, name: `voz.${extension}`, type: extension === '3gp' ? 'audio/3gpp' : 'audio/m4a' } as unknown as Blob);
  const response = await requestWithAutoRefresh('/ai/transcribe', 'POST', accessToken, form);
  if (!response.ok) {
    throw new Error(await parseApiErrorMessage(response, 'No pude entender el audio. Inténtalo de nuevo.'));
  }
  const data = await readResponseBody<{ text?: string }>(response);
  return data.text?.trim() ?? '';
}
