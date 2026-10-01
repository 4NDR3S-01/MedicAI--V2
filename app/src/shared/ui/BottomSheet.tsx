import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppTheme } from '../theme';
import { MOTION, useReducedMotion } from './motion';

type BottomSheetProps = {
  theme: AppTheme;
  visible: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Panel inferior modal con entrada/salida animada. Se cierra con el botón
 * atrás de Android, tocando el fondo o desde el propio contenido.
 */
export function BottomSheet({
  theme,
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: Readonly<BottomSheetProps>) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);

  useEffect(() => {
    if (visible) {
      mountedRef.current = true;
      setMounted(true);
      progress.setValue(reducedMotion ? 1 : 0);
      if (!reducedMotion) {
        Animated.spring(progress, { toValue: 1, useNativeDriver: true, ...MOTION.enter }).start();
      }
      return;
    }

    if (!mountedRef.current) return;
    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : MOTION.fast,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        mountedRef.current = false;
        setMounted(false);
      }
    });
  }, [visible, reducedMotion, progress]);

  if (!mounted) return null;

  const sheetBackground = theme.mode === 'dark' ? '#0F2236' : '#FFFFFF';

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: height * 0.88,
              paddingBottom: Math.max(insets.bottom, 16),
              backgroundColor: sheetBackground,
              borderColor: theme.colors.surfaceBorder,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [Math.min(height * 0.6, 520), 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.inputBorder }]} />
          <Text style={[styles.title, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            typeof subtitle === 'string' ? (
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
            ) : (
              subtitle
            )
          ) : null}
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 12, 22, 0.55)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  body: { marginTop: 14, flexShrink: 1 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
