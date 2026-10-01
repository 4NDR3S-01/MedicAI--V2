import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextInput,
} from "react-native";

import type { AppTheme } from "../../../shared/theme";
import { AppButton, BackgroundDecor, BrandLogo, MOTION, useReducedMotion } from "../../../shared/ui";
import { BirthDatePickerSheet } from "../components/register/BirthDatePickerSheet";
import { CountryPickerSheet } from "../components/register/CountryPickerSheet";
import {
  MedicalStep,
  PersonalStep,
  SpecialStep,
  SummaryStep,
  type EmailStatus,
} from "../components/register/RegisterSteps";
import { REGISTER_STEPS } from "../config/register.constants";
import type { RegisterWizardPayload, SpecialConditionKey } from "../models/register.types";
import { checkEmailAvailability } from "../services";
import { loadRegisterDraft, saveRegisterDraft } from "../services/registerDraft";
import { createInitialForm, getPhoneCountry, normalizeNationalPhone } from "../utils/register.utils";
import {
  firstErrorField,
  isValidEmail,
  validatePersonalData,
  type PersonalField,
} from "../utils/register.validation";

export type { RegisterWizardPayload } from "../models/register.types";

type RegisterScreenProps = {
  theme: AppTheme;
  isSubmitting?: boolean;
  onSubmit: (payload: RegisterWizardPayload) => void | Promise<void>;
  onNavigateToLogin: () => void;
};

const DRAFT_SAVE_DELAY_MS = 400;
const LAST_STEP = REGISTER_STEPS.length - 1;
const NEXT_FIELD: Partial<Record<PersonalField, PersonalField>> = {
  fullName: "birthDate",
  phone: "email",
  email: "password",
  password: "confirmPassword",
};

