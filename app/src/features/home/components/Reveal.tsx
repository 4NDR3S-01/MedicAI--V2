import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '../../../shared/ui';

const STEP_MS = 70;

/**
 * Entrada escalonada: cada bloque aparece y sube un poco, uno tras otro
 * (`index`). Sin animación si el sistema pide reducir el movimiento.
 */
export function Reveal({ index, children, style }: Readonly<{ index: number; children: ReactNode; style?: StyleProp<ViewStyle> }>) {
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
      delay: index * STEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, progress, reducedMotion]);

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
