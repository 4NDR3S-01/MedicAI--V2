import { memo, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import { readableText, type AppTheme } from '../../../shared/theme';
import { dosageOnDay, isAsNeeded, isTreatmentFinished } from '../../../shared/services/dose-schedule';
import type { MedicationData } from '../services/medications.service';
import type { DoseSlot, DoseState } from '../utils/dose-status';
import { formatQuantity, isLowStock, scheduleLabel, stockUnitLabel } from '../utils/medication-form';
import { MedicationOptionsSheet } from './MedicationOptionsSheet';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const VISIBLE_DOSES = 4;

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
  /** Según necesidad: registrar una toma ahora. */
  onLogAsNeeded?: (medication: MedicationData) => void;
  /** Permisos al ver los medicamentos de otra persona (por defecto, todos). */
  canToggle?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canLog?: boolean;
  /** Medicamento propio: ofrece preguntar al asistente desde sus opciones. */
  canAsk?: boolean;
};

/**
 * Tarjeta de un medicamento: qué es, cuándo toca hoy y, solo si hace falta,
 * un aviso (existencias bajas). Todo lo demás está en el panel de opciones,
 * que se abre al tocar la tarjeta.
 */
function MedicationCardBase({
  theme,
  medication,
  slots,
  isToggling,
  onToggleActive,
  onEdit,
  onDelete,
  onDosePress,
  onLogAsNeeded,
  canToggle = true,
  canEdit = true,
  canDelete = true,
  canLog = true,
  canAsk = false,
}: Readonly<MedicationCardProps>) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const finished = isTreatmentFinished(medication);
  const isActive = medication.active;
  const asNeeded = isAsNeeded(medication);
  const completedCount = slots.filter((slot) => slot.state === 'taken').length;
  const allHandled = !asNeeded && slots.length > 0 && slots.every((slot) => slot.state === 'taken' || slot.state === 'skipped');
  // Verde solo si se tomaron todas; con alguna omitida el día queda cerrado pero en gris.
  const allTaken = allHandled && completedCount === slots.length;
  // Dosis que cambia con el tiempo: se muestra la de hoy.
  const dosageToday = medication.dosageSteps?.length ? dosageOnDay(medication, new Date()) : medication.dosage;
  const lowStock = isLowStock(medication);
  const visibleSlots = isExpanded ? slots : slots.slice(0, VISIBLE_DOSES);
  const hiddenCount = slots.length - visibleSlots.length;
  const hasOptions = canEdit || canToggle || canDelete;

  let accentColor = theme.colors.accentPrimary;
  if (!isActive || finished) accentColor = theme.colors.textMuted;
  else if (!asNeeded && !slots.length) accentColor = theme.colors.textMuted;
  else if (allTaken) accentColor = theme.colors.success;
  else if (allHandled) accentColor = theme.colors.textMuted;
  const accentBg = `${accentColor}14`;

  let iconName: IconName = 'pill';
  if (!isActive) iconName = 'bell-sleep-outline';
  else if (allTaken) iconName = 'check-circle';
  else if (allHandled) iconName = 'minus-circle-outline';

  // Estado breve a la derecha: el progreso de hoy o por qué no hay tomas.
  let statusText = '';
  if (!isActive) statusText = 'Pausado';
  else if (finished) statusText = 'Finalizado';
  else if (asNeeded) statusText = medication.maxDailyDoses ? `${completedCount}/${medication.maxDailyDoses}` : `${completedCount} hoy`;
  else if (!slots.length) statusText = 'Hoy no toca';
  else statusText = `${completedCount}/${slots.length}`;

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded((current) => !current);
  };

  const stockLeft = medication.stockQuantity ?? 0;

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
          !isActive && styles.cardInactive,
          pressed && hasOptions && styles.cardPressed,
        ]}
        onPress={hasOptions ? () => setOptionsOpen(true) : undefined}
        onLongPress={canEdit ? () => onEdit(medication) : undefined}
        delayLongPress={300}
        accessibilityRole={hasOptions ? 'button' : undefined}
        accessibilityLabel={`${medication.name}, ${dosageToday}, ${scheduleLabel(medication)}, ${statusText}`}
        accessibilityHint={hasOptions ? 'Abre los detalles y las opciones' : undefined}
      >
        <View style={styles.header}>
          <View style={[styles.icon, { backgroundColor: accentBg }]}>
            <MaterialCommunityIcons name={iconName} size={22} color={accentColor} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: isActive ? theme.colors.textPrimary : theme.colors.textMuted }]} numberOfLines={1}>
              {medication.name}
            </Text>
            <Text style={[styles.meta, { color: theme.colors.textSecondary }]} numberOfLines={2}>
              {dosageToday}
              {medication.dosageSteps?.length ? ' hoy' : ''} · {scheduleLabel(medication)}
            </Text>
          </View>
          <Text style={[styles.status, { color: readableText(theme, accentColor) }]}>{statusText}</Text>
          {hasOptions ? <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} /> : null}
        </View>

        {isActive && slots.length > 0 ? (
          <View style={styles.doses}>
            {visibleSlots.map((slot) => {
              const color = doseStateColor(theme, slot.state);
              const meta = DOSE_STATE_META[slot.state];
              const strong = slot.state === 'due' || slot.state === 'missed';
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
                    { backgroundColor: `${color}${strong ? '1F' : '10'}`, borderColor: `${color}${strong ? '66' : '30'}`, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <MaterialCommunityIcons name={meta.icon} size={14} color={color} />
                  <Text style={[styles.doseTime, { color: readableText(theme, color), fontWeight: strong ? '700' : '600' }]}>
                    {slot.time}
                    {slot.viewerTime ? <Text style={styles.viewerTime}>{` · tú ${slot.viewerTime}`}</Text> : null}
                  </Text>
                </Pressable>
              );
            })}
            {hiddenCount > 0 || isExpanded ? (
              <Pressable
                onPress={toggleExpanded}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? 'Ver menos tomas' : `Ver ${hiddenCount} tomas más`}
                style={[styles.dosePill, { borderColor: theme.colors.surfaceBorder }]}
              >
                <Text style={[styles.doseTime, { color: theme.colors.textSecondary }]}>{isExpanded ? 'Menos' : `+${hiddenCount}`}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {isActive && asNeeded && canLog && onLogAsNeeded ? (
          <Pressable
            onPress={() => onLogAsNeeded(medication)}
            accessibilityRole="button"
            accessibilityLabel={`Registrar una toma de ${medication.name} ahora`}
            style={({ pressed }) => [
              styles.logButton,
              { backgroundColor: `${theme.colors.accentPrimary}14`, borderColor: `${theme.colors.accentPrimary}40`, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color={theme.colors.accentPrimaryText} />
            <Text style={[styles.logButtonText, { color: theme.colors.accentPrimaryText }]}>Registrar una toma ahora</Text>
          </Pressable>
        ) : null}

        {/* Solo se avisa cuando hay que actuar; el detalle completo está en opciones. */}
        {lowStock ? (
          <View style={[styles.alert, { backgroundColor: `${theme.colors.accentTertiary}18` }]}>
            <MaterialCommunityIcons name="alert-outline" size={16} color={theme.colors.warningText} />
            <Text style={[styles.alertText, { color: theme.colors.warningText }]} numberOfLines={1}>
              {stockLeft <= 0
                ? 'Se acabó: actualiza las existencias'
                : `Quedan ${formatQuantity(stockLeft)} ${stockUnitLabel(medication.dosage, stockLeft)}`}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {hasOptions ? (
        <MedicationOptionsSheet
          theme={theme}
          medication={optionsOpen ? medication : null}
          isToggling={isToggling}
          canToggle={canToggle}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setOptionsOpen(false)}
          onToggleActive={onToggleActive}
          onEdit={onEdit}
          onDelete={onDelete}
          canAsk={canAsk}
        />
      ) : null}
    </>
  );
}

export const MedicationCard = memo(MedicationCardBase);

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  cardInactive: { opacity: 0.75 },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  meta: { fontSize: 14, fontWeight: '500' },
  status: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  doses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dosePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  doseTime: { fontSize: 14, fontVariant: ['tabular-nums'] },
  viewerTime: { fontSize: 12, fontWeight: '500', opacity: 0.8 },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
  },
  logButtonText: { fontSize: 14, fontWeight: '700' },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600' },
});
