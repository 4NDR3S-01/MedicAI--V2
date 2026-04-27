export type CountryOption = {
  iso: string;
  name: string;
  code: string;
  flag: string;
};

export type MedicationDraft = {
  id: string;
  name: string;
  dose: string;
  schedule: string;
  frequency: string;
};

export type AppointmentDraft = {
  id: string;
  specialty: string;
  date: string;
  time: string;
  place: string;
};

export type RegisterWizardPayload = {
  personalData: {
    fullName: string;
    birthDate: string;
    age: string;
    phone: string;
    phoneCountryCode: string;
    phoneCountryIso: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  medicalInfo: {
    conditions: string;
    allergies: string;
    specialConditions: {
      pregnancy: boolean;
      lactation: boolean;
      recentSurgeries: boolean;
      immunosuppression: boolean;
      anticoagulantTreatment: boolean;
    };
    specialConditionVigency: {
      pregnancy: { isTemporary: boolean; until: string };
      lactation: { isTemporary: boolean; until: string };
      recentSurgeries: { isTemporary: boolean; until: string };
      immunosuppression: { isTemporary: boolean; until: string };
      anticoagulantTreatment: { isTemporary: boolean; until: string };
    };
  };
  medications: MedicationDraft[];
  medicationsDeferred: boolean;
  appointments: AppointmentDraft[];
  appointmentsDeferred: boolean;
};
