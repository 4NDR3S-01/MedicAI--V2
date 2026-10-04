import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { PressableScale } from '../../../shared/ui';
import { dosageOnDay } from '../../../shared/services/dose-schedule';
import { DOSE_STATE_META, doseStateColor } from '../../tabs/components/MedicationCard';
import type { TodayDose } from '../hooks/useHomeData';
import { SectionHeader } from './SectionHeader';

const MAX_ROWS = 6;

/** Las tomas de hoy en orden, con su estado. Tocar una abre sus opciones. */
export function DoseTimeline({
  theme,
  doses,
  onOpenDose,
  onSeeAll,
}: Readonly<{ theme: AppTheme; doses: TodayDose[]; onOpenDose: (dose: TodayDose) => void; onSeeAll: () => void }>) {
  if (!doses.length) return null;
  // Se muestran las que importan ahora: desde la primera pendiente.
  const firstOpen = doses.findIndex(({ slot }) => slot.state !== 'taken' && slot.state !== 'skipped');
  const start = firstOpen < 0 ? Math.max(0, doses.length - MAX_ROWS) : Math.max(0, Math.min(firstOpen - 1, doses.length - MAX_ROWS));
  const shown = doses.slice(start, start + MAX_ROWS);

  return (
    <View style={styles.section}>
      <SectionHeader theme={theme} title="Tus tomas de hoy" action={doses.length > MAX_ROWS ? `Ver las ${doses.length}` : 'Ver todo'} onAction={onSeeAll} />
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
        {shown.map((dose, index) => {
          const { slot, medication } = dose;
          const color = doseStateColor(theme, slot.state);
          const meta = DOSE_STATE_META[slot.state];
          const done = slot.state === 'taken' || slot.state === 'skipped';
          const last = index === shown.length - 1;
          return (
            <PressableScale
              key={slot.key}
              onPress={() => onOpenDose(dose)}
              pressedScale={0.99}
              accessibilityRole="button"
              accessibilityLabel={`${slot.time}, ${medication.name}, ${meta.label}`}
              style={styles.row}
            >
              <Text style={[styles.time, { color: done ? theme.colors.textMuted : theme.colors.textPrimary }]}>{slot.time}</Text>
              <View style={styles.rail}>
                {index > 0 ? <View style={[styles.lineTop, { backgroundColor: theme.colors.surfaceBorder }]} /> : null}
                {!last ? <View style={[styles.lineBottom, { backgroundColor: theme.colors.surfaceBorder }]} /> : null}
                <View style={[styles.dot, { backgroundColor: color, borderColor: theme.colors.surface }]} />
              </View>
              <View style={styles.info}>
                <Text
                  style={[styles.name, { color: done ? theme.colors.textMuted : theme.colors.textPrimary }, slot.state === 'skipped' && styles.strike]}
                  numberOfLines={1}
                >
                  {medication.name}
                </Text>
                <Text style={[styles.dosage, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {dosageOnDay(medication, slot.at)}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: `${color}14` }]}>
                <MaterialCommunityIcons name={meta.icon} size={13} color={color} />
                <Text style={[styles.badgeText, { color }]}>{meta.label}</Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  card: { borderRadius: 22, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  time: { width: 46, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rail: { width: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  lineTop: { position: 'absolute', top: 0, height: '50%', width: 2 },
  lineBottom: { position: 'absolute', top: '50%', bottom: 0, width: 2 },
  info: { flex: 1, gap: 1 },
  name: { fontSize: 15, fontWeight: '800' },
  strike: { textDecorationLine: 'line-through' },
  dosage: { fontSize: 12.5, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11.5, fontWeight: '800' },
});
