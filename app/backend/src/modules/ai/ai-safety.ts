/**
 * Red de seguridad sobre la respuesta del modelo: el horario de la línea 171
 * (opción 6, salud mental del MSP de Ecuador) no está verificado —las fuentes
 * oficiales se contradicen—, así que nunca se afirma que atiende "24/7".
 * Para riesgo inminente el número es el 911 (ECU 911), que sí atiende siempre.
 */
const ALWAYS_OPEN =
  /\s*[,;]?\s*(?:y\s+)?(?:disponible\s+|atiende\s+|abierta\s+)?(?:(?:las\s+)?24\s*(?:\/|x)\s*7|(?:las\s+)?24\s+horas(?:\s+del\s+d[ií]a)?(?:\s*,?\s*(?:los\s+)?7\s+d[ií]as(?:\s+(?:a|de)\s+la\s+semana)?)?|todos\s+los\s+d[ií]as\s+a\s+toda\s+hora|a\s+cualquier\s+hora|sin\s+interrupci[oó]n)/gi;

const NOTE = 'Confirma su horario al llamar; si no contestan o el riesgo es inmediato, llama al 911.';

export function removeUnverifiedHotlineHours(reply: string): string {
  if (!/\b171\b/.test(reply)) return reply;
  let changed = false;
  // Solo en las frases que nombran la 171: el 911 sí puede decirse "24/7".
  const sentences = reply.split(/(?<=[.!?\n])/);
  const cleaned = sentences.map((sentence) => {
    if (!/\b171\b/.test(sentence)) return sentence;
    const next = sentence
      .replace(ALWAYS_OPEN, '')
      .replace(/\(\s*[,;]?\s*\)/g, '')
      .replace(/\(\s*[,;]\s*/g, '(')
      .replace(/\s*[,;]\s*\)/g, ')')
      .replace(/\s+([.,;)])/g, '$1')
      .replace(/ {2,}/g, ' ');
    if (next !== sentence) changed = true;
    return next;
  });
  let result = cleaned.join('');
  if (changed && !result.includes(NOTE)) {
    // La nota va justo después de la frase de la 171.
    const index = cleaned.findIndex((sentence) => /\b171\b/.test(sentence));
    const before = cleaned.slice(0, index + 1).join('');
    const after = cleaned.slice(index + 1).join('');
    result = `${before.replace(/\s*$/, '')} ${NOTE}${after.startsWith(' ') || after.startsWith('\n') || !after ? '' : ' '}${after}`;
  }
  return result;
}
