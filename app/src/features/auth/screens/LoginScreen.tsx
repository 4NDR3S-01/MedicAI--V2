import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  BackgroundDecor,
  BrandLogo,
  KeyboardAwareScrollView,
  KeyboardAwareTextInput,
} from '../../../shared/ui';
import type { AppTheme } from '../../../shared/theme';

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
  const passwordRef = useRef<TextInput | null>(null);
  const { height } = useWindowDimensions();
  // Logo más pequeño en móviles bajos para que el formulario quepa sin scroll.
  const logoSize = height < 700 ? 96 : 130;

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(prev => !prev);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <BackgroundDecor theme={theme} />
      <KeyboardAwareScrollView contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <BrandLogo theme={theme} size={logoSize} showName={false} />
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
            Correo electrónico
          </Text>
          <KeyboardAwareTextInput
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
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            placeholder="tu@dominio.com"
            placeholderTextColor={theme.colors.inputPlaceholder}
            accessibilityLabel="Correo electrónico"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          {/* Contraseña */}
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
            Contraseña
          </Text>
          <View style={styles.passwordWrap}>
            <KeyboardAwareTextInput
              inputRef={passwordRef}
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
              placeholder="Tu contraseña"
              placeholderTextColor={theme.colors.inputPlaceholder}
              autoCorrect={false}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel="Contraseña"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (!isSubmitting) onSubmit();
              }}
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
            accessibilityRole="button"
            accessibilityLabel="Entrar"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.colors.buttonText} />
            ) : (
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: theme.colors.buttonText },
                ]}
              >
                Entrar
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.forgotButton}
            onPress={onForgotPassword}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: theme.colors.textMuted },
              ]}
            >
              Recuperar contraseña
            </Text>
          </Pressable>

          <View style={[styles.divider, { backgroundColor: theme.colors.surfaceBorder }]} />

          <Pressable
            style={styles.registerButton}
            onPress={onNavigateToRegister}
            disabled={isSubmitting}
            accessibilityRole="button"
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
  forgotButton: {
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
  },
  registerButton: {
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: 'center',
  },
  divider: {
    height: 1,
    opacity: 0.55,
    marginHorizontal: 8,
    marginVertical: 2,
  },
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
