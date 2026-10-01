import { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { MOTION, useReducedMotion } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Escala mínima al presionar. */
  pressedScale?: number;
};

/**
 * Pressable con una leve reducción de escala al tocar (feedback visual).
 * El estilo se aplica al propio Pressable, así `flex`, márgenes, etc. se
 * comportan igual que en un Pressable normal.
 */
export function PressableScale({
  style,
  pressedScale = 0.96,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: Readonly<PressableScaleProps>) {
  const scale = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();

  const animateTo = (value: number) => {
    if (reducedMotion) return;
    Animated.spring(scale, { toValue: value, useNativeDriver: true, ...MOTION.press }).start();
  };

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        animateTo(pressedScale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        animateTo(1);
        onPressOut?.(event);
      }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
