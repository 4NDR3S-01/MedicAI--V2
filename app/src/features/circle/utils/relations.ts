import type { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Lo que una persona ES para otra ("MOTHER" = es su madre). */
export type RelationCode =
  | 'FATHER'
  | 'MOTHER'
  | 'SON'
  | 'DAUGHTER'
  | 'PARTNER'
  | 'SIBLING'
  | 'GRANDPARENT'
  | 'GRANDCHILD'
  | 'RELATIVE'
  | 'CAREGIVER'
  | 'CARE_RECIPIENT'
  | 'DOCTOR'
  | 'PATIENT'
  | 'FRIEND'
  | 'OTHER';

export type Relation = { code: RelationCode | string; label: string | null };

/** Quién cuida a quién, siempre desde el punto de vista de quien mira. */
export type CareValue = 'I_CARE' | 'CARES_FOR_ME' | 'MUTUAL' | 'NONE';

export const RELATION_META: Record<RelationCode, { label: string; icon: IconName }> = {
  FATHER: { label: 'Padre', icon: 'human-male-boy' },
  MOTHER: { label: 'Madre', icon: 'human-female-girl' },
  SON: { label: 'Hijo', icon: 'human-child' },
  DAUGHTER: { label: 'Hija', icon: 'human-child' },
  PARTNER: { label: 'Pareja', icon: 'heart-outline' },
  SIBLING: { label: 'Hermano/a', icon: 'account-multiple-outline' },
  GRANDPARENT: { label: 'Abuelo/a', icon: 'human-cane' },
  GRANDCHILD: { label: 'Nieto/a', icon: 'baby-face-outline' },
  RELATIVE: { label: 'Familiar', icon: 'home-heart' },
  CAREGIVER: { label: 'Cuidador/a', icon: 'hand-heart-outline' },
  CARE_RECIPIENT: { label: 'Persona a cargo', icon: 'account-heart-outline' },
  DOCTOR: { label: 'Médico/a', icon: 'stethoscope' },
  PATIENT: { label: 'Paciente', icon: 'account-injury-outline' },
  FRIEND: { label: 'Amigo/a', icon: 'account-star-outline' },
  OTHER: { label: 'Otra relación', icon: 'account-question-outline' },
};

export const RELATION_GROUPS: { title: string; codes: RelationCode[] }[] = [
  { title: 'Familia', codes: ['FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'PARTNER', 'SIBLING', 'GRANDPARENT', 'GRANDCHILD', 'RELATIVE'] },
  { title: 'Cuidado', codes: ['CAREGIVER', 'CARE_RECIPIENT'] },
  { title: 'Salud', codes: ['DOCTOR', 'PATIENT'] },
  { title: 'Otras', codes: ['FRIEND', 'OTHER'] },
];

/** Si yo soy X para alguien, lo más probable es que esa persona sea esto para mí. */
const RECIPROCAL: Record<RelationCode, RelationCode[]> = {
  FATHER: ['SON', 'DAUGHTER'],
  MOTHER: ['SON', 'DAUGHTER'],
  SON: ['FATHER', 'MOTHER'],
  DAUGHTER: ['FATHER', 'MOTHER'],
  PARTNER: ['PARTNER'],
  SIBLING: ['SIBLING'],
  GRANDPARENT: ['GRANDCHILD'],
  GRANDCHILD: ['GRANDPARENT'],
  RELATIVE: ['RELATIVE'],
  CAREGIVER: ['CARE_RECIPIENT'],
  CARE_RECIPIENT: ['CAREGIVER'],
  DOCTOR: ['PATIENT'],
  PATIENT: ['DOCTOR'],
  FRIEND: ['FRIEND'],
  OTHER: [],
};

const isRelationCode = (code: string): code is RelationCode => code in RELATION_META;

export function reciprocalSuggestions(code: string): RelationCode[] {
  return isRelationCode(code) ? RECIPROCAL[code] : [];
}

/** "Madre", o el texto libre de "Otra relación". */
export function relationLabel(relation: Relation): string {
  if (relation.code === 'OTHER' && relation.label?.trim()) return relation.label.trim();
  return isRelationCode(relation.code) ? RELATION_META[relation.code].label : 'Contacto';
}

export function relationIcon(relation: Relation): IconName {
  return isRelationCode(relation.code) ? RELATION_META[relation.code].icon : 'account-outline';
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** "Tu madre", "Tu persona a cargo". */
export function relationToMe(relation: Relation): string {
  return `Tu ${lowerFirst(relationLabel(relation))}`;
}

/** Sugerencia de "quién cuida a quién" según lo que yo soy para la otra persona. */
export function suggestedCare(myRelation: RelationCode): CareValue {
  switch (myRelation) {
    case 'FATHER':
    case 'MOTHER':
    case 'CAREGIVER':
    case 'DOCTOR':
      return 'I_CARE';
    case 'CARE_RECIPIENT':
    case 'PATIENT':
      return 'CARES_FOR_ME';
    case 'PARTNER':
      return 'MUTUAL';
    default:
      return 'NONE';
  }
}

/** Invierte el punto de vista (lo que dijo quien invita → lo que ve el invitado). */
export function flipCare(care: CareValue): CareValue {
  if (care === 'I_CARE') return 'CARES_FOR_ME';
  if (care === 'CARES_FOR_ME') return 'I_CARE';
  return care;
}

export const CARE_OPTIONS: { value: CareValue; icon: IconName; title: (name: string) => string; hint: string }[] = [
  { value: 'I_CARE', icon: 'hand-heart', title: (name) => `Yo cuido a ${name}`, hint: 'Estás a cargo de su tratamiento o le ayudas a seguirlo.' },
  { value: 'CARES_FOR_ME', icon: 'account-heart', title: (name) => `${name} me cuida`, hint: 'Esta persona te ayuda con tus medicamentos o citas.' },
  { value: 'MUTUAL', icon: 'account-sync-outline', title: () => 'Nos cuidamos mutuamente', hint: 'Se acompañan el uno al otro.' },
  { value: 'NONE', icon: 'account-multiple-outline', title: () => 'Nadie está a cargo', hint: 'Solo quieren estar conectados.' },
];

/** Frase corta para la tarjeta del miembro. */
export function careSummary(care: CareValue, name: string): string | null {
  switch (care) {
    case 'I_CARE':
      return `Tú cuidas a ${name}`;
    case 'CARES_FOR_ME':
      return `${name} te cuida`;
    case 'MUTUAL':
      return 'Se cuidan mutuamente';
    default:
      return null;
  }
}

export const displayName = (person: { fullName: string | null; email: string }) =>
  person.fullName?.trim() || person.email.split('@')[0];

export const firstName = (person: { fullName: string | null; email: string }) => displayName(person).split(/\s+/)[0];
