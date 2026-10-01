import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type TextInput,
} from "react-native";

import type { AppTheme } from "../../../shared/theme";
import {
  AppButton,
  BackgroundDecor,
  BrandLogo,
  MOTION,
  useKeyboardInset,
  useReducedMotion,
} from "../../../shared/ui";
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
  validateMedicalInfo,
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
/** Ancho máximo del contenido en tablets y pantallas grandes. */
const CONTENT_MAX_WIDTH = 560;
/** Por debajo de esta altura la cabecera se compacta (móviles pequeños). */
const SHORT_SCREEN_HEIGHT = 700;
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
  const { width, height } = useWindowDimensions();
  const { keyboardVisible, bottomInset } = useKeyboardInset();

  const [form, setForm] = useState<RegisterWizardPayload>(createInitialForm);
  const [stepIndex, setStepIndex] = useState(0);
  const [touched, setTouched] = useState<Partial<Record<PersonalField, boolean>>>({});
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [showMedicalErrors, setShowMedicalErrors] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailStatusMessage, setEmailStatusMessage] = useState<string | null>(null);
  const [isBirthDateOpen, setIsBirthDateOpen] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const inputRefs = useRef<Partial<Record<PersonalField, TextInput | null>>>({});
  // Regiones (y, alto) dentro del contenido del ScrollView, para mostrar lo
  // enfocado cuando el teclado reduce el área visible.
  const regions = useRef<Record<string, { y: number; height: number }>>({});
  const viewportHeight = useRef(0);
  /** Posición del contenedor del paso dentro del contenido del ScrollView. */
  const stepOffsetY = useRef(0);
  const checkedEmailRef = useRef<{ email: string; available: boolean } | null>(null);
  const continueAfterBirthDate = useRef(false);
  const focusedRegion = useRef<{ key: string; align: "top" | "bottom" } | null>(null);

  const stepAnim = useRef(new Animated.Value(1)).current;
  const stepDirection = useRef(1);
  const progressAnim = useRef(new Animated.Value(0)).current;

  const personalErrors = validatePersonalData(form.personalData);
  const medicalErrors = validateMedicalInfo(form.medicalInfo);
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
    focusedRegion.current = null;
    regions.current = {};
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

  /**
   * "top": deja la región arriba (campos). "bottom": asegura que se vea su
   * final (tarjetas altas cuyo campo de texto está abajo).
   */
  const revealRegion = (key: string, align: "top" | "bottom" = "top") => {
    const region = regions.current[key];
    if (!region) return;
    const top = stepOffsetY.current + region.y;
    const y = align === "top" ? top - 16 : top + region.height - viewportHeight.current + 16;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: !reducedMotion });
  };

  const trackFocus = (key: string, align: "top" | "bottom" = "top") => {
    focusedRegion.current = { key, align };
    revealRegion(key, align);
  };

  const scrollToField = (field: PersonalField) => revealRegion(field);

  const registerRegion = (key: string) => (event: LayoutChangeEvent) => {
    const { y, height: regionHeight } = event.nativeEvent.layout;
    regions.current[key] = { y, height: regionHeight };
  };

  const focusField = (field: PersonalField) => {
    scrollToField(field);
    if (field === "birthDate") {
      setIsBirthDateOpen(true);
      return;
    }
    setTimeout(() => inputRefs.current[field]?.focus(), 250);
  };

  const handleBlur = (field: PersonalField) => {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
    if (focusedRegion.current?.key === field) focusedRegion.current = null;
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

    if (stepIndex === 1 || stepIndex === LAST_STEP) {
      if (Object.keys(medicalErrors).length) {
        setShowMedicalErrors(true);
        if (stepIndex !== 1) goToStep(1);
        else if (medicalErrors.conditions) scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion });
        else scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
        return;
      }
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
            onFieldLayout={registerRegion}
            onSubmitField={handleSubmitField}
            onOpenBirthDate={() => setIsBirthDateOpen(true)}
            onOpenCountry={() => setIsCountryOpen(true)}
            onFocusField={(field) => trackFocus(field)}
          />
        );
      case "medical":
        return (
          <MedicalStep
            theme={theme}
            data={form.medicalInfo}
            errors={showMedicalErrors ? medicalErrors : {}}
            onChange={updateMedical}
            onSectionLayout={registerRegion}
            onCustomInputFocus={(section) => trackFocus(section, "bottom")}
          />
        );
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

  const isShortScreen = height < SHORT_SCREEN_HEIGHT;
  // Con el teclado abierto se oculta la cabecera para dejar sitio al formulario.
  const showHeader = !keyboardVisible;
  const horizontalPadding = width < 360 ? 12 : 16;

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.colors.background,
          paddingHorizontal: horizontalPadding,
          // Separación de la barra de navegación y espacio para el teclado.
          paddingBottom: 12 + bottomInset,
        },
      ]}
    >
      <BackgroundDecor theme={theme} />

      <View style={styles.content}>
        {showHeader ? (
          <View style={[styles.header, isShortScreen ? styles.headerCompact : null]}>
            {isShortScreen ? null : <BrandLogo theme={theme} size={48} showName={false} />}
            <View style={styles.flex}>
              <Text
                style={[styles.title, isShortScreen ? styles.titleCompact : null, { color: theme.colors.textPrimary }]}
                accessibilityRole="header"
                maxFontSizeMultiplier={1.3}
              >
                Crea tu cuenta
              </Text>
              <Text
                style={[styles.subtitle, { color: theme.colors.textMuted }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                Paso {stepIndex + 1} de {REGISTER_STEPS.length} · {step.title}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={styles.progress}
          accessibilityRole="progressbar"
          accessibilityLabel={`Paso ${stepIndex + 1} de ${REGISTER_STEPS.length}: ${step.title}`}
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
            contentContainerStyle={[styles.scrollContent, isShortScreen ? styles.scrollContentCompact : null]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            showsVerticalScrollIndicator={false}
            onLayout={(event) => {
              viewportHeight.current = event.nativeEvent.layout.height;
              // El teclado cambió el alto visible: volver a mostrar lo enfocado.
              const focused = focusedRegion.current;
              if (focused) revealRegion(focused.key, focused.align);
            }}
          >
            {restoredDraft && stepIndex === 0 ? (
              <View style={[styles.restoredBanner, { backgroundColor: `${theme.colors.accentSecondary}14` }]}>
                <Text style={[styles.restoredText, { color: theme.colors.textSecondary }]}>
                  Recuperamos tu progreso. Por seguridad, vuelve a escribir tu contraseña.
                </Text>
              </View>
            ) : null}

            <Animated.View
              onLayout={(event) => {
                stepOffsetY.current = event.nativeEvent.layout.y;
              }}
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

          <View style={[styles.footer, { borderTopColor: theme.colors.surfaceBorder }]}>
            <View style={styles.footerRow}>
              {stepIndex > 0 ? (
                <AppButton
                  theme={theme}
                  variant="secondary"
                  label="Paso anterior"
                  icon="chevron-back"
                  iconOnly
                  onPress={handleBack}
                  disabled={isSubmitting}
                />
              ) : null}
              <AppButton
                theme={theme}
                label={primaryLabel}
                icon={stepIndex === LAST_STEP ? "checkmark" : "chevron-forward"}
                onPress={() => void handleNext()}
                loading={isSubmitting || (stepIndex === 0 && isChecking)}
                style={styles.flex}
              />
            </View>
            {stepIndex === 0 && !keyboardVisible ? (
              <Pressable
                onPress={onNavigateToLogin}
                disabled={isSubmitting}
                hitSlop={8}
                accessibilityRole="link"
                accessibilityLabel="Ya tengo cuenta, iniciar sesión"
                style={styles.loginLink}
              >
                <Text style={[styles.loginLinkText, { color: theme.colors.textMuted }]} maxFontSizeMultiplier={1.4}>
                  ¿Ya tienes cuenta?{" "}
                  <Text style={{ color: theme.colors.accentSecondary, fontWeight: "800" }}>Inicia sesión</Text>
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

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
  screen: { flex: 1, paddingTop: 12 },
  flex: { flex: 1 },
  content: { flex: 1, width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4, marginBottom: 14 },
  headerCompact: { marginBottom: 10 },
  title: { fontSize: 26, fontWeight: "800" },
  titleCompact: { fontSize: 22 },
  subtitle: { fontSize: 14, marginTop: 2, fontWeight: "600" },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 4, marginBottom: 12 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { flex: 1, borderRadius: 3, transformOrigin: "left" },
  card: { flex: 1, borderWidth: 1, borderRadius: 24, overflow: "hidden" },
  scrollContent: { padding: 18, paddingBottom: 24 },
  scrollContentCompact: { padding: 14, paddingBottom: 20 },
  restoredBanner: { borderRadius: 14, padding: 12, marginBottom: 16 },
  restoredText: { fontSize: 13, lineHeight: 19 },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerRow: { flexDirection: "row", gap: 10 },
  loginLink: { alignSelf: "center", minHeight: 36, justifyContent: "center", paddingHorizontal: 8 },
  loginLinkText: { fontSize: 14, textAlign: "center" },
});
