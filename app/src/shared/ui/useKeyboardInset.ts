import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from './motion';

/**
 * Espacio inferior que hay que reservar para que el teclado no tape el
 * contenido, en una pantalla que ya respeta el área segura inferior.
 *
 * Por qué no KeyboardAvoidingView: con edge-to-edge (obligatorio en Expo SDK
 * 54+) Android ya no redimensiona la ventana y KeyboardAvoidingView calcula mal
 * el solapamiento. Además, cada plataforma informa el alto distinto:
 * - Android (ReactRootView): alto del teclado SIN la barra de navegación, que
 *   el SafeAreaView ya reservó → se usa tal cual.
 * - iOS: alto que INCLUYE la zona del indicador de inicio → se resta.
 */
export function useKeyboardInset() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const isIOS = Platform.OS === 'ios';
    const animate = (event?: KeyboardEvent) => {
      if (reducedMotion) return;
      LayoutAnimation.configureNext({
        duration: event?.duration || 220,
        update: { type: isIOS ? LayoutAnimation.Types.keyboard : LayoutAnimation.Types.easeInEaseOut },
      });
    };

    const show = Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      animate(event);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', (event) => {
      animate(event);
      setKeyboardHeight(0);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [reducedMotion]);

  const bottomInset =
    Platform.OS === 'ios' ? Math.max(0, keyboardHeight - insets.bottom) : keyboardHeight;
  // Distancia desde el borde inferior de la PANTALLA hasta el borde superior
  // del teclado (para capas a pantalla completa, sin SafeAreaView inferior).
  const screenInset =
    keyboardHeight > 0 && Platform.OS === 'android' ? keyboardHeight + insets.bottom : keyboardHeight;

  return { keyboardVisible: keyboardHeight > 0, bottomInset, screenInset };
}
