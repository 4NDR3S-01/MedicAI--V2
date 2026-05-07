import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, Modal, Image } from 'react-native';
import { useState, useMemo } from 'react';
import { updateAvatarOnBackend } from '../../auth/services/auth.service';

const PREDEFINED_SEEDS = [
  { seed: 'Alexander', bg: 'e0f2fe' },
  { seed: 'Sophia', bg: 'fce7f3' },
  { seed: 'Oliver', bg: 'dcfce7' },
  { seed: 'Isabella', bg: 'fef3c7' },
  { seed: 'William', bg: 'e0e7ff' },
  { seed: 'Mia', bg: 'ffedd5' },
  { seed: 'James', bg: 'f3f4f6' },
  { seed: 'Charlotte', bg: 'cffafe' },
  { seed: 'Benjamin', bg: 'fae8ff' },
  { seed: 'Amelia', bg: 'ecfccb' },
  { seed: 'Lucas', bg: 'ffedd5' },
  { seed: 'Harper', bg: 'e0f2fe' },
];

const PREDEFINED_AVATARS = PREDEFINED_SEEDS.map((s, i) => ({
  id: `db-avt-${i}`,
  url: `https://api.dicebear.com/9.x/avataaars/png?seed=${s.seed}&backgroundColor=${s.bg}`,
}));

function getSafeAvatar(data: string | null | undefined) {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    if (parsed && parsed.url) return parsed;
  } catch (e) {
    // ignore
  }
  return null;
}

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

function handleStub(title: string) {
  Alert.alert(
    'En desarrollo',
    `La sección «${title}» estará disponible en una próxima actualización.`
  );
}

type MenuItemProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  theme: AppTheme;
  isLast?: boolean;
};

