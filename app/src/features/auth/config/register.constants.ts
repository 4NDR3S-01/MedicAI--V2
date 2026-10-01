import type { CountryOption, SpecialConditionKey } from "../models/register.types";

export const REGISTER_STEPS = [
  { key: "personal", title: "Datos personales", short: "Datos" },
  { key: "medical", title: "Salud y alergias", short: "Salud" },
  { key: "special", title: "Situaciones especiales", short: "Especial" },
  { key: "summary", title: "Revisa y confirma", short: "Resumen" },
] as const;

export type RegisterStepKey = (typeof REGISTER_STEPS)[number]["key"];

export const MIN_REGISTER_AGE = 13;
export const MAX_REGISTER_AGE = 120;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
export const FULL_NAME_MAX_LENGTH = 100;
export const MEDICAL_CUSTOM_ITEM_MAX_LENGTH = 60;
export const MEDICAL_CUSTOM_ITEMS_MAX = 5;

export const PHONE_COUNTRIES: CountryOption[] = [
  { iso: "EC", name: "Ecuador", code: "+593", digits: 9, example: "987654321" },
  { iso: "CO", name: "Colombia", code: "+57", digits: 10, example: "3001234567" },
  { iso: "PE", name: "Perú", code: "+51", digits: 9, example: "912345678" },
  { iso: "MX", name: "México", code: "+52", digits: 10, example: "5512345678" },
  { iso: "AR", name: "Argentina", code: "+54", digits: 10, example: "1123456789" },
  { iso: "CL", name: "Chile", code: "+56", digits: 9, example: "912345678" },
  { iso: "US", name: "Estados Unidos", code: "+1", digits: 10, example: "2015550123" },
  { iso: "ES", name: "España", code: "+34", digits: 9, example: "612345678" },
];

export const DEFAULT_PHONE_COUNTRY_ISO = "EC";

export const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** Condiciones diagnosticadas de la propia persona (no antecedentes familiares). */
export const HEALTH_CONDITIONS = [
  "Diabetes",
  "Hipertensión arterial",
  "Asma",
  "EPOC",
  "Enfermedad cardíaca",
  "Enfermedad renal crónica",
  "Enfermedad hepática",
  "Enfermedad tiroidea",
  "Epilepsia",
  "Gastritis o úlcera",
] as const;

/** Agrupadas para que la lista sea fácil de recorrer. Medicamentos primero. */
export const ALLERGY_GROUPS = [
  {
    title: "Medicamentos",
    items: ["Penicilina", "Sulfas", "AINEs (ibuprofeno, aspirina)", "Anestésicos"],
  },
  {
    title: "Alimentos",
    items: ["Mariscos", "Frutos secos", "Huevo", "Leche"],
  },
  {
    title: "Otras",
    items: ["Látex", "Polen", "Ácaros", "Picaduras de insectos"],
  },
] as const;

export const SPECIAL_CONDITIONS: ReadonlyArray<{
  key: SpecialConditionKey;
  label: string;
  description: string;
  icon: "heart-outline" | "water-outline" | "bandage-outline" | "shield-half-outline" | "pulse-outline";
}> = [
  {
    key: "pregnancy",
    label: "Embarazo",
    description: "Algunos medicamentos no son seguros durante el embarazo.",
    icon: "heart-outline",
  },
  {
    key: "lactation",
    label: "Lactancia",
    description: "Ciertos fármacos pasan a la leche materna.",
    icon: "water-outline",
  },
  {
    key: "recentSurgeries",
    label: "Cirugía reciente",
    description: "En los últimos 3 meses.",
    icon: "bandage-outline",
  },
  {
    key: "immunosuppression",
    label: "Defensas bajas",
    description: "Inmunosupresión por enfermedad o tratamiento.",
    icon: "shield-half-outline",
  },
  {
    key: "anticoagulantTreatment",
    label: "Anticoagulantes",
    description: "Por ejemplo warfarina, rivaroxabán o apixabán.",
    icon: "pulse-outline",
  },
];
