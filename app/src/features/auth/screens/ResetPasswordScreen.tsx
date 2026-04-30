import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackgroundDecor, BrandLogo } from '../../../shared/ui';
import type { AppTheme } from '../../../shared/theme';

type ResetPasswordScreenProps = {
  theme: AppTheme;
  password: string;
  confirmPassword: string;
  isSubmitting?: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ResetPasswordScreen({
  theme,
  password,
  confirmPassword,
  isSubmitting = false,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onCancel,
}: Readonly<ResetPasswordScreenProps>) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const togglePasswordVisibility = () => {
    setIsPasswordVisible((prev) => !prev);
  };

  const toggleConfirmPasswordVisibility = () => {
    setIsConfirmPasswordVisible((prev) => !prev);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      <BackgroundDecor theme={theme} />

      <View style={styles.header}>
        <BrandLogo theme={theme} size={110} showName={false} />
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Nueva contrasena</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Crea una contrasena segura para proteger tu cuenta.
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
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Nueva contrasena</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            value={password}
            onChangeText={onPasswordChange}
            style={[
              styles.input,
              styles.passwordInput,
              {
                backgroundColor: theme.colors.inputBackground,
                borderColor: theme.colors.inputBorder,
                color: theme.colors.textPrimary,
              },
            ]}
            secureTextEntry={!isPasswordVisible}
            autoCapitalize="none"
            placeholder="Minimo 8 caracteres"
            placeholderTextColor={theme.colors.inputPlaceholder}
            editable={!isSubmitting}
          />
          <Pressable
            onPress={togglePasswordVisibility}
            style={styles.passwordToggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.accentSecondary}
            />
          </Pressable>
        </View>

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Confirmar contrasena</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            value={confirmPassword}
            onChangeText={onConfirmPasswordChange}
            style={[
              styles.input,
              styles.passwordInput,
              {
                backgroundColor: theme.colors.inputBackground,
                borderColor: theme.colors.inputBorder,
                color: theme.colors.textPrimary,
              },
            ]}
            secureTextEntry={!isConfirmPasswordVisible}
            autoCapitalize="none"
            placeholder="Repite tu contrasena"
            placeholderTextColor={theme.colors.inputPlaceholder}
            editable={!isSubmitting}
          />
          <Pressable
            onPress={toggleConfirmPasswordVisibility}
            style={styles.passwordToggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isConfirmPasswordVisible ? 'Ocultar contrasena de confirmacion' : 'Mostrar contrasena de confirmacion'}
          >
            <Ionicons
              name={isConfirmPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.accentSecondary}
            />
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.primaryButton,
            { backgroundColor: theme.colors.accentPrimary },
            isSubmitting && styles.buttonDisabled,
          ]}
          onPress={onSubmit}
          disabled={isSubmitting}
          accessibilityState={{ disabled: isSubmitting }}
        >
          <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>
            {isSubmitting ? 'Actualizando…' : 'Actualizar contrasena'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={onCancel}
          disabled={isSubmitting}
          accessibilityState={{ disabled: isSubmitting }}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.colors.accentSecondary }]}>
            Cancelar
          </Text>
        </Pressable>
      </View>
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
  passwordWrap: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 74,
  },
  passwordToggle: {
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 3,
  },
  primaryButton: {
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
