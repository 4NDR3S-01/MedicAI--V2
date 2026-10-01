import type { ReactNode, RefObject } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";

import { PRIVACY_POLICY_URL } from "../../../../shared/config/links";
import type { AppTheme } from "../../../../shared/theme";
import { PressableScale } from "../../../../shared/ui";
import {
  ALLERGY_GROUPS,
  FULL_NAME_MAX_LENGTH,
  HEALTH_CONDITIONS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SPECIAL_CONDITIONS,
} from "../../config/register.constants";
import type {
  MedicalSelection,
  RegisterWizardPayload,
  SpecialConditionKey,
} from "../../models/register.types";
import {
  calculateAgeFromBirthDate,
  countryFlag,
  formatBirthDateLong,
  getPhoneCountry,
} from "../../utils/register.utils";
import type {
  MedicalErrors,
  PersonalErrors,
  PersonalField,
} from "../../utils/register.validation";
import { FieldShell, TextField, useFieldColors } from "./FormField";
import { MedicalMultiSelect } from "./MedicalMultiSelect";

export type EmailStatus = "idle" | "checking" | "available" | "taken" | "error";

type PersonalData = RegisterWizardPayload["personalData"];
type MedicalInfo = RegisterWizardPayload["medicalInfo"];

// ─── Paso 1: datos personales ─────────────────────────────────────────────

type PersonalStepProps = {
  theme: AppTheme;
  data: PersonalData;
  errors: PersonalErrors;
  emailStatus: EmailStatus;
  emailStatusMessage: string | null;
  inputRefs: RefObject<Partial<Record<PersonalField, TextInput | null>>>;
  onChange: (patch: Partial<PersonalData>) => void;
  onBlurField: (field: PersonalField) => void;
  onFieldLayout: (field: PersonalField) => (event: LayoutChangeEvent) => void;
  onSubmitField: (field: PersonalField) => void;
  onOpenBirthDate: () => void;
  onOpenCountry: () => void;
  onFocusField: (field: PersonalField) => void;
};

