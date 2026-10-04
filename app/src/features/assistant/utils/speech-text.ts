/** Reglas de texto de la conversación por voz (sin dependencias nativas). */

/** Texto apto para leer: sin marcas, listas convertidas en frases y unidades dichas. */
export function toSpeech(text: string): string {
  return text
    .replace(/\*\*|__|`|#+\s/g, '')
    .replace(/^\s*(?:[-*•+]|\d+[.)])\s+/gm, '')
    .replace(/\n+/g, '. ')
    .replace(/\b(\d+(?:[.,]\d+)?)\s?mg\b/gi, '$1 miligramos')
    .replace(/\b(\d+(?:[.,]\d+)?)\s?ml\b/gi, '$1 mililitros')
    .replace(/\b(\d+(?:[.,]\d+)?)\s?mcg\b/gi, '$1 microgramos')
    .replace(/\.\s*\./g, '.')
    .trim();
}

// ─── Respuestas habladas ────────────────────────────────────────────────────

const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
/** Solo respuestas cortas cuentan como "sí": "sí, pero ¿qué me toca después?" es otra pregunta. */
const short = (text: string, words = 5) => normalize(text).split(' ').length <= words;

/** "listo", "terminar", "eso es todo", "adiós"… */
export const isExitPhrase = (text: string) =>
  /^(listo|terminar|termina|termine|salir|adios|chao|nada mas|eso es todo|ya esta|gracias,? eso es todo|para|detente)( gracias)?$/.test(normalize(text));

/** "sí", "claro", "regístrala"… */
export const isYes = (text: string) =>
  short(text) && /^(si|sip|claro|dale|ok|okay|vale|correcto|exacto|por favor|registrala|registralo|confirmo|confirma|hazlo|ya me la tome|ya la tome)\b/.test(normalize(text));

/** "no", "todavía no", "cancela"… */
export const isNo = (text: string) =>
  /^(no|no gracias|todavia no|aun no|cancela|cancelar|no la registres|no lo registres|mejor no|no me la he tomado|no la he tomado)$/.test(normalize(text));
