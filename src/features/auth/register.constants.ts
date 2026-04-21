import type { CountryOption } from './register.types';

export const REGISTER_STEPS = [2, 3, 4, 5, 6] as const;

export const STEP_TITLE: Record<number, string> = {
  2: 'Datos personales',
  3: 'Informacion medica',
  4: 'Medicamentos',
  5: 'Citas medicas',
  6: 'Resumen final',
};

export const PHONE_COUNTRIES: CountryOption[] = [
  { iso: 'EC', name: 'Ecuador', code: '+593', flag: 'EC' },
  { iso: 'CO', name: 'Colombia', code: '+57', flag: 'CO' },
  { iso: 'PE', name: 'Peru', code: '+51', flag: 'PE' },
  { iso: 'MX', name: 'Mexico', code: '+52', flag: 'MX' },
  { iso: 'AR', name: 'Argentina', code: '+54', flag: 'AR' },
  { iso: 'CL', name: 'Chile', code: '+56', flag: 'CL' },
  { iso: 'US', name: 'Estados Unidos', code: '+1', flag: 'US' },
  { iso: 'ES', name: 'Espana', code: '+34', flag: 'ES' },
];

export const MONTH_OPTIONS = [
  { value: 1, label: 'Ene' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Abr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Ago' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dic' },
] as const;

export const HEREDITARY_CONDITIONS = [
  'Ninguno',
  'Diabetes',
  'Hipertension arterial',
  'Asma',
  'Hipotiroidismo',
  'Enfermedad cardiaca',
  'Cancer familiar',
  'Enfermedad renal cronica',
  'Alzheimer o demencia',
  'Otros',
] as const;

export const COMMON_ALLERGIES = [
  'Ninguno',
  'Penicilina',
  'AINEs (ibuprofeno, aspirina)',
  'Mariscos',
  'Frutos secos',
  'Lactosa',
  'Polen',
  'Acarios (polvo)',
  'Picaduras de insectos',
  'Otros',
] as const;
