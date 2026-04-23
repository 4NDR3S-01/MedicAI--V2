import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BackgroundDecor, BrandLogo } from '../../components';
import type { AppTheme } from '../../theme';

type VerifyEmailPromptScreenProps = {
  theme: AppTheme;
  email: string;
  isSubmitting?: boolean;
  cooldownSeconds?: number;
  onResendEmail: () => void;
  onBackToLogin: () => void;
};

export function VerifyEmailPromptScreen({
  theme,
  email,
  isSubmitting = false,
  cooldownSeconds = 0,
  onResendEmail,
  onBackToLogin,
}: Readonly<VerifyEmailPromptScreenProps>) {
  const [isEmailSent, setIsEmailSent] = useState(false);

  const handleResend = async () => {
    await onResendEmail();
    setIsEmailSent(true);
    setTimeout(() => setIsEmailSent(false), 3000);
  };

  const isButtonDisabled = isSubmitting || cooldownSeconds > 0;
  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      <BackgroundDecor theme={theme} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BrandLogo theme={theme} size={100} showName={false} />
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
          {/* Icono de alerta */}
          <View style={styles.iconContainer}>
            <View
              style={[
                styles.iconBox,
                { backgroundColor: `${theme.colors.accentPrimary}15` },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={48}
                color={theme.colors.accentPrimary}
              />
            </View>
          </View>

          {/* Título */}
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            ¿Tienes problemas?
          </Text>

          {/* Subtítulo */}
          <Text
            style={[
              styles.subtitle,
              { color: theme.colors.textMuted },
            ]}
          >
            No hemos podido iniciar tu sesión porque tu correo electrónico aún no ha sido verificado.
          </Text>

          {/* Email display */}
          <View
            style={[
              styles.emailBox,
              {
                backgroundColor: theme.colors.inputBackground,
                borderColor: theme.colors.inputBorder,
              },
            ]}
          >
            <Ionicons
              name="mail-outline"
              size={18}
              color={theme.colors.textMuted}
            />
            <Text style={[styles.emailText, { color: theme.colors.textSecondary }]}>
              {maskedEmail}
            </Text>
          </View>

          {/* Instrucciones */}
          <View style={styles.instructionsContainer}>
            <View style={styles.instructionItem}>
              <View
                style={[
                  styles.stepNumber,
                  { backgroundColor: theme.colors.accentPrimary },
                ]}
              >
                <Text style={[styles.stepText, { color: theme.colors.buttonText }]}>
                  1
                </Text>
              </View>
              <Text
                style={[
                  styles.instructionText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                Solicita que reenviemos un nuevo correo de verificación
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View
                style={[
                  styles.stepNumber,
                  { backgroundColor: theme.colors.accentPrimary },
                ]}
              >
                <Text style={[styles.stepText, { color: theme.colors.buttonText }]}>
                  2
                </Text>
              </View>
              <Text
                style={[
                  styles.instructionText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                Busca en tu bandeja de entrada o spam
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View
                style={[
                  styles.stepNumber,
                  { backgroundColor: theme.colors.accentPrimary },
                ]}
              >
                <Text style={[styles.stepText, { color: theme.colors.buttonText }]}>
                  3
                </Text>
              </View>
              <Text
                style={[
                  styles.instructionText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                Haz clic en el enlace para verificar tu correo
              </Text>
            </View>
          </View>

          {/* Success message */}
          {isEmailSent && (
            <View
              style={[
                styles.successBox,
                { backgroundColor: `${theme.colors.success}15` },
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={theme.colors.success}
              />
              <Text
                style={[
                  styles.successText,
                  { color: theme.colors.success },
                ]}
              >
                Correo reenviado correctamente
              </Text>
            </View>
          )}

          {/* Resend button */}
          <Pressable
            style={[
              styles.primaryButton,
              { backgroundColor: theme.colors.accentPrimary },
              isButtonDisabled && styles.buttonDisabled,
            ]}
            onPress={handleResend}
            disabled={isButtonDisabled}
            accessibilityState={{ disabled: isButtonDisabled }}
          >
            <Ionicons
              name="mail-outline"
              size={20}
              color={theme.colors.buttonText}
            />
            <Text
              style={[
                styles.primaryButtonText,
                { color: theme.colors.buttonText },
              ]}
            >
              {isSubmitting
                ? 'Reenviando…'
                : cooldownSeconds > 0
                  ? `Reenviar en ${cooldownSeconds}s`
                  : 'Reenviar correo de verificación'}
            </Text>
          </Pressable>

          {/* Back to login */}
          <Pressable
            style={styles.secondaryButton}
            onPress={onBackToLogin}
            disabled={isSubmitting}
            accessibilityState={{ disabled: isSubmitting }}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: theme.colors.textMuted },
              ]}
            >
              Volver a inicio de sesión
            </Text>
          </Pressable>
        </View>

        <Text
          style={[
            styles.helpText,
            { color: theme.colors.textMuted },
          ]}
        >
          ¿Necesitas ayuda? Contacta con soporte
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    gap: 14,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  iconBox: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
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
    textAlign: 'center',
  },
  emailBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emailText: {
    fontSize: 14,
    fontWeight: '500',
  },
  instructionsContainer: {
    gap: 14,
    marginVertical: 8,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  stepText: {
    fontWeight: '700',
    fontSize: 14,
  },
  instructionText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
    paddingTop: 4,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  successText: {
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
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
  helpText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 24,
  },
});
