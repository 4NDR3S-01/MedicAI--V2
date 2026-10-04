import { File } from 'expo-file-system';

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

/**
 * Voz → texto. El audio va en base64 dentro de JSON (enviarlo como archivo
 * adjunto falla en algunos teléfonos Android) y la grabación se borra del
 * teléfono en cuanto se envía. El servidor tampoco la guarda.
 */
export async function transcribeAudio(accessToken: string, uri: string): Promise<string> {
  ensureApiBaseUrl();
  const file = new File(uri);
  const format = uri.split('.').pop()?.toLowerCase() || 'm4a';
  let audio: string;
  try {
    audio = await file.base64();
  } catch {
    throw new Error('No pude leer la grabación. Inténtalo de nuevo.');
  }
  try {
    const response = await requestWithAutoRefresh('/ai/transcribe', 'POST', accessToken, { audio, format });
    if (!response.ok) {
      throw new Error(await parseApiErrorMessage(response, 'No pude entender el audio. Inténtalo de nuevo.'));
    }
    const data = await readResponseBody<{ text?: string }>(response);
    return data.text?.trim() ?? '';
  } finally {
    try {
      file.delete();
    } catch {
      // ya no existe: nada que borrar
    }
  }
}
