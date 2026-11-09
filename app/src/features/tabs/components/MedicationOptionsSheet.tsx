import { useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { BottomSheet } from '../../../shared/ui';
import { dosageOnDay } from '../../../shared/services/dose-schedule';
import type { MedicationData } from '../services/medications.service';
import { changedByNote } from '../utils/audit';
import { formatQuantity, isLowStock, scheduleLabel, stockDaysLeft, stockUnitLabel } from '../utils/medication-form';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

type MedicationOptionsSheetProps = {
  theme: AppTheme;
  medication: MedicationData | null;
  isToggling: boolean;
  canToggle: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onToggleActive: (medication: MedicationData) => void;
  onEdit: (medication: MedicationData) => void;
  onDelete: (medication: MedicationData) => void;
};

/**
 * Detalle y acciones de un medicamento. Lo secundario (notas, existencias,
 * quién lo cambió, pausar, eliminar) vive aquí para que la tarjeta muestre
 * solo lo que importa hoy.
 */
export function MedicationOptionsSheet({
  theme,
  medication,
  isToggling,
  canToggle,
  canEdit,
  canDelete,
  onClose,
  onToggleActive,
  onEdit,
  onDelete,
}: Readonly<MedicationOptionsSheetProps>) {
  // Conserva el contenido mientras el panel se cierra.
  const last = useRef(medication);
  if (medication) last.current = medication;
  const med = medication ?? last.current;

  if (!med) return null;

  const dosageToday = med.dosageSteps?.length ? dosageOnDay(med, new Date()) : med.dosage;
  const stockTracked = med.stockQuantity != null;
  const lowStock = isLowStock(med);
  const daysLeft = stockTracked ? stockDaysLeft(med) : null;
  const audit = changedByNote(med, { masculine: true });

  // Abrir otra hoja encima de esta da problemas en Android: primero se cierra.
  const thenClose = (action: (m: MedicationData) => void) => () => {
    onClose();
    setTimeout(() => action(med), 220);
  };

  let stockText: string | null = null;
  if (stockTracked) {
    const left = med.stockQuantity!;
    stockText = left <= 0
      ? 'Se acabó: actualiza las existencias'
      : `Quedan ${formatQuantity(left)} ${stockUnitLabel(med.dosage, left)}${daysLeft !== null ? ` · unos ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}` : ''}`;
  }

  return (
    <BottomSheet
      theme={theme}
      visible={Boolean(medication)}
      onClose={onClose}
      title={med.name}
      subtitle={
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          {dosageToday} · {scheduleLabel(med)}
        </Text>
      }
    >
      <View style={styles.body}>
        {stockText || med.notes || audit ? (
          <View style={[styles.info, { backgroundColor: `${theme.colors.textMuted}0D` }]}>
            {stockText ? (
              <InfoLine
                theme={theme}
                icon={lowStock ? 'alert-outline' : 'package-variant-closed'}
                text={stockText}
                color={lowStock ? theme.colors.warningText : undefined}
              />
            ) : null}
            {med.notes ? <InfoLine theme={theme} icon="note-text-outline" text={med.notes} /> : null}
            {audit ? <InfoLine theme={theme} icon="account-edit-outline" text={audit} /> : null}
          </View>
        ) : null}

        {canEdit ? (
          <OptionRow theme={theme} icon="pencil-outline" label="Editar medicamento" hint="Horario, dosis y existencias" onPress={thenClose(onEdit)} />
        ) : null}

        {canToggle ? (
          <Pressable
            onPress={() => onToggleActive(med)}
            disabled={isToggling}
            accessibilityRole="switch"
            accessibilityState={{ checked: med.active, disabled: isToggling }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={[styles.rowIcon, { backgroundColor: `${theme.colors.accentPrimary}14` }]}>
              <MaterialCommunityIcons name={med.active ? 'bell-ring-outline' : 'bell-sleep-outline'} size={20} color={theme.colors.accentPrimaryText} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.colors.textPrimary }]}>Recordatorios</Text>
              <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>
                {med.active ? 'Activo: suenan las alarmas' : 'Pausado: no sonará ninguna alarma'}
              </Text>
            </View>
            <Switch
              value={med.active}
              disabled={isToggling}
              onValueChange={() => onToggleActive(med)}
              trackColor={{ false: theme.colors.surfaceBorder, true: `${theme.colors.accentPrimary}60` }}
              thumbColor={med.active ? theme.colors.accentPrimary : theme.colors.textMuted}
              ios_backgroundColor={theme.colors.surfaceBorder}
              importantForAccessibility="no-hide-descendants"
            />
          </Pressable>
        ) : null}

        {canDelete ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.colors.surfaceBorder }]} />
            <OptionRow theme={theme} icon="trash-can-outline" label="Eliminar medicamento" destructive onPress={thenClose(onDelete)} />
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function InfoLine({ theme, icon, text, color }: Readonly<{ theme: AppTheme; icon: IconName; text: string; color?: string }>) {
  return (
    <View style={styles.infoLine}>
      <MaterialCommunityIcons name={icon} size={16} color={color ?? theme.colors.textMuted} />
      <Text style={[styles.infoText, { color: color ?? theme.colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function OptionRow({
  theme,
  icon,
  label,
  hint,
  destructive = false,
  onPress,
}: Readonly<{ theme: AppTheme; icon: IconName; label: string; hint?: string; destructive?: boolean; onPress: () => void }>) {
  const tint = destructive ? theme.colors.warningText : theme.colors.accentPrimaryText;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.rowIcon, { backgroundColor: `${tint}14` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={tint} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: destructive ? tint : theme.colors.textPrimary }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>{hint}</Text> : null}
      </View>
      {destructive ? null : <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, marginTop: 4 },
  body: { gap: 4 },
  info: { borderRadius: 12, padding: 12, gap: 8, marginBottom: 8 },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 },
  pressed: { opacity: 0.6 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  rowHint: { fontSize: 13, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
