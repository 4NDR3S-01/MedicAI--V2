import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode, type Ref } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useReducedMotion } from './motion';
import { useKeyboardInset } from './useKeyboardInset';
import { BufferedTextInput } from './BufferedTextInput';

const RevealFocusedInputContext = createContext<() => void>(() => undefined);

/**
 * TextInput que, al enfocarse dentro de un KeyboardAwareScrollView, se
 * desplaza a la vista (p. ej. al pasar de correo a contraseña con el teclado
 * ya abierto). Fuera de él se comporta como un TextInput normal.
 */
export function KeyboardAwareTextInput({
  onFocus,
  inputRef,
  ...props
}: TextInputProps & { inputRef?: Ref<TextInput> }) {
  const reveal = useContext(RevealFocusedInputContext);
  return (
    <BufferedTextInput
      inputRef={inputRef}
      {...props}
      onFocus={(event) => {
        onFocus?.(event);
        // Tras el foco, cuando el campo ya es el "currentlyFocusedInput".
        requestAnimationFrame(reveal);
      }}
    />
  );
}

type KeyboardAwareScrollViewProps = {
  children: ReactNode;
  /** Estilo del contenido (padding, gap…). Ocupa al menos toda la altura. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * Espacio que se intenta dejar visible bajo el campo enfocado, para que el
   * botón principal que suele ir debajo tampoco quede tapado.
   */
  revealExtraSpace?: number;
  /**
   * Reserva el espacio del teclado con padding inferior. Desactívalo si un
   * contenedor superior ya lo hace (p. ej. FormSheet).
   */
  reserveKeyboardSpace?: boolean;
  /** Al cambiar (p. ej. el paso de un asistente), vuelve arriba del todo. */
  scrollToTopKey?: string | number;
  style?: StyleProp<ViewStyle>;
};

/**
 * ScrollView que reserva el espacio del teclado (ver useKeyboardInset) y
 * desplaza el campo enfocado a la vista. Sustituye a KeyboardAvoidingView en
 * pantallas con formularios: funciona igual en Android (edge-to-edge) e iOS.
 */
export function KeyboardAwareScrollView({
  children,
  contentContainerStyle,
  revealExtraSpace = 96,
  reserveKeyboardSpace = true,
  scrollToTopKey,
  style,
}: Readonly<KeyboardAwareScrollViewProps>) {
  const { keyboardVisible, bottomInset } = useKeyboardInset();
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView | null>(null);
  const contentRef = useRef<View | null>(null);
  const viewportHeight = useRef(0);

  useEffect(() => {
    if (scrollToTopKey === undefined) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollToTopKey]);

  const revealFocusedInput = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput();
    const content = contentRef.current;
    if (!input || !content) return;

    input.measureLayout(
      content,
      (_x, y, _width, height) => {
        // Prioridad: que el campo se vea entero; si cabe, también lo de abajo.
        const showBelow = y + height + revealExtraSpace - viewportHeight.current;
        const target = Math.min(y - 16, showBelow);
        scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: !reducedMotion });
      },
      () => undefined,
    );
  }, [reducedMotion, revealExtraSpace]);

  return (
    <RevealFocusedInputContext.Provider value={revealFocusedInput}>
      <View style={[styles.flex, style, { paddingBottom: reserveKeyboardSpace ? bottomInset : 0 }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.grow}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          onLayout={(event) => {
            viewportHeight.current = event.nativeEvent.layout.height;
            // El teclado cambió el alto visible: volver a mostrar el campo.
            if (keyboardVisible) revealFocusedInput();
          }}
        >
          <View ref={contentRef} collapsable={false} style={[styles.grow, contentContainerStyle]}>
            {children}
          </View>
        </ScrollView>
      </View>
    </RevealFocusedInputContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
