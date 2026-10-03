import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Switch, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { ALLERGY_GROUPS, HEALTH_CONDITIONS, SPECIAL_CONDITIONS } from '../config/register.constants';
import type { MedicalSelection, SpecialConditionKey } from '../models/register.types';
import { parseMedicalSelection, serializeMedicalSelection } from '../utils/register.utils';
import { MedicalMultiSelect } from './register/MedicalMultiSelect';

/** Información médica tal como la guarda el backend (texto + indicadores). */
export type MedicalInfo = {
  conditions: string;
  allergies: string;
} & Record<SpecialConditionKey, boolean>;

export const EMPTY_MEDICAL_INFO: MedicalInfo = {
  conditions: '',
  allergies: '',
  pregnancy: false,
  lactation: false,
  recentSurgeries: false,
  immunosuppression: false,
  anticoagulantTreatment: false,
};

/**
 * Condiciones, alergias y situaciones especiales con los mismos controles que
 * el registro. Se usa en el perfil propio y en los perfiles a cargo, para que
 * la información médica se pida y se vea igual en toda la app.
 */
export function MedicalInfoEditor({
  theme,
  value,
  onChange,
  subject = 'self',
}: Readonly<{
  theme: AppTheme;
  value: MedicalInfo;
  onChange: (value: MedicalInfo) => void;
  /** 'other': los textos hablan de "esta persona" en vez de "tú". */
  subject?: 'self' | 'other';
}>) {
  const self = subject === 'self';
  const toText = (selection: MedicalSelection) => serializeMedicalSelection(selection) ?? '';

  return (
    <View style={styles.stack}>
      <MedicalMultiSelect
        theme={theme}
        title="Condiciones de salud"
        description={self ? 'Enfermedades que te hayan diagnosticado.' : 'Enfermedades que le hayan diagnosticado.'}
        icon="medkit-outline"
        noneLabel="Ninguna"
        groups={[{ items: HEALTH_CONDITIONS }]}
        customPlaceholder="Agregar otra condición"
        value={parseMedicalSelection(value.conditions)}
        onChange={(selection) => onChange({ ...value, conditions: toText(selection) })}
      />
      <MedicalMultiSelect
        theme={theme}
        title="Alergias"
        description="Sobre todo a medicamentos."
        icon="alert-circle-outline"
        noneLabel="Ninguna conocida"
        groups={ALLERGY_GROUPS}
        customPlaceholder="Agregar otra alergia"
        value={parseMedicalSelection(value.allergies)}
        onChange={(selection) => onChange({ ...value, allergies: toText(selection) })}
      />

      <View style={styles.special}>
        <Text style={[styles.specialTitle, { color: theme.colors.textPrimary }]}>Situaciones especiales</Text>
        <Text style={[styles.specialHint, { color: theme.colors.textMuted }]}>
          {self ? 'Marca solo las que te apliquen ahora.' : 'Marca solo las que le apliquen ahora.'}
        </Text>
        {SPECIAL_CONDITIONS.map((item) => (
          <View key={item.key} style={[styles.row, { borderColor: theme.colors.surfaceBorder }]}>
            <Ionicons name={item.icon} size={20} color={value[item.key] ? theme.colors.accentPrimary : theme.colors.textMuted} />
            <View style={styles.flex}>
              <Text style={[styles.rowLabel, { color: theme.colors.textPrimary }]}>{item.label}</Text>
              <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>{item.description}</Text>
            </View>
            <Switch
              value={value[item.key]}
              onValueChange={(next) => onChange({ ...value, [item.key]: next })}
              trackColor={{ false: theme.colors.surfaceBorder, true: `${theme.colors.accentPrimary}60` }}
              thumbColor={value[item.key] ? theme.colors.accentPrimary : theme.colors.textMuted}
              ios_backgroundColor={theme.colors.surfaceBorder}
              accessibilityLabel={item.label}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 22 },
  special: { gap: 8 },
  specialTitle: { fontSize: 15, fontWeight: '800' },
  specialHint: { fontSize: 12.5, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 14.5, fontWeight: '700' },
  rowHint: { fontSize: 12, lineHeight: 16, marginTop: 1 },
});
