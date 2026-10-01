export const MIN_USER_AGE = 13;
export const MAX_USER_AGE = 120;
export const BIRTH_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Edad cumplida para una fecha `YYYY-MM-DD` (calendario, sin zona horaria).
 * Devuelve null si la fecha no existe (p. ej. 2023-02-30) o es futura.
 */
export function calculateAge(birthDate: string, today = new Date()): number | null {
  if (!BIRTH_DATE_PATTERN.test(birthDate)) return null;

  const [year, month, day] = birthDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthday) age -= 1;

  return age < 0 ? null : age;
}

/** Mensaje de error si la fecha no es válida para registrarse, o null. */
export function getBirthDateIssue(birthDate: string): string | null {
  const age = calculateAge(birthDate);
  if (age === null) return 'La fecha de nacimiento no es válida.';
  if (age < MIN_USER_AGE) return `Debes tener al menos ${MIN_USER_AGE} años para crear una cuenta.`;
  if (age > MAX_USER_AGE) return 'Revisa el año de nacimiento.';
  return null;
}
