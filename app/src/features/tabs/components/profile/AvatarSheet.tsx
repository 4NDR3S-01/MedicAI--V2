import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { BottomSheet, PressableScale } from '../../../../shared/ui';
import { updateAvatarOnBackend } from '../../../auth/services/auth.service';
import { AVATAR_OPTIONS, INITIALS_AVATAR, initialsOf, parseAvatar } from './avatar';

export function AvatarSheet({
  theme,
  visible,
  name,
  avatarData,
  onClose,
  onSaved,
}: Readonly<{
  theme: AppTheme;
  visible: boolean;
  name: string;
  avatarData: string | null | undefined;
  onClose: () => void;
  onSaved: (avatarData: string) => void;
}>) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const current = parseAvatar(avatarData);

  const choose = async (id: string, data: string) => {
    if (savingId) return;
    setSavingId(id);
    try {
      await updateAvatarOnBackend(data);
      onSaved(data);
      onClose();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setSavingId(null);
    }
  };

  const tile = (id: string, selected: boolean, label: string, onPress: () => void, child: React.ReactNode) => (
    <PressableScale
      key={id}
      onPress={onPress}
      disabled={Boolean(savingId)}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: Boolean(savingId) }}
      style={[styles.tile, { borderColor: selected ? theme.colors.accentPrimary : theme.colors.surfaceBorder }]}
    >
      {child}
      {savingId === id ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
      {selected && savingId !== id ? (
        <View style={[styles.check, { backgroundColor: theme.colors.accentPrimary, borderColor: theme.colors.background }]}>
          <MaterialCommunityIcons name="check" size={12} color="#fff" />
        </View>
      ) : null}
    </PressableScale>
  );

  return (
    <BottomSheet theme={theme} visible={visible} title="Tu foto de perfil" subtitle="Así te verán las personas de tu Círculo." onClose={onClose}>
      <View style={styles.grid}>
        {tile(
          'initials',
          !current,
          'Usar mis iniciales',
          () => void choose('initials', INITIALS_AVATAR),
          <View style={[styles.initials, { backgroundColor: `${theme.colors.accentPrimary}18` }]}>
            <Text style={[styles.initialsText, { color: theme.colors.accentPrimary }]}>{initialsOf(name)}</Text>
          </View>,
        )}
        {AVATAR_OPTIONS.map((option, index) =>
          tile(
            option.id,
            current?.id === option.id,
            `Avatar ${index + 1}`,
            () => void choose(option.id, JSON.stringify(option)),
            <Image source={{ uri: option.url }} style={styles.image} accessibilityIgnoresInvertColors />,
          ))}
      </View>
    </BottomSheet>
  );
}

const SIZE = 68;
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', paddingVertical: 6 },
  tile: { width: SIZE + 6, height: SIZE + 6, borderRadius: (SIZE + 6) / 2, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  image: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  initials: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 22, fontWeight: '900' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: SIZE, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  check: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
