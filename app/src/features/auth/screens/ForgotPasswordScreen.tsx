import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  BackgroundDecor,
  BrandLogo,
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../../shared/ui';
import type { AppTheme } from '../../../shared/theme';

type ForgotPasswordScreenProps = {
  theme: AppTheme;
  email: string;
  isSubmitting?: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  onBackToLogin: () => void;
};

export function ForgotPasswordScreen({
  theme,
  email,
  isSubmitting = false,
  onEmailChange,
  onSubmit,
  onBackToLogin,
}: Readonly<ForgotPasswordScreenProps>) {
  const { height } = useWindowDimensions();
  const logoSize = height < 700 ? 88 : 110;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <BackgroundDecor theme={theme} />
      <KeyboardAwareScrollView contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <BrandLogo theme={theme} size={logoSize} showName={false} />
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Recuperar contraseña</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Ingresa tu correo electrónico y te enviaremos instrucciones seguras para restablecerla.
          </Text>
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
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Correo electrónico</Text>
          <KeyboardAwareTextInput
            value={email}
            onChangeText={onEmailChange}
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.inputBackground,
                borderColor: theme.colors.inputBorder,
                color: theme.colors.textPrimary,
              },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholder="tu@dominio.com"
            placeholderTextColor={theme.colors.inputPlaceholder}
            accessibilityLabel="Correo electrónico"
            editable={!isSubmitting}
            returnKeyType="send"
            onSubmitEditing={() => {
              if (!isSubmitting) onSubmit();
            }}
          />

          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: theme.colors.accentPrimary },
              isSubmitting && styles.buttonDisabled,
            ]}
            onPress={onSubmit}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Enviar enlace"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.colors.buttonText} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>
                Enviar enlace
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={onBackToLogin}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.accentSecondary }]}>
              Volver al inicio de sesión
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
  },
  header: {
    marginTop: 8,
    marginBottom: 24,
    gap: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: '94%',
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  label: {
    fontSize: 13,
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  primaryButton: {
    minHeight: 50,
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
