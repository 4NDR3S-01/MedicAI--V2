import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';

export type AppointmentsScreenProps = {
  theme: AppTheme;
  contentBottomInset: number;
};

export function AppointmentsScreen({ theme, contentBottomInset }: Readonly<AppointmentsScreenProps>) {
  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: contentBottomInset }]}
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.accentSecondary}22` }]}>
            <MaterialCommunityIcons name="calendar-clock" size={32} color={theme.colors.accentSecondary} />
          </View>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Citas</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Agenda médica, recordatorios y enlaces a ubicaciones. Estamos preparando la sincronización con
            tu calendario.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
});
