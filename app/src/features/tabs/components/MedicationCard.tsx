import { memo, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LayoutAnimation, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { isTreatmentFinished } from '../../../shared/services/dose-schedule';
import type { MedicationData } from '../services/medications.service';
import type { DoseSlot, DoseState } from '../utils/dose-status';
import { changedByNote } from '../utils/audit';
import { frequencyLabel } from '../utils/medication-form';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const VISIBLE_DOSES = 3;

export const DOSE_STATE_META: Record<DoseState, { label: string; icon: IconName }> = {
  taken: { label: 'Tomada', icon: 'check-circle' },
  skipped: { label: 'Omitida', icon: 'minus-circle-outline' },
  due: { label: 'Es la hora', icon: 'alarm-light' },
  missed: { label: 'Sin registrar', icon: 'alert-circle-outline' },
  upcoming: { label: 'Pendiente', icon: 'clock-outline' },
};

export function doseStateColor(theme: AppTheme, state: DoseState): string {
  switch (state) {
    case 'taken':
      return theme.colors.success;
    case 'due':
    case 'missed':
      return theme.colors.accentTertiary;
    case 'skipped':
      return theme.colors.textMuted;
    case 'upcoming':
    default:
      return theme.colors.accentPrimary;
  }
}

type MedicationCardProps = {
  theme: AppTheme;
  medication: MedicationData;
  slots: DoseSlot[];
  isToggling: boolean;
  onToggleActive: (medication: MedicationData) => void;
  onEdit: (medication: MedicationData) => void;
  onDelete: (medication: MedicationData) => void;
  onDosePress: (medication: MedicationData, slot: DoseSlot) => void;
  /** Permisos al ver los medicamentos de otra persona (por defecto, todos). */
  canToggle?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
};

function MedicationCardBase({
  theme,
  medication,
  slots,
  isToggling,
  onToggleActive,
  onEdit,
  onDelete,
  onDosePress,
  canToggle = true,
  canEdit = true,
  canDelete = true,
}: Readonly<MedicationCardProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const finished = isTreatmentFinished(medication);
  const isActive = medication.active;
  const completedCount = slots.filter((slot) => slot.state === 'taken').length;
  const allCompleted = slots.length > 0 && slots.every((slot) => slot.state === 'taken' || slot.state === 'skipped');
  const visibleSlots = isExpanded ? slots : slots.slice(0, VISIBLE_DOSES);
  const hiddenCount = slots.length - visibleSlots.length;

  let accentColor = theme.colors.accentPrimary;
  let accentBg = `${theme.colors.accentPrimary}10`;
  if (!isActive || finished) {
    accentColor = theme.colors.textMuted;
    accentBg = `${theme.colors.textMuted}10`;
  } else if (allCompleted) {
    accentColor = theme.colors.success;
    accentBg = `${theme.colors.success}12`;
  }

  let iconName: IconName = 'pill';
  if (!isActive) iconName = 'sleep';
  else if (allCompleted) iconName = 'check-circle';

  let statusText = '';
  if (!isActive) statusText = 'Inactivo';
  else if (finished) statusText = 'Finalizado';
  else if (!slots.length) statusText = 'Sin dosis hoy';
  else if (allCompleted) statusText = 'Completado';
  else statusText = `${completedCount}/${slots.length} tomadas`;

  const toggleExpanded = () => {
    if (slots.length <= VISIBLE_DOSES) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((current) => !current);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderLeftColor: accentColor,
          borderColor: theme.colors.surfaceBorder,
        },
        !isActive && styles.cardInactive,
        pressed && { transform: [{ scale: 0.99 }], backgroundColor: accentBg },
      ]}
      onPress={toggleExpanded}
      onLongPress={canEdit ? () => onEdit(medication) : undefined}
      delayLongPress={250}
      accessibilityLabel={`${medication.name}, ${medication.dosage}, ${isActive ? 'activo' : 'inactivo'}, ${completedCount} de ${slots.length} tomadas`}
      accessibilityHint={canEdit ? 'Mantén presionado para editar' : undefined}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.medIconCircle, { backgroundColor: accentBg }]}>
          <MaterialCommunityIcons name={iconName} size={22} color={accentColor} />
        </View>
        <View style={styles.cardHeaderInfo}>
          <Text
            style={[styles.medName, { color: isActive ? theme.colors.textPrimary : theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {medication.name}
          </Text>
          <View style={styles.medMetaRow}>
            <Text style={[styles.dosageText, { color: accentColor }]}>{medication.dosage}</Text>
            <View style={[styles.metaDot, { backgroundColor: accentColor }]} />
            <Text style={[styles.frequencyText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {frequencyLabel(medication.frequency)}
            </Text>
          </View>
        </View>
        <Switch
          value={isActive}
          disabled={isToggling || !canToggle}
          onValueChange={() => onToggleActive(medication)}
          trackColor={{ false: theme.colors.surfaceBorder, true: `${theme.colors.accentPrimary}60` }}
          thumbColor={isActive ? theme.colors.accentPrimary : theme.colors.textMuted}
          ios_backgroundColor={theme.colors.surfaceBorder}
          accessibilityLabel={isActive ? 'Desactivar alarma' : 'Activar alarma'}
        />
      </View>

      {isActive && slots.length > 0 ? (
        <View style={styles.doseTimeline}>
          {visibleSlots.map((slot) => {
            const color = doseStateColor(theme, slot.state);
            const meta = DOSE_STATE_META[slot.state];
            return (
              <Pressable
                key={slot.key}
                onPress={() => onDosePress(medication, slot)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`${slot.time}, ${meta.label.toLowerCase()}`}
                accessibilityHint="Abre las opciones de esta toma"
                style={({ pressed }) => [
                  styles.dosePill,
                  { backgroundColor: `${color}10`, borderColor: `${color}30`, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View style={[styles.doseDot, { backgroundColor: color }]} />
                <Text style={[styles.dosePillTime, { color, fontWeight: slot.state === 'due' ? '900' : '700' }]}>
                  {slot.time}
                  {slot.viewerTime ? <Text style={styles.viewerTime}>{` · tú ${slot.viewerTime}`}</Text> : null}
                </Text>
                <MaterialCommunityIcons name={meta.icon} size={12} color={color} />
              </Pressable>
            );
          })}
          {!isExpanded && hiddenCount > 0 ? (
            <Pressable
              onPress={toggleExpanded}
              accessibilityRole="button"
              accessibilityLabel={`Ver ${hiddenCount} tomas más`}
              style={[styles.expandChip, { backgroundColor: `${theme.colors.textMuted}10`, borderColor: `${theme.colors.textMuted}20` }]}
            >
              <Text style={[styles.expandChipText, { color: theme.colors.textMuted }]}>+{hiddenCount} más</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {medication.notes ? (
        <View style={[styles.notesRow, { backgroundColor: `${theme.colors.accentPrimary}05` }]}>
          <MaterialCommunityIcons name="note-text-outline" size={13} color={theme.colors.textMuted} />
          <Text style={[styles.notesText, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {medication.notes}
          </Text>
        </View>
      ) : null}

      {changedByNote(medication, { masculine: true }) ? (
        <View style={styles.auditRow}>
          <MaterialCommunityIcons name="account-edit-outline" size={13} color={theme.colors.textMuted} />
          <Text style={[styles.auditText, { color: theme.colors.textMuted }]}>{changedByNote(medication, { masculine: true })}</Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <View style={[styles.statusPill, { backgroundColor: accentBg }]}>
          <MaterialCommunityIcons
            name={
              !isActive || finished || !slots.length
                ? 'information-outline'
                : allCompleted
                  ? 'check-circle'
                  : 'progress-check'
            }
            size={14}
            color={accentColor}
          />
          <Text style={[styles.statusPillText, { color: accentColor }]}>{statusText}</Text>
        </View>
        <View style={styles.cardActions}>
          {canEdit ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: `${theme.colors.textSecondary}08` },
                pressed && styles.actionBtnPressed,
              ]}
              onPress={() => onEdit(medication)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`Editar ${medication.name}`}
            >
              <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: `${theme.colors.accentTertiary}10` },
                pressed && styles.actionBtnPressed,
              ]}
              onPress={() => onDelete(medication)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`Eliminar ${medication.name}`}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.accentTertiary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const MedicationCard = memo(MedicationCardBase);

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, borderLeftWidth: 4, padding: 16, gap: 12 },
  cardInactive: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  medIconCircle: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardHeaderInfo: { flex: 1, gap: 3 },
  medName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  medMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dosageText: { fontSize: 13, fontWeight: '700' },
  metaDot: { width: 3, height: 3, borderRadius: 2 },
  frequencyText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  doseTimeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dosePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  doseDot: { width: 6, height: 6, borderRadius: 3 },
  dosePillTime: { fontSize: 12, fontVariant: ['tabular-nums'] },
  viewerTime: { fontSize: 11, fontWeight: '600', opacity: 0.75 },
  expandChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  expandChipText: { fontSize: 11, fontWeight: '800' },
  notesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  notesText: { fontSize: 11, fontWeight: '600', flex: 1 },
  auditRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  auditText: { fontSize: 11.5, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20 },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  cardActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnPressed: { opacity: 0.6 },
});
