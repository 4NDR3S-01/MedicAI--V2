import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appStorage } from '../../../shared/storage';
import { BackgroundDecor, BrandLogo } from '../../../shared/ui';
import type { AppTheme } from '../../../shared/theme';
import { checkEmailAvailability } from '../services';
import {
  COMMON_ALLERGIES,
  HEREDITARY_CONDITIONS,
  MONTH_OPTIONS,
  PHONE_COUNTRIES,
  REGISTER_STEPS,
  STEP_TITLE,
} from '../config/register.constants';
import type { AppointmentDraft, MedicationDraft, RegisterWizardPayload } from '../models/register.types';
import {
  calculateAgeFromBirthDate,
  createAppointmentDraft,
  createInitialForm,
  createMedicationDraft,
  formatBirthDate,
  getDaysInMonth,
  parseBirthDate,
} from '../utils/register.utils';

export type { RegisterWizardPayload } from '../models/register.types';

type PersonalFieldKey =
  | 'fullName'
  | 'birthDate'
  | 'phone'
  | 'email'
  | 'password'
  | 'confirmPassword';

type FocusablePersonalFieldKey = Exclude<PersonalFieldKey, 'birthDate'>;

type RegisterScreenProps = {
  theme: AppTheme;
  isSubmitting?: boolean;
  onSubmit: (payload: RegisterWizardPayload) => void | Promise<void>;
  onNavigateToLogin: () => void;
  initialSpecialConditions?: RegisterWizardPayload['medicalInfo']['specialConditions'];
  initialSpecialConditionVigency?: RegisterWizardPayload['medicalInfo']['specialConditionVigency'];
};

type SpecialConditionKey = keyof RegisterWizardPayload['medicalInfo']['specialConditions'];

const SPECIAL_CONDITION_LABELS: Record<SpecialConditionKey, string> = {
  pregnancy: 'Embarazo',
  lactation: 'Lactancia',
  recentSurgeries: 'Cirugias recientes',
  immunosuppression: 'Inmunosupresion',
  anticoagulantTreatment: 'Tratamiento anticoagulante',
};

const REGISTER_WIZARD_DRAFT_STORAGE_KEY = 'medicai_register_wizard_draft_v1';

type RegisterWizardDraft = {
  form: RegisterWizardPayload;
  stepIndex: number;
  selectedConditions: string[];
  selectedAllergies: string[];
  otherConditionItems: string[];
  otherAllergyItems: string[];
};

type RegisterDraftHydrationSetters = {
  setForm: React.Dispatch<React.SetStateAction<RegisterWizardPayload>>;
  setStepIndex: React.Dispatch<React.SetStateAction<number>>;
  setSelectedConditions: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedAllergies: React.Dispatch<React.SetStateAction<string[]>>;
  setOtherConditionItems: React.Dispatch<React.SetStateAction<string[]>>;
  setOtherAllergyItems: React.Dispatch<React.SetStateAction<string[]>>;
  setIsWizardHydrated: React.Dispatch<React.SetStateAction<boolean>>;
};

const createRegisterInitialForm = (
  initialSpecialConditions?: RegisterWizardPayload['medicalInfo']['specialConditions'],
  initialSpecialConditionVigency?: RegisterWizardPayload['medicalInfo']['specialConditionVigency'],
) => {
  const initialForm = createInitialForm();

  if (initialSpecialConditions) {
    initialForm.medicalInfo.specialConditions = {
      ...initialForm.medicalInfo.specialConditions,
      ...initialSpecialConditions,
    };
  }

  if (initialSpecialConditionVigency) {
    initialForm.medicalInfo.specialConditionVigency = {
      ...initialForm.medicalInfo.specialConditionVigency,
      ...initialSpecialConditionVigency,
    };
  }

  return initialForm;
};

const applyRegisterDraft = (
  parsedDraft: Partial<RegisterWizardDraft>,
  setters: Omit<RegisterDraftHydrationSetters, 'setIsWizardHydrated'>,
) => {
  if (parsedDraft.form) {
    setters.setForm(parsedDraft.form);
  }

  if (typeof parsedDraft.stepIndex === 'number') {
    const safeStepIndex = Math.max(0, Math.min(REGISTER_STEPS.length - 1, parsedDraft.stepIndex));
    setters.setStepIndex(safeStepIndex);
  }

  if (Array.isArray(parsedDraft.selectedConditions)) {
    setters.setSelectedConditions(parsedDraft.selectedConditions);
  }

  if (Array.isArray(parsedDraft.selectedAllergies)) {
    setters.setSelectedAllergies(parsedDraft.selectedAllergies);
  }

  if (Array.isArray(parsedDraft.otherConditionItems)) {
    setters.setOtherConditionItems(parsedDraft.otherConditionItems);
  }

  if (Array.isArray(parsedDraft.otherAllergyItems)) {
    setters.setOtherAllergyItems(parsedDraft.otherAllergyItems);
  }
};

const useRegisterWizardHydration = ({
  setForm,
  setStepIndex,
  setSelectedConditions,
  setSelectedAllergies,
  setOtherConditionItems,
  setOtherAllergyItems,
  setIsWizardHydrated,
}: RegisterDraftHydrationSetters) => {
  useEffect(() => {
    let isMounted = true;

    const hydrateWizardDraft = async () => {
      try {
        const rawDraft = await appStorage.getItem(REGISTER_WIZARD_DRAFT_STORAGE_KEY);
        if (!rawDraft || !isMounted) {
          return;
        }

        const parsedDraft = JSON.parse(rawDraft) as Partial<RegisterWizardDraft>;
        applyRegisterDraft(parsedDraft, {
          setForm,
          setStepIndex,
          setSelectedConditions,
          setSelectedAllergies,
          setOtherConditionItems,
          setOtherAllergyItems,
        });
      } catch {
        // Si falla la hidratacion, mantenemos el estado inicial.
      } finally {
        if (isMounted) {
          setIsWizardHydrated(true);
        }
      }
    };

    void hydrateWizardDraft();

    return () => {
      isMounted = false;
    };
  }, [
    setForm,
    setStepIndex,
    setSelectedConditions,
    setSelectedAllergies,
    setOtherConditionItems,
    setOtherAllergyItems,
    setIsWizardHydrated,
  ]);
};

const useRegisterWizardPersistence = (
  isWizardHydrated: boolean,
  draft: RegisterWizardDraft,
) => {
  useEffect(() => {
    if (!isWizardHydrated) {
      return;
    }

    const persistWizardDraft = async () => {
      try {
        await appStorage.setItem(REGISTER_WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // Si falla la persistencia local, no bloqueamos la experiencia.
      }
    };

    void persistWizardDraft();
  }, [draft, isWizardHydrated]);
};

const isValidAppointmentDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

const isValidAppointmentTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());

const validatePersonalStep = (
  personalData: RegisterWizardPayload['personalData'],
  calculatedAge: number | null,
): string | null => {
  const validationIssue = getPersonalValidationIssue(personalData, calculatedAge);
  return validationIssue?.message ?? null;
};

