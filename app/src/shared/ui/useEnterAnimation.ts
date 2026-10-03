import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { useReducedMotion } from './motion';

const ENTER_DURATION = 500;
const ENTER_OFFSET = 30;

/**
 * Entrada del contenido de una pantalla (fundido + subida) al salir del estado
 * de carga. Devuelve el estilo para un Animated.View y si está animando.
 *
 * - Arranca dos frames después del montaje: si empieza en el mismo commit que
 *   una lista pesada, la animación nativa termina antes de que el contenido se
 *   pinte y la interfaz aparece de golpe.
 * - Nunca se queda a medias: si se interrumpe, el contenido queda visible.
 * - Mientras anima se pide composición fuera de pantalla (Android) para que la
 *   opacidad no haga parpadear sombras y bordes de las tarjetas.
 */
export function useEnterAnimation(ready: boolean) {
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const progress = useRef(new Animated.Value(0)).current;
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!ready) {
      progress.stopAnimation();
      progress.setValue(0);
      return undefined;
    }
    if (reducedMotionRef.current) {
      progress.setValue(1);
      return undefined;
    }

    let cancelled = false;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (cancelled) return;
        setAnimating(true);
        Animated.timing(progress, {
          toValue: 1,
          duration: ENTER_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          progress.setValue(1);
          if (!cancelled) setAnimating(false);
        });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      progress.stopAnimation();
      progress.setValue(1);
    };
  }, [ready, progress]);

  return {
    animating,
    style: {
      opacity: progress,
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [ENTER_OFFSET, 0] }) },
      ],
    },
  };
}
