import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { BackgroundDecor, BrandLogo } from '../../../shared/ui';
import type { AppTheme } from '../../../shared/theme';

type LoadingScreenProps = {
  theme: AppTheme;
};

export function LoadingScreen({ theme }: Readonly<LoadingScreenProps>) {
  const floatY = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const contentIn = useRef(new Animated.Value(0)).current;
  const [infoIndex, setInfoIndex] = useState(0);

  const infoMessages = useMemo(
    () => [
      'Sincronizando recordatorios de medicamentos...',
      'Sincronizando agenda de citas medicas...',
      'Ajustando tu asistencia personalizada con IA...',
    ],
    [],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentIn, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatY, {
            toValue: -8,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(floatY, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.05,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]).start();

    const messageTimer = setInterval(() => {
      setInfoIndex((previous) => (previous + 1) % infoMessages.length);
    }, 2200);

    return () => {
      clearInterval(messageTimer);
    };
  }, [contentIn, floatY, infoMessages.length, pulse]);

  const contentTranslate = contentIn.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
  });

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <BackgroundDecor theme={theme} />
      <Animated.View
        style={[
          styles.wrap,
          {
            opacity: contentIn,
            transform: [{ translateY: contentTranslate }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ translateY: floatY }, { scale: pulse }] }}>
          <BrandLogo theme={theme} size={150} showName={false} />
        </Animated.View>

        <Text style={[styles.loadingText, { color: theme.colors.textPrimary }]}>Cargando tu espacio medico</Text>
        <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>{infoMessages[infoIndex]}</Text>
      </Animated.View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}> 
          Copyright © 2026 MedicAI. Todos los derechos reservados.
        </Text>
        <Text style={[styles.footerText, { color: theme.colors.textMuted }]}>Creador: William Cabrera</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 18,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  infoText: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 16,
    maxWidth: 340,
  },
  footer: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 18,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