const getPersonalValidationIssue = (
  personalData: RegisterWizardPayload['personalData'],
  calculatedAge: number | null,
): { field: PersonalFieldKey; message: string } | null => {
  const password = personalData.password ?? '';
  const confirmPassword = personalData.confirmPassword ?? '';

  if (!personalData.fullName.trim()) {
    return {
      field: 'fullName',
      message: 'El nombre completo es obligatorio.',
    };
  }
  if (!personalData.birthDate.trim() || calculatedAge === null) {
    return {
      field: 'birthDate',
      message: 'Selecciona una fecha de nacimiento valida.',
    };
  }
  if (personalData.phone && !/^\d{9}$/.test(personalData.phone)) {
    return {
      field: 'phone',
      message: 'El numero telefonico debe tener exactamente 9 digitos.',
    };
  }
  if (!personalData.email.trim()) {
    return {
      field: 'email',
      message: 'El correo es obligatorio.',
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalData.email.trim())) {
    return {
      field: 'email',
      message: 'Ingresa un correo valido.',
    };
  }
  if (!password.trim()) {
    return {
      field: 'password',
      message: 'La contrasena es obligatoria.',
    };
  }
  if (password.trim().length < 6) {
    return {
      field: 'password',
      message: 'La contrasena debe tener al menos 6 caracteres.',
    };
  }
  if (!confirmPassword.trim()) {
    return {
      field: 'confirmPassword',
      message: 'Confirma tu contrasena.',
    };
  }
  if (password !== confirmPassword) {
    return {
      field: 'confirmPassword',
      message: 'Las contrasenas no coinciden.',
    };
  }
  return null;
};

const validateMedicalInfoStep = (
  medicalInfo: RegisterWizardPayload['medicalInfo'],
): string | null => {
  const hasSpecialCondition = Object.values(medicalInfo.specialConditions).some(Boolean);
  if (!medicalInfo.conditions.trim() && !medicalInfo.allergies.trim() && !hasSpecialCondition) {
    return 'Debes seleccionar "Ninguno" o agregar al menos un antecedente hereditario, alergia o condicion especial.';
  }
  return null;
};

const validateMedicationsStep = (
  medicationsDeferred: boolean,
  medications: RegisterWizardPayload['medications'],
): string | null => {
  if (medicationsDeferred) {
    return null;
  }

  const hasIncomplete = medications.some((medication) =>
    [medication.name, medication.dose, medication.schedule, medication.frequency].some((value) => !value.trim()),
  );
  return hasIncomplete ? 'Completa todos los campos de cada medicamento.' : null;
};

const validateAppointmentsStep = (
  appointmentsDeferred: boolean,
  appointments: RegisterWizardPayload['appointments'],
): string | null => {
  if (appointmentsDeferred) {
    return null;
  }

  const hasIncompleteAppointment = appointments.some((appointment) =>
    [appointment.specialty, appointment.date, appointment.time, appointment.place].some((value) => !value.trim()),
  );
  if (hasIncompleteAppointment) {
    return 'Completa todos los campos de cada cita.';
  }

  const hasInvalidDate = appointments.some((appointment) => !isValidAppointmentDate(appointment.date));
  if (hasInvalidDate) {
    return 'La fecha de cita debe tener formato YYYY-MM-DD y ser valida.';
  }

  const hasInvalidTime = appointments.some((appointment) => !isValidAppointmentTime(appointment.time));
  if (hasInvalidTime) {
    return 'La hora de cita debe tener formato HH:MM en 24 horas.';
  }

  return null;
};

const validateCurrentStep = (
  step: number,
  form: RegisterWizardPayload,
  calculatedAge: number | null,
) => {
  const stepValidators: Record<number, () => string | null> = {
    2: () => validatePersonalStep(form.personalData, calculatedAge),
    3: () => validateMedicalInfoStep(form.medicalInfo),
    4: () => validateMedicationsStep(form.medicationsDeferred, form.medications),
    5: () => validateAppointmentsStep(form.appointmentsDeferred, form.appointments),
  };

  return stepValidators[step]?.() ?? null;
};

