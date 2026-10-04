/** Avatares ilustrados disponibles (DiceBear) y lectura del guardado en la cuenta. */
const SEEDS = [
  { seed: 'Alexander', bg: 'e0f2fe' },
  { seed: 'Sophia', bg: 'fce7f3' },
  { seed: 'Oliver', bg: 'dcfce7' },
  { seed: 'Isabella', bg: 'fef3c7' },
  { seed: 'William', bg: 'e0e7ff' },
  { seed: 'Mia', bg: 'ffedd5' },
  { seed: 'James', bg: 'f3f4f6' },
  { seed: 'Charlotte', bg: 'cffafe' },
  { seed: 'Benjamin', bg: 'fae8ff' },
  { seed: 'Amelia', bg: 'ecfccb' },
  { seed: 'Lucas', bg: 'ffedd5' },
  { seed: 'Harper', bg: 'e0f2fe' },
];

export type AvatarOption = { id: string; url: string };

export const AVATAR_OPTIONS: AvatarOption[] = SEEDS.map((item, index) => ({
  id: `db-avt-${index}`,
  url: `https://api.dicebear.com/9.x/avataaars/png?seed=${item.seed}&backgroundColor=${item.bg}`,
}));

/** Sin imagen: se muestran las iniciales. */
export const INITIALS_AVATAR = JSON.stringify({ id: 'initials' });

export function parseAvatar(data: string | null | undefined): AvatarOption | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Partial<AvatarOption>;
    return parsed?.url && parsed.id ? { id: parsed.id, url: parsed.url } : null;
  } catch {
    return null;
  }
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}
