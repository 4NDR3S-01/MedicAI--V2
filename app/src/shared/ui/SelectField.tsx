import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { AppTheme } from '../theme';
import { useFieldColors } from './FormField';
import { MOTION, useReducedMotion } from './motion';
import { Portal } from './Portal';

export type SelectOption<T extends string> = { value: T; label: string };

type SelectFieldProps<T extends string> = {
  theme: AppTheme;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Nombre del campo para lectores de pantalla, p. ej. "Unidad de la dosis". */
  accessibilityLabel: string;
  invalid?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

type Anchor = { x: number; y: number; width: number; height: number };

const OPTION_HEIGHT = 46;
const MENU_PADDING = 6;
const MENU_MAX_HEIGHT = 300;
const MENU_MIN_WIDTH = 150;
const SCREEN_MARGIN = 12;

/**
 * Lista desplegable compacta (tipo <select>): muestra el valor con una flecha
 * y abre un menú anclado al control, encima del resto de la interfaz (también
 * de los paneles del Portal). Pensada para listas cortas de opciones.
 */
export function SelectField<T extends string>({
  theme,
  value,
  options,
  onChange,
  accessibilityLabel,
  invalid = false,
  disabled = false,
  style,
}: Readonly<SelectFieldProps<T>>) {
  const anchorRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = anchor !== null;
  const colors = useFieldColors(theme, open, invalid);
  const selected = options.find((option) => option.value === value);

  const openMenu = () => {
    if (disabled) return;
    Keyboard.dismiss();
    anchorRef.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  };

  const close = () => setAnchor(null);

  return (
    <>
      <Pressable
        ref={anchorRef}
        onPress={openMenu}
        disabled={disabled}
        accessibilityRole="combobox"
        accessibilityLabel={`${accessibilityLabel}: ${selected?.label ?? value}`}
        accessibilityHint="Abre la lista de opciones"
        accessibilityState={{ expanded: open, disabled }}
        style={({ pressed }) => [styles.trigger, colors, { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}
      >
        <Text style={[styles.triggerText, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {selected?.label ?? value}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
      </Pressable>

      {anchor ? (
        <SelectMenu
          theme={theme}
          anchor={anchor}
          options={options}
          value={value}
          onSelect={(next) => {
            onChange(next);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function SelectMenu<T extends string>({
  theme,
  anchor,
  options,
  value,
  onSelect,
  onClose,
}: Readonly<{
  theme: AppTheme;
  anchor: Anchor;
  options: readonly SelectOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}>) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const startedRef = useRef(false);

  // El menú vive en el Portal: se monta un render después. La entrada arranca
  // cuando ya está en pantalla, si no el resorte termina antes de verse.
  const handleLayout = () => {
    if (startedRef.current || reducedMotion) return;
    startedRef.current = true;
    Animated.spring(progress, { toValue: 1, useNativeDriver: true, ...MOTION.enter, overshootClamping: true }).start();
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const menuWidth = Math.max(anchor.width, MENU_MIN_WIDTH);
  const menuHeight = Math.min(options.length * OPTION_HEIGHT + MENU_PADDING * 2, MENU_MAX_HEIGHT);
  const spaceBelow = screenHeight - (anchor.y + anchor.height) - SCREEN_MARGIN;
  const opensUp = spaceBelow < menuHeight && anchor.y > spaceBelow;
  const top = opensUp ? Math.max(SCREEN_MARGIN, anchor.y - menuHeight - 6) : anchor.y + anchor.height + 6;
  // Alineado al borde derecho del control, sin salirse de la pantalla.
  const left = Math.min(
    Math.max(SCREEN_MARGIN, anchor.x + anchor.width - menuWidth),
    screenWidth - menuWidth - SCREEN_MARGIN,
  );

  const surface = theme.mode === 'dark' ? '#12283D' : '#FFFFFF';

  return (
    <Portal>
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cerrar lista"
        />
        <Animated.View
          accessibilityViewIsModal
          onLayout={handleLayout}
          style={[
            styles.menu,
            {
              top,
              left,
              width: menuWidth,
              maxHeight: menuHeight,
              backgroundColor: surface,
              borderColor: theme.colors.surfaceBorder,
              opacity: progress,
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [opensUp ? 8 : -8, 0] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.menuContent}>
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onSelect(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.option,
                    isSelected && { backgroundColor: `${theme.colors.accentPrimary}16` },
                    pressed && { backgroundColor: `${theme.colors.textMuted}1A` },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: isSelected ? theme.colors.accentPrimary : theme.colors.textPrimary, fontWeight: isSelected ? '800' : '600' },
                    ]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  {isSelected ? <Ionicons name="checkmark" size={18} color={theme.colors.accentPrimary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  triggerText: { flex: 1, fontSize: 16, fontWeight: '700' },
  menu: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  menuContent: { padding: MENU_PADDING },
  option: {
    height: OPTION_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  optionText: { flex: 1, fontSize: 15.5 },
});
