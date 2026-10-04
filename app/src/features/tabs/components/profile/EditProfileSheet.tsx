import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { AppButton, ERROR_COLOR, FieldShell, FormSheet, PressableScale, TextField, useFieldColors } from '../../../../shared/ui';
import { MedicalInfoEditor, type MedicalInfo } from '../../../auth';
import { updateProfileOnBackend, type ProfileUser } from '../../../auth/services/auth.service';
import { CountryPickerSheet } from '../../../auth/components/register/CountryPickerSheet';
import { countryFlag, getPhoneCountry, normalizeNationalPhone, parsePhone, toE164 } from '../../../auth/utils/register.utils';

/** `phone`: número nacional (sin código ni 0 inicial); el país va aparte. */
type Form = { fullName: string; birthDate: Date | null; phoneCountryIso: string; phone: string } & MedicalInfo;
type Errors = Partial<Record<'fullName' | 'phone', string>>;

const NAME_MAX = 80;
const MIN_BIRTH = new Date(1900, 0, 1);

const parseBirthDate = (value?: string | null) => {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};
const toKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const formFrom = (user: Partial<ProfileUser>): Form => {
  const { country, national } = parsePhone(user.phone);
  return {
  fullName: user.fullName ?? '',
  birthDate: parseBirthDate(user.birthDate),
  phoneCountryIso: country.iso,
  phone: normalizeNationalPhone(national, country),
  conditions: user.conditions ?? '',
  allergies: user.allergies ?? '',
  pregnancy: Boolean(user.pregnancy),
  lactation: Boolean(user.lactation),
  recentSurgeries: Boolean(user.recentSurgeries),
  immunosuppression: Boolean(user.immunosuppression),
  anticoagulantTreatment: Boolean(user.anticoagulantTreatment),
  };
};

function validate(form: Form): Errors {
  const errors: Errors = {};
  if (form.fullName.trim().length < 2) errors.fullName = 'Escribe tu nombre.';
  const country = getPhoneCountry(form.phoneCountryIso);
  if (form.phone && form.phone.length !== country.digits) {
    errors.phone = `En ${country.name} el número tiene ${country.digits} dígitos.`;
  }
  return errors;
}

const sameForm = (a: Form, b: Form) =>
  JSON.stringify({ ...a, birthDate: a.birthDate ? toKey(a.birthDate) : null })
  === JSON.stringify({ ...b, birthDate: b.birthDate ? toKey(b.birthDate) : null });

