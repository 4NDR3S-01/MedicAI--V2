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
  const confirmRef = useRef<TextInput | null>(null);
  const { height } = useWindowDimensions();
  const logoSize = height < 700 ? 88 : 110;

  const inputColors = {
    backgroundColor: theme.colors.inputBackground,
    borderColor: theme.colors.inputBorder,
    color: theme.colors.textPrimary,
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <BackgroundDecor theme={theme} />
      <KeyboardAwareScrollView contentContainerStyle={styles.screen}>
        <View style={styles.header}>
          <BrandLogo theme={theme} size={logoSize} showName={false} />
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Nueva contraseña</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Crea una contraseña segura para proteger tu cuenta.
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
          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Nueva contraseña</Text>
          <View style={styles.passwordWrap}>
            <KeyboardAwareTextInput
              value={password}
              onChangeText={onPasswordChange}
              style={[styles.input, styles.passwordInput, inputColors]}
              secureTextEntry={!isPasswordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={theme.colors.inputPlaceholder}
              accessibilityLabel="Nueva contraseña"
              editable={!isSubmitting}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <Pressable
              onPress={() => setIsPasswordVisible((prev) => !prev)}
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

          <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Confirmar contraseña</Text>
          <View style={styles.passwordWrap}>
            <KeyboardAwareTextInput
              inputRef={confirmRef}
              value={confirmPassword}
              onChangeText={onConfirmPasswordChange}
              style={[styles.input, styles.passwordInput, inputColors]}
              secureTextEntry={!isConfirmPasswordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder="Repite tu contraseña"
              placeholderTextColor={theme.colors.inputPlaceholder}
              accessibilityLabel="Confirmar contraseña"
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!isSubmitting) onSubmit();
              }}
            />
            <Pressable
              onPress={() => setIsConfirmPasswordVisible((prev) => !prev)}
              style={styles.passwordToggle}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                isConfirmPasswordVisible
                  ? 'Ocultar confirmación de contraseña'
                  : 'Mostrar confirmación de contraseña'
              }
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
            accessibilityRole="button"
            accessibilityLabel="Actualizar contraseña"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.colors.buttonText} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: theme.colors.buttonText }]}>
                Actualizar contraseña
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={onCancel}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.colors.accentSecondary }]}>
              Cancelar
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
  secondaryButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});
