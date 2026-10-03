import { useState, type ReactNode } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LayoutAnimation, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { SelectField, SelectableChip, TextField, useReducedMotion } from '../../../shared/ui';
import type { ReminderMode } from '../services/circle.service';
import {
  PERMISSION_GROUPS,
  PERMISSION_META,
  PERMISSION_PRESETS,
  groupSummary,
  permissionPhrases,
  presetOf,
  setPermission,
  type PermissionSet,
} from '../utils/permissions';
import {
  CARE_OPTIONS,
  RELATION_GROUPS,
  RELATION_META,
  type CareValue,
  type RelationCode,
} from '../utils/relations';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

// ─── Avatar ──────────────────────────────────────────────────────────────────

const AVATAR_TONES = ['#12A594', '#1B86E3', '#F59A2E', '#8B5CF6', '#E5487D', '#0EA5E9'];

export function Avatar({ name, seed, size = 46 }: Readonly<{ name: string; seed: string; size?: number }>) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2.6, backgroundColor: `${tone}22` }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.avatarText, { color: tone, fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

// ─── Encabezados y notas ─────────────────────────────────────────────────────

export function SectionTitle({
  theme,
  title,
  hint,
  right,
}: Readonly<{ theme: AppTheme; title: string; hint?: string; right?: ReactNode }>) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.flex}>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        {hint ? <Text style={[styles.sectionHint, { color: theme.colors.textMuted }]}>{hint}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function InfoNote({
  theme,
  icon = 'information-outline',
  color,
  children,
}: Readonly<{ theme: AppTheme; icon?: IconName; color?: string; children: ReactNode }>) {
  const tone = color ?? theme.colors.accentSecondary;
  return (
    <View style={[styles.note, { backgroundColor: `${tone}12` }]}>
      <MaterialCommunityIcons name={icon} size={16} color={tone} />
      <Text style={[styles.noteText, { color: theme.colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

export function Badge({ label, color, icon }: Readonly<{ label: string; color: string; icon?: IconName }>) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}18` }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={13} color={color} /> : null}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Recordatorios en mi teléfono ───────────────────────────────────────────

export const REMINDER_OPTIONS: { value: ReminderMode; label: string }[] = [
  { value: 'OFF', label: 'No recibir' },
  { value: 'NOTIFY', label: 'Solo aviso' },
  { value: 'ALARM', label: 'Alarma completa' },
];

export const reminderHint = (mode: ReminderMode, name: string) =>
  mode === 'ALARM'
    ? `Sonará la alarma a la hora de las tomas de ${name}, y te avisaremos de sus citas y de las tomas que no registre.`
    : mode === 'NOTIFY'
      ? `Te llegará un aviso a la hora de sus tomas y citas, y si no registra alguna.`
      : `No recibirás avisos de sus tomas ni de sus citas.`;

/** "Sus recordatorios en tu teléfono": no recibir, solo aviso o alarma completa. */
export function ReminderModePicker({
  theme,
  value,
  name,
  onChange,
  disabled,
}: Readonly<{ theme: AppTheme; value: ReminderMode; name: string; onChange: (mode: ReminderMode) => void; disabled?: boolean }>) {
  return (
    <View style={[styles.reminderBox, { borderColor: theme.colors.surfaceBorder }]}>
      <View style={styles.reminderRow}>
        <MaterialCommunityIcons name="bell-ring-outline" size={22} color={theme.colors.accentPrimary} />
        <View style={styles.flex}>
          <Text style={[styles.reminderTitle, { color: theme.colors.textPrimary }]}>Sus recordatorios en tu teléfono</Text>
          <Text style={[styles.reminderHintText, { color: theme.colors.textMuted }]}>{reminderHint(value, name)}</Text>
        </View>
      </View>
      <SelectField
        theme={theme}
        value={value}
        options={REMINDER_OPTIONS}
        onChange={onChange}
        disabled={disabled}
        accessibilityLabel={`Recordatorios de ${name}`}
        style={styles.reminderSelect}
      />
    </View>
  );
}

// ─── Buscador ────────────────────────────────────────────────────────────────

export function SearchBar({
  theme,
  value,
  onChange,
  placeholder,
}: Readonly<{ theme: AppTheme; value: string; onChange: (value: string) => void; placeholder: string }>) {
  return (
    <View style={[styles.search, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}>
      <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.inputPlaceholder}
        style={[styles.searchInput, { color: theme.colors.textPrimary }]}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
          <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Relación ────────────────────────────────────────────────────────────────

export function RelationPicker({
  theme,
  value,
  customLabel,
  onChange,
  onCustomLabelChange,
  suggested = [],
  error,
}: Readonly<{
  theme: AppTheme;
  value: RelationCode | null;
  customLabel: string;
  onChange: (code: RelationCode) => void;
  onCustomLabelChange: (label: string) => void;
  suggested?: RelationCode[];
  error?: string | null;
}>) {
  const chip = (code: RelationCode) => (
    <SelectableChip
      key={code}
      theme={theme}
      label={RELATION_META[code].label}
      selected={value === code}
      onPress={() => onChange(code)}
    />
  );

  return (
    <View style={styles.relationPicker}>
      {suggested.length ? (
        <View style={styles.relationGroup}>
          <Text style={[styles.groupLabel, { color: theme.colors.accentSecondary }]}>Sugerido</Text>
          <View style={styles.chips}>{suggested.map(chip)}</View>
        </View>
      ) : null}
      {RELATION_GROUPS.map((group) => {
        const codes = group.codes.filter((code) => !suggested.includes(code));
        if (!codes.length) return null;
        return (
          <View key={group.title} style={styles.relationGroup}>
            <Text style={[styles.groupLabel, { color: theme.colors.textMuted }]}>{group.title}</Text>
            <View style={styles.chips}>{codes.map(chip)}</View>
          </View>
        );
      })}
      {value === 'OTHER' ? (
        <TextField
          theme={theme}
          label="¿Cuál es la relación?"
          value={customLabel}
          onChangeText={onCustomLabelChange}
          placeholder="Ej. Vecina, tutor, enfermera"
          maxLength={40}
          autoCapitalize="sentences"
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// ─── Quién cuida a quién ────────────────────────────────────────────────────

export function CarePicker({
  theme,
  value,
  name,
  onChange,
}: Readonly<{ theme: AppTheme; value: CareValue; name: string; onChange: (value: CareValue) => void }>) {
  return (
    <View style={styles.careList} accessibilityRole="radiogroup">
      {CARE_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => [
              styles.careOption,
              {
                borderColor: selected ? theme.colors.accentPrimary : theme.colors.inputBorder,
                backgroundColor: selected ? `${theme.colors.accentPrimary}12` : theme.colors.inputBackground,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <MaterialCommunityIcons name={option.icon} size={22} color={selected ? theme.colors.accentPrimary : theme.colors.textMuted} />
            <View style={styles.flex}>
              <Text style={[styles.careTitle, { color: theme.colors.textPrimary }]}>{option.title(name)}</Text>
              <Text style={[styles.careHint, { color: theme.colors.textMuted }]}>{option.hint}</Text>
            </View>
            <MaterialCommunityIcons
              name={selected ? 'radiobox-marked' : 'radiobox-blank'}
              size={20}
              color={selected ? theme.colors.accentPrimary : theme.colors.inputBorder}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Permisos ────────────────────────────────────────────────────────────────

/**
 * Editor en dos niveles: primero un nivel de acceso (lo habitual) y, solo si
 * se pide, el detalle por área con interruptores. Así no se muestran diez
 * opciones de golpe.
 */
export function PermissionEditor({
  theme,
  value,
  onChange,
  disabled = false,
  allowCircleAdmin = true,
}: Readonly<{
  theme: AppTheme;
  value: PermissionSet;
  onChange: (value: PermissionSet) => void;
  disabled?: boolean;
  allowCircleAdmin?: boolean;
}>) {
  const reducedMotion = useReducedMotion();
  const preset = presetOf({ ...value, manageCircle: false });
  const [customOpen, setCustomOpen] = useState(preset === null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const animate = () => {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };
  const groups = PERMISSION_GROUPS.filter((group) => group.id !== 'circle' || allowCircleAdmin);

  return (
    <View style={styles.editor}>
      <View style={styles.presetList} accessibilityRole="radiogroup">
        {PERMISSION_PRESETS.map((item) => {
          const selected = !customOpen && preset === item.id;
          return (
            <Pressable
              key={item.id}
              disabled={disabled}
              onPress={() => {
                animate();
                setCustomOpen(false);
                onChange({ ...item.value, manageCircle: value.manageCircle });
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              style={({ pressed }) => [
                styles.preset,
                {
                  borderColor: selected ? theme.colors.accentPrimary : theme.colors.inputBorder,
                  backgroundColor: selected ? `${theme.colors.accentPrimary}12` : theme.colors.inputBackground,
                  opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
                color={selected ? theme.colors.accentPrimary : theme.colors.inputBorder}
              />
              <View style={styles.flex}>
                <Text style={[styles.presetLabel, { color: theme.colors.textPrimary }]}>{item.label}</Text>
                <Text style={[styles.presetHint, { color: theme.colors.textMuted }]}>{item.hint}</Text>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          disabled={disabled}
          onPress={() => {
            animate();
            setCustomOpen((current) => !current);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: customOpen }}
          style={({ pressed }) => [styles.customToggle, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="tune-variant" size={18} color={theme.colors.accentSecondary} />
          <Text style={[styles.customToggleText, { color: theme.colors.accentSecondary }]}>
            {customOpen ? 'Ocultar detalle' : preset === null ? 'Personalizado · ver detalle' : 'Personalizar'}
          </Text>
          <MaterialCommunityIcons name={customOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.accentSecondary} />
        </Pressable>
      </View>

      {customOpen || allowCircleAdmin ? (
        <View style={[styles.groups, { borderColor: theme.colors.surfaceBorder }]}>
          {groups
            .filter((group) => customOpen || group.id === 'circle')
            .map((group, index) => {
              const open = openGroup === group.id || group.keys.length === 1;
              return (
                <View key={group.id} style={index > 0 ? [styles.groupDivider, { borderTopColor: theme.colors.surfaceBorder }] : null}>
                  {group.keys.length > 1 ? (
                    <Pressable
                      onPress={() => {
                        animate();
                        setOpenGroup((current) => (current === group.id ? null : group.id));
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}
                    >
                      <MaterialCommunityIcons name={group.icon} size={20} color={theme.colors.accentPrimary} />
                      <Text style={[styles.groupTitle, { color: theme.colors.textPrimary }]}>{group.title}</Text>
                      <Text style={[styles.groupSummary, { color: theme.colors.textMuted }]}>{groupSummary(group, value)}</Text>
                      <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
                    </Pressable>
                  ) : null}
                  {open
                    ? group.keys.map((key) => {
                      const meta = PERMISSION_META[key];
                      const isAdmin = meta.kind === 'admin';
                      return (
                        <View key={key} style={styles.permissionRow}>
                          {group.keys.length === 1 ? (
                            <MaterialCommunityIcons name={group.icon} size={20} color={isAdmin ? theme.colors.accentTertiary : theme.colors.accentPrimary} />
                          ) : (
                            <View style={styles.indent} />
                          )}
                          <View style={styles.flex}>
                            <Text style={[styles.permissionLabel, { color: theme.colors.textPrimary }]}>{meta.label}</Text>
                            {isAdmin ? (
                              <Text style={[styles.permissionHint, { color: theme.colors.textMuted }]}>
                                Solo para alguien de mucha confianza: podrá invitar y quitar personas de este Círculo.
                              </Text>
                            ) : meta.kind === 'view' && group.keys.length > 1 ? (
                              <Text style={[styles.permissionHint, { color: theme.colors.textMuted }]}>Necesario para todo lo demás</Text>
                            ) : null}
                          </View>
                          <Switch
                            value={value[key]}
                            disabled={disabled}
                            onValueChange={(next) => onChange(setPermission(value, key, next))}
                            trackColor={{ false: theme.colors.surfaceBorder, true: `${isAdmin ? theme.colors.accentTertiary : theme.colors.accentPrimary}60` }}
                            thumbColor={value[key] ? (isAdmin ? theme.colors.accentTertiary : theme.colors.accentPrimary) : theme.colors.textMuted}
                            ios_backgroundColor={theme.colors.surfaceBorder}
                            accessibilityLabel={meta.label}
                          />
                        </View>
                      );
                    })
                    : null}
                </View>
              );
            })}
        </View>
      ) : null}
    </View>
  );
}

/** Lista de solo lectura: "Puede ver tus medicamentos", etc. */
export function PermissionList({
  theme,
  value,
  perspective,
  emptyText,
}: Readonly<{ theme: AppTheme; value: PermissionSet; perspective: 'theyCan' | 'iCan'; emptyText: string }>) {
  const phrases = permissionPhrases(value, perspective);
  if (!phrases.length) {
    return (
      <View style={styles.listRow}>
        <MaterialCommunityIcons name="eye-off-outline" size={18} color={theme.colors.textMuted} />
        <Text style={[styles.listText, { color: theme.colors.textMuted }]}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {phrases.map((phrase) => (
        <View key={phrase} style={styles.listRow}>
          <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.success} />
          <Text style={[styles.listText, { color: theme.colors.textPrimary }]}>{phrase}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '900' },

  reminderBox: { gap: 10, borderWidth: 1, borderRadius: 16, padding: 12 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reminderTitle: { fontSize: 14, fontWeight: '800' },
  reminderHintText: { fontSize: 12, lineHeight: 16, marginTop: 1 },
  reminderSelect: { minHeight: 46 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -0.2 },
  sectionHint: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 18.5 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11.5, fontWeight: '800' },

  relationPicker: { gap: 14 },
  relationGroup: { gap: 8 },
  groupLabel: { fontSize: 11.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: '#D64545', fontSize: 12.5, fontWeight: '600' },

  careList: { gap: 8 },
  careOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5 },
  careTitle: { fontSize: 15, fontWeight: '800' },
  careHint: { fontSize: 12.5, lineHeight: 17, marginTop: 1 },

  editor: { gap: 10 },
  presetList: { gap: 8 },
  preset: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5 },
  presetLabel: { fontSize: 14.5, fontWeight: '800' },
  presetHint: { fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  customToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, alignSelf: 'flex-start' },
  customToggleText: { fontSize: 13.5, fontWeight: '800' },
  groups: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12 },
  groupDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  groupTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  groupSummary: { fontSize: 12.5, fontWeight: '700' },
  permissionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingVertical: 6 },
  indent: { width: 20 },
  permissionLabel: { fontSize: 14, fontWeight: '700' },
  permissionHint: { fontSize: 12, lineHeight: 16, marginTop: 1 },

  list: { gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
