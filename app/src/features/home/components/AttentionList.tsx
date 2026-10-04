import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { PressableScale } from '../../../shared/ui';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type AttentionItem = { key: string; icon: IconName; tone: 'warning' | 'info'; title: string; body: string; action: string; onPress: () => void };

/** Lo que necesita una acción tuya (alarmas sin permiso, existencias, asistencia). */
export function AttentionList({ theme, items }: Readonly<{ theme: AppTheme; items: AttentionItem[] }>) {
  if (!items.length) return null;
  return (
    <View style={styles.list}>
      {items.map((item) => {
        const color = item.tone === 'warning' ? theme.colors.accentTertiary : theme.colors.accentSecondary;
        return (
          <PressableScale
            key={item.key}
            onPress={item.onPress}
            pressedScale={0.99}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.body}. ${item.action}`}
            style={[styles.item, { backgroundColor: `${color}10`, borderColor: `${color}35` }]}
          >
            <View style={[styles.icon, { backgroundColor: `${color}1F` }]}>
              <MaterialCommunityIcons name={item.icon} size={20} color={color} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.body, { color: theme.colors.textSecondary }]}>{item.body}</Text>
            </View>
            <Text style={[styles.action, { color }]}>{item.action}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 12 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
  title: { fontSize: 14.5, fontWeight: '900' },
  body: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  action: { fontSize: 13, fontWeight: '900' },
});
