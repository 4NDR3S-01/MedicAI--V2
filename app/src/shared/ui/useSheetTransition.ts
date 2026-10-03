import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { MOTION, useReducedMotion } from './motion';

/** Resorte para paneles: sin rebote (un rebote abre un hueco bajo el panel). */
const SHEET_SPRING = { ...MOTION.enter, overshootClamping: true } as const;

/**
 * Montaje + entrada/salida de un panel (FormSheet, BottomSheet, menús).
 *
 * La entrada arranca en `onLayout`, es decir, cuando el panel ya existe en la
 * vista nativa. Si arrancara al cambiar `visible`, el resorte correría mientras
 * React aún monta el contenido (más aún a través del Portal) y el panel
 * aparecería de golpe, ya casi al final de la animación.
 */
export function useSheetTransition(visible: boolean, closeDuration: number = MOTION.fast + 40) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const laidOutRef = useRef(false);
  const pendingEnterRef = useRef(visible);
  const frameRef = useRef<number | null>(null);

  const animateIn = useCallback(() => {
    progress.stopAnimation();
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    Animated.spring(progress, { toValue: 1, useNativeDriver: true, ...SHEET_SPRING }).start();
  }, [progress, reducedMotion]);

  useEffect(() => {
    if (visible) {
      if (mountedRef.current && laidOutRef.current) {
        // Reabierto mientras se cerraba: ya está en pantalla, se invierte.
        animateIn();
      } else {
        progress.setValue(0);
        pendingEnterRef.current = true;
        mountedRef.current = true;
        setMounted(true);
      }
      return;
    }

    pendingEnterRef.current = false;
    if (!mountedRef.current) return;
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : closeDuration,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        mountedRef.current = false;
        laidOutRef.current = false;
        setMounted(false);
      }
    });
  }, [visible, reducedMotion, closeDuration, progress, animateIn]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  /** Para el onLayout del contenedor animado del panel. */
  const onLayout = useCallback(() => {
    laidOutRef.current = true;
    if (!pendingEnterRef.current) return;
    pendingEnterRef.current = false;
    // Un frame más: el primer frame con el panel ya pintado fuera de pantalla.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      animateIn();
    });
  }, [animateIn]);

  return { mounted, progress, onLayout };
}
