import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../shared/theme';

export type MainTabId = 'home' | 'medications' | 'family' | 'appointments' | 'profile';

type AppBottomBarProps = {
  theme: AppTheme;
  activeTab: MainTabId;
  onSelect: (tab: MainTabId) => void;
};

const SIDE_TABS: {
  tab: MainTabId;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  activeIcon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { tab: 'home', label: 'Inicio', icon: 'home-outline', activeIcon: 'home' },
  { tab: 'medications', label: 'Medicamentos', icon: 'pill', activeIcon: 'pill' },
  { tab: 'appointments', label: 'Citas', icon: 'calendar-clock-outline', activeIcon: 'calendar-clock' },
  { tab: 'profile', label: 'Perfil', icon: 'account-outline', activeIcon: 'account' },
];

const BAR_BODY_MIN_HEIGHT = 56;
const FAB_SIZE = 58;
/** Espacio reservado encima de la barra para el botón central. */
export const MAIN_TAB_FAB_OVERFLOW = 24;

/**
 * Padding inferior recomendado para listas / scroll del área principal,
 * para que no queden bajo la barra ni bajo el FAB central.
 */
export function useMainTabContentInset(): number {
  return MAIN_TAB_FAB_OVERFLOW + BAR_BODY_MIN_HEIGHT + 16;
}

export function AppBottomBar({ theme, activeTab, onSelect }: Readonly<AppBottomBarProps>) {
  const isFamily = activeTab === 'family';
  const bottomPad = 0;
  const barBackground = theme.mode === 'light' ? '#FFFFFF' : '#0A1C2D';

  return (
    <View style={[styles.outer, { paddingBottom: bottomPad }]} pointerEvents="box-none">
      <View style={styles.inner} pointerEvents="box-none">
        <View style={styles.fabStack} pointerEvents="box-none">
          <Pressable
            onPress={() => onSelect('family')}
            style={({ pressed }) => {
              let scale = 1;
              if (pressed) scale = 0.94;
              else if (isFamily) scale = 1.06;

              return [
                styles.fab,
                {
                  backgroundColor: theme.colors.accentPrimary,
                  borderColor: isFamily ? theme.colors.accentSecondary : theme.colors.surface,
                  transform: [{ scale }],
                },
              ];
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFamily }}
            accessibilityLabel="Familia"
            accessibilityHint="Perfiles y cuidado familiar"
          >
            <MaterialCommunityIcons name="account-group" size={28} color={theme.colors.buttonText} />
          </Pressable>
          <Text
            style={[
              styles.fabLabel,
              {
                color: isFamily ? theme.colors.accentPrimary : theme.colors.textMuted,
                fontWeight: isFamily ? '800' : '600',
              },
            ]}
            numberOfLines={1}
          >
            Familia
          </Text>
        </View>

        <View
          style={[
            styles.bar,
            {
              backgroundColor: barBackground,
              borderColor: theme.colors.surfaceBorder,
              opacity: 1,
            },
          ]}
          accessibilityRole="tablist"
        >
          <View style={styles.barRow}>
            <View style={styles.sideCluster}>
              {SIDE_TABS.slice(0, 2).map((item) => (
                <SideTab
                  key={item.tab}
                  theme={theme}
                  item={item}
                  active={activeTab === item.tab}
                  onPress={() => onSelect(item.tab)}
                />
              ))}
            </View>
            <View style={styles.fabGap} />
            <View style={styles.sideCluster}>
              {SIDE_TABS.slice(2, 4).map((item) => (
                <SideTab
                  key={item.tab}
                  theme={theme}
                  item={item}
                  active={activeTab === item.tab}
                  onPress={() => onSelect(item.tab)}
                />
              ))}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function SideTab({
  theme,
  item,
  active,
  onPress,
}: Readonly<{
  theme: AppTheme;
  item: (typeof SIDE_TABS)[number];
  active: boolean;
  onPress: () => void;
}>) {
  const color = active ? theme.colors.accentPrimary : theme.colors.textMuted;
  const iconName = active ? item.activeIcon : item.icon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sideTab, pressed && styles.sideTabPressed]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
    >
      <MaterialCommunityIcons name={iconName} size={24} color={color} />
      <Text style={[styles.sideLabel, { color }]} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 520,
    marginHorizontal: 0,
    marginTop: MAIN_TAB_FAB_OVERFLOW,
    alignSelf: 'center',
  },
  fabStack: {
    position: 'absolute',
    top: -MAIN_TAB_FAB_OVERFLOW,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
    gap: 2,
  },
  bar: {
    borderRadius: 22,
    borderWidth: 1,
    minHeight: BAR_BODY_MIN_HEIGHT,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: BAR_BODY_MIN_HEIGHT,
  },
  sideCluster: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  fabGap: {
    width: FAB_SIZE + 4,
  },
  sideTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    minWidth: 0,
  },
  sideTabPressed: {
    opacity: 0.75,
  },
  sideLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  fabLabel: {
    fontSize: 11,
    letterSpacing: 0.15,
  },
});