function MenuItem({ icon, title, subtitle, onPress, theme, isLast }: Readonly<MenuItemProps>) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        !isLast && { borderBottomColor: theme.colors.surfaceBorder, borderBottomWidth: StyleSheet.hairlineWidth },
        pressed && { backgroundColor: `${theme.colors.accentPrimary}0A` },
      ]}
      onPress={onPress}
    >
      <View style={[styles.menuIconWrap, { backgroundColor: `${theme.colors.textMuted}15` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={theme.colors.textSecondary} />
      </View>
      <View style={styles.menuTextWrap}>
        <Text style={[styles.menuItemTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.menuItemSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
    </Pressable>
  );
}

export type ProfileScreenProps = {
  theme: AppTheme;
  userFullName: string | null;
  userEmail: string | null;
  avatarData?: string | null;
  onSetAvatar?: (data: string) => void;
  contentBottomInset: number;
  isSigningOut: boolean;
  onSignOut: () => void;
};

export function ProfileScreen({
  theme,
  userFullName,
  userEmail,
  avatarData,
  onSetAvatar,
  contentBottomInset,
  isSigningOut,
  onSignOut,
}: Readonly<ProfileScreenProps>) {
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const name = userFullName ? userFullName : displayNameFromEmail(userEmail);
  const initial = initialFromName(name);
  const parsedAvatar = useMemo(() => getSafeAvatar(avatarData), [avatarData]);

  const handleAvatarSelect = async (avatar: typeof PREDEFINED_AVATARS[0]) => {
    setIsSavingAvatar(true);
    try {
      const avatarStr = JSON.stringify(avatar);
      await updateAvatarOnBackend(avatarStr);
      if (onSetAvatar) {
        onSetAvatar(avatarStr);
      }
      setIsEditingAvatar(false);
    } catch (error) {
      Alert.alert(
        'Error al guardar avatar',
        error instanceof Error ? error.message : 'No se pudo guardar el avatar. Intenta de nuevo.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSavingAvatar(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: contentBottomInset + 20 }]}
      >
        {/* Profile Hero */}
        <View style={styles.profileHero}>
          <Pressable
            style={[
              styles.avatar,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.surfaceBorder,
              },
            ]}
            onPress={() => setIsEditingAvatar(true)}
          >
            {parsedAvatar ? (
              <Image source={{ uri: parsedAvatar.url }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarLetter, { color: theme.colors.accentPrimary }]}>{initial}</Text>
            )}
            <View style={[styles.editBadge, { backgroundColor: theme.colors.surfaceBorder }]}>
              <MaterialCommunityIcons name="pencil" size={14} color={theme.colors.textPrimary} />
            </View>
          </Pressable>

          <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          {userEmail ? (
            <View style={[styles.emailBadge, { backgroundColor: `${theme.colors.textMuted}15` }]}>
              <Text style={[styles.email, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {userEmail}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Section: Cuenta */}
        <View style={styles.sectionGroup}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Mi Cuenta</Text>
          <View
            style={[
              styles.menuBlock,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
            ]}
          >
            <MenuItem
              icon="account-outline"
              title="Datos Personales"
              subtitle="Información médica y perfil"
              onPress={() => handleStub('Datos Personales')}
              theme={theme}
            />
            <MenuItem
              icon="shield-check-outline"
              title="Seguridad"
              subtitle="Contraseña y accesos"
              onPress={() => handleStub('Seguridad')}
              theme={theme}
            />
            <MenuItem
              icon="bell-outline"
              title="Notificaciones"
              subtitle="Preferencias de alertas"
              onPress={() => handleStub('Notificaciones')}
              theme={theme}
              isLast
            />
          </View>
        </View>

        {/* Section: Soporte */}
        <View style={styles.sectionGroup}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Soporte y Privacidad</Text>
          <View
            style={[
              styles.menuBlock,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
            ]}
          >
            <MenuItem
              icon="help-circle-outline"
              title="Centro de Ayuda"
              onPress={() => handleStub('Centro de Ayuda')}
              theme={theme}
            />
            <MenuItem
              icon="file-document-outline"
              title="Términos y Privacidad"
              onPress={() => handleStub('Términos y Privacidad')}
              theme={theme}
              isLast
            />
          </View>
        </View>

        {/* Sign Out Button */}
        <Pressable
          style={({ pressed }) => [
            styles.signOut,
            {
              backgroundColor: `${theme.colors.accentTertiary}10`,
              borderColor: `${theme.colors.accentTertiary}30`,
              transform: [{ scale: pressed && !isSigningOut ? 0.98 : 1 }],
            },
            isSigningOut && styles.signOutDisabled,
          ]}
          onPress={onSignOut}
          disabled={isSigningOut}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          accessibilityState={{ disabled: isSigningOut }}
        >
          <MaterialCommunityIcons name="logout" size={20} color={theme.colors.accentTertiary} />
          <Text style={[styles.signOutText, { color: theme.colors.accentTertiary }]}>
            {isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Text>
        </Pressable>

        <Text style={[styles.versionText, { color: theme.colors.textMuted }]}>MedicAI v1.0.0</Text>
      </ScrollView>

      {/* Avatar Gallery Modal */}
      <Modal
        visible={isEditingAvatar}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsEditingAvatar(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Elige tu Avatar</Text>
            <Pressable onPress={() => setIsEditingAvatar(false)} style={styles.modalClose}>
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.galleryGrid}>
            {PREDEFINED_AVATARS.map((avatar) => {
              const isSelected = parsedAvatar?.id === avatar.id;
              return (
                <Pressable
                  key={avatar.id}
                  style={[
                    styles.galleryItem,
                    isSelected && { borderColor: theme.colors.accentPrimary },
                  ]}
                  onPress={() => handleAvatarSelect(avatar)}
                  disabled={isSavingAvatar}
                >
                  <Image source={{ uri: avatar.url }} style={styles.galleryImage} />
                  {isSavingAvatar && isSelected && (
                    <View style={styles.galleryLoadingOverlay}>
                      <Text style={{ color: theme.colors.textPrimary }}>Guardando...</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 32,
    gap: 28,
  },
  profileHero: {
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarLetter: {
    fontSize: 40,
    fontWeight: '900',
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  modalContainer: {
    flex: 1,
    paddingTop: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.2)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  modalClose: {
    padding: 8,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 24,
    gap: 24,
    justifyContent: 'center',
  },
  galleryItem: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  galleryLoadingOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  name: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginBottom: 10,
    textAlign: 'center',
  },
  emailBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  email: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionGroup: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingLeft: 16,
  },
  menuBlock: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 16,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextWrap: {
    flex: 1,
    gap: 2,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  menuItemSubtitle: {
    fontSize: 13,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '800',
  },
  signOutDisabled: {
    opacity: 0.5,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
});
