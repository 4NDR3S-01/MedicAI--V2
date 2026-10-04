import { appStorage } from '../../../shared/storage';

/**
 * Código de invitación recibido por enlace (medicai://circle/invite?code=…).
 * Se guarda hasta que la persona inicie sesión y la pantalla Círculo lo abra.
 */
const STORAGE_KEY = 'medicai_pending_circle_invite_v1';
type Listener = (code: string) => void;
let listeners: Listener[] = [];

export function parseCircleInviteCode(url: string): string | null {
  if (!/circle|circulo/i.test(url)) return null;
  const match = /[?&]code=([A-Za-z0-9-]+)/.exec(url);
  const code = match?.[1]?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? '';
  return code.length === 8 ? code : null;
}

export async function setPendingCircleInvite(code: string): Promise<void> {
  await appStorage.setItem(STORAGE_KEY, code).catch(() => undefined);
  listeners.forEach((listener) => listener(code));
}

export async function hasPendingCircleInvite(): Promise<boolean> {
  try {
    return Boolean(await appStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

/** Devuelve el código pendiente y lo borra (se procesa una sola vez). */
export async function takePendingCircleInvite(): Promise<string | null> {
  try {
    const code = await appStorage.getItem(STORAGE_KEY);
    if (code) await appStorage.removeItem(STORAGE_KEY);
    return code || null;
  } catch {
    return null;
  }
}

export function onCircleInvite(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

// ─── Abrir Círculo desde una notificación ────────────────────────────────────

type OpenListener = () => void;
let openListeners: OpenListener[] = [];

/** Avisos del Círculo (invitación, toma sin registrar…): llevan a esa pestaña. */
export function requestOpenCircle(): void {
  openListeners.forEach((listener) => listener());
}

export function onOpenCircle(listener: OpenListener): () => void {
  openListeners.push(listener);
  return () => {
    openListeners = openListeners.filter((item) => item !== listener);
  };
}

/** Tipos de aviso push que se abren en Círculo. */
export const isCirclePushType = (type: unknown) =>
  type === 'CIRCLE' || type === 'CIRCLE_INVITE' || type === 'MISSED_DOSE' || type === 'CARE_LOW_STOCK';
