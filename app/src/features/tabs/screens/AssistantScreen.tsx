import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppTheme } from '../../../shared/theme';

export type AssistantScreenProps = {
  theme: AppTheme;
  onClose: () => void;
};

/**
 * Asistente IA: pantalla a pantalla completa (no ocupa un slot en la barra inferior)
 * para no saturar la navegación (4 pestañas + FAB Familia).
 */
export function AssistantScreen({ theme, onClose }: Readonly<AssistantScreenProps>) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12) + 20;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View
        style={[
          styles.topBar,
          {
            paddingTop: Math.max(insets.top, 12),
            borderBottomColor: theme.colors.surfaceBorder,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          Asistente IA
        </Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.accentSecondary}22` }]}>
            <MaterialCommunityIcons name="robot-outline" size={32} color={theme.colors.accentSecondary} />
          </View>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Tu asistente de salud</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Aquí conectaremos un chat con contexto de tus medicamentos y citas, con avisos claros de que
            no sustituye el criterio médico.
          </Text>
        </View>

        <View
          style={[
            styles.placeholderCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.surfaceBorder,
            },
          ]}
        >
          <MaterialCommunityIcons name="message-text-outline" size={22} color={theme.colors.textMuted} />
          <Text style={[styles.placeholderTitle, { color: theme.colors.textSecondary }]}>
            Conversación
          </Text>
          <Text style={[styles.placeholderBody, { color: theme.colors.textMuted }]}>
            El envío de mensajes y la integración con el modelo estarán disponibles cuando conectemos el
            backend de IA.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  topBarSpacer: {
    width: 44,
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 20,
    gap: 16,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    gap: 12,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  placeholderCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    gap: 8,
    alignItems: 'flex-start',
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  placeholderBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