export function PersonalStep({
  theme,
  data,
  errors,
  emailStatus,
  emailStatusMessage,
  inputRefs,
  onChange,
  onBlurField,
  onFieldLayout,
  onSubmitField,
  onOpenBirthDate,
  onOpenCountry,
  onFocusField,
}: Readonly<PersonalStepProps>) {
  const country = getPhoneCountry(data.phoneCountryIso);
  const age = calculateAgeFromBirthDate(data.birthDate);
  const birthDateColors = useFieldColors(theme, false, Boolean(errors.birthDate));
  const phoneColors = useFieldColors(theme, false, Boolean(errors.phone));
  const setRef = (field: PersonalField) => (ref: TextInput | null) => {
    inputRefs.current[field] = ref;
  };

  let emailTrailing: ReactNode = null;
  if (emailStatus === "checking") {
    emailTrailing = <ActivityIndicator style={styles.trailingIcon} size="small" color={theme.colors.textMuted} />;
  } else if (emailStatus === "available" && !errors.email) {
    emailTrailing = (
      <Ionicons
        style={styles.trailingIcon}
        name="checkmark-circle"
        size={20}
        color={theme.colors.success}
        accessibilityLabel="Correo disponible"
      />
    );
  }
  const passwordLongEnough = data.password.length >= PASSWORD_MIN_LENGTH;

  return (
    <View style={styles.stack}>
      <TextField
        theme={theme}
        label="Nombre completo"
        value={data.fullName}
        error={errors.fullName}
        inputRef={setRef("fullName")}
        onLayout={onFieldLayout("fullName")}
        onChangeText={(fullName) => onChange({ fullName })}
        onFocus={() => onFocusField("fullName")}
        onBlur={() => onBlurField("fullName")}
        onSubmitEditing={() => onSubmitField("fullName")}
        placeholder="Nombre y apellido"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={FULL_NAME_MAX_LENGTH}
        returnKeyType="next"
        submitBehavior="submit"
      />

      <FieldShell
        theme={theme}
        label="Fecha de nacimiento"
        error={errors.birthDate}
        helper={age !== null && !errors.birthDate ? `Tienes ${age} años.` : undefined}
        onLayout={onFieldLayout("birthDate")}
      >
        <PressableScale
          pressedScale={0.98}
          onPress={onOpenBirthDate}
          accessibilityRole="button"
          accessibilityLabel={
            data.birthDate
              ? `Fecha de nacimiento, ${formatBirthDateLong(data.birthDate)}. Toca para cambiar.`
              : "Seleccionar fecha de nacimiento"
          }
          style={[styles.selector, birthDateColors]}
        >
          <Ionicons name="calendar-outline" size={20} color={theme.colors.accentSecondary} />
          <Text
            style={[
              styles.selectorText,
              { color: data.birthDate ? theme.colors.textPrimary : theme.colors.inputPlaceholder },
            ]}
          >
            {data.birthDate ? formatBirthDateLong(data.birthDate) : "Seleccionar fecha"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
        </PressableScale>
      </FieldShell>

      <FieldShell
        theme={theme}
        label="Teléfono"
        optional
        error={errors.phone}
        helper={`${country.digits} dígitos, sin el 0 inicial.`}
        onLayout={onFieldLayout("phone")}
      >
        <View style={styles.phoneRow}>
          <PressableScale
            pressedScale={0.97}
            onPress={onOpenCountry}
            accessibilityRole="button"
            accessibilityLabel={`Código de país ${country.name} ${country.code}. Toca para cambiar.`}
            style={[styles.countryButton, phoneColors]}
          >
            <Text style={styles.flag}>{countryFlag(country.iso)}</Text>
            <Text style={[styles.countryCode, { color: theme.colors.textPrimary }]}>{country.code}</Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
          </PressableScale>
          <View style={styles.flex}>
            <PhoneInput
              theme={theme}
              value={data.phone}
              placeholder={country.example}
              maxLength={country.digits}
              hasError={Boolean(errors.phone)}
              inputRef={setRef("phone")}
              onChangeText={(phone) => onChange({ phone })}
              onFocus={() => onFocusField("phone")}
              onBlur={() => onBlurField("phone")}
              onSubmitEditing={() => onSubmitField("phone")}
            />
          </View>
        </View>
      </FieldShell>

      <TextField
        theme={theme}
        label="Correo electrónico"
        value={data.email}
        error={errors.email ?? (emailStatus === "taken" || emailStatus === "error" ? emailStatusMessage : null)}
        inputRef={setRef("email")}
        onLayout={onFieldLayout("email")}
        onChangeText={(email) => onChange({ email: email.trim() })}
        onFocus={() => onFocusField("email")}
        onBlur={() => onBlurField("email")}
        onSubmitEditing={() => onSubmitField("email")}
        placeholder="tu@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        trailing={emailTrailing}
      />

      <TextField
        theme={theme}
        label="Contraseña"
        value={data.password}
        error={errors.password}
        helper={
          <Text
            style={[
              styles.passwordRule,
              passwordLongEnough
                ? { color: theme.colors.success, fontWeight: "700" }
                : { color: theme.colors.textMuted },
            ]}
            accessibilityLiveRegion="polite"
          >
            Mínimo {PASSWORD_MIN_LENGTH} caracteres.
          </Text>
        }
        inputRef={setRef("password")}
        onLayout={onFieldLayout("password")}
        onChangeText={(password) => onChange({ password })}
        onFocus={() => onFocusField("password")}
        onBlur={() => onBlurField("password")}
        onSubmitEditing={() => onSubmitField("password")}
        placeholder="Crea una contraseña"
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={PASSWORD_MAX_LENGTH}
        returnKeyType="next"
        submitBehavior="submit"
      />

      <TextField
        theme={theme}
        label="Confirmar contraseña"
        value={data.confirmPassword}
        error={errors.confirmPassword}
        inputRef={setRef("confirmPassword")}
        onLayout={onFieldLayout("confirmPassword")}
        onChangeText={(confirmPassword) => onChange({ confirmPassword })}
        onFocus={() => onFocusField("confirmPassword")}
        onBlur={() => onBlurField("confirmPassword")}
        onSubmitEditing={() => onSubmitField("confirmPassword")}
        placeholder="Repite tu contraseña"
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        maxLength={PASSWORD_MAX_LENGTH}
        returnKeyType="done"
      />
    </View>
  );
}

type PhoneInputProps = {
  theme: AppTheme;
  value: string;
  placeholder: string;
  maxLength: number;
  hasError: boolean;
  inputRef: (ref: TextInput | null) => void;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmitEditing: () => void;
};

function PhoneInput({ theme, hasError, inputRef, onFocus, onBlur, ...props }: Readonly<PhoneInputProps>) {
  return (
    <TextField
      theme={theme}
      label=""
      {...props}
      inputRef={inputRef}
      invalid={hasError}
      onFocus={onFocus}
      onBlur={onBlur}
      keyboardType="phone-pad"
      autoComplete="tel-national"
      textContentType="telephoneNumber"
      accessibilityLabel="Número de teléfono"
      returnKeyType="next"
      submitBehavior="submit"
    />
  );
}

// ─── Paso 2: salud y alergias ──────────────────────────────────────────────

type MedicalStepProps = {
  theme: AppTheme;
  data: MedicalInfo;
  errors: MedicalErrors;
  onChange: (patch: Partial<MedicalInfo>) => void;
  onSectionLayout: (section: "conditions" | "allergies") => (event: LayoutChangeEvent) => void;
  onCustomInputFocus: (section: "conditions" | "allergies") => void;
};

export function MedicalStep({
  theme,
  data,
  errors,
  onChange,
  onSectionLayout,
  onCustomInputFocus,
}: Readonly<MedicalStepProps>) {
  return (
    <View style={styles.stack}>
      <InfoNote
        theme={theme}
        icon="lock-closed-outline"
        text="Solo lo ves tú. Nos ayuda a advertirte sobre medicamentos que podrían no convenirte. Si no tienes ninguna, elige «Ninguna»."
      />
      <View onLayout={onSectionLayout("conditions")}>
        <MedicalMultiSelect
          theme={theme}
          onCustomInputFocus={() => onCustomInputFocus("conditions")}
          title="Condiciones de salud"
          description="Enfermedades que te hayan diagnosticado."
          icon="medkit-outline"
          noneLabel="Ninguna"
          groups={[{ items: HEALTH_CONDITIONS }]}
          customPlaceholder="Agregar otra condición"
          error={errors.conditions}
          value={data.conditions}
          onChange={(conditions: MedicalSelection) => onChange({ conditions })}
        />
      </View>
      <View onLayout={onSectionLayout("allergies")}>
        <MedicalMultiSelect
          theme={theme}
          onCustomInputFocus={() => onCustomInputFocus("allergies")}
          title="Alergias"
          description="Sobre todo a medicamentos."
          icon="alert-circle-outline"
          noneLabel="Ninguna conocida"
          groups={ALLERGY_GROUPS}
          customPlaceholder="Agregar otra alergia"
          error={errors.allergies}
          value={data.allergies}
          onChange={(allergies: MedicalSelection) => onChange({ allergies })}
        />
      </View>
    </View>
  );
}

// ─── Paso 3: situaciones especiales ───────────────────────────────────────

type SpecialStepProps = {
  theme: AppTheme;
  data: MedicalInfo;
  onToggle: (key: SpecialConditionKey, value: boolean) => void;
};

export function SpecialStep({ theme, data, onToggle }: Readonly<SpecialStepProps>) {
  return (
    <View style={styles.stack}>
      <InfoNote
        theme={theme}
        icon="information-circle-outline"
        text="Activa solo las que apliquen ahora. Puedes cambiarlas cuando quieras desde tu perfil."
      />
      {SPECIAL_CONDITIONS.map((condition) => {
        const active = data.specialConditions[condition.key];
        return (
          <PressableScale
            key={condition.key}
            pressedScale={0.98}
            onPress={() => onToggle(condition.key, !active)}
            accessibilityRole="switch"
            accessibilityLabel={`${condition.label}. ${condition.description}`}
            accessibilityState={{ checked: active }}
            style={[
              styles.toggleCard,
              {
                backgroundColor: active ? `${theme.colors.accentPrimary}17` : theme.colors.surface,
                borderColor: active ? theme.colors.accentPrimary : theme.colors.surfaceBorder,
              },
            ]}
          >
            <View
              style={[
                styles.toggleIcon,
                { backgroundColor: active ? theme.colors.accentPrimary : `${theme.colors.accentSecondary}1F` },
              ]}
            >
              <Ionicons
                name={condition.icon}
                size={20}
                color={active ? theme.colors.buttonText : theme.colors.accentSecondary}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.toggleTitle, { color: theme.colors.textPrimary }]}>{condition.label}</Text>
              <Text style={[styles.toggleDescription, { color: theme.colors.textMuted }]}>
                {condition.description}
              </Text>
            </View>
            <ThemedSwitch
              theme={theme}
              value={active}
              onValueChange={(value) => onToggle(condition.key, value)}
              hiddenFromAccessibility
            />
          </PressableScale>
        );
      })}
    </View>
  );
}

