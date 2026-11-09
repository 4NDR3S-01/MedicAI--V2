import type { ReactNode } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Bloque gris con datos de solo lectura (notas, existencias, quién editó…). */
export function SheetInfo({ theme, children }: Readonly<{ theme: AppTheme; children: ReactNode }>) {
  return <View style={[styles.info, { backgroundColor: `${theme.colors.textMuted}0D` }]}>{children}</View>;
}

export function SheetInfoLine({ theme, icon, text, color }: Readonly<{ theme: AppTheme; icon: IconName; text: string; color?: string }>) {
  return (
    <View style={styles.infoLine}>
      <MaterialCommunityIcons name={icon} size={16} color={color ?? theme.colors.textMuted} />
      <Text style={[styles.infoText, { color: color ?? theme.colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

/** Fila de acción de un panel de opciones. La destructiva va al final, separada. */
export function SheetOptionRow({
  theme,
  icon,
  label,
  hint,
  destructive = false,
  right,
  onPress,
}: Readonly<{
  theme: AppTheme;
  icon: IconName;
  label: string;
  hint?: string;
  destructive?: boolean;
  /** Sustituye la flecha (p. ej. un interruptor). */
  right?: ReactNode;
  onPress: () => void;
}>) {
  const tint = destructive ? theme.colors.warningText : theme.colors.accentPrimaryText;
  return (
    <>
      {destructive ? <View style={[styles.divider, { backgroundColor: theme.colors.surfaceBorder }]} /> : null}
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={[styles.rowIcon, { backgroundColor: `${tint}14` }]}>
          <MaterialCommunityIcons name={icon} size={20} color={tint} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: destructive ? tint : theme.colors.textPrimary }]}>{label}</Text>
          {hint ? <Text style={[styles.rowHint, { color: theme.colors.textMuted }]}>{hint}</Text> : null}
        </View>
        {right ?? (destructive ? null : <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />)}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  info: { borderRadius: 12, padding: 12, gap: 8, marginBottom: 8 },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 },
  pressed: { opacity: 0.6 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  rowHint: { fontSize: 13, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
