import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '../../../shared/ui';

/** Tres puntos que "laten" mientras el asistente escribe. */
export function TypingDots({ color }: Readonly<{ color: string }>) {
  const reducedMotion = useReducedMotion();
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    if (reducedMotion) {
      values.forEach((value) => value.setValue(0.7));
      return undefined;
    }
    const loops = values.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(value, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay((2 - index) * 160),
        ]),
      ));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [reducedMotion, values]);

  return (
    <View style={styles.row} accessibilityLabel="El asistente está escribiendo" accessibilityLiveRegion="polite">
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={[styles.dot, { backgroundColor: color, opacity: value, transform: [{ scale: value.interpolate({ inputRange: [0.3, 1], outputRange: [0.8, 1.1] }) }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