// ─── Paso 4: resumen ──────────────────────────────────────────────────────

type SummaryStepProps = {
  theme: AppTheme;
  form: RegisterWizardPayload;
  onEditStep: (stepIndex: number) => void;
  onToggleAiConsent: (value: boolean) => void;
};

export function SummaryStep({ theme, form, onEditStep, onToggleAiConsent }: Readonly<SummaryStepProps>) {
  const { personalData: personal, medicalInfo: medical } = form;
  const country = getPhoneCountry(personal.phoneCountryIso);
  const age = calculateAgeFromBirthDate(personal.birthDate);
  const activeSpecial = SPECIAL_CONDITIONS.filter((item) => medical.specialConditions[item.key]);
  const describeSelection = (selection: MedicalSelection, noneText: string) => {
    if (selection.none) return noneText;
    return selection.items.length ? selection.items.join(", ") : "Sin especificar";
  };

  return (
    <View style={styles.stack}>
      <SummaryCard theme={theme} title="Datos personales" icon="person-outline" onEdit={() => onEditStep(0)}>
        <SummaryRow theme={theme} label="Nombre" value={personal.fullName.trim()} />
        <SummaryRow
          theme={theme}
          label="Nacimiento"
          value={`${formatBirthDateLong(personal.birthDate)}${age !== null ? ` · ${age} años` : ""}`}
        />
        <SummaryRow
          theme={theme}
          label="Teléfono"
          value={personal.phone ? `${countryFlag(country.iso)} ${country.code} ${personal.phone}` : "No agregado"}
          muted={!personal.phone}
        />
        <SummaryRow theme={theme} label="Correo" value={personal.email} />
      </SummaryCard>

      <SummaryCard theme={theme} title="Salud y alergias" icon="medkit-outline" onEdit={() => onEditStep(1)}>
        <SummaryRow
          theme={theme}
          label="Condiciones"
          value={describeSelection(medical.conditions, "Ninguna")}
          muted={!medical.conditions.none && !medical.conditions.items.length}
        />
        <SummaryRow
          theme={theme}
          label="Alergias"
          value={describeSelection(medical.allergies, "Ninguna conocida")}
          muted={!medical.allergies.none && !medical.allergies.items.length}
        />
      </SummaryCard>

      <SummaryCard theme={theme} title="Situaciones especiales" icon="shield-checkmark-outline" onEdit={() => onEditStep(2)}>
        <SummaryRow
          theme={theme}
          label="Activas"
          value={activeSpecial.length ? activeSpecial.map((item) => item.label).join(", ") : "Ninguna"}
          muted={!activeSpecial.length}
        />
      </SummaryCard>

      <View
        style={[
          styles.consentCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: medical.aiHealthContextConsent ? theme.colors.accentSecondary : theme.colors.surfaceBorder,
          },
        ]}
      >
        <View style={styles.consentHeader}>
          <View style={[styles.toggleIcon, { backgroundColor: `${theme.colors.accentSecondary}1F` }]}>
            <Ionicons name="sparkles-outline" size={20} color={theme.colors.accentSecondary} />
          </View>
          <Text style={[styles.consentTitle, { color: theme.colors.textPrimary }]}>
            Personalizar el asistente de IA
          </Text>
          <ThemedSwitch
            theme={theme}
            value={medical.aiHealthContextConsent}
            onValueChange={onToggleAiConsent}
            accessibilityLabel="Compartir mi información de salud con el asistente de IA"
          />
        </View>
        <Text style={[styles.consentText, { color: theme.colors.textMuted }]}>
          Si lo activas, al consultar al asistente se incluirán tu edad, condiciones, alergias y
          situaciones especiales (nunca tu nombre, correo ni teléfono) para darte respuestas más seguras.
          Las procesa un proveedor externo de IA. Es opcional y puedes desactivarlo cuando quieras.
        </Text>
        <Text
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          accessibilityRole="link"
          style={[styles.link, { color: theme.colors.accentSecondary }]}
        >
          Leer la política de privacidad
        </Text>
      </View>

      <InfoNote
        theme={theme}
        icon="medical-outline"
        text="MedicAI te ayuda a organizarte, pero no reemplaza la consulta con un profesional de la salud."
      />
    </View>
  );
}

