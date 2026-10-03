import type { MaterialCommunityIcons } from '@expo/vector-icons';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

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
export type PermissionSet = Record<PermissionKey, boolean>;

/** Tipo de acción: ver, gestionar (cambiar información) o administrar el Círculo. */
export type PermissionKind = 'view' | 'manage' | 'admin';

type PermissionMeta = {
  kind: PermissionKind;
  /** Para el interruptor: "Ver medicamentos". */
  label: string;
  /** Lo que otra persona puede hacer con MI información. */
  theyCan: string;
  /** Lo que YO puedo hacer con la información de otra persona. */
  iCan: string;
};

export const PERMISSION_META: Record<PermissionKey, PermissionMeta> = {
  viewMedications: { kind: 'view', label: 'Ver medicamentos y tomas', theyCan: 'Puede ver tus medicamentos', iCan: 'Puedes ver sus medicamentos' },
  addMedications: { kind: 'manage', label: 'Agregar medicamentos', theyCan: 'Puede agregar medicamentos', iCan: 'Puedes agregarle medicamentos' },
  editMedications: { kind: 'manage', label: 'Editar nombre, dosis y notas', theyCan: 'Puede editar tus medicamentos', iCan: 'Puedes editar sus medicamentos' },
  deleteMedications: { kind: 'manage', label: 'Eliminar medicamentos', theyCan: 'Puede eliminar tus medicamentos', iCan: 'Puedes eliminar sus medicamentos' },
  manageReminders: { kind: 'manage', label: 'Cambiar horarios y recordatorios', theyCan: 'Puede cambiar tus horarios y recordatorios', iCan: 'Puedes cambiar sus horarios y recordatorios' },
  logDoses: { kind: 'manage', label: 'Registrar o confirmar tomas', theyCan: 'Puede registrar tus tomas', iCan: 'Puedes registrar sus tomas' },
  viewAppointments: { kind: 'view', label: 'Ver citas', theyCan: 'Puede ver tus citas', iCan: 'Puedes ver sus citas' },
  manageAppointments: { kind: 'manage', label: 'Crear y cambiar citas', theyCan: 'Puede administrar tus citas', iCan: 'Puedes administrar sus citas' },
  viewHealth: { kind: 'view', label: 'Ver alergias y condiciones', theyCan: 'Puede ver tu información de salud', iCan: 'Puedes ver su información de salud' },
  manageCircle: { kind: 'admin', label: 'Invitar y quitar personas', theyCan: 'Puede administrar tu Círculo', iCan: 'Puedes administrar su Círculo' },
};

export type PermissionGroup = {
  id: 'medications' | 'appointments' | 'health' | 'circle';
  title: string;
  icon: IconName;
  /** El primero es el de "ver": sin él, los demás no tienen sentido. */
  keys: PermissionKey[];
};

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'medications',
    title: 'Medicamentos',
    icon: 'pill',
    keys: ['viewMedications', 'logDoses', 'addMedications', 'editMedications', 'manageReminders', 'deleteMedications'],
  },
  { id: 'appointments', title: 'Citas', icon: 'calendar-heart', keys: ['viewAppointments', 'manageAppointments'] },
  { id: 'health', title: 'Salud', icon: 'heart-pulse', keys: ['viewHealth'] },
  { id: 'circle', title: 'Círculo', icon: 'account-group-outline', keys: ['manageCircle'] },
];

export const NO_PERMISSIONS: PermissionSet = Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false])) as PermissionSet;

const only = (...keys: PermissionKey[]): PermissionSet => ({
  ...NO_PERMISSIONS,
  ...Object.fromEntries(keys.map((key) => [key, true])),
});

export type PresetId = 'none' | 'view' | 'help' | 'manage';

export const PERMISSION_PRESETS: { id: PresetId; label: string; hint: string; value: PermissionSet }[] = [
  { id: 'none', label: 'Sin acceso', hint: 'Solo estarán conectados.', value: NO_PERMISSIONS },
  { id: 'view', label: 'Solo ver', hint: 'Ver medicamentos, citas y salud, sin cambiar nada.', value: only('viewMedications', 'viewAppointments', 'viewHealth') },
  {
    id: 'help',
    label: 'Ver y ayudar',
    hint: 'Además, registrar tomas y administrar citas.',
    value: only('viewMedications', 'logDoses', 'viewAppointments', 'manageAppointments', 'viewHealth'),
  },
  {
    id: 'manage',
    label: 'Gestionar todo',
    hint: 'Ver y cambiar medicamentos, recordatorios y citas.',
    value: only(
      'viewMedications',
      'addMedications',
      'editMedications',
      'deleteMedications',
      'manageReminders',
      'logDoses',
      'viewAppointments',
      'manageAppointments',
      'viewHealth',
    ),
  },
];

