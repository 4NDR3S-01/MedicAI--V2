import { useCallback, useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { AppButton } from '../../../../shared/ui';
import {
  getAlarmSetupSnapshot,
  onAlarmSetupChanged,
  openAlarmSetup,
  type AlarmSetupSnapshot,
} from '../../../../shared/services/alarm-setup.service';

/**
 * Estado de las alarmas de este teléfono. Es lo más importante de la app:
 * si falta algo, lo dice claro y abre "Prepara tus alarmas".
 */
export function AlarmStatusCard({ theme, onIssueChange }: Readonly<{ theme: AppTheme; onIssueChange?: (hasIssue: boolean) => void }>) {
  const [snapshot, setSnapshot] = useState<AlarmSetupSnapshot | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await getAlarmSetupSnapshot());
    } catch {
      setSnapshot(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Al volver de los ajustes del sistema, el estado puede haber cambiado.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const unsubscribe = onAlarmSetupChanged(() => void refresh());
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [refresh]);

  const missing = snapshot ? snapshot.steps.filter((step) => !step.done) : [];
  const ready = Boolean(snapshot) && missing.length === 0;
  const onlyTest = missing.length === 1 && missing[0].id === 'test';

  useEffect(() => {
    if (snapshot) onIssueChange?.(!ready);
  }, [ready, snapshot, onIssueChange]);

  if (!snapshot) return null;

  // Todo en orden: una línea discreta. La tarjeta grande solo cuando hay que actuar.
  if (ready) {
    return (
      <Pressable
        onPress={openAlarmSetup}
        style={styles.okRow}
        accessibilityRole="button"
        accessibilityLabel="Alarmas listas en este teléfono"
        accessibilityHint="Abre Prepara tus alarmas para revisarlas o probarlas de nuevo"
      >
        <MaterialCommunityIcons name="alarm-check" size={18} color={theme.colors.successText} />
        <Text style={[styles.okText, { color: theme.colors.textSecondary }]}>
          <Text style={{ color: theme.colors.successText, fontWeight: '700' }}>Alarmas listas</Text>
          {' en este teléfono'}
        </Text>
        <Text style={[styles.okLink, { color: theme.colors.accentSecondaryText }]}>Revisar</Text>
      </Pressable>
    );
  }

  const color = theme.colors.accentTertiary;
  return (
    <View
      style={[styles.card, { backgroundColor: `${color}10`, borderColor: `${color}35` }]}
      accessibilityRole="summary"
    >
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: `${color}1F` }]}>
          <MaterialCommunityIcons name={onlyTest ? 'alarm' : 'alarm-off'} size={22} color={color} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {onlyTest ? 'Prueba tu alarma' : 'Tus alarmas podrían no sonar'}
          </Text>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
            {onlyTest
              ? 'Comprueba en 10 segundos que se ve con el teléfono bloqueado.'
              : `Falta${missing.length === 1 ? '' : 'n'}: ${missing.map((step) => step.title.toLowerCase()).join(', ')}.`}
          </Text>
        </View>
      </View>
      <AppButton
        theme={theme}
        label={onlyTest ? 'Probar alarma' : 'Resolver ahora'}
        icon={onlyTest ? 'alarm-outline' : 'construct-outline'}
        iconPosition="left"
        onPress={openAlarmSetup}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 12 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 3 },
  title: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  okText: { flex: 1, fontSize: 14, fontWeight: '500' },
  okLink: { fontSize: 14, fontWeight: '700' },
});
