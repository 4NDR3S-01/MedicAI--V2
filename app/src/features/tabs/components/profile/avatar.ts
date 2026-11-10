import type { ImageSourcePropType } from 'react-native';

/**
 * Avatares ilustrados (estilo "Personas" de Draftbit, CC BY 4.0, generados con
 * DiceBear). Van dentro de la app: se ven al instante y sin conexión. La `url`
 * se guarda igual en la cuenta por compatibilidad (y para avatares antiguos,
 * que solo tienen la url).
 */
const SEEDS = [
  { n: 1, seed: 'Ana', bg: 'e0f2fe' },
  { n: 2, seed: 'Leo', bg: 'fce7f3' },
  { n: 3, seed: 'Mateo', bg: 'dcfce7' },
  { n: 4, seed: 'Lucia', bg: 'fef3c7' },
  { n: 5, seed: 'Diego', bg: 'e0e7ff' },
  { n: 6, seed: 'Valentina', bg: 'ffedd5' },
  { n: 7, seed: 'Tomas', bg: 'e0f2fe' },
  { n: 8, seed: 'Bruno', bg: 'fce7f3' },
  { n: 9, seed: 'Carmen', bg: 'dcfce7' },
  { n: 11, seed: 'Rosa', bg: 'e0e7ff' },
  { n: 12, seed: 'Ines', bg: 'ffedd5' },
];

const LOCAL: Record<string, ImageSourcePropType> = {
  'persona-1': require('../../../../../assets/avatars/persona-1.png'),
  'persona-2': require('../../../../../assets/avatars/persona-2.png'),
  'persona-3': require('../../../../../assets/avatars/persona-3.png'),
  'persona-4': require('../../../../../assets/avatars/persona-4.png'),
  'persona-5': require('../../../../../assets/avatars/persona-5.png'),
  'persona-6': require('../../../../../assets/avatars/persona-6.png'),
  'persona-7': require('../../../../../assets/avatars/persona-7.png'),
  'persona-8': require('../../../../../assets/avatars/persona-8.png'),
  'persona-9': require('../../../../../assets/avatars/persona-9.png'),
  'persona-11': require('../../../../../assets/avatars/persona-11.png'),
  'persona-12': require('../../../../../assets/avatars/persona-12.png'),
};

export type AvatarOption = { id: string; url: string };

export const AVATAR_OPTIONS: AvatarOption[] = SEEDS.map((item) => ({
  id: `persona-${item.n}`,
  url: `https://api.dicebear.com/9.x/personas/png?seed=${item.seed}&size=192&backgroundColor=${item.bg}&mouth=smile,bigSmile&eyes=open,happy,glasses&nose=smallRound,mediumRound`,
}));

/** La imagen local si es uno de los incluidos; si no, la de internet. */
export function avatarSource(option: AvatarOption): ImageSourcePropType {
  return LOCAL[option.id] ?? { uri: option.url };
}

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
