import { useEffect, useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { PressableScale, useReducedMotion } from '../../../shared/ui';

export type VoicePhase = 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'paused';

const LABELS: Record<VoicePhase, string> = {
  listening: 'Te escucho…',
  transcribing: 'Entendiendo…',
  thinking: 'Pensando…',
  speaking: 'Respondiendo',
  paused: 'En pausa',
};

/**
 * Conversación por voz: un círculo que crece con tu voz mientras escucha,
 * late mientras piensa y ondula mientras habla. Debajo, lo último que oyó.
 */
export function VoicePanel({
  theme,
  phase,
  level,
  autoStop,
  caption,
  onFinishSpeaking,
  onInterrupt,
  onResume,
  onEnd,
}: Readonly<{
  theme: AppTheme;
  phase: VoicePhase;
  /** 0-1: volumen del micrófono. */
  level: number;
  /** false: el teléfono no detecta el silencio y hay que tocar "Listo". */
  autoStop: boolean;
  caption: string | null;
  onFinishSpeaking: () => void;
  onInterrupt: () => void;
  onResume: () => void;
  onEnd: () => void;
}>) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const volume = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(volume, { toValue: phase === 'listening' ? level : 0, duration: 100, useNativeDriver: true }).start();
  }, [level, phase, volume]);

  useEffect(() => {
    if (reducedMotion || phase === 'listening' || phase === 'paused') {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: phase === 'speaking' ? 500 : 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: phase === 'speaking' ? 500 : 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse, reducedMotion]);

  const color = phase === 'speaking' ? theme.colors.accentSecondary : theme.colors.accentPrimary;
  const scale = Animated.add(
    volume.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
  );
  let icon: keyof typeof MaterialCommunityIcons.glyphMap = 'microphone';
  if (phase === 'speaking') icon = 'volume-high';
  else if (phase === 'thinking' || phase === 'transcribing') icon = 'dots-horizontal';
  else if (phase === 'paused') icon = 'pause';

  let primary: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void } | null = null;
  if (phase === 'listening') primary = { label: autoStop ? 'Ya terminé' : 'Listo, envíalo', icon: 'send', onPress: onFinishSpeaking };
  else if (phase === 'speaking') primary = { label: 'Interrumpir', icon: 'hand-back-right-outline', onPress: onInterrupt };
  else if (phase === 'paused') primary = { label: 'Seguir hablando', icon: 'microphone', onPress: onResume };

  return (
    <View style={[styles.panel, { borderTopColor: theme.colors.surfaceBorder }]}>
      <View style={styles.orbArea} accessible accessibilityLabel={LABELS[phase]} accessibilityLiveRegion="polite">
        <Animated.View style={[styles.halo, { backgroundColor: `${color}22`, transform: [{ scale }] }]} />
        <View style={[styles.orb, { backgroundColor: color }]}>
          <MaterialCommunityIcons name={icon} size={34} color="#fff" />
        </View>
      </View>
      <Text style={[styles.phase, { color: theme.colors.textPrimary }]}>{LABELS[phase]}</Text>
      {caption ? (
        <Text style={[styles.caption, { color: theme.colors.textSecondary }]} numberOfLines={2}>“{caption}”</Text>
      ) : (
        <Text style={[styles.caption, { color: theme.colors.textMuted }]}>
          {phase === 'listening' ? (autoStop ? 'Habla con normalidad; cuando hagas una pausa, respondo.' : 'Habla y toca "Listo" al terminar.') : ' '}
        </Text>
      )}
      <View style={styles.buttons}>
        <PressableScale
          onPress={onEnd}
          accessibilityRole="button"
          accessibilityLabel="Terminar la conversación por voz"
          style={[styles.secondary, { borderColor: theme.colors.surfaceBorder, backgroundColor: theme.colors.surface }]}
        >
          <MaterialCommunityIcons name="keyboard-outline" size={20} color={theme.colors.textPrimary} />
          <Text style={[styles.secondaryText, { color: theme.colors.textPrimary }]}>Terminar</Text>
        </PressableScale>
        {primary ? (
          <PressableScale
            onPress={primary.onPress}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: color }]}
          >
            <MaterialCommunityIcons name={primary.icon} size={20} color="#fff" />
            <Text style={styles.primaryText}>{primary.label}</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const ORB = 76;
const styles = StyleSheet.create({
  panel: { alignItems: 'center', gap: 8, paddingTop: 18, paddingBottom: 8, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
  orbArea: { width: ORB * 1.8, height: ORB * 1.6, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: ORB * 1.25, height: ORB * 1.25, borderRadius: ORB },
  orb: { width: ORB, height: ORB, borderRadius: ORB / 2, alignItems: 'center', justifyContent: 'center' },
  phase: { fontSize: 18, fontWeight: '900' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center', minHeight: 20 },
  buttons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 6 },
  secondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 50, borderRadius: 16, borderWidth: 1 },
  secondaryText: { fontSize: 15, fontWeight: '800' },
  primary: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 50, borderRadius: 16 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
