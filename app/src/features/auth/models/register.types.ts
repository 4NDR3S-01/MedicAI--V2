export type CountryOption = {
  iso: string;
  name: string;
  /** Prefijo internacional, p. ej. "+593". */
  code: string;
  /** Longitud del número nacional sin prefijo ni 0 inicial. */
  digits: number;
  example: string;
};

export type SpecialConditionKey =
  | "pregnancy"
  | "lactation"
  | "recentSurgeries"
  | "immunosuppression"
  | "anticoagulantTreatment";

export type SpecialConditions = Record<SpecialConditionKey, boolean>;

/**
 * Respuesta a una pregunta médica de selección múltiple.
 * - `none: true`  → el usuario declara explícitamente "ninguna".
 * - items vacíos y `none: false` → sin responder (se puede completar luego).
 */
export type MedicalSelection = {
  none: boolean;
  items: string[];
};

export type RegisterWizardPayload = {
  personalData: {
    fullName: string;
    birthDate: string;
    phone: string;
    phoneCountryIso: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  medicalInfo: {
    conditions: MedicalSelection;
    allergies: MedicalSelection;
    specialConditions: SpecialConditions;
    aiHealthContextConsent: boolean;
  };
};