/** Datos personales y de salud de la cuenta. */
export function EditProfileSheet({
  theme,
  visible,
  profile,
  onClose,
  onSaved,
}: Readonly<{
  theme: AppTheme;
  visible: boolean;
  profile: Partial<ProfileUser>;
  onClose: () => void;
  onSaved: (user: ProfileUser | null, payload: Partial<ProfileUser>) => void;
}>) {
  const [initial, setInitial] = useState<Form>(() => formFrom(profile));
  const [form, setForm] = useState<Form>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [iosPicker, setIosPicker] = useState(false);
  const [countryVisible, setCountryVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const next = formFrom(profile);
    setInitial(next);
    setForm(next);
    setShowErrors(false);
    setIosPicker(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));
  const errors = showErrors ? validate(form) : {};
  const dateColors = useFieldColors(theme, iosPicker, false);
  const phoneColors = useFieldColors(theme, false, Boolean(errors.phone));
  const country = getPhoneCountry(form.phoneCountryIso);

  const requestClose = () => {
    if (saving) return;
    if (sameForm(form, initial)) {
      onClose();
      return;
    }
    Alert.alert('¿Descartar los cambios?', 'Lo que modificaste no se guardará.', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: onClose },
    ]);
  };

  const openDatePicker = () => {
    const value = form.birthDate ?? new Date(1990, 0, 1);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        minimumDate: MIN_BIRTH,
        maximumDate: new Date(),
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) update({ birthDate: selected });
        },
      });
    } else {
      if (!form.birthDate) update({ birthDate: value });
      setIosPicker((current) => !current);
    }
  };

  const save = async () => {
    setShowErrors(true);
    if (Object.keys(validate(form)).length) return;
    if (sameForm(form, initial)) {
      onClose();
      return;
    }
    const payload = {
      fullName: form.fullName.trim(),
      birthDate: form.birthDate ? toKey(form.birthDate) : '',
      phone: toE164(form.phone, country) ?? '',
      conditions: form.conditions.trim(),
      allergies: form.allergies.trim(),
      pregnancy: form.pregnancy,
      lactation: form.lactation,
      recentSurgeries: form.recentSurgeries,
      immunosuppression: form.immunosuppression,
      anticoagulantTreatment: form.anticoagulantTreatment,
    };
    setSaving(true);
    try {
      const response = await updateProfileOnBackend(payload);
      onSaved(response.user ?? null, payload);
      onClose();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo en unos minutos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title="Datos personales"
      subtitle="Ayudan a tus cuidadores y al asistente a darte información segura."
      onClose={requestClose}
      dismissDisabled={saving}
      footer={
        <>
          <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={requestClose} disabled={saving} style={styles.flex} />
          <AppButton theme={theme} label="Guardar" icon="checkmark" onPress={() => void save()} loading={saving} style={styles.flexWide} />
        </>
      }
    >
      <TextField
        theme={theme}
        label="Nombre completo"
        value={form.fullName}
        error={errors.fullName}
        onChangeText={(fullName) => update({ fullName })}
        placeholder="Tu nombre y apellido"
        maxLength={NAME_MAX}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
      />

      <FieldShell theme={theme} label="Fecha de nacimiento" optional>
        <PressableScale
          pressedScale={0.98}
          onPress={openDatePicker}
          accessibilityRole="button"
          accessibilityLabel={form.birthDate ? `Fecha de nacimiento: ${form.birthDate.toLocaleDateString('es-ES')}. Toca para cambiar.` : 'Elegir fecha de nacimiento'}
          style={[styles.selector, dateColors]}
        >
          <Ionicons name="calendar-outline" size={20} color={theme.colors.accentSecondary} />
          <Text style={[styles.selectorText, { color: form.birthDate ? theme.colors.textPrimary : theme.colors.inputPlaceholder }]}>
            {form.birthDate ? form.birthDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Elegir fecha'}
          </Text>
          {form.birthDate ? (
            <PressableScale onPress={() => update({ birthDate: null })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Quitar fecha de nacimiento">
              <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
            </PressableScale>
          ) : (
            <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
          )}
        </PressableScale>
        {Platform.OS === 'ios' && iosPicker ? (
          <DateTimePicker
            value={form.birthDate ?? new Date(1990, 0, 1)}
            mode="date"
            display="spinner"
            minimumDate={MIN_BIRTH}
            maximumDate={new Date()}
            locale="es-ES"
            themeVariant={theme.mode}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (selected) update({ birthDate: selected });
            }}
          />
        ) : null}
      </FieldShell>

      <FieldShell
        theme={theme}
        label="Teléfono"
        optional
        error={errors.phone}
        helper={`${country.digits} dígitos, sin el 0 inicial. Para que tus cuidadores puedan contactarte.`}
      >
        <View style={styles.phoneRow}>
          <PressableScale
            pressedScale={0.97}
            onPress={() => setCountryVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`Código de país ${country.name} ${country.code}. Toca para cambiar.`}
            style={[styles.countryButton, phoneColors]}
          >
            <Text style={styles.flag}>{countryFlag(country.iso)}</Text>
            <Text style={[styles.countryCode, { color: theme.colors.textPrimary }]}>{country.code}</Text>
            <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
          </PressableScale>
          <View style={styles.flex}>
            <TextField
              theme={theme}
              label=""
              value={form.phone}
              invalid={Boolean(errors.phone)}
              onChangeText={(phone) => update({ phone: normalizeNationalPhone(phone, country) })}
              placeholder={country.example}
              maxLength={country.digits}
              keyboardType="phone-pad"
              autoComplete="tel-national"
              textContentType="telephoneNumber"
              accessibilityLabel="Número de teléfono"
            />
          </View>
        </View>
      </FieldShell>

      <View style={[styles.divider, { backgroundColor: theme.colors.surfaceBorder }]} />
      <Text style={[styles.section, { color: theme.colors.textPrimary }]}>Información de salud</Text>
      <MedicalInfoEditor
        theme={theme}
        value={form}
        onChange={(medical) => update(medical)}
      />

      <CountryPickerSheet
        theme={theme}
        visible={countryVisible}
        selectedIso={form.phoneCountryIso}
        onClose={() => setCountryVisible(false)}
        onSelect={(iso) => {
          update({ phoneCountryIso: iso, phone: normalizeNationalPhone(form.phone, getPhoneCountry(iso)) });
          setCountryVisible(false);
        }}
      />

      {showErrors && Object.keys(validate(form)).length ? (
        <Text style={[styles.formError, { color: ERROR_COLOR }]} accessibilityLiveRegion="polite">Revisa los campos marcados.</Text>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  phoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  countryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12 },
  flag: { fontSize: 20 },
  countryCode: { fontSize: 16, fontWeight: '700' },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
  selectorText: { flex: 1, fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  section: { fontSize: 16, fontWeight: '900' },
  formError: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
