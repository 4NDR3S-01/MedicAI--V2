/**
 * Relaciones que una persona puede tener con otra dentro del Círculo. El
 * código describe lo que ESA persona es para la otra ("MOTHER" = es su madre).
 * OTHER admite un texto libre (relationLabel).
 */
export const RELATION_CODES = [
  'FATHER',
  'MOTHER',
  'SON',
  'DAUGHTER',
  'PARTNER',
  'SIBLING',
  'GRANDPARENT',
  'GRANDCHILD',
  'RELATIVE',
  'CAREGIVER',
  'CARE_RECIPIENT',
  'DOCTOR',
  'PATIENT',
  'FRIEND',
  'OTHER',
] as const;
export type RelationCode = (typeof RELATION_CODES)[number];

export const RELATION_LABEL_MAX = 40;

/** Texto legible para correos y mensajes del servidor. */
export const RELATION_LABELS: Record<RelationCode, string> = {
  FATHER: 'padre',
  MOTHER: 'madre',
  SON: 'hijo',
  DAUGHTER: 'hija',
  PARTNER: 'pareja',
  SIBLING: 'hermano/a',
  GRANDPARENT: 'abuelo/a',
  GRANDCHILD: 'nieto/a',
  RELATIVE: 'familiar',
  CAREGIVER: 'cuidador/a',
  CARE_RECIPIENT: 'persona a cargo',
  DOCTOR: 'médico/a',
  PATIENT: 'paciente',
  FRIEND: 'amigo/a',
  OTHER: 'contacto',
};

/**
 * Quién cuida a quién, desde el punto de vista de quien lo dice:
 * I_CARE (yo cuido a la otra persona), CARES_FOR_ME (me cuida), MUTUAL, NONE.
 */
export const CARE_VALUES = ['I_CARE', 'CARES_FOR_ME', 'MUTUAL', 'NONE'] as const;
export type CareValue = (typeof CARE_VALUES)[number];

export function careFromFlags(iCare: boolean, caresForMe: boolean): CareValue {
  if (iCare && caresForMe) return 'MUTUAL';
  if (iCare) return 'I_CARE';
  if (caresForMe) return 'CARES_FOR_ME';
  return 'NONE';
}

export function flagsFromCare(care: CareValue): { iCare: boolean; caresForMe: boolean } {
  return {
    iCare: care === 'I_CARE' || care === 'MUTUAL',
    caresForMe: care === 'CARES_FOR_ME' || care === 'MUTUAL',
  };
}

/**
 * Permisos que el dueño de la información concede a otra persona. Se agrupan
 * en: ver (view*), gestionar (add/edit/delete/reminders/logDoses/manage*) y
 * administrar el Círculo (manageCircle).
 */
export const PERMISSION_KEYS = [
  'viewMedications',
  'addMedications',
  'editMedications',
  'deleteMedications',
  'manageReminders',
  'logDoses',
  'viewAppointments',
  'manageAppointments',
  'viewHealth',
  'manageCircle',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type CirclePermissions = Record<PermissionKey, boolean>;

export const NO_PERMISSIONS: CirclePermissions = Object.fromEntries(
  PERMISSION_KEYS.map((key) => [key, false]),
) as CirclePermissions;

const MEDICATION_WRITE: PermissionKey[] = [
  'addMedications',
  'editMedications',
  'deleteMedications',
  'manageReminders',
  'logDoses',
];

/**
 * Completa y hace coherente un conjunto de permisos: gestionar implica poder
 * ver (no se puede editar un medicamento que no se ve).
 */
export function normalizePermissions(input: Partial<Record<string, unknown>> | null | undefined): CirclePermissions {
  const result = { ...NO_PERMISSIONS };
  for (const key of PERMISSION_KEYS) result[key] = input?.[key] === true;
  if (MEDICATION_WRITE.some((key) => result[key])) result.viewMedications = true;
  if (result.manageAppointments) result.viewAppointments = true;
  return result;
}

export function pickPermissions(row: Partial<Record<PermissionKey, unknown>> | null | undefined): CirclePermissions {
  return normalizePermissions(row ?? null);
}

/** Mensajes de error comprensibles cuando falta un permiso. */
export const PERMISSION_DENIED_MESSAGES: Record<PermissionKey, string> = {
  viewMedications: 'No tienes permiso para ver los medicamentos de esta persona.',
  addMedications: 'No tienes permiso para agregar medicamentos a esta persona.',
  editMedications: 'No tienes permiso para editar los medicamentos de esta persona.',
  deleteMedications: 'No tienes permiso para eliminar medicamentos de esta persona.',
  manageReminders: 'No tienes permiso para cambiar los horarios ni los recordatorios de esta persona.',
  logDoses: 'No tienes permiso para registrar las tomas de esta persona.',
  viewAppointments: 'No tienes permiso para ver las citas de esta persona.',
  manageAppointments: 'No tienes permiso para gestionar las citas de esta persona.',
  viewHealth: 'No tienes permiso para ver la información de salud de esta persona.',
  manageCircle: 'No tienes permiso para administrar el Círculo de esta persona.',
};

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_PENDING_INVITATIONS = 20;
/** Sin 0/O/1/I/L para que el código se pueda dictar sin confusiones. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
