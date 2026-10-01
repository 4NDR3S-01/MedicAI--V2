import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundDecor, BrandLogo } from '../../../shared/ui';
import type { AppTheme } from '../../../shared/theme';

export type AuthActionStatusVariant = 'loading' | 'success' | 'warning' | 'error' | 'info';

type AuthActionButton = {
  label: string;
  onPress: () => void;
};

type AuthActionStatusScreenProps = {
  theme: AppTheme;
  variant: AuthActionStatusVariant;
  title: string;
  message: string;
  primaryAction?: AuthActionButton;
  secondaryAction?: AuthActionButton;
};

const getStatusAccent = (theme: AppTheme, variant: AuthActionStatusVariant) => {
  switch (variant) {
    case 'success':
      return theme.colors.success;
    case 'warning':
      return theme.colors.accentTertiary;
    case 'info':
      return theme.colors.accentSecondary;
    case 'error':
      return '#D64545';
    case 'loading':
    default:
      return theme.colors.accentPrimary;
  }
};

const getStatusIcon = (variant: Exclude<AuthActionStatusVariant, 'loading'>) => {
  switch (variant) {
    case 'success':
      return 'checkmark-circle';
    case 'warning':
      return 'warning-outline';
    case 'info':
      return 'information-circle-outline';
    case 'error':
    default:
      return 'close-circle-outline';
  }
};

export function AuthActionStatusScreen({
  theme,
  variant,
  title,
  message,
  primaryAction,
  secondaryAction,
}: Readonly<AuthActionStatusScreenProps>) {
  const { height } = useWindowDimensions();
  const logoSize = height < 700 ? 88 : 124;
  const accentColor = getStatusAccent(theme, variant);
  const isLoading = variant === 'loading';

  return (
    // AppRoot ya aplica el área segura; el scroll evita que el contenido se
    // corte en móviles bajos.
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <BackgroundDecor theme={theme} />
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <BrandLogo theme={theme} size={logoSize} showName={false} />
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.surfaceBorder,
              },
            ]}
          >
            <View style={styles.iconContainer}>
              <View style={[styles.iconBox, { backgroundColor: `${accentColor}16` }]}>
                {isLoading ? (
                  <ActivityIndicator size="large" color={accentColor} />
                ) : (
                  <Ionicons name={getStatusIcon(variant)} size={42} color={accentColor} />
                )}
              </View>
            </View>

            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
            <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>

            {primaryAction ? (
              <Pressable
                style={[styles.primaryButton, { backgroundColor: theme.colors.accentPrimary }]}
                onPress={primaryAction.onPress}
              >
                <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>
                  {primaryAction.label}
                </Text>
              </Pressable>
            ) : null}

            {secondaryAction ? (
              <Pressable style={styles.secondaryButton} onPress={secondaryAction.onPress}>
                <Text style={[styles.secondaryButtonText, { color: theme.colors.accentSecondary }]}>
                  {secondaryAction.label}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 24,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 22,
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    gap: 12,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 4,
  },
  iconBox: {
    width: 82,
    height: 82,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 27,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
