import { useState, type ReactNode, type Ref } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInputProps,
} from "react-native";

import type { AppTheme } from "../../../../shared/theme";

export const ERROR_COLOR = "#D64545";

type FieldShellProps = {
  theme: AppTheme;
  label: string;
  optional?: boolean;
  error?: string | null;
  helper?: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
};

/** Etiqueta + control + mensaje de ayuda o error. */
export function FieldShell({
  theme,
  label,
  optional,
  error,
  helper,
  onLayout,
  children,
}: Readonly<FieldShellProps>) {
  return (
    <View style={styles.block} onLayout={onLayout}>
      {label ? (
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          {label}
          {optional ? <Text style={{ color: theme.colors.textMuted }}> · opcional</Text> : null}
        </Text>
      ) : null}
      {children}
      {error ? (
        <View style={styles.messageRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={14} color={ERROR_COLOR} />
          <Text style={[styles.message, { color: ERROR_COLOR }]}>{error}</Text>
        </View>
      ) : helper ? (
        typeof helper === "string" ? (
          <Text style={[styles.message, { color: theme.colors.textMuted }]}>{helper}</Text>
        ) : (
          helper
        )
      ) : null}
    </View>
  );
}

export function useFieldColors(theme: AppTheme, focused: boolean, hasError: boolean) {
  let borderColor = theme.colors.inputBorder;
  if (hasError) borderColor = ERROR_COLOR;
  else if (focused) borderColor = theme.colors.accentPrimary;
  return { borderColor, backgroundColor: theme.colors.inputBackground };
}

type TextFieldProps = Omit<TextInputProps, "style"> & {
  theme: AppTheme;
  label: string;
  optional?: boolean;
  error?: string | null;
  helper?: ReactNode;
  inputRef?: Ref<TextInput>;
  onLayout?: (event: LayoutChangeEvent) => void;
  /** Muestra el botón de mostrar/ocultar contraseña. */
  secureToggle?: boolean;
  trailing?: ReactNode;
  /** Marca el borde como inválido sin mostrar mensaje (lo muestra el padre). */
  invalid?: boolean;
};

export function TextField({
  theme,
  label,
  optional,
  error,
  helper,
  inputRef,
  onLayout,
  secureToggle,
  trailing,
  onFocus,
  onBlur,
  secureTextEntry,
  invalid,
  accessibilityLabel,
  ...inputProps
}: Readonly<TextFieldProps>) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const colors = useFieldColors(theme, focused, Boolean(error) || Boolean(invalid));

  return (
    <FieldShell
      theme={theme}
      label={label}
      optional={optional}
      error={error}
      helper={helper}
      onLayout={onLayout}
    >
      <View style={[styles.inputWrap, colors]}>
        <TextInput
          ref={inputRef}
          {...inputProps}
          secureTextEntry={secureToggle ? !revealed : secureTextEntry}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={error ?? undefined}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          placeholderTextColor={theme.colors.inputPlaceholder}
          style={[styles.input, { color: theme.colors.textPrimary }]}
        />
        {trailing}
        {secureToggle ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            hitSlop={10}
            style={styles.trailingButton}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={theme.colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  label: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    minHeight: 52,
  },
  input: { flex: 1, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  trailingButton: { paddingHorizontal: 14, alignSelf: "stretch", justifyContent: "center" },
  messageRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  message: { fontSize: 12.5, lineHeight: 17, flexShrink: 1 },
});
