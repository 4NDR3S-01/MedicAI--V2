import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Respeta la preferencia del sistema "Reducir movimiento" (iOS) / "Quitar
 * animaciones" (Android). Las animaciones decorativas deben desactivarse.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

export const MOTION = {
  /** Respuesta rápida a un toque. */
  press: { speed: 40, bounciness: 0 },
  /** Entrada de paneles y contenido. */
  enter: { damping: 22, stiffness: 240, mass: 1 },
  fast: 160,
  base: 240,
} as const;
