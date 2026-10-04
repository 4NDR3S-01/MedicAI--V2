import { useEffect, useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, PressableScale, useReducedMotion } from '../../../shared/ui';
import { dosageOnDay } from '../../../shared/services/dose-schedule';
import { countdownLabel } from '../../tabs/utils/appointment-status';
import type { TodayDose } from '../hooks/useHomeData';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * La tarjeta principal: qué hacer ahora con tus medicamentos. Si es la hora
 * (u olvidaste una), se registra desde aquí; si no, cuenta atrás a la próxima.
 */
export function TodayCard({
  theme,
  now,
  hasMedications,
  focus,
  taken,
  handled,
  total,
  missedCount,
  busy,
  onRegister,
  onOpenDose,
  onAddMedication,
  onOpenMedications,
}: Readonly<{
  theme: AppTheme;
  now: Date;
  hasMedications: boolean;
  focus: TodayDose | null;
  taken: number;
  handled: number;
  total: number;
  missedCount: number;
  busy: boolean;
  onRegister: (dose: TodayDose, action: 'TAKEN' | 'SKIPPED') => void;
  onOpenDose: (dose: TodayDose) => void;
  onAddMedication: () => void;
  onOpenMedications: () => void;
}>) {
  const reducedMotion = useReducedMotion();
  const progress = total ? handled / total : 0;
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) fill.setValue(progress);
    else Animated.timing(fill, { toValue: progress, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress, reducedMotion, fill]);

  const accent = theme.colors.accentPrimary;

  // Sin medicamentos: invitación clara a empezar.
  if (!hasMedications) {
    return (
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
        <View style={[styles.iconBig, { backgroundColor: `${accent}14` }]}>
          <MaterialCommunityIcons name="pill" size={28} color={accent} />
        </View>
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Empieza con tu primer medicamento</Text>
        <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
          Te avisaremos a la hora de cada toma, aunque el teléfono esté bloqueado.
        </Text>
        <AppButton theme={theme} label="Agregar medicamento" icon="add" iconPosition="left" onPress={onAddMedication} />
      </View>
    );
  }

  const state = focus?.slot.state;
  const actionable = state === 'due' || state === 'missed';
  let icon: IconName = 'check-decagram';
  let tone = theme.colors.success;
  let eyebrow = 'Hoy';
  let title = total ? 'Todo al día' : 'Hoy no hay tomas';
  let body = total ? 'Registraste todas las tomas de hoy. ¡Bien hecho!' : 'Ninguno de tus medicamentos toca hoy.';

  if (focus && state === 'due') {
    icon = 'alarm-light';
    tone = accent;
    eyebrow = 'Es la hora';
  } else if (focus && state === 'missed') {
    icon = 'alert-circle-outline';
    tone = theme.colors.accentTertiary;
    eyebrow = 'Sin registrar';
  } else if (focus) {
    icon = 'clock-outline';
    tone = theme.colors.accentSecondary;
    eyebrow = `Próxima toma ${countdownLabel(focus.slot.at, now)}`;
  }
  if (focus) {
    title = focus.medication.name;
    body = `${dosageOnDay(focus.medication, focus.slot.at)} · ${focus.slot.time}${focus.slot.viewerTime ? ` (${focus.slot.viewerTime} para ti)` : ''}`;
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: `${tone}40` }]}>
      <PressableScale
        onPress={focus ? () => onOpenDose(focus) : onOpenMedications}
        pressedScale={0.99}
        accessibilityRole="button"
        accessibilityLabel={`${eyebrow}. ${title}. ${body}`}
        style={styles.focusRow}
      >
        <View style={[styles.iconBig, { backgroundColor: `${tone}18` }]}>
          <MaterialCommunityIcons name={icon} size={28} color={tone} />
        </View>
        <View style={styles.focusText}>
          <Text style={[styles.eyebrow, { color: tone }]}>{eyebrow}</Text>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>{title}</Text>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{body}</Text>
        </View>
      </PressableScale>

      {focus && actionable ? (
        <View style={styles.actions}>
          <AppButton theme={theme} label="La omití" variant="secondary" onPress={() => onRegister(focus, 'SKIPPED')} disabled={busy} style={styles.flex} />
          <AppButton theme={theme} label="La tomé" icon="checkmark" onPress={() => onRegister(focus, 'TAKEN')} loading={busy} style={styles.flexWide} />
        </View>
      ) : null}

      {total ? (
        <PressableScale onPress={onOpenMedications} pressedScale={0.99} accessibilityRole="button" accessibilityLabel={`${taken} de ${total} tomas registradas hoy. Ver medicamentos.`} style={styles.progressBlock}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressText, { color: theme.colors.textSecondary }]}>
              <Text style={{ color: theme.colors.textPrimary, fontWeight: '900' }}>{taken}</Text> de {total} tomas hoy
            </Text>
            {missedCount ? (
              <Text style={[styles.missed, { color: theme.colors.accentTertiary }]}>
                {missedCount} sin registrar
              </Text>
            ) : null}
          </View>
          <View style={[styles.track, { backgroundColor: `${accent}14` }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: handled }}>
            <Animated.View
              style={[
                styles.fill,
                { backgroundColor: progress >= 1 ? theme.colors.success : accent, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  card: { borderRadius: 28, borderWidth: 1.5, padding: 18, gap: 16 },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBig: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  focusText: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10 },
  progressBlock: { gap: 8 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: 13.5, fontWeight: '600' },
  missed: { fontSize: 12.5, fontWeight: '800' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
});
