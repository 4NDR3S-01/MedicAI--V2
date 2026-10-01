import { appStorage } from "../../../shared/storage";

import type { RegisterWizardPayload } from "../models/register.types";
import { createInitialForm } from "../utils/register.utils";

const DRAFT_KEY = "medicai_register_wizard_draft_v3";
// Versiones anteriores guardaban la contraseña en texto plano.
const LEGACY_DRAFT_KEYS = ["medicai_register_wizard_draft_v2"];

type StoredDraft = {
  personalData: Omit<RegisterWizardPayload["personalData"], "password" | "confirmPassword">;
  medicalInfo: RegisterWizardPayload["medicalInfo"];
};

/** Restaura el borrador (sin contraseñas). null si no hay o está corrupto. */
export async function loadRegisterDraft(): Promise<RegisterWizardPayload | null> {
  await Promise.all(LEGACY_DRAFT_KEYS.map((key) => appStorage.removeItem(key)));

  const raw = await appStorage.getItem(DRAFT_KEY);
  if (!raw) return null;

  try {
    const draft = JSON.parse(raw) as Partial<StoredDraft>;
    const initial = createInitialForm();
    return {
      personalData: { ...initial.personalData, ...draft.personalData, password: "", confirmPassword: "" },
      medicalInfo: {
        ...initial.medicalInfo,
        ...draft.medicalInfo,
        specialConditions: {
          ...initial.medicalInfo.specialConditions,
          ...draft.medicalInfo?.specialConditions,
        },
      },
    };
  } catch {
    await appStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

export async function saveRegisterDraft(form: RegisterWizardPayload): Promise<void> {
  const { password: _password, confirmPassword: _confirm, ...personalData } = form.personalData;
  const draft: StoredDraft = { personalData, medicalInfo: form.medicalInfo };
  await appStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function clearRegisterDraft(): Promise<void> {
  await appStorage.removeItem(DRAFT_KEY);
}
