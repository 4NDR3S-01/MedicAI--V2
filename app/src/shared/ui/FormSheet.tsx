import { useEffect, useRef, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppTheme } from '../theme';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';
import { Portal } from './Portal';
import { useKeyboardInset } from './useKeyboardInset';
import { useSheetTransition } from './useSheetTransition';

type FormSheetProps = {
  theme: AppTheme;
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Impide cerrar (p. ej. mientras se guarda). */
  dismissDisabled?: boolean;
  footer?: ReactNode;
  /** Al cambiar (p. ej. el paso de un asistente), el contenido vuelve arriba. */
  scrollToTopKey?: string | number;
  children: ReactNode;
};

/**
 * Panel inferior para formularios. Se monta en el Portal (ventana principal),
 * así el teclado se gestiona igual en Android (edge-to-edge) e iOS: el panel se
 * reduce y el pie con los botones queda siempre justo encima del teclado.
 */
export function FormSheet({
  theme,
  visible,
  title,
  subtitle,
  onClose,
  dismissDisabled = false,
  footer,
  scrollToTopKey,
  children,
}: Readonly<FormSheetProps>) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { keyboardVisible, screenInset } = useKeyboardInset();
  const { mounted, progress, onLayout } = useSheetTransition(visible);

  const requestClose = () => {
    if (dismissDisabled) return;
    Keyboard.dismiss();
    onClose();
  };

  // Botón atrás de Android: cierra el panel en vez de salir de la pantalla.
  // Se registra una sola vez al abrir: con paneles anidados, el último en
  // abrirse es el primero en recibir el evento.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestCloseRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [visible]);

  if (!mounted) return null;

  const sheetBackground = theme.mode === 'dark' ? '#0F2236' : '#FFFFFF';
  const bottomPadding = keyboardVisible ? screenInset : insets.bottom;

  return (
    <Portal>
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
        </Animated.View>

        <View
          pointerEvents="box-none"
          style={[styles.frame, { paddingTop: insets.top + 24, paddingBottom: bottomPadding }]}
        >
          <Animated.View
            accessibilityViewIsModal
            onLayout={onLayout}
            style={[
              styles.sheet,
              {
                backgroundColor: sheetBackground,
                borderColor: theme.colors.surfaceBorder,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [height, 0],
                    }),
                  },
                ],
              },
              keyboardVisible ? styles.sheetWithKeyboard : null,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: theme.colors.inputBorder }]} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: theme.colors.textPrimary }]} accessibilityRole="header">
                  {title}
                </Text>
                {subtitle ? (
                  <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={requestClose}
                disabled={dismissDisabled}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                style={[styles.closeButton, { backgroundColor: `${theme.colors.textMuted}18` }]}
              >
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              reserveKeyboardSpace={false}
              scrollToTopKey={scrollToTopKey}
              contentContainerStyle={styles.body}
              revealExtraSpace={24}
            >
              {children}
            </KeyboardAwareScrollView>

            {footer ? (
              <View
                style={[
                  styles.footer,
                  {
                    borderTopColor: theme.colors.surfaceBorder,
                    paddingBottom: keyboardVisible || Platform.OS === 'android' ? 12 : 4,
                  },
                ]}
              >
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(3, 12, 22, 0.55)' },
  frame: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    flex: 1,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  sheetWithKeyboard: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13.5, lineHeight: 19 },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 20 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
