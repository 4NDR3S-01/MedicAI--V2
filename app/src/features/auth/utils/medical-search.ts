/**
 * Buscador de condiciones de salud y alergias: al escribir se ofrece primero
 * lo que ya existe (aunque esté mal escrito o dicho con otras palabras), para
 * que la lista no se llene de «Diabetes», «diabetes» e «iabetes».
 * Pura y sin dependencias de React Native (se prueba en backend/test).
 */

export type MedicalSuggestion = {
  item: string;
  reason: 'exact' | 'prefix' | 'contains' | 'synonym' | 'typo';
  /** Sinónimo con el que coincidió («presión alta»). */
  via?: string;
};

const RANK: Record<MedicalSuggestion['reason'], number> = { exact: 0, prefix: 1, contains: 2, synonym: 3, typo: 4 };

/** Minúsculas, sin tildes ni espacios de más. */
export function normalizeMedicalText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

const words = (text: string) => text.split(/[^a-z0-9ñ]+/).filter(Boolean);

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

/** Letras de diferencia que se toleran: 1 en palabras cortas, 2 en largas. */
const tolerance = (length: number) => (length <= 4 ? 1 : 2);

const isTypoOf = (query: string, target: string) =>
  query.length >= 4 && target.length >= 4 && editDistance(query, target) <= tolerance(Math.min(query.length, target.length));

function matchOne(query: string, item: string, synonyms: readonly string[]): MedicalSuggestion | null {
  const text = normalizeMedicalText(item);
  if (text === query) return { item, reason: 'exact' };
  const itemWords = words(text);
  if (text.startsWith(query) || itemWords.some((word) => word.startsWith(query))) return { item, reason: 'prefix' };
  // Palabras de la gente («presión alta», «tiroides»): pesan más que un parecido.
  for (const synonym of synonyms) {
    const normalized = normalizeMedicalText(synonym);
    if (normalized === query || normalized.startsWith(query) || (query.length >= 4 && query.includes(normalized))) {
      return { item, reason: 'synonym', via: synonym };
    }
  }
  // Casi la palabra entera («iabetes»): es un error al escribir, no una búsqueda.
  const typo = isTypoOf(query, text) || itemWords.some((word) => isTypoOf(query, word));
  if (typo) return { item, reason: 'typo' };
  if (query.length >= 3 && text.includes(query)) return { item, reason: 'contains' };

  for (const synonym of synonyms) {
    if (isTypoOf(query, normalizeMedicalText(synonym))) return { item, reason: 'synonym', via: synonym };
  }
  return null;
}

/** Opciones de la lista que coinciden con lo escrito, la mejor primero. */
export function suggestMedicalOptions(
  query: string,
  options: readonly string[],
  synonyms: Readonly<Record<string, readonly string[]>> = {},
  limit = 3,
): MedicalSuggestion[] {
  const normalized = normalizeMedicalText(query);
  if (normalized.length < 2) return [];
  return options
    .map((item) => matchOne(normalized, item, synonyms[item] ?? []))
    .filter((match): match is MedicalSuggestion => match !== null)
    .sort((a, b) => RANK[a.reason] - RANK[b.reason])
    .slice(0, limit);
}

/** Algo que no está en la lista: sin espacios de más y con mayúscula inicial. */
export function formatCustomMedicalItem(value: string): string {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}
