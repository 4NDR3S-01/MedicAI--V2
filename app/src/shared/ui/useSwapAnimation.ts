import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

import { useReducedMotion } from './motion';

/**
 * Transición corta del contenido de una lista al cambiar de pestaña o filtro
 * (`key`). Más fluida que LayoutAnimation, que en Android parpadea al
 * reemplazar toda una lista virtualizada. Devuelve un estilo para envolver
 * cada elemento: todos comparten el mismo valor nativo.
 */
export function useSwapAnimation(key: string) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (reducedMotion) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [key, reducedMotion, progress]);

  return {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };
}
