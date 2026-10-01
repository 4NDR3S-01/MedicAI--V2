import {
  FULL_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../config/register.constants";
import type { MedicalSelection, RegisterWizardPayload } from "../models/register.types";
import { getBirthDateIssue, getPhoneCountry } from "./register.utils";

export type PersonalField =
  | "fullName"
  | "birthDate"
  | "phone"
  | "email"
  | "password"
  | "confirmPassword";

export const PERSONAL_FIELDS_ORDER: PersonalField[] = [
  "fullName",
  "birthDate",
  "phone",
  "email",
  "password",
  "confirmPassword",
];

export type PersonalErrors = Partial<Record<PersonalField, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** Mismas reglas que valida el backend (RegisterDto + AuthService). */
export function validatePersonalData(
  personal: RegisterWizardPayload["personalData"],
): PersonalErrors {
  const errors: PersonalErrors = {};

  const name = personal.fullName.trim();
  if (name.length < 2) errors.fullName = "Escribe tu nombre y apellido.";
  else if (name.length > FULL_NAME_MAX_LENGTH) errors.fullName = `Máximo ${FULL_NAME_MAX_LENGTH} caracteres.`;

  const birthDateIssue = getBirthDateIssue(personal.birthDate);
  if (birthDateIssue) errors.birthDate = birthDateIssue;

  if (personal.phone) {
    const country = getPhoneCountry(personal.phoneCountryIso);
    if (personal.phone.length !== country.digits) {
      errors.phone = `En ${country.name} el número tiene ${country.digits} dígitos.`;
    }
  }

  if (!personal.email.trim()) errors.email = "Escribe tu correo electrónico.";
  else if (!isValidEmail(personal.email)) errors.email = "Revisa el formato del correo.";

  if (personal.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Usa al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  } else if (personal.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }

  if (!personal.confirmPassword) errors.confirmPassword = "Repite tu contraseña.";
  else if (personal.confirmPassword !== personal.password) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }

  return errors;
}

export type MedicalErrors = Partial<Record<"conditions" | "allergies", string>>;

const isAnswered = (selection: MedicalSelection) => selection.none || selection.items.length > 0;

/**
 * Cada sección exige una respuesta explícita: opciones o «Ninguna». No se
 * preselecciona «Ninguna» para no registrar por omisión que alguien no tiene
 * alergias cuando en realidad no respondió.
 */
export function validateMedicalInfo(medical: RegisterWizardPayload["medicalInfo"]): MedicalErrors {
  const errors: MedicalErrors = {};
  if (!isAnswered(medical.conditions)) errors.conditions = "Elige al menos una opción o marca «Ninguna».";
  if (!isAnswered(medical.allergies)) errors.allergies = "Elige al menos una opción o marca «Ninguna conocida».";
  return errors;
}

export function firstErrorField(errors: PersonalErrors): PersonalField | null {
  return PERSONAL_FIELDS_ORDER.find((field) => errors[field]) ?? null;
}
