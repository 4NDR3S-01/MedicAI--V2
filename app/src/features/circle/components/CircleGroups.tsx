import { useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet, SelectableChip } from '../../../shared/ui';
import { withToken } from '../hooks/useCircle';
import * as circleAPI from '../services/circle.service';
import type { CircleGroup } from '../services/circle.service';
import { InfoNote } from './CircleParts';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const GROUP_ICONS: IconName[] = [
  'account-group',
  'home-heart',
  'stethoscope',
  'hospital-building',
  'human-cane',
  'briefcase-outline',
  'school-outline',
  'account-heart-outline',
];

/** Nombres sugeridos según el uso más común. */
const SUGGESTED_GROUPS: { name: string; icon: IconName }[] = [
  { name: 'Familia', icon: 'home-heart' },
  { name: 'Pacientes', icon: 'stethoscope' },
  { name: 'Personas que cuido', icon: 'human-cane' },
];

export const groupIcon = (group: Pick<CircleGroup, 'icon'>): IconName =>
  (GROUP_ICONS as string[]).includes(group.icon) ? (group.icon as IconName) : 'account-group';

/** Selección múltiple de grupos (chips) con creación rápida. */
export function GroupPicker({
  theme,
  groups,
  value,
  onChange,
  onCreate,
}: Readonly<{
  theme: AppTheme;
  groups: CircleGroup[];
  value: string[];
  onChange: (groupIds: string[]) => void;
  /**
   * Si se indica, permite crear un grupo desde aquí. Recibe el grupo y la
   * selección resultante (que ya lo incluye); onChange no se llama.
   */
  onCreate?: (group: CircleGroup, nextValue: string[]) => void;
}>) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (groupId: string) =>
    onChange(value.includes(groupId) ? value.filter((id) => id !== groupId) : [...value, groupId]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      setBusy(true);
      const group = await circleAPI.createGroup(await withToken(), name.trim());
      onCreate?.(group, [...value, group.id]);
      setName('');
      setCreating(false);
    } catch (error) {
      Alert.alert('No se pudo crear el grupo', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.picker}>
      <View style={styles.chips}>
        {groups.map((group) => (
          <SelectableChip key={group.id} theme={theme} label={group.name} selected={value.includes(group.id)} onPress={() => toggle(group.id)} />
        ))}
        {onCreate && !creating ? (
          <Pressable
            onPress={() => setCreating(true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addChip, { borderColor: theme.colors.inputBorder }, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="plus" size={16} color={theme.colors.accentSecondary} />
            <Text style={[styles.addChipText, { color: theme.colors.accentSecondary }]}>Nuevo grupo</Text>
          </Pressable>
        ) : null}
      </View>
      {creating ? (
        <View style={[styles.createRow, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre del grupo"
            placeholderTextColor={theme.colors.inputPlaceholder}
            style={[styles.createInput, { color: theme.colors.textPrimary }]}
            maxLength={40}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void create()}
          />
          <Pressable onPress={() => void create()} disabled={busy || !name.trim()} hitSlop={6} accessibilityRole="button" accessibilityLabel="Crear grupo">
            <MaterialCommunityIcons name="check-circle" size={26} color={name.trim() ? theme.colors.accentPrimary : theme.colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => setCreating(false)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Cancelar">
            <MaterialCommunityIcons name="close-circle-outline" size={26} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Crear, renombrar y borrar grupos. Los grupos solo organizan: no dan permisos. */
export function GroupsSheet({
  theme,
  visible,
  groups,
  onClose,
  onChange,
}: Readonly<{
  theme: AppTheme;
  visible: boolean;
  groups: CircleGroup[];
  onClose: () => void;
  onChange: (groups: CircleGroup[]) => void;
}>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftIcon, setDraftIcon] = useState<IconName>('account-group');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) setEditingId(null);
  }, [visible]);

  const startEdit = (group: CircleGroup | null) => {
    setEditingId(group?.id ?? 'new');
    setDraftName(group?.name ?? '');
    setDraftIcon(group ? groupIcon(group) : 'account-group');
  };

  const run = async (task: () => Promise<void>, title: string) => {
    try {
      setBusy(true);
      await task();
    } catch (error) {
      Alert.alert(title, error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!draftName.trim()) return;
      const token = await withToken();
      if (editingId === 'new') {
        const group = await circleAPI.createGroup(token, draftName.trim(), draftIcon);
        onChange([...groups, group]);
      } else if (editingId) {
        await circleAPI.updateGroup(token, editingId, { name: draftName.trim(), icon: draftIcon });
        onChange(groups.map((group) => (group.id === editingId ? { ...group, name: draftName.trim(), icon: draftIcon } : group)));
      }
      setEditingId(null);
    }, 'No se pudo guardar el grupo');

  const remove = (group: CircleGroup) => {
    Alert.alert(`Eliminar "${group.name}"`, 'Las personas del grupo seguirán en tu Círculo con los mismos permisos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await circleAPI.deleteGroup(await withToken(), group.id);
            onChange(groups.filter((item) => item.id !== group.id));
          }, 'No se pudo eliminar el grupo'),
      },
    ]);
  };

  const quickCreate = (name: string, icon: IconName) =>
    run(async () => {
      const group = await circleAPI.createGroup(await withToken(), name, icon);
      onChange([...groups, group]);
    }, 'No se pudo crear el grupo');

  const missingSuggestions = SUGGESTED_GROUPS.filter((item) => !groups.some((group) => group.name.toLowerCase() === item.name.toLowerCase()));

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title="Grupos"
      subtitle="Organiza tu Círculo, por ejemplo Familia y Pacientes."
      onClose={onClose}
      dismissDisabled={busy}
      footer={
        editingId ? (
          <>
            <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={() => setEditingId(null)} disabled={busy} style={styles.flex} />
            <AppButton theme={theme} label="Guardar" icon="checkmark" onPress={() => void save()} loading={busy} disabled={!draftName.trim()} style={styles.flexWide} />
          </>
        ) : (
          <>
            <AppButton theme={theme} label="Cerrar" variant="secondary" onPress={onClose} style={styles.flex} />
            <AppButton theme={theme} label="Nuevo grupo" icon="add" iconPosition="left" onPress={() => startEdit(null)} style={styles.flexWide} />
          </>
        )
      }
    >
      {editingId ? (
        <>
          <View style={[styles.createRow, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}>
            <MaterialCommunityIcons name={draftIcon} size={22} color={theme.colors.accentPrimary} />
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Nombre del grupo"
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={[styles.createInput, { color: theme.colors.textPrimary }]}
              maxLength={40}
              autoFocus
            />
          </View>
          <View style={styles.icons} accessibilityRole="radiogroup">
            {GROUP_ICONS.map((icon) => {
              const selected = icon === draftIcon;
              return (
                <Pressable
                  key={icon}
                  onPress={() => setDraftIcon(icon)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Icono ${icon}`}
                  style={[
                    styles.iconOption,
                    { borderColor: selected ? theme.colors.accentPrimary : theme.colors.inputBorder, backgroundColor: selected ? `${theme.colors.accentPrimary}14` : theme.colors.inputBackground },
                  ]}
                >
                  <MaterialCommunityIcons name={icon} size={22} color={selected ? theme.colors.accentPrimary : theme.colors.textSecondary} />
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          {groups.length ? (
            groups.map((group) => (
              <View key={group.id} style={[styles.groupRow, { borderColor: theme.colors.surfaceBorder, backgroundColor: theme.colors.surface }]}>
                <View style={[styles.groupIcon, { backgroundColor: `${theme.colors.accentPrimary}14` }]}>
                  <MaterialCommunityIcons name={groupIcon(group)} size={20} color={theme.colors.accentPrimary} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.groupName, { color: theme.colors.textPrimary }]}>{group.name}</Text>
                  <Text style={[styles.groupCount, { color: theme.colors.textMuted }]}>
                    {group.linkIds.length === 1 ? '1 persona' : `${group.linkIds.length} personas`}
                  </Text>
                </View>
                <Pressable onPress={() => startEdit(group)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Editar ${group.name}`} style={styles.iconButton}>
                  <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.textSecondary} />
                </Pressable>
                <Pressable onPress={() => remove(group)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Eliminar ${group.name}`} style={styles.iconButton}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.accentTertiary} />
                </Pressable>
              </View>
            ))
          ) : (
            <InfoNote theme={theme} icon="folder-account-outline">
              Aún no tienes grupos. Te ayudan a separar, por ejemplo, a tu familia de tus pacientes.
            </InfoNote>
          )}
          {missingSuggestions.length ? (
            <View style={styles.suggestions}>
              <Text style={[styles.suggestionsTitle, { color: theme.colors.textMuted }]}>Crear rápido</Text>
              <View style={styles.chips}>
                {missingSuggestions.map((item) => (
                  <Pressable
                    key={item.name}
                    onPress={() => void quickCreate(item.name, item.icon)}
                    disabled={busy}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.addChip, { borderColor: theme.colors.inputBorder }, pressed && styles.pressed]}
                  >
                    <MaterialCommunityIcons name={item.icon} size={16} color={theme.colors.accentSecondary} />
                    <Text style={[styles.addChipText, { color: theme.colors.accentSecondary }]}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <InfoNote theme={theme} icon="shield-check-outline">
            Los grupos son solo tuyos: nadie más los ve y no cambian lo que cada persona puede ver o hacer.
          </InfoNote>
        </>
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  pressed: { opacity: 0.7 },
  picker: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed' },
  addChipText: { fontSize: 14, fontWeight: '700' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 50 },
  createInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconOption: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  groupIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  groupName: { fontSize: 15.5, fontWeight: '800' },
  groupCount: { fontSize: 12.5, marginTop: 1 },
  iconButton: { padding: 6 },
  suggestions: { gap: 8 },
  suggestionsTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
});
