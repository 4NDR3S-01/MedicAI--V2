import { useEffect, useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import type { AppTheme } from '../theme';

type BackgroundDecorProps = {
  theme: AppTheme;
};

// Shared animated values keep continuity when navigating between screens.
const sharedDriftA = new Animated.Value(0);
const sharedDriftB = new Animated.Value(0);
const sharedPulse = new Animated.Value(0.96);
let hasStartedSharedAnimation = false;

export function BackgroundDecor({ theme }: Readonly<BackgroundDecorProps>) {
  const driftA = useRef(sharedDriftA).current;
  const driftB = useRef(sharedDriftB).current;
  const pulse = useRef(sharedPulse).current;

  useEffect(() => {
    if (hasStartedSharedAnimation) {
      return;
    }

    hasStartedSharedAnimation = true;

    Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(driftA, {
            toValue: 1,
            duration: 3200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(driftA, {
            toValue: 0,
            duration: 3200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(driftB, {
            toValue: 1,
            duration: 4000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(driftB, {
            toValue: 0,
            duration: 4000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0.92,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();
  }, [driftA, driftB, pulse]);

  const driftATranslateY = driftA.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -22],
  });

  const driftBTranslateY = driftB.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 18],
  });

  const driftARotate = driftA.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '4deg'],
  });

  const driftBRotate = driftB.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-4deg'],
  });

  return (
    <View style={styles.background} pointerEvents="none">
      <View style={[styles.centerSoftMask, { backgroundColor: `${theme.colors.background}D9` }]} />

      <Animated.View
        style={[
          styles.badge,
          styles.circleLarge,
          styles.badgePill,
          {
            backgroundColor: `${theme.colors.accentPrimary}18`,
            borderColor: `${theme.colors.surfaceBorder}52`,
            transform: [{ translateY: driftATranslateY }, { rotate: driftARotate }, { scale: pulse }],
          },
        ]}
      >
        <MaterialCommunityIcons name="pill" size={20} color={`${theme.colors.accentPrimary}C9`} />
      </Animated.View>

      <Animated.View
        style={[
          styles.badge,
          styles.circleLarge,
          styles.badgeCalendar,
          {
            backgroundColor: `${theme.colors.accentSecondary}18`,
            borderColor: `${theme.colors.surfaceBorder}52`,
            transform: [{ translateY: driftBTranslateY }, { rotate: driftBRotate }, { scale: pulse }],
          },
        ]}
      >
        <MaterialCommunityIcons name="calendar-clock-outline" size={20} color={`${theme.colors.accentSecondary}C9`} />
      </Animated.View>

      <Animated.View
        style={[
          styles.badge,
          styles.circleLarge,
          styles.badgeRobot,
          {
            backgroundColor: `${theme.colors.accentTertiary}18`,
            borderColor: `${theme.colors.surfaceBorder}52`,
            transform: [{ translateY: driftATranslateY }, { rotate: driftBRotate }, { scale: pulse }],
          },
        ]}
      >
        <MaterialCommunityIcons name="robot-outline" size={20} color={`${theme.colors.accentTertiary}C9`} />
      </Animated.View>

      <Animated.View
        style={[
          styles.microBadge,
          styles.circleSmall,
          styles.microOne,
          {
            backgroundColor: `${theme.colors.accentPrimary}14`,
            borderColor: `${theme.colors.surfaceBorder}45`,
            transform: [{ translateY: driftBTranslateY }, { scale: pulse }],
          },
        ]}
      >
        <MaterialCommunityIcons name="heart-pulse" size={12} color={`${theme.colors.accentPrimary}C2`} />
      </Animated.View>
      <Animated.View
        style={[
          styles.microBadge,
          styles.circleSmall,
          styles.microTwo,
          {
            backgroundColor: `${theme.colors.accentSecondary}14`,
            borderColor: `${theme.colors.surfaceBorder}45`,
            transform: [{ translateY: driftATranslateY }, { scale: pulse }],
          },
        ]}
      >
        <MaterialCommunityIcons name="stethoscope" size={12} color={`${theme.colors.accentSecondary}C2`} />
      </Animated.View>
      <Animated.View
        style={[
          styles.microBadge,
          styles.circleSmall,
          styles.microThree,
          {
            backgroundColor: `${theme.colors.accentTertiary}14`,
            borderColor: `${theme.colors.surfaceBorder}45`,
            transform: [{ translateY: driftBTranslateY }, { scale: pulse }],
          },
        ]}
      >
        <MaterialCommunityIcons name="brain" size={12} color={`${theme.colors.accentTertiary}C2`} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  centerSoftMask: {
    position: 'absolute',
    left: 22,
    right: 22,
    top: '22%',
    bottom: '22%',
    borderRadius: 28,
  },
  badge: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLarge: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 2,
    },
  },
  badgePill: {
    top: 28,
    left: -10,
    transform: [{ rotate: '9deg' }],
  },
  badgeCalendar: {
    top: 164,
    right: -8,
    transform: [{ rotate: '-9deg' }],
  },
  badgeRobot: {
    bottom: 112,
    left: -8,
    transform: [{ rotate: '7deg' }],
  },
  microBadge: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleSmall: {
    opacity: 0.72,
  },
  microOne: {
    top: 36,
    right: 20,
  },
  microTwo: {
    top: 304,
    right: 14,
  },
  microThree: {
    bottom: 40,
    right: 28,
  },
});
