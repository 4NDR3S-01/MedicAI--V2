import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { AppTheme } from '../theme';
import { PressableScale } from './PressableScale';

type AppButtonProps = {
  theme: AppTheme;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function AppButton({
  theme,
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'right',
  style,
  accessibilityHint,
}: Readonly<AppButtonProps>) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: theme.colors.accentPrimary, fg: theme.colors.buttonText, border: theme.colors.accentPrimary },
    secondary: { bg: theme.colors.inputBackground, fg: theme.colors.textSecondary, border: theme.colors.inputBorder },
    ghost: { bg: 'transparent', fg: theme.colors.accentSecondary, border: 'transparent' },
  }[variant];

  const iconNode = icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled && !loading ? 0.5 : 1 },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : (
          <>
            {iconPosition === 'left' ? iconNode : null}
            <Text style={[styles.label, { color: palette.fg }]} numberOfLines={1}>
              {label}
            </Text>
            {iconPosition === 'right' ? iconNode : null}
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 16, fontWeight: '800' },
});
