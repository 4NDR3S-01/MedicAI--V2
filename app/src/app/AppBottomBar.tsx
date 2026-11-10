import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppTheme } from '../shared/theme';

export type MainTabId = 'home' | 'medications' | 'family' | 'appointments' | 'profile';

type AppBottomBarProps = {
  theme: AppTheme;
  activeTab: MainTabId;
  onSelect: (tab: MainTabId) => void;
};

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Cinco pestañas iguales en orden de uso: lo diario primero (tomas, citas),
 * luego el Círculo y el perfil. Ninguna se destaca sobre las demás: la acción
 * principal de cada pantalla vive en la propia pantalla.
 */
const TABS: { tab: MainTabId; label: string; icon: IconName; activeIcon: IconName }[] = [
  { tab: 'home', label: 'Inicio', icon: 'home-outline', activeIcon: 'home' },
  { tab: 'medications', label: 'Medicinas', icon: 'pill', activeIcon: 'pill' },
  { tab: 'appointments', label: 'Citas', icon: 'calendar-clock-outline', activeIcon: 'calendar-clock' },
  { tab: 'family', label: 'Círculo', icon: 'account-group-outline', activeIcon: 'account-group' },
  { tab: 'profile', label: 'Perfil', icon: 'account-outline', activeIcon: 'account' },
];

const BAR_HEIGHT = 64;
// Barra fija de lado a lado: nada del contenido se ve por debajo ni a los lados.
const BAR_BOTTOM_GAP = 0;

/** Se mantiene por compatibilidad: ya no hay botón central que sobresalga. */
export const MAIN_TAB_FAB_OVERFLOW = 0;

/**
 * Distancia desde el borde inferior para los botones flotantes de cada
 * pantalla (agregar medicamento, cita…): justo encima de la barra.
 */
export const FLOATING_ACTION_BUTTON_BOTTOM = BAR_HEIGHT + BAR_BOTTOM_GAP + 12;

/** Padding inferior para que el contenido no quede bajo la barra. */
export function useMainTabContentInset(): number {
  return BAR_HEIGHT + BAR_BOTTOM_GAP + 16;
}

export function AppBottomBar({ theme, activeTab, onSelect }: Readonly<AppBottomBarProps>) {
  const barBackground = theme.mode === 'light' ? '#FFFFFF' : '#0A1C2D';
  // La pantalla termina encima de la barra de gestos (área segura): la barra se
  // extiende por debajo con su mismo color para que no quede una franja distinta.
  const { bottom: safeBottom } = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.outer,
        { backgroundColor: barBackground, borderTopColor: theme.colors.surfaceBorder, bottom: -safeBottom, paddingBottom: safeBottom },
      ]}
    >
      <View style={styles.bar} accessibilityRole="tablist">
        {TABS.map((item) => (
          <Tab key={item.tab} theme={theme} item={item} active={activeTab === item.tab} onPress={() => onSelect(item.tab)} />
        ))}
      </View>
    </View>
  );
}

function Tab({
  theme,
  item,
  active,
  onPress,
}: Readonly<{ theme: AppTheme; item: (typeof TABS)[number]; active: boolean; onPress: () => void }>) {
  const color = active ? theme.colors.accentPrimaryText : theme.colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
    >
      <View style={[styles.indicator, active && { backgroundColor: `${theme.colors.accentPrimary}24` }]}>
        <MaterialCommunityIcons name={active ? item.activeIcon : item.icon} size={22} color={color} />
      </View>
      <Text style={[styles.label, { color, fontWeight: active ? '700' : '500' }]} numberOfLines={1}>
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: BAR_BOTTOM_GAP,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: 560,
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 0, height: '100%' },
  pressed: { opacity: 0.7 },
  indicator: { width: 56, height: 30, borderRadius: 15, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, letterSpacing: 0.1 },
});