// ─── Piezas compartidas ───────────────────────────────────────────────────

function ThemedSwitch({
  theme,
  value,
  onValueChange,
  accessibilityLabel,
  hiddenFromAccessibility,
}: Readonly<{
  theme: AppTheme;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  /** Cuando la tarjeta contenedora ya actúa como interruptor accesible. */
  hiddenFromAccessibility?: boolean;
}>) {
  return (
    <Switch
      value={value}
      accessibilityElementsHidden={hiddenFromAccessibility}
      importantForAccessibility={hiddenFromAccessibility ? "no-hide-descendants" : "auto"}
      onValueChange={onValueChange}
      accessibilityLabel={accessibilityLabel}
      trackColor={{ false: theme.colors.inputBorder, true: theme.colors.accentPrimary }}
      thumbColor={Platform.OS === "android" ? (value ? "#FFFFFF" : "#F1F5F9") : undefined}
      ios_backgroundColor={theme.colors.inputBorder}
    />
  );
}

function InfoNote({
  theme,
  icon,
  text,
}: Readonly<{ theme: AppTheme; icon: keyof typeof Ionicons.glyphMap; text: string }>) {
  return (
    <View style={[styles.note, { backgroundColor: `${theme.colors.accentSecondary}14` }]}>
      <Ionicons name={icon} size={18} color={theme.colors.accentSecondary} />
      <Text style={[styles.noteText, { color: theme.colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function SummaryCard({
  theme,
  title,
  icon,
  onEdit,
  children,
}: Readonly<{
  theme: AppTheme;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onEdit: () => void;
  children: ReactNode;
}>) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
      <View style={styles.summaryHeader}>
        <Ionicons name={icon} size={18} color={theme.colors.accentSecondary} />
        <Text style={[styles.summaryTitle, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        <PressableScale
          onPress={onEdit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${title.toLowerCase()}`}
          style={styles.editButton}
        >
          <Ionicons name="create-outline" size={16} color={theme.colors.accentSecondary} />
          <Text style={[styles.editText, { color: theme.colors.accentSecondary }]}>Editar</Text>
        </PressableScale>
      </View>
      <View style={styles.summaryRows}>{children}</View>
    </View>
  );
}

function SummaryRow({
  theme,
  label,
  value,
  muted,
}: Readonly<{ theme: AppTheme; label: string; value: string; muted?: boolean }>) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          { color: muted ? theme.colors.textMuted : theme.colors.textPrimary },
          muted ? styles.summaryValueMuted : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 16 },
  trailingIcon: { marginRight: 14 },
  passwordRule: { fontSize: 12.5, lineHeight: 17 },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  selectorText: { flex: 1, fontSize: 16 },
  phoneRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  countryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  flag: { fontSize: 20 },
  countryCode: { fontSize: 16, fontWeight: "700" },
  note: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 14, alignItems: "flex-start" },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19 },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 18,
    padding: 14,
  },
  toggleIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toggleTitle: { fontSize: 15.5, fontWeight: "800" },
  toggleDescription: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  summaryCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryTitle: { flex: 1, fontSize: 15, fontWeight: "800" },
  editButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  editText: { fontSize: 14, fontWeight: "700" },
  summaryRows: { gap: 8 },
  summaryRow: { flexDirection: "row", gap: 12 },
  summaryLabel: { width: 96, fontSize: 13.5 },
  summaryValue: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  summaryValueMuted: { fontStyle: "italic", fontWeight: "500" },
  consentCard: { borderWidth: 1.5, borderRadius: 18, padding: 14, gap: 10 },
  consentHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  consentTitle: { flex: 1, fontSize: 15, fontWeight: "800" },
  consentText: { fontSize: 13, lineHeight: 19 },
  link: { fontSize: 13.5, fontWeight: "700", textDecorationLine: "underline" },
});
