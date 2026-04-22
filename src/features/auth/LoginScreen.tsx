import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BackgroundDecor, BrandLogo } from '../../components';
import type { AppTheme } from '../../theme';

export type LoginFormState = {
  email: string;
  password: string;
};

type LoginScreenProps = {
  theme: AppTheme;
  form: LoginFormState;
  isSubmitting?: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onForgotPassword: () => void;
  onNavigateToRegister: () => void;
};

export function LoginScreen({
  theme,
  form,
  isSubmitting = false,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onForgotPassword,
  onNavigateToRegister,
}: Readonly<LoginScreenProps>) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(prev => !prev);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      <BackgroundDecor theme={theme} />

      <View style={styles.header}>
        <BrandLogo theme={theme} size={130} showName={false} />
        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
          Inicio de sesión
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          Gestiona medicamentos, citas médicas y asistencia de IA en un solo lugar.
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
        {/* Correo */}
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          Correo profesional
        </Text>
        <TextInput
          value={form.email}
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
          keyboardType="email-address"
          placeholder="tu@dominio.com"
          placeholderTextColor={theme.colors.inputPlaceholder}
        />

        {/* Contraseña */}
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          Contraseña
        </Text>
        <View style={styles.passwordWrap}>
          <TextInput
            value={form.password}
            onChangeText={onPasswordChange}
            secureTextEntry={!isPasswordVisible}
            style={[
              styles.input,
              styles.passwordInput,
              {
                backgroundColor: theme.colors.inputBackground,
                borderColor: theme.colors.inputBorder,
                color: theme.colors.textPrimary,
              },
            ]}
            placeholder="********"
            placeholderTextColor={theme.colors.inputPlaceholder}
            autoCorrect={false}
            autoCapitalize="none"
          />

          <Pressable
            onPress={togglePasswordVisibility}
            style={styles.passwordToggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.accentSecondary}
            />
          </Pressable>
        </View>

        {/* BOTÓN */}
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
          <Text
            style={[
              styles.primaryButtonText,
              { color: theme.colors.buttonText },
            ]}
          >
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={onForgotPassword}
          disabled={isSubmitting}
          accessibilityState={{ disabled: isSubmitting }}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              { color: theme.colors.textMuted },
            ]}
          >
            Recuperar contrasena
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={onNavigateToRegister}
          disabled={isSubmitting}
          accessibilityState={{ disabled: isSubmitting }}
        >
          <Text
            style={[
              styles.secondaryButtonText,
              { color: theme.colors.accentSecondary },
            ]}
          >
            Crear cuenta nueva
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
    fontSize: 36,
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