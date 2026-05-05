import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';

export type FamilyScreenProps = {
  theme: AppTheme;
  contentBottomInset: number;
};

export function FamilyScreen({ theme, contentBottomInset }: Readonly<FamilyScreenProps>) {
  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: contentBottomInset }]}
      >
        <View
          style={[
            styles.hero,
            {
              backgroundColor: `${theme.colors.accentPrimary}14`,
              borderColor: `${theme.colors.accentPrimary}44`,
            },
          ]}
        >
          <View style={[styles.fabMini, { backgroundColor: theme.colors.accentPrimary }]}>
            <MaterialCommunityIcons name="account-group" size={28} color={theme.colors.buttonText} />
          </View>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Tu familia</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Gestiona perfiles de quienes cuidas: adultos mayores, niños o dependientes. MedicAI
            centralizará citas y medicación por persona.
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
          ]}
        >
          <View style={styles.row}>
            <MaterialCommunityIcons name="account-heart-outline" size={22} color={theme.colors.accentSecondary} />
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>Miembros</Text>
          </View>
          <Text style={[styles.cardBody, { color: theme.colors.textMuted }]}>
            Añade integrantes y asigna un rol (tú, familiar, cuidador). Esta sección se activará cuando
            el backend esté listo.
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
    borderRadius: 24,
    padding: 22,
    gap: 12,
    alignItems: 'flex-start',
  },
  fabMini: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 21,
  },
});