export function RegisterScreen({ // NOSONAR
  theme,
  isSubmitting = false,
  onSubmit,
  onNavigateToLogin,
  initialSpecialConditions,
  initialSpecialConditionVigency,
}: Readonly<RegisterScreenProps>) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => Array.from({ length: 121 }, (_, index) => currentYear - index), [currentYear]);

  const [form, setForm] = useState<RegisterWizardPayload>(() =>
    createRegisterInitialForm(initialSpecialConditions, initialSpecialConditionVigency),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [isBirthDateModalVisible, setIsBirthDateModalVisible] = useState(false);
  const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
  const [isVigencyModalVisible, setIsVigencyModalVisible] = useState(false);
  const [draftBirthYear, setDraftBirthYear] = useState(currentYear - 18);
  const [draftBirthMonth, setDraftBirthMonth] = useState(1);
  const [draftBirthDay, setDraftBirthDay] = useState(1);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [otherConditionDraft, setOtherConditionDraft] = useState('');
  const [otherAllergyDraft, setOtherAllergyDraft] = useState('');
  const [otherConditionItems, setOtherConditionItems] = useState<string[]>([]);
  const [otherAllergyItems, setOtherAllergyItems] = useState<string[]>([]);
  const [otherConditionError, setOtherConditionError] = useState<string | null>(null);
  const [otherAllergyError, setOtherAllergyError] = useState<string | null>(null);
  const [isWizardHydrated, setIsWizardHydrated] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [emailAvailabilityMessage, setEmailAvailabilityMessage] = useState<string | null>(null);
  const [isCheckingEmailAvailability, setIsCheckingEmailAvailability] = useState(false);
  const stepScrollRef = useRef<ScrollView | null>(null);
  const lastEmailAvailabilityRef = useRef<{ email: string; available: boolean } | null>(null);
  const fieldOffsetsRef = useRef<Record<PersonalFieldKey, number>>({
    fullName: 0,
    birthDate: 0,
    phone: 0,
    email: 0,
    password: 0,
    confirmPassword: 0,
  });
  const personalFieldRefs = useRef<Record<FocusablePersonalFieldKey, TextInput | null>>({
    fullName: null,
    phone: null,
    email: null,
    password: null,
    confirmPassword: null,
  });
  const pendingBirthDateFollowUpRef = useRef<FocusablePersonalFieldKey | null>(null);
  const NONE_OPTION = 'Ninguno';
  const OTHER_OPTION = 'Otros';

  const currentStep = REGISTER_STEPS[stepIndex];
  const isLastStep = stepIndex === REGISTER_STEPS.length - 1;

  let primaryActionLabel = 'Siguiente';
  if (currentStep === 2 && isCheckingEmailAvailability) {
    primaryActionLabel = 'Validando correo…';
  }
  if (isLastStep) {
    primaryActionLabel = isSubmitting ? 'Guardando…' : 'Guardar perfil';
  }

  const isCompact = width < 390;
  const isShortScreen = height < 760;
  const isVeryShortScreen = height < 700;
  const modalSolidBackground = theme.mode === 'dark' ? '#1A202C' : '#FFFFFF';
  let iosBottomExtra = 0;
  if (Platform.OS === 'ios') {
    iosBottomExtra = isShortScreen ? 12 : 18;
  }
  const iosFooterPadding = Platform.OS === 'ios' ? 8 : 0;

  let horizontalPadding = 28;
  if (width < 390) {
    horizontalPadding = 14;
  } else if (width < 768) {
    horizontalPadding = 22;
  }
  let logoSize = 108;
  if (isShortScreen) {
    logoSize = 84;
  } else if (width < 390) {
    logoSize = 88;
  }
  const topPadding = isShortScreen ? 10 : 24;
  const iosScreenBottomPadding = Math.max(14, insets.bottom + (isShortScreen ? 8 : 14) + iosBottomExtra);
  const androidScreenBottomPadding = Math.max(8, insets.bottom + (isShortScreen ? 2 : 6));
  const bottomPadding = Platform.OS === 'ios' ? iosScreenBottomPadding : androidScreenBottomPadding;
  const cardPadding = isShortScreen ? 14 : 18;
  const keyboardOffset = Platform.OS === 'ios' ? 0 : 20;
  const cardBottomGap = Platform.OS === 'ios' ? Math.max(12, insets.bottom) : 0;

  const selectedCountry =
    PHONE_COUNTRIES.find((country) => country.iso === form.personalData.phoneCountryIso) ?? PHONE_COUNTRIES[0];

  const calculatedAge = calculateAgeFromBirthDate(form.personalData.birthDate);
  const dayOptions = Array.from({ length: getDaysInMonth(draftBirthYear, draftBirthMonth) }, (_, index) => index + 1);
  const specialConditionKeys = Object.keys(SPECIAL_CONDITION_LABELS) as SpecialConditionKey[];
  const activeSpecialConditionKeys = specialConditionKeys.filter(
    (key) => form.medicalInfo.specialConditions[key],
  );
  const temporarySpecialConditionsCount = activeSpecialConditionKeys.filter(
    (key) => form.medicalInfo.specialConditionVigency[key].isTemporary,
  ).length;

  useRegisterWizardHydration({
    setForm,
    setStepIndex,
    setSelectedConditions,
    setSelectedAllergies,
    setOtherConditionItems,
    setOtherAllergyItems,
    setIsWizardHydrated,
  });

  useRegisterWizardPersistence(isWizardHydrated, {
    form,
    stepIndex,
    selectedConditions,
    selectedAllergies,
    otherConditionItems,
    otherAllergyItems,
  });

  useEffect(() => {
    stepScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [stepIndex]);

  const registerFieldOffset = (field: PersonalFieldKey) => (
    event: LayoutChangeEvent,
  ) => {
    fieldOffsetsRef.current[field] = event.nativeEvent.layout.y;
  };

  const registerPersonalFieldRef = (field: FocusablePersonalFieldKey) => (
    ref: TextInput | null,
  ) => {
    personalFieldRefs.current[field] = ref;
  };

  const scrollToFocusedField = (field: PersonalFieldKey) => {
    setTimeout(() => {
      const targetY = Math.max(0, fieldOffsetsRef.current[field] - 24);
      stepScrollRef.current?.scrollTo({ y: targetY, animated: true });
    }, 120);
  };

  const focusPersonalField = (
    field: PersonalFieldKey,
    options?: { birthDateFollowUp?: FocusablePersonalFieldKey | null },
  ) => {
    scrollToFocusedField(field);

    if (field === 'birthDate') {
      pendingBirthDateFollowUpRef.current = options?.birthDateFollowUp ?? null;
      Keyboard.dismiss();
      setTimeout(() => {
        openBirthDateModal();
      }, 180);
      return;
    }

    setTimeout(() => {
      personalFieldRefs.current[field]?.focus();
    }, 220);
  };

  const handlePersonalInputSubmit = (field: FocusablePersonalFieldKey) => {
    const nextFieldMap: Record<FocusablePersonalFieldKey, PersonalFieldKey | 'submit'> = {
      fullName: 'birthDate',
      phone: 'email',
      email: 'password',
      password: 'confirmPassword',
      confirmPassword: 'submit',
    };

    const nextField = nextFieldMap[field];

    if (nextField === 'submit') {
      void onNext();
      return;
    }

    if (nextField === 'birthDate') {
      focusPersonalField('birthDate', { birthDateFollowUp: 'phone' });
      return;
    }

    focusPersonalField(nextField);
  };

  const updateMedicationField = (id: string, field: keyof Omit<MedicationDraft, 'id'>, value: string) => {
    setForm((previous) => ({
      ...previous,
      medications: previous.medications.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const updateAppointmentField = (id: string, field: keyof Omit<AppointmentDraft, 'id'>, value: string) => {
    setForm((previous) => ({
      ...previous,
      appointments: previous.appointments.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const removeAppointment = (id: string) => {
    setForm((previous) => {
      const remaining = previous.appointments.filter((item) => item.id !== id);
      return {
        ...previous,
        appointments: remaining.length > 0 ? remaining : [createAppointmentDraft()],
      };
    });
  };

  const removeMedication = (id: string) => {
    setForm((previous) => {
      const remaining = previous.medications.filter((item) => item.id !== id);
      return {
        ...previous,
        medications: remaining.length > 0 ? remaining : [createMedicationDraft()],
      };
    });
  };

  const updateSpecialCondition = (key: SpecialConditionKey, value: boolean) => {
    setForm((previous) => ({
      ...previous,
      medicalInfo: {
        ...previous.medicalInfo,
        specialConditions: {
          ...previous.medicalInfo.specialConditions,
          [key]: value,
        },
        specialConditionVigency: {
          ...previous.medicalInfo.specialConditionVigency,
          [key]: value
            ? previous.medicalInfo.specialConditionVigency[key]
            : { isTemporary: false, until: '' },
        },
      },
    }));
  };

  const updateSpecialConditionTemporary = (key: SpecialConditionKey, value: boolean) => {
    setForm((previous) => ({
      ...previous,
      medicalInfo: {
        ...previous.medicalInfo,
        specialConditionVigency: {
          ...previous.medicalInfo.specialConditionVigency,
          [key]: {
            ...previous.medicalInfo.specialConditionVigency[key],
            isTemporary: value,
            until: value ? previous.medicalInfo.specialConditionVigency[key].until : '',
          },
        },
      },
    }));
  };

  const updateSpecialConditionUntil = (key: SpecialConditionKey, value: string) => {
    setForm((previous) => ({
      ...previous,
      medicalInfo: {
        ...previous.medicalInfo,
        specialConditionVigency: {
          ...previous.medicalInfo.specialConditionVigency,
          [key]: {
            ...previous.medicalInfo.specialConditionVigency[key],
            until: value.trim(),
          },
        },
      },
    }));
  };

  const openBirthDateModal = () => {
    const parsed = parseBirthDate(form.personalData.birthDate);
    if (parsed) {
      setDraftBirthYear(parsed.year);
      setDraftBirthMonth(parsed.month);
      setDraftBirthDay(parsed.day);
    } else {
      setDraftBirthYear(currentYear - 18);
      setDraftBirthMonth(1);
      setDraftBirthDay(1);
    }
    setIsBirthDateModalVisible(true);
  };

  const applyBirthDateSelection = () => {
    const birthDate = formatBirthDate(draftBirthYear, draftBirthMonth, draftBirthDay);
    const age = calculateAgeFromBirthDate(birthDate);

    setForm((previous) => ({
      ...previous,
      personalData: {
        ...previous.personalData,
        birthDate,
        age: age === null ? '' : String(age),
      },
    }));

    setIsBirthDateModalVisible(false);

    const nextField = pendingBirthDateFollowUpRef.current;
    pendingBirthDateFollowUpRef.current = null;

    if (nextField) {
      setTimeout(() => {
        focusPersonalField(nextField);
      }, 220);
    }
  };

  const buildMedicalListText = (selectedItems: string[], otherItems: string[]) => {
    if (selectedItems.includes(NONE_OPTION)) {
      return NONE_OPTION;
    }

    const normalizedSelected = selectedItems.filter((item) => item !== OTHER_OPTION);
    const normalizedOther = otherItems
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `Otros: ${item}`);
    const combined = [...normalizedSelected, ...normalizedOther];

    return combined.join(', ');
  };

  const normalizeMedicalToken = (value: string) => value.trim().toLowerCase().replaceAll(/\s+/g, ' ');

  const syncConditionsText = (nextSelectedConditions: string[], nextOtherConditionItems: string[]) => {
    setForm((previousForm) => ({
      ...previousForm,
      medicalInfo: {
        ...previousForm.medicalInfo,
        conditions: buildMedicalListText(nextSelectedConditions, nextOtherConditionItems),
      },
    }));
  };

  const syncAllergiesText = (nextSelectedAllergies: string[], nextOtherAllergyItems: string[]) => {
    setForm((previousForm) => ({
      ...previousForm,
      medicalInfo: {
        ...previousForm.medicalInfo,
        allergies: buildMedicalListText(nextSelectedAllergies, nextOtherAllergyItems),
      },
    }));
  };

  const toggleCondition = (condition: string) => {
    setSelectedConditions((previous) => {
      const alreadySelected = previous.includes(condition);
      let next: string[];

      if (condition === NONE_OPTION) {
        next = alreadySelected ? [] : [NONE_OPTION];
      } else if (alreadySelected) {
        next = previous.filter((item) => item !== condition);
      } else {
        next = [...previous.filter((item) => item !== NONE_OPTION), condition];
      }

      const shouldClearOther =
        condition === OTHER_OPTION
          ? alreadySelected || next.includes(NONE_OPTION)
          : next.includes(NONE_OPTION);
      const nextOtherItems = shouldClearOther ? [] : otherConditionItems;

      if (shouldClearOther) {
        setOtherConditionDraft('');
        setOtherConditionItems([]);
      }

      syncConditionsText(next, nextOtherItems);

      return next;
    });
  };

  const toggleAllergy = (allergy: string) => {
    setSelectedAllergies((previous) => {
      const alreadySelected = previous.includes(allergy);
      let next: string[];

      if (allergy === NONE_OPTION) {
        next = alreadySelected ? [] : [NONE_OPTION];
      } else if (alreadySelected) {
        next = previous.filter((item) => item !== allergy);
      } else {
        next = [...previous.filter((item) => item !== NONE_OPTION), allergy];
      }

      const shouldClearOther =
        allergy === OTHER_OPTION
          ? alreadySelected || next.includes(NONE_OPTION)
          : next.includes(NONE_OPTION);
      const nextOtherItems = shouldClearOther ? [] : otherAllergyItems;

      if (shouldClearOther) {
        setOtherAllergyDraft('');
        setOtherAllergyItems([]);
      }

      syncAllergiesText(next, nextOtherItems);

      return next;
    });
  };

  const addOtherCondition = () => {
    const value = otherConditionDraft.trim();
    if (!value) {
      setOtherConditionError('Escribe una condicion para agregar.');
      return;
    }

    if (!selectedConditions.includes(OTHER_OPTION)) {
      setOtherConditionError('Activa la opcion Otros para agregar valores personalizados.');
      return;
    }

    const normalized = normalizeMedicalToken(value);
    const conditionAlreadySelected = selectedConditions
      .filter((item) => item !== OTHER_OPTION && item !== NONE_OPTION)
      .some((item) => normalizeMedicalToken(item) === normalized);

    if (conditionAlreadySelected) {
      setOtherConditionError('Esta condicion ya esta seleccionada en la lista principal.');
      return;
    }

    const otherAlreadyExists = otherConditionItems.some((item) => normalizeMedicalToken(item) === normalized);
    if (otherAlreadyExists) {
      setOtherConditionError('Esta condicion ya fue agregada en Otros.');
      setOtherConditionDraft('');
      return;
    }

    const nextOtherItems = [...otherConditionItems, value];
    setOtherConditionItems(nextOtherItems);
    setOtherConditionDraft('');
    setOtherConditionError(null);
    syncConditionsText(selectedConditions, nextOtherItems);
  };

  const removeOtherCondition = (value: string) => {
    const nextOtherItems = otherConditionItems.filter((item) => item !== value);
    setOtherConditionItems(nextOtherItems);
    syncConditionsText(selectedConditions, nextOtherItems);
  };

  const addOtherAllergy = () => {
    const value = otherAllergyDraft.trim();
    if (!value) {
      setOtherAllergyError('Escribe una alergia para agregar.');
      return;
    }

    if (!selectedAllergies.includes(OTHER_OPTION)) {
      setOtherAllergyError('Activa la opcion Otros para agregar valores personalizados.');
      return;
    }

    const normalized = normalizeMedicalToken(value);
    const allergyAlreadySelected = selectedAllergies
      .filter((item) => item !== OTHER_OPTION && item !== NONE_OPTION)
      .some((item) => normalizeMedicalToken(item) === normalized);

    if (allergyAlreadySelected) {
      setOtherAllergyError('Esta alergia ya esta seleccionada en la lista principal.');
      return;
    }

    const otherAlreadyExists = otherAllergyItems.some((item) => normalizeMedicalToken(item) === normalized);
    if (otherAlreadyExists) {
      setOtherAllergyError('Esta alergia ya fue agregada en Otros.');
      setOtherAllergyDraft('');
      return;
    }

    const nextOtherItems = [...otherAllergyItems, value];
    setOtherAllergyItems(nextOtherItems);
    setOtherAllergyDraft('');
    setOtherAllergyError(null);
    syncAllergiesText(selectedAllergies, nextOtherItems);
  };

  const removeOtherAllergy = (value: string) => {
    const nextOtherItems = otherAllergyItems.filter((item) => item !== value);
    setOtherAllergyItems(nextOtherItems);
    syncAllergiesText(selectedAllergies, nextOtherItems);
  };

  const onNext = async () => {
    if (isSubmitting || isCheckingEmailAvailability) {
      return;
    }

    if (currentStep === 2) {
      const personalValidationIssue = getPersonalValidationIssue(form.personalData, calculatedAge);
      if (personalValidationIssue) {
        setStepError(personalValidationIssue.message);
        focusPersonalField(personalValidationIssue.field);
        return;
      }
    }

    const validationError = validateCurrentStep(currentStep, form, calculatedAge);
    if (validationError) {
      setStepError(validationError);
      return;
    }

    setStepError(null);

    if (currentStep === 2) {
      const normalizedEmail = form.personalData.email.trim().toLowerCase();
      const lastCheck = lastEmailAvailabilityRef.current;

      if (!lastCheck || lastCheck.email !== normalizedEmail) {
        try {
          setIsCheckingEmailAvailability(true);
          const result = await checkEmailAvailability(normalizedEmail);
          lastEmailAvailabilityRef.current = {
            email: normalizedEmail,
            available: result.available,
          };

          if (!result.available) {
            setEmailAvailabilityMessage(result.message);
            focusPersonalField('email');
            return;
          }

          setEmailAvailabilityMessage(null);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo validar el correo en este momento.';
          setStepError(message);
          return;
        } finally {
          setIsCheckingEmailAvailability(false);
        }
      } else if (!lastCheck.available) {
        setEmailAvailabilityMessage('Este correo ya está en uso. Inicia sesión o recupera tu contraseña.');
        focusPersonalField('email');
        return;
      }
    }

    if (isLastStep) {
      void appStorage.removeItem(REGISTER_WIZARD_DRAFT_STORAGE_KEY);
      void onSubmit(form);
      return;
    }

    setStepIndex((previous) => Math.min(REGISTER_STEPS.length - 1, previous + 1));
  };

  const onBack = () => {
    if (isSubmitting || isCheckingEmailAvailability) {
      return;
    }
    setStepError(null);
    setStepIndex((previous) => Math.max(0, previous - 1));
  };

  const renderPersonalStep = () => (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Nombre completo</Text>
      <TextInput
        ref={registerPersonalFieldRef('fullName')}
        value={form.personalData.fullName}
        onChangeText={(value) =>
          setForm((previous) => ({
            ...previous,
            personalData: { ...previous.personalData, fullName: value },
          }))
        }
        onLayout={registerFieldOffset('fullName')}
        onFocus={() => scrollToFocusedField('fullName')}
        onSubmitEditing={() => handlePersonalInputSubmit('fullName')}
        style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]}
        placeholder="Nombre y apellido"
        placeholderTextColor={theme.colors.inputPlaceholder}
        autoCapitalize="words"
        returnKeyType="next"
      />

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Fecha de nacimiento</Text>
      <Pressable
        onLayout={registerFieldOffset('birthDate')}
        style={[styles.selectorField, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
        onPress={openBirthDateModal}
      >
        <Text style={{ color: form.personalData.birthDate ? theme.colors.textPrimary : theme.colors.inputPlaceholder, fontSize: 15 }}>
          {form.personalData.birthDate || 'Seleccionar fecha'}
        </Text>
        <Text style={{ color: theme.colors.textMuted }}>▼</Text>
      </Pressable>

      <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Edad: {calculatedAge ?? '-'}</Text>

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Telefono (opcional)</Text>
      <View style={[styles.phoneRow, isCompact ? styles.phoneRowCompact : null]}>
        <Pressable
          style={[styles.countrySelector, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
          onPress={() => setIsCountryModalVisible(true)}
        >
          <Text style={[styles.countryFlag, { color: theme.colors.textPrimary }]}>{selectedCountry.flag}</Text>
          <Text style={[styles.countryCode, { color: theme.colors.textPrimary }]}>{selectedCountry.code}</Text>
          <Text style={{ color: theme.colors.textMuted }}>▼</Text>
        </Pressable>

        <TextInput
          ref={registerPersonalFieldRef('phone')}
          value={form.personalData.phone}
          onChangeText={(value) =>
            setForm((previous) => ({
              ...previous,
              personalData: {
                ...previous.personalData,
                phone: value.replaceAll(/\D/g, '').slice(0, 9),
              },
            }))
          }
          onLayout={registerFieldOffset('phone')}
          onFocus={() => scrollToFocusedField('phone')}
          onSubmitEditing={() => handlePersonalInputSubmit('phone')}
          style={[styles.input, styles.phoneInput, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]}
          placeholder="987654321"
          keyboardType="number-pad"
          placeholderTextColor={theme.colors.inputPlaceholder}
          maxLength={9}
          returnKeyType="next"
        />
      </View>

      <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Formato Ecuador: 9 digitos (ej. 987654321)</Text>

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Correo</Text>
      <TextInput
        ref={registerPersonalFieldRef('email')}
        value={form.personalData.email}
        onChangeText={(value) =>
          setForm((previous) => {
            const nextEmail = value.trim();
            const normalizedNextEmail = nextEmail.toLowerCase();
            const lastCheck = lastEmailAvailabilityRef.current;

            if (lastCheck?.email !== normalizedNextEmail && emailAvailabilityMessage) {
              setEmailAvailabilityMessage(null);
            }

            return {
              ...previous,
              personalData: { ...previous.personalData, email: nextEmail },
            };
          })
        }
        onLayout={registerFieldOffset('email')}
        onFocus={() => scrollToFocusedField('email')}
        style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]}
        placeholder="tu@dominio.com"
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor={theme.colors.inputPlaceholder}
        onSubmitEditing={() => handlePersonalInputSubmit('email')}
        returnKeyType="next"
      />
      {emailAvailabilityMessage ? (
        <Text style={[styles.inlineValidationText, { color: '#C0392B' }]}>
          {emailAvailabilityMessage}
        </Text>
      ) : null}

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Contrasena</Text>
      <View style={styles.passwordWrap} onLayout={registerFieldOffset('password')}>
        <TextInput
          ref={registerPersonalFieldRef('password')}
          value={form.personalData.password}
          onChangeText={(value) =>
            setForm((previous) => ({
              ...previous,
              personalData: { ...previous.personalData, password: value },
            }))
          }
          onFocus={() => scrollToFocusedField('password')}
          style={[styles.input, styles.passwordInput, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]}
          placeholder="Minimo 6 caracteres"
          placeholderTextColor={theme.colors.inputPlaceholder}
          autoCapitalize="none"
          secureTextEntry={!isPasswordVisible}
          onSubmitEditing={() => handlePersonalInputSubmit('password')}
          returnKeyType="next"
        />
        <Pressable
          onPress={() => setIsPasswordVisible((previous) => !previous)}
          style={styles.passwordToggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isPasswordVisible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
        >
          <Ionicons
            name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={theme.colors.accentSecondary}
          />
        </Pressable>
      </View>

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Confirmar contrasena</Text>
      <View style={styles.passwordWrap} onLayout={registerFieldOffset('confirmPassword')}>
        <TextInput
          ref={registerPersonalFieldRef('confirmPassword')}
          value={form.personalData.confirmPassword}
          onChangeText={(value) =>
            setForm((previous) => ({
              ...previous,
              personalData: { ...previous.personalData, confirmPassword: value },
            }))
          }
          onFocus={() => scrollToFocusedField('confirmPassword')}
          style={[styles.input, styles.passwordInput, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]}
          placeholder="Repite tu contrasena"
          placeholderTextColor={theme.colors.inputPlaceholder}
          autoCapitalize="none"
          secureTextEntry={!isConfirmPasswordVisible}
          onSubmitEditing={() => handlePersonalInputSubmit('confirmPassword')}
          returnKeyType="done"
        />
        <Pressable
          onPress={() => setIsConfirmPasswordVisible((previous) => !previous)}
          style={styles.passwordToggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isConfirmPasswordVisible ? 'Ocultar confirmacion de contrasena' : 'Mostrar confirmacion de contrasena'}
        >
          <Ionicons
            name={isConfirmPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={theme.colors.accentSecondary}
          />
        </Pressable>
      </View>
    </View>
  );

  const renderMedicalInfoStep = () => (
    <View style={styles.group}>
      <View style={[styles.medicalSelectorCard, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}> 
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Enfermedades o condiciones hereditarias</Text>
        <Text style={[styles.selectorSubtitle, { color: theme.colors.textMuted }]}>Selecciona las mas importantes para antecedentes familiares.</Text>

        <View style={styles.optionsWrap}>
          {HEREDITARY_CONDITIONS.map((condition) => {
            const isSelected = selectedConditions.includes(condition);
            return (
              <Pressable
                key={condition}
                onPress={() => toggleCondition(condition)}
                style={[
                  styles.optionChip,
                  {
                    borderColor: isSelected ? theme.colors.accentPrimary : theme.colors.inputBorder,
                    backgroundColor: isSelected ? `${theme.colors.accentPrimary}22` : theme.colors.surface,
                  },
                ]}
              >
                <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>{condition}</Text>
              </Pressable>
            );
          })}
        </View>

        {selectedConditions.includes(OTHER_OPTION) ? (
          <>
            <View style={styles.otherInputRow}>
              <TextInput
                value={otherConditionDraft}
                onChangeText={(value) => {
                  setOtherConditionDraft(value);
                  if (otherConditionError) {
                    setOtherConditionError(null);
                  }
                }}
                style={[styles.input, styles.compactInput, styles.otherInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]}
                placeholder="Escribe una condicion y toca Agregar"
                placeholderTextColor={theme.colors.inputPlaceholder}
                onSubmitEditing={addOtherCondition}
              />
              <Pressable style={[styles.addInlineButton, { backgroundColor: theme.colors.accentPrimary }]} onPress={addOtherCondition}>
                <Text style={[styles.addInlineButtonText, { color: theme.colors.buttonText }]}>Agregar</Text>
              </Pressable>
            </View>
            {otherConditionItems.length ? (
              <View style={styles.optionsWrap}>
                {otherConditionItems.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => removeOtherCondition(item)}
                    style={[styles.optionChip, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.surface }]}
                  >
                    <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>{item} ×</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {otherConditionError ? <Text style={[styles.errorText, { color: '#D64545' }]}>{otherConditionError}</Text> : null}
          </>
        ) : null}
      </View>

      <View style={[styles.medicalSelectorCard, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}> 
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Alergias comunes</Text>
        <Text style={[styles.selectorSubtitle, { color: theme.colors.textMuted }]}>Marca alergias frecuentes y agrega otras si aplica.</Text>

        <View style={styles.optionsWrap}>
          {COMMON_ALLERGIES.map((allergy) => {
            const isSelected = selectedAllergies.includes(allergy);
            return (
              <Pressable
                key={allergy}
                onPress={() => toggleAllergy(allergy)}
                style={[
                  styles.optionChip,
                  {
                    borderColor: isSelected ? theme.colors.accentPrimary : theme.colors.inputBorder,
                    backgroundColor: isSelected ? `${theme.colors.accentPrimary}22` : theme.colors.surface,
                  },
                ]}
              >
                <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>{allergy}</Text>
              </Pressable>
            );
          })}
        </View>

        {selectedAllergies.includes(OTHER_OPTION) ? (
          <>
            <View style={styles.otherInputRow}>
              <TextInput
                value={otherAllergyDraft}
                onChangeText={(value) => {
                  setOtherAllergyDraft(value);
                  if (otherAllergyError) {
                    setOtherAllergyError(null);
                  }
                }}
                style={[styles.input, styles.compactInput, styles.otherInput, { backgroundColor: theme.colors.surface, borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]}
                placeholder="Escribe una alergia y toca Agregar"
                placeholderTextColor={theme.colors.inputPlaceholder}
                onSubmitEditing={addOtherAllergy}
              />
              <Pressable style={[styles.addInlineButton, { backgroundColor: theme.colors.accentPrimary }]} onPress={addOtherAllergy}>
                <Text style={[styles.addInlineButtonText, { color: theme.colors.buttonText }]}>Agregar</Text>
              </Pressable>
            </View>
            {otherAllergyItems.length ? (
              <View style={styles.optionsWrap}>
                {otherAllergyItems.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => removeOtherAllergy(item)}
                    style={[styles.optionChip, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.surface }]}
                  >
                    <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>{item} ×</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {otherAllergyError ? <Text style={[styles.errorText, { color: '#D64545' }]}>{otherAllergyError}</Text> : null}
          </>
        ) : null}
      </View>

      <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Condiciones especiales</Text>

      <View style={styles.permissionRow}>
        <Text style={[styles.permissionText, { color: theme.colors.textPrimary }]}>Embarazo</Text>
        <Switch
          value={form.medicalInfo.specialConditions.pregnancy}
          onValueChange={(value) => updateSpecialCondition('pregnancy', value)}
          trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
        />
      </View>

      <View style={styles.permissionRow}>
        <Text style={[styles.permissionText, { color: theme.colors.textPrimary }]}>Lactancia</Text>
        <Switch
          value={form.medicalInfo.specialConditions.lactation}
          onValueChange={(value) => updateSpecialCondition('lactation', value)}
          trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
        />
      </View>

      <View style={styles.permissionRow}>
        <Text style={[styles.permissionText, { color: theme.colors.textPrimary }]}>Cirugías recientes</Text>
        <Switch
          value={form.medicalInfo.specialConditions.recentSurgeries}
          onValueChange={(value) => updateSpecialCondition('recentSurgeries', value)}
          trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
        />
      </View>

      <View style={styles.permissionRow}>
        <Text style={[styles.permissionText, { color: theme.colors.textPrimary }]}>Inmunosupresion</Text>
        <Switch
          value={form.medicalInfo.specialConditions.immunosuppression}
          onValueChange={(value) => updateSpecialCondition('immunosuppression', value)}
          trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
        />
      </View>

      <View style={styles.permissionRow}>
        <Text style={[styles.permissionText, { color: theme.colors.textPrimary }]}>Tratamiento anticoagulante</Text>
        <Switch
          value={form.medicalInfo.specialConditions.anticoagulantTreatment}
          onValueChange={(value) => updateSpecialCondition('anticoagulantTreatment', value)}
          trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
        />
      </View>

      <Pressable
        style={[
          styles.vigencyButton,
          {
            borderColor:
              activeSpecialConditionKeys.length > 0
                ? theme.colors.accentSecondary
                : theme.colors.inputBorder,
            backgroundColor: theme.colors.inputBackground,
          },
        ]}
        disabled={activeSpecialConditionKeys.length === 0}
        onPress={() => setIsVigencyModalVisible(true)}
      >
        <Text
          style={[
            styles.vigencyButtonText,
            {
              color:
                activeSpecialConditionKeys.length > 0
                  ? theme.colors.accentSecondary
                  : theme.colors.textMuted,
            },
          ]}
        >
          Configurar vigencia (opcional)
        </Text>
      </Pressable>
      <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Vigencias temporales configuradas: {temporarySpecialConditionsCount}</Text>
    </View>
  );

  const renderMedicationsStep = () => (
    <View style={styles.group}>
      <View style={styles.permissionRow}>
        <Text style={[styles.permissionText, { color: theme.colors.textPrimary }]}>Agregar medicamentos despues</Text>
        <Switch
          value={form.medicationsDeferred}
          onValueChange={(value) =>
            setForm((previous) => {
              let medications = previous.medications;

              if (value) {
                medications = [];
              } else if (!previous.medications.length) {
                medications = [createMedicationDraft()];
              }

              return {
                ...previous,
                medicationsDeferred: value,
                medications,
              };
            })
          }
          trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
        />
      </View>

      {form.medicationsDeferred ? (
        <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Podras registrar medicamentos mas adelante desde la pantalla de medicamentos.</Text>
      ) : (
        <>
          {form.medications.map((medication, index) => (
            <View key={medication.id} style={[styles.medicationCard, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}> 
              <View style={styles.medicationHeader}>
                <Text style={[styles.choiceTitle, { color: theme.colors.textPrimary }]}>Medicamento {index + 1}</Text>
                {form.medications.length > 1 ? (
                  <Pressable onPress={() => removeMedication(medication.id)}>
                    <Text style={[styles.removeText, { color: theme.colors.accentSecondary }]}>Quitar</Text>
                  </Pressable>
                ) : null}
              </View>

              <TextInput value={medication.name} onChangeText={(value) => updateMedicationField(medication.id, 'name', value)} style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]} placeholder="Nombre" placeholderTextColor={theme.colors.inputPlaceholder} />
              <TextInput value={medication.dose} onChangeText={(value) => updateMedicationField(medication.id, 'dose', value)} style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]} placeholder="Dosis" placeholderTextColor={theme.colors.inputPlaceholder} />
              <TextInput value={medication.schedule} onChangeText={(value) => updateMedicationField(medication.id, 'schedule', value)} style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]} placeholder="Horario" placeholderTextColor={theme.colors.inputPlaceholder} />
              <TextInput value={medication.frequency} onChangeText={(value) => updateMedicationField(medication.id, 'frequency', value)} style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]} placeholder="Frecuencia" placeholderTextColor={theme.colors.inputPlaceholder} />
            </View>
          ))}

          <Pressable
            onPress={() =>
              setForm((previous) => ({ ...previous, medications: [...previous.medications, createMedicationDraft()] }))
            }
            style={[styles.addButton, { borderColor: theme.colors.accentSecondary }]}
          >
            <Text style={[styles.addButtonText, { color: theme.colors.accentSecondary }]}>+ Agregar medicamento</Text>
          </Pressable>
        </>
      )}
    </View>
  );

  const renderAppointmentsStep = () => (
    <View style={styles.group}>
      <View style={styles.permissionRow}>
        <Text style={[styles.permissionText, { color: theme.colors.textPrimary }]}>Agregar citas despues</Text>
        <Switch
          value={form.appointmentsDeferred}
          onValueChange={(value) =>
            setForm((previous) => {
              let nextAppointments = previous.appointments;

              if (value) {
                nextAppointments = [];
              } else if (!previous.appointments.length) {
                nextAppointments = [createAppointmentDraft()];
              }

              return {
                ...previous,
                appointmentsDeferred: value,
                appointments: nextAppointments,
              };
            })
          }
          trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
        />
      </View>

      {form.appointmentsDeferred ? (
        <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Podras agregar tus citas luego de unirte y completar tu perfil.</Text>
      ) : (
        <>
          {form.appointments.map((appointment, index) => (
            <View key={appointment.id} style={[styles.medicationCard, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}> 
              <View style={styles.medicationHeader}>
                <Text style={[styles.choiceTitle, { color: theme.colors.textPrimary }]}>Cita {index + 1}</Text>
                {form.appointments.length > 1 ? (
                  <Pressable onPress={() => removeAppointment(appointment.id)}>
                    <Text style={[styles.removeText, { color: theme.colors.accentSecondary }]}>Quitar</Text>
                  </Pressable>
                ) : null}
              </View>

              <TextInput value={appointment.specialty} onChangeText={(value) => updateAppointmentField(appointment.id, 'specialty', value)} style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]} placeholder="Especialidad o motivo" placeholderTextColor={theme.colors.inputPlaceholder} />
              <TextInput value={appointment.date} onChangeText={(value) => updateAppointmentField(appointment.id, 'date', value)} style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]} placeholder="Fecha (YYYY-MM-DD)" placeholderTextColor={theme.colors.inputPlaceholder} />
              <TextInput value={appointment.time} onChangeText={(value) => updateAppointmentField(appointment.id, 'time', value)} style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]} placeholder="Hora (HH:MM)" placeholderTextColor={theme.colors.inputPlaceholder} />
              <TextInput value={appointment.place} onChangeText={(value) => updateAppointmentField(appointment.id, 'place', value)} style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]} placeholder="Centro o clinica" placeholderTextColor={theme.colors.inputPlaceholder} />
            </View>
          ))}

          <Pressable
            onPress={() =>
              setForm((previous) => ({ ...previous, appointments: [...previous.appointments, createAppointmentDraft()] }))
            }
            style={[styles.addButton, { borderColor: theme.colors.accentSecondary }]}
          >
            <Text style={[styles.addButtonText, { color: theme.colors.accentSecondary }]}>+ Agregar cita</Text>
          </Pressable>
        </>
      )}
    </View>
  );

  const renderSummaryStep = () => {
    const activeConditions = specialConditionKeys
      .filter((key) => form.medicalInfo.specialConditions[key])
      .map((key) => SPECIAL_CONDITION_LABELS[key]);

    let medicationsSummary = 'Ninguno';
    if (form.medicationsDeferred) {
      medicationsSummary = 'Se agregaran despues';
    } else if (form.medications.length) {
      medicationsSummary = `${form.medications.length} registrado(s)`;
    }

    let appointmentsSummary = 'Ninguna';
    if (form.appointmentsDeferred) {
      appointmentsSummary = 'Se agregaran despues';
    } else if (form.appointments.length) {
      appointmentsSummary = `${form.appointments.length} registrada(s)`;
    }

    return (
      <View style={styles.group}>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Nombre: {form.personalData.fullName || '-'}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Fecha de nacimiento: {form.personalData.birthDate || '-'}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Edad: {form.personalData.age || '-'}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Telefono: {form.personalData.phone ? `${form.personalData.phoneCountryCode} ${form.personalData.phone}` : '-'}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Antecedentes hereditarios: {form.medicalInfo.conditions || 'Ninguna'}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Alergias: {form.medicalInfo.allergies || 'Ninguna'}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Condiciones especiales: {activeConditions.length ? activeConditions.join(', ') : 'Ninguna'}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Vigencias temporales: {temporarySpecialConditionsCount}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Medicamentos: {medicationsSummary}</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>Citas: {appointmentsSummary}</Text>
      </View>
    );
  };

  const renderStep = () => {
    const stepRenderers: Partial<Record<number, () => React.JSX.Element>> = {
      2: renderPersonalStep,
      3: renderMedicalInfoStep,
      4: renderMedicationsStep,
      5: renderAppointmentsStep,
    };

    const renderer = stepRenderers[currentStep];
    return renderer ? renderer() : renderSummaryStep();
  };

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
          paddingHorizontal: horizontalPadding,
          paddingTop: topPadding,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      <BackgroundDecor theme={theme} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        style={styles.keyboardLayer}
      >

      <View style={styles.header}>
        <BrandLogo theme={theme} size={logoSize} showName={false} />
        <Text style={[styles.title, isShortScreen ? styles.titleCompact : null, { color: theme.colors.textPrimary }]}>Registro de Perfil</Text>
      </View>

      <View style={[styles.card, { padding: cardPadding, paddingBottom: cardPadding + iosFooterPadding, marginBottom: cardBottomGap, backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
        <View style={styles.stepHeader}>
          <Text style={[styles.stepCount, { color: theme.colors.accentSecondary }]}>Paso {stepIndex + 1} de {REGISTER_STEPS.length}</Text>
          <Text style={[styles.stepTitle, { color: theme.colors.textPrimary }]}>{STEP_TITLE[currentStep]}</Text>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: theme.colors.inputBorder }]}>
          <View style={[styles.progressFill, { width: `${((stepIndex + 1) / REGISTER_STEPS.length) * 100}%`, backgroundColor: theme.colors.accentPrimary }]} />
        </View>

        <ScrollView
          ref={stepScrollRef}
          style={styles.stepContent}
          contentContainerStyle={[styles.stepContentInner, { paddingBottom: isShortScreen ? 16 : 12 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>

        {stepError ? <Text style={[styles.errorText, { color: '#D64545' }]}>{stepError}</Text> : null}

        <View style={[styles.footerActions, isVeryShortScreen ? styles.footerActionsStacked : null, { paddingBottom: iosFooterPadding }]}> 
          <Pressable
            style={[styles.secondaryAction, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}
            onPress={stepIndex === 0 ? onNavigateToLogin : onBack}
            disabled={isSubmitting || isCheckingEmailAvailability}
            accessibilityState={{ disabled: isSubmitting || isCheckingEmailAvailability }}
          >
            <Text style={[styles.secondaryActionText, { color: theme.colors.textSecondary }]}> 
              {stepIndex === 0 ? 'Volver al login' : 'Anterior'}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.primaryAction,
              isVeryShortScreen ? styles.primaryActionStacked : null,
              { backgroundColor: theme.colors.accentPrimary },
              isSubmitting && styles.footerActionDisabled,
            ]}
            onPress={onNext}
            disabled={isSubmitting || isCheckingEmailAvailability}
            accessibilityState={{ disabled: isSubmitting || isCheckingEmailAvailability }}
          >
            <Text style={[styles.primaryActionText, { color: theme.colors.buttonText }]}> 
              {primaryActionLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={isBirthDateModalVisible} transparent animationType="fade" onRequestClose={() => setIsBirthDateModalVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={() => setIsBirthDateModalVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: modalSolidBackground, borderColor: theme.colors.surfaceBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Selecciona fecha de nacimiento</Text>

            <View style={styles.datePickerGrid}>
              <View style={styles.datePickerColumn}>
                <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Año</Text>
                <ScrollView style={styles.datePickerList}>
                  {yearOptions.map((year) => (
                    <Pressable
                      key={year}
                      onPress={() => {
                        setDraftBirthYear(year);
                        const maxDay = getDaysInMonth(year, draftBirthMonth);
                        if (draftBirthDay > maxDay) {
                          setDraftBirthDay(maxDay);
                        }
                      }}
                      style={[styles.datePickerOption, { borderColor: draftBirthYear === year ? theme.colors.accentPrimary : 'transparent' }]}
                    >
                      <Text style={[styles.datePickerOptionText, { color: theme.colors.textPrimary }]}>{year}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.datePickerColumn}>
                <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Mes</Text>
                <ScrollView style={styles.datePickerList}>
                  {MONTH_OPTIONS.map((monthOption) => (
                    <Pressable
                      key={monthOption.value}
                      onPress={() => {
                        setDraftBirthMonth(monthOption.value);
                        const maxDay = getDaysInMonth(draftBirthYear, monthOption.value);
                        if (draftBirthDay > maxDay) {
                          setDraftBirthDay(maxDay);
                        }
                      }}
                      style={[styles.datePickerOption, { borderColor: draftBirthMonth === monthOption.value ? theme.colors.accentPrimary : 'transparent' }]}
                    >
                      <Text style={[styles.datePickerOptionText, { color: theme.colors.textPrimary }]}>{monthOption.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.datePickerColumn}>
                <Text style={[styles.datePickerLabel, { color: theme.colors.textMuted }]}>Dia</Text>
                <ScrollView style={styles.datePickerList}>
                  {dayOptions.map((day) => (
                    <Pressable
                      key={day}
                      onPress={() => setDraftBirthDay(day)}
                      style={[styles.datePickerOption, { borderColor: draftBirthDay === day ? theme.colors.accentPrimary : 'transparent' }]}
                    >
                      <Text style={[styles.datePickerOptionText, { color: theme.colors.textPrimary }]}>{day}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalActionSecondary, { borderColor: theme.colors.inputBorder }]} onPress={() => setIsBirthDateModalVisible(false)}>
                <Text style={[styles.modalActionSecondaryText, { color: theme.colors.textSecondary }]}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.modalActionPrimary, { backgroundColor: theme.colors.accentPrimary }]} onPress={applyBirthDateSelection}>
                <Text style={[styles.modalActionPrimaryText, { color: theme.colors.buttonText }]}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isCountryModalVisible} transparent animationType="fade" onRequestClose={() => setIsCountryModalVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={() => setIsCountryModalVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: modalSolidBackground, borderColor: theme.colors.surfaceBorder }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Selecciona pais</Text>
            <ScrollView style={styles.modalList}>
              {PHONE_COUNTRIES.map((country) => (
                <Pressable
                  key={country.iso}
                  onPress={() => {
                    setForm((previous) => ({
                      ...previous,
                      personalData: {
                        ...previous.personalData,
                        phoneCountryCode: country.code,
                        phoneCountryIso: country.iso,
                      },
                    }));
                    setIsCountryModalVisible(false);
                  }}
                  style={[styles.modalItem, { borderBottomColor: theme.colors.inputBorder }]}
                >
                  <Text style={[styles.modalItemText, { color: theme.colors.textPrimary }]}>
                    {country.flag} {country.name} ({country.code})
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={isVigencyModalVisible} transparent animationType="fade" onRequestClose={() => setIsVigencyModalVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={() => setIsVigencyModalVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: modalSolidBackground, borderColor: theme.colors.surfaceBorder }]}> 
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Vigencia de condiciones especiales</Text>
            <ScrollView style={styles.modalList}>
              {activeSpecialConditionKeys.length === 0 ? (
                <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>Activa una condicion especial para configurar vigencia.</Text>
              ) : (
                activeSpecialConditionKeys.map((key) => {
                  const vigency = form.medicalInfo.specialConditionVigency[key];
                  return (
                    <View key={key} style={[styles.vigencyCard, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}> 
                      <Text style={[styles.choiceTitle, { color: theme.colors.textPrimary }]}>{SPECIAL_CONDITION_LABELS[key]}</Text>
                      <View style={styles.permissionRow}>
                        <Text style={[styles.permissionText, { color: theme.colors.textPrimary }]}>Temporal</Text>
                        <Switch
                          value={vigency.isTemporary}
                          onValueChange={(value) => updateSpecialConditionTemporary(key, value)}
                          trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
                        />
                      </View>
                      {vigency.isTemporary ? (
                        <TextInput
                          value={vigency.until}
                          onChangeText={(value) => updateSpecialConditionUntil(key, value)}
                          style={[styles.input, styles.compactInput, { borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary }]}
                          placeholder="Hasta (YYYY-MM-DD)"
                          placeholderTextColor={theme.colors.inputPlaceholder}
                        />
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={[styles.modalActionPrimary, { backgroundColor: theme.colors.accentPrimary }]} onPress={() => setIsVigencyModalVisible(false)}>
                <Text style={[styles.modalActionPrimaryText, { color: theme.colors.buttonText }]}>Listo</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboardLayer: { flex: 1 },
  header: { marginTop: 8, marginBottom: 14, gap: 8, alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center' },
  titleCompact: { fontSize: 28 },
  card: { borderWidth: 1, borderRadius: 22, gap: 10, flex: 1, minHeight: 0, width: '100%', maxWidth: 640, alignSelf: 'center' },
  stepHeader: { gap: 2 },
  stepCount: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  stepTitle: { fontSize: 22, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  stepContent: { flex: 1, minHeight: 0 },
  stepContentInner: { paddingBottom: 8 },
  group: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  label: { fontSize: 13, marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 8 },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  passwordToggle: { position: 'absolute', right: 12, top: 12, zIndex: 3 },
  selectorField: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phoneRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
  countrySelector: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 130 },
  countryFlag: { fontSize: 18 },
  countryCode: { fontSize: 15, fontWeight: '700' },
  phoneInput: { flex: 1, marginBottom: 0 },
  helperText: { fontSize: 12, marginTop: -2, marginBottom: 8 },
  inlineValidationText: { fontSize: 12, marginTop: -2, marginBottom: 8, fontWeight: '600' },
  medicalSelectorCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 4 },
  selectorSubtitle: { fontSize: 12, marginBottom: 10 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  optionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  optionChipText: { fontSize: 13, fontWeight: '600' },
  otherInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 },
  otherInput: { flex: 1, marginBottom: 0 },
  addInlineButton: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  addInlineButtonText: { fontSize: 13, fontWeight: '800' },
  vigencyButton: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  vigencyButtonText: { fontSize: 13, fontWeight: '700' },
  vigencyCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  choiceTitle: { fontSize: 15, fontWeight: '700' },
  medicationCard: { borderWidth: 1, borderRadius: 14, padding: 12 },
  medicationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  compactInput: { backgroundColor: 'transparent', marginBottom: 6 },
  removeText: { fontSize: 13, fontWeight: '700' },
  addButton: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  addButtonText: { fontSize: 14, fontWeight: '700' },
  permissionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  permissionText: { fontSize: 14, flex: 1, paddingRight: 12 },
  summaryText: { fontSize: 13, lineHeight: 18 },
  errorText: { fontSize: 13, fontWeight: '600' },
  footerActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  footerActionsStacked: { flexDirection: 'column' },
  secondaryAction: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  secondaryActionText: { fontSize: 14, fontWeight: '700' },
  primaryAction: { flex: 1.25, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryActionStacked: { flex: 1 },
  footerActionDisabled: { opacity: 0.65 },
  primaryActionText: { fontSize: 14, fontWeight: '800' },
  modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.58)' },
  modalCard: {
    borderWidth: 1,
    borderRadius: 18,
    maxHeight: '70%',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingVertical: 14 },
  modalList: { paddingHorizontal: 12, paddingBottom: 10 },
  modalItem: { borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 6 },
  modalItemText: { fontSize: 15 },
  datePickerGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  datePickerColumn: { flex: 1 },
  datePickerLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  datePickerList: { maxHeight: 220 },
  datePickerOption: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 8, marginBottom: 6 },
  datePickerOptionText: { fontSize: 14, textAlign: 'center', fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 },
  modalActionSecondary: { flex: 1, borderWidth: 1, borderRadius: 10, alignItems: 'center', paddingVertical: 11 },
  modalActionSecondaryText: { fontWeight: '700', fontSize: 14 },
  modalActionPrimary: { flex: 1, borderRadius: 10, alignItems: 'center', paddingVertical: 11 },
  modalActionPrimaryText: { fontWeight: '800', fontSize: 14 },
});