export function RegisterScreen({
  theme,
  isSubmitting = false,
  onSubmit,
  onNavigateToLogin,
}: Readonly<RegisterScreenProps>) {
  const reducedMotion = useReducedMotion();

  const [form, setForm] = useState<RegisterWizardPayload>(createInitialForm);
  const [stepIndex, setStepIndex] = useState(0);
  const [touched, setTouched] = useState<Partial<Record<PersonalField, boolean>>>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailStatusMessage, setEmailStatusMessage] = useState<string | null>(null);
  const [isBirthDateOpen, setIsBirthDateOpen] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const inputRefs = useRef<Partial<Record<PersonalField, TextInput | null>>>({});
  const fieldOffsets = useRef<Partial<Record<PersonalField, number>>>({});
  const checkedEmailRef = useRef<{ email: string; available: boolean } | null>(null);
  const continueAfterBirthDate = useRef(false);

  const stepAnim = useRef(new Animated.Value(1)).current;
  const stepDirection = useRef(1);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const personalErrors = validatePersonalData(form.personalData);
  const visibleErrors = Object.fromEntries(
    Object.entries(personalErrors).filter(
      ([field]) => showAllErrors || touched[field as PersonalField],
    ),
  );

  // ── Borrador: se restaura sin contraseñas y siempre desde el paso 1 ────
  useEffect(() => {
    let mounted = true;
    void loadRegisterDraft()
      .then((draft) => {
        if (!mounted || !draft) return;
        setForm(draft);
        const hasProgress =
          draft.personalData.fullName || draft.personalData.email || draft.personalData.birthDate;
        if (hasProgress) setRestoredDraft(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setIsHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const timer = setTimeout(() => {
      void saveRegisterDraft(form).catch(() => undefined);
    }, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [form, isHydrated]);

  // ── Animaciones de paso y progreso ──────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (reducedMotion) {
      stepAnim.setValue(1);
      progressAnim.setValue(stepIndex + 1);
      return;
    }
    stepAnim.setValue(0);
    Animated.parallel([
      Animated.timing(stepAnim, {
        toValue: 1,
        duration: MOTION.base,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: stepIndex + 1,
        duration: MOTION.base + 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [stepIndex, reducedMotion, stepAnim, progressAnim]);

  const goToStep = useCallback((next: number) => {
    setStepIndex((current) => {
      stepDirection.current = next >= current ? 1 : -1;
      return Math.max(0, Math.min(LAST_STEP, next));
    });
  }, []);

  // ── Botón atrás de Android: retrocede de paso en lugar de salir ──────────
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isSubmitting) return true;
      if (stepIndex > 0) {
        goToStep(stepIndex - 1);
      } else {
        onNavigateToLogin();
      }
      return true;
    });
    return () => subscription.remove();
  }, [stepIndex, isSubmitting, goToStep, onNavigateToLogin]);

  // ── Datos personales ────────────────────────────────────────────────────
  const updatePersonal = (patch: Partial<RegisterWizardPayload["personalData"]>) => {
    setForm((current) => {
      const next = { ...current.personalData, ...patch };
      if (patch.phone !== undefined || patch.phoneCountryIso !== undefined) {
        next.phone = normalizeNationalPhone(next.phone, getPhoneCountry(next.phoneCountryIso));
      }
      return { ...current, personalData: next };
    });
    if (patch.email !== undefined) {
      const normalized = patch.email.trim().toLowerCase();
      const checked = checkedEmailRef.current;
      if (checked?.email === normalized) {
        setEmailStatus(checked.available ? "available" : "taken");
      } else {
        setEmailStatus("idle");
        setEmailStatusMessage(null);
      }
    }
  };

  const updateMedical = (patch: Partial<RegisterWizardPayload["medicalInfo"]>) =>
    setForm((current) => ({ ...current, medicalInfo: { ...current.medicalInfo, ...patch } }));

  const toggleSpecial = (key: SpecialConditionKey, value: boolean) =>
    setForm((current) => ({
      ...current,
      medicalInfo: {
        ...current.medicalInfo,
        specialConditions: { ...current.medicalInfo.specialConditions, [key]: value },
      },
    }));

  /** Devuelve true si el correo está libre. Cachea el último resultado. */
  const verifyEmail = async (): Promise<boolean> => {
    const email = form.personalData.email.trim().toLowerCase();
    if (!isValidEmail(email)) return false;
    const checked = checkedEmailRef.current;
    if (checked?.email === email) return checked.available;

    setEmailStatus("checking");
    try {
      const result = await checkEmailAvailability(email);
      checkedEmailRef.current = { email, available: result.available };
      setEmailStatus(result.available ? "available" : "taken");
      setEmailStatusMessage(result.available ? null : "Este correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.");
      return result.available;
    } catch (error) {
      setEmailStatus("error");
      setEmailStatusMessage(
        error instanceof Error ? error.message : "No pudimos comprobar el correo. Inténtalo de nuevo.",
      );
      return false;
    }
  };

  const scrollToField = (field: PersonalField) => {
    const y = fieldOffsets.current[field];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: !reducedMotion });
  };

  const focusField = (field: PersonalField) => {
    scrollToField(field);
    if (field === "birthDate") {
      setIsBirthDateOpen(true);
      return;
    }
    setTimeout(() => inputRefs.current[field]?.focus(), 250);
  };

  const handleFieldLayout = (field: PersonalField) => (event: LayoutChangeEvent) => {
    fieldOffsets.current[field] = event.nativeEvent.layout.y;
  };

  const handleBlur = (field: PersonalField) => {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
    if (field === "email" && !personalErrors.email) void verifyEmail();
  };

  const handleSubmitField = (field: PersonalField) => {
    if (field === "confirmPassword") {
      void handleNext();
      return;
    }
    const next = NEXT_FIELD[field];
    if (next === "birthDate") {
      continueAfterBirthDate.current = true;
      setIsBirthDateOpen(true);
    } else if (next) {
      inputRefs.current[next]?.focus();
    }
  };

  // ── Navegación ──────────────────────────────────────────────────────────
  const validatePersonalStep = async (): Promise<boolean> => {
    const firstError = firstErrorField(personalErrors);
    if (firstError) {
      setShowAllErrors(true);
      if (stepIndex !== 0) goToStep(0);
      setTimeout(() => focusField(firstError), stepIndex !== 0 ? MOTION.base + 60 : 0);
      return false;
    }
    const emailAvailable = await verifyEmail();
    if (!emailAvailable) {
      if (stepIndex !== 0) goToStep(0);
      setTimeout(() => focusField("email"), stepIndex !== 0 ? MOTION.base + 60 : 0);
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (isSubmitting || emailStatus === "checking") return;

    if (stepIndex === 0) {
      if (await validatePersonalStep()) {
        setRestoredDraft(false);
        goToStep(1);
      }
      return;
    }

    if (stepIndex === LAST_STEP) {
      // Revalidar todo antes de enviar: el formulario pudo editarse hacia atrás.
      if (!(await validatePersonalStep())) return;
      await onSubmit(form);
      return;
    }

    goToStep(stepIndex + 1);
  };

  const handleBack = () => {
    if (isSubmitting) return;
    if (stepIndex === 0) onNavigateToLogin();
    else goToStep(stepIndex - 1);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const step = REGISTER_STEPS[stepIndex];
  const isChecking = emailStatus === "checking";
  let primaryLabel = "Continuar";
  if (stepIndex === LAST_STEP) primaryLabel = "Crear cuenta";

  const stepContent = (() => {
    switch (step.key) {
      case "personal":
        return (
          <PersonalStep
            theme={theme}
            data={form.personalData}
            errors={visibleErrors}
            emailStatus={emailStatus}
            emailStatusMessage={emailStatusMessage}
            inputRefs={inputRefs}
            onChange={updatePersonal}
            onBlurField={handleBlur}
            onFieldLayout={handleFieldLayout}
            onSubmitField={handleSubmitField}
            onOpenBirthDate={() => setIsBirthDateOpen(true)}
            onOpenCountry={() => setIsCountryOpen(true)}
            onFocusField={scrollToField}
          />
        );
      case "medical":
        return <MedicalStep theme={theme} data={form.medicalInfo} onChange={updateMedical} />;
      case "special":
        return <SpecialStep theme={theme} data={form.medicalInfo} onToggle={toggleSpecial} />;
      default:
        return (
          <SummaryStep
            theme={theme}
            form={form}
            onEditStep={goToStep}
            onToggleAiConsent={(aiHealthContextConsent) => updateMedical({ aiHealthContextConsent })}
          />
        );
    }
  })();

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <BackgroundDecor theme={theme} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <View style={styles.header}>
          <BrandLogo theme={theme} size={52} showName={false} />
          <View style={styles.flex}>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]} accessibilityRole="header">
              Crea tu cuenta
            </Text>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              Paso {stepIndex + 1} de {REGISTER_STEPS.length} · {step.title}
            </Text>
          </View>
        </View>

        <View
          style={styles.progress}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: REGISTER_STEPS.length, now: stepIndex + 1 }}
        >
          {REGISTER_STEPS.map((item, index) => (
            <View key={item.key} style={[styles.progressTrack, { backgroundColor: theme.colors.inputBorder }]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.colors.accentPrimary,
                    transform: [
                      {
                        scaleX: progressAnim.interpolate({
                          inputRange: [index, index + 1],
                          outputRange: [0, 1],
                          extrapolate: "clamp",
                        }),
                      },
                    ],
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
          >
            {restoredDraft && stepIndex === 0 ? (
              <View style={[styles.restoredBanner, { backgroundColor: `${theme.colors.accentSecondary}14` }]}>
                <Text style={[styles.restoredText, { color: theme.colors.textSecondary }]}>
                  Recuperamos tu progreso. Por seguridad, vuelve a escribir tu contraseña.
                </Text>
              </View>
            ) : null}

            <Animated.View
              style={{
                opacity: stepAnim,
                transform: [
                  {
                    translateX: stepAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24 * stepDirection.current, 0],
                    }),
                  },
                ],
              }}
            >
              {stepContent}
            </Animated.View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              // AppRoot ya aplica el área segura inferior (SafeAreaView).
              { borderTopColor: theme.colors.surfaceBorder },
            ]}
          >
            <AppButton
              theme={theme}
              variant="secondary"
              label={stepIndex === 0 ? "Ya tengo cuenta" : "Atrás"}
              icon={stepIndex === 0 ? undefined : "chevron-back"}
              iconPosition="left"
              onPress={handleBack}
              disabled={isSubmitting}
              style={styles.secondaryButton}
            />
            <AppButton
              theme={theme}
              label={primaryLabel}
              icon={stepIndex === LAST_STEP ? "checkmark" : "chevron-forward"}
              onPress={() => void handleNext()}
              loading={isSubmitting || (stepIndex === 0 && isChecking)}
              style={styles.primaryButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <BirthDatePickerSheet
        theme={theme}
        visible={isBirthDateOpen}
        value={form.personalData.birthDate}
        onClose={() => {
          continueAfterBirthDate.current = false;
          setIsBirthDateOpen(false);
        }}
        onConfirm={(birthDate) => {
          updatePersonal({ birthDate });
          setTouched((current) => ({ ...current, birthDate: true }));
          setIsBirthDateOpen(false);
          if (continueAfterBirthDate.current) {
            continueAfterBirthDate.current = false;
            setTimeout(() => inputRefs.current.phone?.focus(), 300);
          }
        }}
      />

      <CountryPickerSheet
        theme={theme}
        visible={isCountryOpen}
        selectedIso={form.personalData.phoneCountryIso}
        onClose={() => setIsCountryOpen(false)}
        onSelect={(phoneCountryIso) => {
          updatePersonal({ phoneCountryIso });
          setIsCountryOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4, marginBottom: 14 },
  title: { fontSize: 26, fontWeight: "800" },
  subtitle: { fontSize: 14, marginTop: 2, fontWeight: "600" },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 4, marginBottom: 14 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { flex: 1, borderRadius: 3, transformOrigin: "left" },
  card: {
    flex: 1,
    borderWidth: 1,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    marginHorizontal: -16,
    width: undefined,
    overflow: "hidden",
  },
  scrollContent: { padding: 18, paddingBottom: 28, maxWidth: 640, width: "100%", alignSelf: "center" },
  restoredBanner: { borderRadius: 14, padding: 12, marginBottom: 16 },
  restoredText: { fontSize: 13, lineHeight: 19 },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  secondaryButton: { flex: 1 },
  primaryButton: { flex: 1.4 },
});
