import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { BottomSheet, PressableScale } from '../../../../shared/ui';
import { updateAvatarOnBackend } from '../../../auth/services/auth.service';
import { AVATAR_OPTIONS, avatarSource, INITIALS_AVATAR, initialsOf, parseAvatar } from './avatar';

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
  const current = parseAvatar(avatarData);

  // Se ve al instante y el panel se cierra; se guarda en la cuenta detrás.
  // Si el servidor no lo acepta, vuelve el anterior y se avisa.
  const choose = (data: string) => {
    if (data === avatarData) {
      onClose();
      return;
    }
    const previous = avatarData ?? INITIALS_AVATAR;
    onSaved(data);
    onClose();
    updateAvatarOnBackend(data).catch((error: unknown) => {
      onSaved(previous);
      Alert.alert('No se pudo cambiar tu foto', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    });
  };

  const tile = (id: string, selected: boolean, label: string, onPress: () => void, child: React.ReactNode) => (
    <PressableScale
      key={id}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.tile, { borderColor: selected ? theme.colors.accentPrimary : theme.colors.surfaceBorder }]}
    >
      {child}
      {selected ? (
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
          () => choose(INITIALS_AVATAR),
          <View style={[styles.initials, { backgroundColor: `${theme.colors.accentPrimary}18` }]}>
            <Text style={[styles.initialsText, { color: theme.colors.accentPrimaryText }]}>{initialsOf(name)}</Text>
          </View>,
        )}
        {AVATAR_OPTIONS.map((option, index) =>
          tile(
            option.id,
            current?.id === option.id,
            `Avatar ${index + 1}`,
            () => choose(JSON.stringify(option)),
            <Image source={avatarSource(option)} style={styles.image} accessibilityIgnoresInvertColors />,
          ))}
      </View>
      <Text style={[styles.credit, { color: theme.colors.textMuted }]}>Ilustraciones: "Personas" de Draftbit (CC BY 4.0), vía DiceBear</Text>
    </BottomSheet>
  );
}

const SIZE = 68;
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', paddingVertical: 6 },
  tile: { width: SIZE + 6, height: SIZE + 6, borderRadius: (SIZE + 6) / 2, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  image: { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  initials: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 24, fontWeight: '800' },
  credit: { fontSize: 11, fontWeight: '500', textAlign: 'center', marginTop: 10 },
  check: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
