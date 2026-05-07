import type { RegisterWizardPayload } from "../models/register.types";

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseBirthDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parsed) {
    return null;
  }

  return {
    year: Number(parsed[1]),
    month: Number(parsed[2]),
    day: Number(parsed[3]),
  };
}

export function formatBirthDate(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calculateAgeFromBirthDate(value: string): number | null {
  const parsed = parseBirthDate(value);
  if (!parsed) {
    return null;
  }

  const { year, month, day } = parsed;
  const date = new Date(year, month - 1, day);
  const validDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  if (!validDate) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const alreadyBirthday =
    today.getMonth() > month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() >= day);

  if (!alreadyBirthday) {
    age -= 1;
  }

  if (age < 0 || age > 120) {
    return null;
  }

  return age;
}

export function createInitialForm(): RegisterWizardPayload {
  return {
    personalData: {
      fullName: "",
      birthDate: "",
      age: "",
      phone: "",
      phoneCountryCode: "+593",
      phoneCountryIso: "EC",
      email: "",
      password: "",
      confirmPassword: "",
    },
    medicalInfo: {
      conditions: "",
      allergies: "",
      specialConditions: {
        pregnancy: false,
        lactation: false,
        recentSurgeries: false,
        immunosuppression: false,
        anticoagulantTreatment: false,
      },
      specialConditionVigency: {
        pregnancy: { isTemporary: false, until: "" },
        lactation: { isTemporary: false, until: "" },
        recentSurgeries: { isTemporary: false, until: "" },
        immunosuppression: { isTemporary: false, until: "" },
        anticoagulantTreatment: { isTemporary: false, until: "" },
      },
    },
  };
}
