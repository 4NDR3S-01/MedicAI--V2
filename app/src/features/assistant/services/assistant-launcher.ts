/**
 * Abre el asistente desde cualquier pantalla (Inicio, panel de un
 * medicamento, de una toma…) sin pasar props por toda la app. MainAppShell
 * escucha y muestra el chat.
 */
export type AssistantRequest = {
  /** Cambia en cada petición: permite repetir la misma. */
  id: number;
  /** Pregunta ya escrita en el campo (el usuario la revisa y envía). */
  text?: string;
  /** Empieza directamente la conversación por voz. */
  voice?: boolean;
};

type Listener = (request: AssistantRequest) => void;

let listener: Listener | null = null;
let counter = 0;

export function openAssistant(options: Omit<AssistantRequest, 'id'> = {}): void {
  counter += 1;
  listener?.({ id: counter, ...options });
}

export function onOpenAssistant(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}
