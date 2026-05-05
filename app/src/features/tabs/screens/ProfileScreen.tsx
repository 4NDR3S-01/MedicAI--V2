import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';

function displayNameFromEmail(email: string | null): string {
  if (!email) {
    return 'Usuario';
  }
  const local = email.split('@')[0] ?? '';
  if (!local) {
    return 'Usuario';
  }
  const spaced = local.replace(/[._-]+/g, ' ').trim();
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
}

function initialFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  return trimmed[0]!.toUpperCase();
}

export type ProfileScreenProps = {
  theme: AppTheme;
  userEmail: string | null;
  contentBottomInset: number;
  isSigningOut: boolean;
  onSignOut: () => void;
};

export function ProfileScreen({
  theme,
  userEmail,
  contentBottomInset,
  isSigningOut,
  onSignOut,
}: Readonly<ProfileScreenProps>) {
  const name = displayNameFromEmail(userEmail);
  const initial = initialFromName(name);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: contentBottomInset }]}
      >
        <View
          style={[
            styles.headerCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
          ]}
        >
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: `${theme.colors.accentPrimary}24`,
                borderColor: `${theme.colors.accentPrimary}55`,
              },
            ]}
          >
            <Text style={[styles.avatarLetter, { color: theme.colors.accentPrimary }]}>{initial}</Text>
          </View>
          <Text style={[styles.name, { color: theme.colors.textPrimary }]}>{name}</Text>
          {userEmail ? (
            <Text style={[styles.email, { color: theme.colors.textMuted }]}>{userEmail}</Text>
          ) : null}
        </View>

        <Text style={[styles.section, { color: theme.colors.textSecondary }]}>Cuenta</Text>
        <View
          style={[
            styles.rowCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
          ]}
        >
          <MaterialCommunityIcons name="shield-account-outline" size={22} color={theme.colors.accentSecondary} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.colors.textPrimary }]}>Seguridad</Text>
            <Text style={[styles.rowSub, { color: theme.colors.textMuted }]}>
              Contraseña y verificación de correo (próximamente)
            </Text>
          </View>
        </View>

        <Pressable
          style={[
            styles.signOut,
            {
              backgroundColor: `${theme.colors.accentPrimary}18`,
              borderColor: `${theme.colors.accentPrimary}50`,
            },
            isSigningOut && styles.signOutDisabled,
          ]}
          onPress={onSignOut}
          disabled={isSigningOut}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          accessibilityState={{ disabled: isSigningOut }}
        >
          <MaterialCommunityIcons name="logout" size={22} color={theme.colors.accentPrimary} />
          <Text style={[styles.signOutText, { color: theme.colors.accentPrimary }]}>
            {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 20,
    gap: 14,
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 28,
    fontWeight: '800',
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
  },
  email: {
    fontSize: 14,
  },
  section: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  rowText: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  rowSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '800',
  },
  signOutDisabled: {
    opacity: 0.65,
  },
});
