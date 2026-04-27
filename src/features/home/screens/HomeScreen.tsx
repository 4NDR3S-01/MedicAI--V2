import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BackgroundDecor, BrandLogo } from '../../../shared/ui';
import type { AppTheme } from '../../../shared/theme';

export type HomeScreenProps = {
  theme: AppTheme;
  userEmail: string | null;
  isSigningOut: boolean;
  onSignOut: () => void;
};

export function HomeScreen({ theme, userEmail, isSigningOut, onSignOut }: Readonly<HomeScreenProps>) {
  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <BackgroundDecor theme={theme} />

      <View style={styles.header}>
        <BrandLogo theme={theme} size={100} showName={false} />
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>MedicAI</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Tu espacio para medicamentos, citas y seguimiento de salud.
        </Text>
        {userEmail ? (
          <Text style={[styles.email, { color: theme.colors.textSecondary }]}>{userEmail}</Text>
        ) : null}
      </View>

      <Pressable
        style={[
          styles.primaryButton,
          { backgroundColor: theme.colors.accentPrimary },
          isSigningOut && styles.buttonDisabled,
        ]}
        onPress={onSignOut}
        disabled={isSigningOut}
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        accessibilityState={{ disabled: isSigningOut }}
      >
        <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>
          {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 8,
    gap: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: '94%',
    textAlign: 'center',
  },
  email: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryButtonText: {
    fontWeight: '800',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
