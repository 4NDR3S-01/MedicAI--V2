/**
 * Señales de una posible emergencia en lo que escribe el usuario. Se avisa al
 * instante, sin esperar a la IA: en una urgencia cada segundo cuenta.
 */
const PATTERNS = [
  /dolor (fuerte |intenso )?(en el |de )?pecho/,
  /no puedo respirar|me ahogo|falta de aire|dificultad para respirar/,
  /desmay|perdi(o|ó) el conocimiento|inconsciente|convulsi/,
  /(cara|boca|labios) (torcid|dormid)|no puedo hablar|habla arrastrada/,
  /sangr(a|e|ado) mucho|hemorragia|vomit(o|é|a) sangre/,
  /sobredosis|me tom(e|é) (todas|muchas|demasiad)|intoxicad/,
  /hinchaz(o|ó)n de (la )?(garganta|lengua)|se me cierra la garganta|anafilax/,
  /suicid|quitarme la vida|hacerme da(ñ|n)o|no quiero vivir|matarme/,
];

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function looksLikeEmergency(text: string): boolean {
  const value = normalize(text);
  return PATTERNS.some((pattern) => pattern.test(value) || pattern.test(text.toLowerCase()));
}

/** Línea de emergencias de Colombia. */
export const EMERGENCY_NUMBER = '123';