/** Gestionar implica ver; dejar de ver quita también la gestión. */
export function setPermission(current: PermissionSet, key: PermissionKey, value: boolean): PermissionSet {
  const next = { ...current, [key]: value };
  const group = PERMISSION_GROUPS.find((item) => item.keys.includes(key));
  if (!group || group.id === 'circle') return next;
  const [viewKey, ...manageKeys] = group.keys;
  if (key === viewKey && !value) manageKeys.forEach((manageKey) => { next[manageKey] = false; });
  if (key !== viewKey && value) next[viewKey] = true;
  return next;
}

export function normalizePermissions(input: Partial<PermissionSet> | null | undefined): PermissionSet {
  let result = { ...NO_PERMISSIONS };
  for (const key of PERMISSION_KEYS) if (input?.[key]) result = setPermission(result, key, true);
  return result;
}

export const samePermissions = (a: PermissionSet, b: PermissionSet) => PERMISSION_KEYS.every((key) => a[key] === b[key]);

export function presetOf(value: PermissionSet): PresetId | null {
  return PERMISSION_PRESETS.find((preset) => samePermissions(preset.value, value))?.id ?? null;
}

export const hasAnyPermission = (value: PermissionSet) => PERMISSION_KEYS.some((key) => value[key]);

/** Resumen de un grupo: "No puede ver", "Solo ver", "Ver y 2 acciones", "Todo". */
export function groupSummary(group: PermissionGroup, value: PermissionSet): string {
  const enabled = group.keys.filter((key) => value[key]);
  if (group.id === 'circle') return value.manageCircle ? 'Puede administrarlo' : 'No';
  if (!enabled.length) return 'Sin acceso';
  if (enabled.length === group.keys.length) return group.keys.length === 1 ? 'Puede ver' : 'Todo';
  if (enabled.length === 1) return 'Solo ver';
  const actions = enabled.length - 1;
  return `Ver y ${actions} ${actions === 1 ? 'acción' : 'acciones'}`;
}

/**
 * Frases cortas de lo permitido, ordenadas de "ver" a "administrar".
 * perspective "theyCan": "Puede ver tus medicamentos"; "iCan": "Puedes ver sus medicamentos".
 */
export function permissionPhrases(value: PermissionSet, perspective: 'theyCan' | 'iCan'): string[] {
  return PERMISSION_GROUPS.flatMap((group) => group.keys)
    .filter((key) => value[key])
    .map((key) => PERMISSION_META[key][perspective]);
}

/**
 * Una línea para la tarjeta: "Ve tus medicamentos y citas".
 * - theyCan: lo que otra persona hace con MI información.
 * - iCan: lo que YO hago con la suya.
 * - thirdParty: administrando el Círculo de otra persona ("Ve sus medicamentos").
 */
export function accessHeadline(value: PermissionSet, perspective: 'theyCan' | 'iCan' | 'thirdParty'): string {
  const words = {
    theyCan: { none: 'No ve tu información', view: 'Ve tus', manage: 'Gestiona tus', admin: 'Administra tu Círculo' },
    iCan: { none: 'No ves su información', view: 'Ves sus', manage: 'Gestionas sus', admin: 'Administras su Círculo' },
    thirdParty: { none: 'No ve su información', view: 'Ve sus', manage: 'Gestiona sus', admin: 'Administra su Círculo' },
  }[perspective];
  const managesSomething = PERMISSION_KEYS.some((key) => value[key] && PERMISSION_META[key].kind === 'manage');
  const sees: string[] = [];
  if (value.viewMedications) sees.push('medicamentos');
  if (value.viewAppointments) sees.push('citas');
  if (value.viewHealth) sees.push('datos de salud');
  if (!sees.length && !value.manageCircle) return words.none;

  const list = sees.length > 1 ? `${sees.slice(0, -1).join(', ')} y ${sees[sees.length - 1]}` : sees[0];
  const parts = sees.length ? [`${managesSomething ? words.manage : words.view} ${list}`] : [];
  if (value.manageCircle) parts.push(words.admin);
  return parts.join(' · ');
}
