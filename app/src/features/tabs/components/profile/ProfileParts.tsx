import { Children, Fragment, type ReactNode } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Switch, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { PressableScale } from '../../../../shared/ui';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** Grupo de ajustes: título pequeño y una tarjeta con filas separadas. */
export function SettingsGroup({ theme, title, children }: Readonly<{ theme: AppTheme; title: string; children: ReactNode }>) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.groupCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
        {items.map((child, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.colors.surfaceBorder }]} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

type SettingsItemProps = {
  theme: AppTheme;
  icon: IconName;
  title: string;
  /** Descripción corta o valor actual ("5 min antes"). */
  subtitle?: string;
  color?: string;
  onPress?: () => void;
  /** chevron (abre algo), external (sale de la app), none, o un interruptor. */
  trailing?: 'chevron' | 'external' | 'none';
  toggle?: { value: boolean; onChange: (value: boolean) => void; disabled?: boolean };
  destructive?: boolean;
  /** Punto de aviso (p. ej. falta un permiso). */
  badge?: boolean;
  accessibilityHint?: string;
};

export function SettingsItem({
  theme,
  icon,
  title,
  subtitle,
  color,
  onPress,
  trailing = 'chevron',
  toggle,
  destructive = false,
  badge = false,
  accessibilityHint,
}: Readonly<SettingsItemProps>) {
  const tone = destructive ? theme.colors.accentTertiary : color ?? theme.colors.accentPrimary;
  const content = (
    <>
      <View style={[styles.iconTile, { backgroundColor: `${tone}18` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={tone} />
        {badge ? <View style={[styles.badge, { backgroundColor: theme.colors.accentTertiary, borderColor: theme.colors.surface }]} /> : null}
      </View>
      <View style={styles.itemText}>
        <Text style={[styles.itemTitle, { color: destructive ? tone : theme.colors.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.itemSubtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          disabled={toggle.disabled}
          accessibilityLabel={title}
          trackColor={{ false: theme.colors.inputBorder, true: `${theme.colors.accentPrimary}80` }}
          thumbColor={toggle.value ? theme.colors.accentPrimary : '#f4f4f5'}
          ios_backgroundColor={theme.colors.inputBorder}
        />
      ) : null}
      {!toggle && trailing === 'chevron' ? <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} /> : null}
      {!toggle && trailing === 'external' ? <MaterialCommunityIcons name="open-in-new" size={18} color={theme.colors.textMuted} /> : null}
    </>
  );

  if (!onPress || toggle) {
    return (
      <View style={styles.item} accessible={!toggle} accessibilityLabel={toggle ? undefined : [title, subtitle].filter(Boolean).join('. ')}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.985}
      accessibilityRole={trailing === 'external' ? 'link' : 'button'}
      accessibilityLabel={[title, subtitle].filter(Boolean).join('. ')}
      accessibilityHint={accessibilityHint}
      style={styles.item}
    >
      {content}
    </PressableScale>
  );
}

/** Nota con icono (información, aviso). */
export function ProfileNote({
  theme,
  icon,
  color,
  children,
}: Readonly<{ theme: AppTheme; icon: IconName; color?: string; children: ReactNode }>) {
  const tone = color ?? theme.colors.accentSecondary;
  return (
    <View style={[styles.note, { backgroundColor: `${tone}12` }]}>
      <MaterialCommunityIcons name={icon} size={18} color={tone} />
      <Text style={[styles.noteText, { color: theme.colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  groupTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase', paddingLeft: 6 },
  groupCard: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  iconTile: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  itemText: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 15.5, fontWeight: '800' },
  itemSubtitle: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
});
