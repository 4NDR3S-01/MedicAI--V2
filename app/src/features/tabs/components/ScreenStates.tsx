import { useEffect, useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { useReducedMotion } from '../../../shared/ui';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// ─── Estado vacío / error ───────────────────────────────────────────────────

export type EmptyStateProps = {
  theme: AppTheme;
  icon: IconName;
  iconColor?: string;
  title: string;
  text: string;
  actionIcon?: IconName;
  actionLabel?: string;
  /** Color del botón de acción (por defecto, el acento de la pantalla). */
  actionColor?: string;
  onAction?: () => void;
};

export function EmptyState({
  theme,
  icon,
  iconColor,
  title,
  text,
  actionIcon,
  actionLabel,
  actionColor,
  onAction,
}: Readonly<EmptyStateProps>) {
  const color = iconColor ?? theme.colors.accentPrimary;
  const buttonColor = actionColor ?? theme.colors.accentPrimary;
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIconBox, { backgroundColor: `${color}12` }]}>
        <MaterialCommunityIcons name={icon} size={52} color={color} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: buttonColor, opacity: pressed ? 0.85 : 1 }]}
        >
          {actionIcon ? <MaterialCommunityIcons name={actionIcon} size={20} color="#fff" /> : null}
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Esqueleto de carga ─────────────────────────────────────────────────────

export function SkeletonList({
  theme,
  count = 4,
  bottomInset = 0,
}: Readonly<{ theme: AppTheme; count?: number; bottomInset?: number }>) {
  const reducedMotion = useReducedMotion();
  // Un único valor para todas las tarjetas: pulsan sincronizadas.
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0.6);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  const block = { backgroundColor: theme.colors.surfaceBorder };
  return (
    <View
      style={[styles.skeletonContainer, { paddingBottom: bottomInset }]}
      accessible
      accessibilityLabel="Cargando"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: count }, (_, index) => (
        <Animated.View
          key={index}
          style={[styles.skeletonCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder, opacity: pulse }]}
        >
          <View style={styles.skeletonHeader}>
            <View style={[styles.skelCircle, block]} />
            <View style={styles.skeletonLines}>
              <View style={[styles.skelLine, block, { width: '60%' }]} />
              <View style={[styles.skelLine, block, { width: '40%', height: 10 }]} />
            </View>
            <View style={[styles.skelToggle, block]} />
          </View>
          <View style={styles.skeletonPills}>
            {[1, 2, 3].map((pill) => (
              <View key={pill} style={[styles.skelPill, block]} />
            ))}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyIconBox: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  emptySubtext: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingHorizontal: 16, opacity: 0.7 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  skeletonContainer: { paddingHorizontal: 18, paddingTop: 34, gap: 12 },
  skeletonCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 16 },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonPills: { flexDirection: 'row', gap: 8 },
  skelCircle: { width: 46, height: 46, borderRadius: 16 },
  skelToggle: { width: 40, height: 24, borderRadius: 12 },
  skelLine: { height: 12, borderRadius: 6 },
  skelPill: { width: 50, height: 24, borderRadius: 12 },
});
