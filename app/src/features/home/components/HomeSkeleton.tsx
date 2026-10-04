import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { useReducedMotion } from '../../../shared/ui';

/**
 * Esqueleto del inicio con la misma forma y tamaño que el contenido real
 * (tarjeta de "ahora", tomas de hoy, próxima cita y asistente): al cargar,
 * nada salta de sitio.
 */
export function HomeSkeleton({ theme }: Readonly<{ theme: AppTheme }>) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0.7);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  const bone = (width: DimensionValue, height: number, extra?: ViewStyle) => (
    <View style={[{ width, height, borderRadius: Math.min(height / 2, 8), backgroundColor: theme.colors.surfaceBorder }, extra]} />
  );
  const card = [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }];

  return (
    <Animated.View style={[styles.stack, { opacity: pulse }]} accessible accessibilityLabel="Cargando tu día" accessibilityState={{ busy: true }}>
      {/* Ahora */}
      <View style={[card, styles.today]}>
        <View style={styles.row}>
          {bone(56, 56, { borderRadius: 18 })}
          <View style={styles.lines}>
            {bone('35%', 11)}
            {bone('70%', 22)}
            {bone('55%', 13)}
          </View>
        </View>
        <View style={styles.row}>
          {bone('38%', 48, { borderRadius: 14 })}
          {bone('58%', 48, { borderRadius: 14 })}
        </View>
        <View style={styles.lines}>
          {bone('45%', 12)}
          {bone('100%', 10)}
        </View>
      </View>

      {/* Tus tomas de hoy */}
      <View style={styles.section}>
        {bone('42%', 18)}
        <View style={[card, styles.timeline]}>
          {[0, 1, 2, 3].map((row) => (
            <View key={row} style={styles.timelineRow}>
              {bone(42, 14)}
              {bone(14, 14, { borderRadius: 7 })}
              <View style={styles.lines}>
                {bone(row % 2 ? '60%' : '75%', 14)}
                {bone('35%', 11)}
              </View>
              {bone(74, 24, { borderRadius: 12 })}
            </View>
          ))}
        </View>
      </View>

      {/* Próxima cita */}
      <View style={styles.section}>
        {bone('32%', 18)}
        <View style={[card, styles.row, styles.appointment]}>
          {bone(62, 74, { borderRadius: 16 })}
          <View style={styles.lines}>
            {bone('40%', 11)}
            {bone('80%', 16)}
            {bone('55%', 13)}
          </View>
        </View>
      </View>

      {/* Asistente */}
      <View style={styles.section}>
        {bone('28%', 18)}
        {bone('100%', 150, { borderRadius: 26 })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  section: { gap: 10 },
  card: { borderRadius: 22, borderWidth: 1 },
  today: { borderRadius: 28, padding: 18, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lines: { flex: 1, gap: 8 },
  timeline: { paddingVertical: 6, paddingHorizontal: 14 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  appointment: { padding: 14 },
});
