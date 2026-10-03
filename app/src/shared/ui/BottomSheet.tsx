import type { ReactNode } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppTheme } from '../theme';
import { MOTION } from './motion';
import { useSheetTransition } from './useSheetTransition';

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
  const { mounted, progress, onLayout } = useSheetTransition(visible, MOTION.fast);

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
          onLayout={onLayout}
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
