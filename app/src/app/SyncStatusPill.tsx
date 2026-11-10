import { useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';

import type { AppTheme } from '../shared/theme';
import { useReducedMotion } from '../shared/ui';
import { refreshOwnData, useOwnData } from '../features/tabs/data/own-data-store';
import { FLOATING_ACTION_BUTTON_BOTTOM } from './AppBottomBar';

type Mode = 'offline' | 'pending' | 'synced';

/** Cuánto se ve la confirmación "Todo al día" tras reconectar o enviar. */
const SYNCED_VISIBLE_MS = 2500;

/**
 * Aviso discreto del estado de la conexión. Aparece sin conexión o con
 * cambios por enviar (lo hecho ya está guardado en el teléfono); al volver la
 * red y enviarse todo, confirma "Todo al día" un momento y se va. Entra y sale
 * con una transición suave. Tocarlo reintenta.
 */
export function SyncStatusPill({ theme }: Readonly<{ theme: AppTheme }>) {
  const { offline, pendingCount, hydrated } = useOwnData();
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const problem: Mode | null = !hydrated ? null : offline ? 'offline' : pendingCount > 0 ? 'pending' : null;

  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (problem) {
      setMode(problem);
      return;
    }
    // Se resolvió (volvió la red / se envió todo): se confirma y se oculta.
    setMode((current) => (current ? 'synced' : null));
    hideTimer.current = setTimeout(() => setMode(null), SYNCED_VISIBLE_MS);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [problem]);

  const visible = mode !== null;
  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(visible ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 280,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress, reducedMotion]);

  // Mantiene el último texto mientras se desvanece.
  const lastMode = useRef<Mode>('offline');
  if (mode) lastMode.current = mode;
  const shown = mode ?? lastMode.current;

  const changes = pendingCount === 1 ? '1 cambio por enviar' : `${pendingCount} cambios por enviar`;
  let label = changes;
  let icon: keyof typeof MaterialCommunityIcons.glyphMap = 'cloud-upload-outline';
  let tone = theme.colors.accentSecondaryText;
  if (shown === 'offline') {
    label = pendingCount ? `Sin conexión · ${changes}` : 'Sin conexión';
    icon = 'cloud-off-outline';
    tone = theme.colors.warningText;
  } else if (shown === 'synced') {
    label = 'Todo al día';
    icon = 'check-circle-outline';
    tone = theme.colors.successText;
  }

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <Pressable
        onPress={() => void refreshOwnData({ force: true })}
        disabled={shown === 'synced'}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={shown === 'synced' ? label : `${label}. Toca para reintentar`}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons name={icon} size={16} color={tone} />
        <Text style={[styles.text, { color: theme.colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    // A la altura de los botones "+" (que van a la derecha), encima de la barra.
    bottom: FLOATING_ACTION_BUTTON_BOTTOM + 14,
    maxWidth: '62%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pressed: { opacity: 0.7 },
  text: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
