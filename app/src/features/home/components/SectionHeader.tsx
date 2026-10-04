import { StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { PressableScale } from '../../../shared/ui';

export function SectionHeader({
  theme,
  title,
  action,
  onAction,
}: Readonly<{ theme: AppTheme; title: string; action?: string; onAction?: () => void }>) {
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]} accessibilityRole="header">{title}</Text>
      {action && onAction ? (
        <PressableScale onPress={onAction} hitSlop={10} accessibilityRole="button" style={styles.action}>
          <Text style={[styles.actionText, { color: theme.colors.accentPrimary }]}>{action}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  action: { minHeight: 32, justifyContent: 'center' },
  actionText: { fontSize: 13.5, fontWeight: '800' },
});
