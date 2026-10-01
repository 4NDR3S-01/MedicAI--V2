import {
  DEFAULT_PHONE_COUNTRY_ISO,
  MAX_REGISTER_AGE,
  MIN_REGISTER_AGE,
  MONTH_NAMES,
  PHONE_COUNTRIES,
} from "../config/register.constants";
import type {
  CountryOption,
  MedicalSelection,
  RegisterWizardPayload,
} from "../models/register.types";

export type CalendarDate = { year: number; month: number; day: number };

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseBirthDate(value: string): CalendarDate | null {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parsed) return null;

  const date = { year: Number(parsed[1]), month: Number(parsed[2]), day: Number(parsed[3]) };
  return date.day <= getDaysInMonth(date.year, date.month) && date.month >= 1 && date.month <= 12
    ? date
    : null;
}

export function formatBirthDate({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "15 de marzo de 2005" */
export function formatBirthDateLong(value: string): string {
  const parsed = parseBirthDate(value);
  if (!parsed) return "";
  return `${parsed.day} de ${MONTH_NAMES[parsed.month - 1]} de ${parsed.year}`;
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function calculateAge(date: CalendarDate, today = new Date()): number {
  let age = today.getFullYear() - date.year;
  const hadBirthday =
    today.getMonth() + 1 > date.month
    || (today.getMonth() + 1 === date.month && today.getDate() >= date.day);
  if (!hadBirthday) age -= 1;
  return age;
}

export function calculateAgeFromBirthDate(value: string): number | null {
  const parsed = parseBirthDate(value);
  return parsed ? calculateAge(parsed) : null;
}

/**
 * Rango de fechas de nacimiento válidas: como mucho hoy menos 13 años
 * (quien cumple 13 hoy ya puede registrarse) y como poco hoy menos 120 años.
 */
export function getBirthDateBounds(today = new Date()): { min: CalendarDate; max: CalendarDate } {
  const clampDay = (year: number) =>
    Math.min(today.getDate(), getDaysInMonth(year, today.getMonth() + 1));
  const maxYear = today.getFullYear() - MIN_REGISTER_AGE;
  const minYear = today.getFullYear() - MAX_REGISTER_AGE;

  return {
    max: { year: maxYear, month: today.getMonth() + 1, day: clampDay(maxYear) },
    min: { year: minYear, month: today.getMonth() + 1, day: clampDay(minYear) },
  };
}

export function clampCalendarDate(
  date: CalendarDate,
  bounds: { min: CalendarDate; max: CalendarDate },
): CalendarDate {
  const withValidDay = {
    ...date,
    day: Math.min(date.day, getDaysInMonth(date.year, date.month)),
  };
  if (compareCalendarDates(withValidDay, bounds.max) > 0) return bounds.max;
  if (compareCalendarDates(withValidDay, bounds.min) < 0) return bounds.min;
  return withValidDay;
}

export function getBirthDateIssue(value: string): string | null {
  const parsed = parseBirthDate(value);
  if (!parsed) return "Selecciona tu fecha de nacimiento.";
  const age = calculateAge(parsed);
  if (age < MIN_REGISTER_AGE) {
    return `Debes tener al menos ${MIN_REGISTER_AGE} años para crear una cuenta.`;
  }
  if (age > MAX_REGISTER_AGE) return "Revisa el año de nacimiento.";
  return null;
}

/** Bandera emoji a partir del código ISO (EC → 🇪🇨). */
export function countryFlag(iso: string): string {
  return String.fromCodePoint(
    ...iso.toUpperCase().split("").map((char) => 0x1f1e6 + char.charCodeAt(0) - 65),
  );
}

export function getPhoneCountry(iso: string): CountryOption {
  return (
    PHONE_COUNTRIES.find((country) => country.iso === iso)
    ?? PHONE_COUNTRIES.find((country) => country.iso === DEFAULT_PHONE_COUNTRY_ISO)!
  );
}

/**
 * Solo dígitos y sin el 0 de marcación nacional (0987654321 → 987654321), que
 * no forma parte del número internacional.
 */
export function normalizeNationalPhone(value: string, country: CountryOption): string {
  return value.replace(/\D/g, "").replace(/^0+/, "").slice(0, country.digits);
}

/** "+593987654321", o undefined si no hay teléfono. */
export function toE164(phone: string, country: CountryOption): string | undefined {
  return phone ? `${country.code}${phone}` : undefined;
}

export const EMPTY_MEDICAL_SELECTION: MedicalSelection = { none: false, items: [] };

/** Texto que se guarda en el backend; undefined si no se respondió. */
export function serializeMedicalSelection(selection: MedicalSelection): string | undefined {
  if (selection.none) return "Ninguna";
  return selection.items.length ? selection.items.join(", ") : undefined;
}

export function normalizeMedicalToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

export function createInitialForm(): RegisterWizardPayload {
  return {
    personalData: {
      fullName: "",
      birthDate: "",
      phone: "",
      phoneCountryIso: DEFAULT_PHONE_COUNTRY_ISO,
      email: "",
      password: "",
      confirmPassword: "",
    },
    medicalInfo: {
      conditions: EMPTY_MEDICAL_SELECTION,
      allergies: EMPTY_MEDICAL_SELECTION,
      specialConditions: {
        pregnancy: false,
        lactation: false,
        recentSurgeries: false,
        immunosuppression: false,
        anticoagulantTreatment: false,
      },
      aiHealthContextConsent: false,
    },
  };
}
