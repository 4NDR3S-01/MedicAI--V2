import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from './motion';

const STEP_MS = 70;

/**
 * Entrada escalonada: cada bloque aparece y sube un poco, uno tras otro
 * (`index`), opcionalmente tras una espera inicial (`delay`, p. ej. mientras
 * entra el panel que lo contiene). Sin animación si se pide reducir el movimiento.
 */
export function Reveal({
  index,
  delay = 0,
  children,
  style,
}: Readonly<{ index: number; delay?: number; children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 380,
      delay: delay + index * STEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, delay, progress, reducedMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
