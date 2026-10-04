import { useCallback, useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppState, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { AppButton } from '../../../../shared/ui';
import {
  ensureAlarmPermissions,
  getAlarmPermissionsStatus,
  isOemAutostartRequired,
  openAutostartSettings,
  type AlarmPermissionsStatus,
} from '../../../../shared/services/alarm-permissions.service';

/** Lo que falta para que las alarmas suenen a tiempo, en lenguaje sencillo. */
function missingItems(status: AlarmPermissionsStatus): string[] {
  const items: string[] = [];
  if (status.notifications !== 'granted') items.push('Las notificaciones están desactivadas.');
  if (status.shouldPromptExactAlarmPermission) items.push('Falta el permiso de alarmas exactas: podrían sonar con minutos de retraso.');
  if (status.shouldPromptFullScreenIntent) items.push('La alarma no podrá mostrarse con la pantalla bloqueada.');
  if (status.shouldPromptBatteryOptimization) items.push('El ahorro de batería puede retrasar o silenciar las alarmas.');
  return items;
}

/**
 * Estado de las alarmas de este teléfono. Es lo más importante de la app:
 * si falta un permiso, lo dice claro y lleva a resolverlo.
 */
export function AlarmStatusCard({ theme, onIssueChange }: Readonly<{ theme: AppTheme; onIssueChange?: (hasIssue: boolean) => void }>) {
  const [status, setStatus] = useState<AlarmPermissionsStatus | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [fixing, setFixing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [next, oem] = await Promise.all([getAlarmPermissionsStatus(), isOemAutostartRequired().catch(() => false)]);
      setStatus(next);
      setAutostart(oem);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Al volver de los ajustes del sistema, el estado puede haber cambiado.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const missing = status ? missingItems(status) : [];
  const ready = Boolean(status) && missing.length === 0;

  useEffect(() => {
    if (status) onIssueChange?.(!ready);
  }, [ready, status, onIssueChange]);

  if (!status) return null;

  const fix = async () => {
    setFixing(true);
    try {
      await ensureAlarmPermissions();
    } finally {
      setFixing(false);
      void refresh();
    }
  };

  const color = ready ? theme.colors.success : theme.colors.accentTertiary;
  return (
    <View
      style={[styles.card, { backgroundColor: `${color}10`, borderColor: `${color}35` }]}
      accessibilityRole="summary"
    >
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: `${color}1F` }]}>
          <MaterialCommunityIcons name={ready ? 'alarm-check' : 'alarm-off'} size={22} color={color} />
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {ready ? 'Tus alarmas están listas' : 'Tus alarmas podrían no sonar'}
          </Text>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
            {ready ? 'Este teléfono tiene todo lo necesario para avisarte a tiempo.' : missing.join(' ')}
          </Text>
        </View>
      </View>
      {!ready ? (
        <AppButton theme={theme} label="Resolver ahora" icon="construct-outline" iconPosition="left" onPress={() => void fix()} loading={fixing} />
      ) : null}
      {autostart ? (
        <AppButton
          theme={theme}
          label="Permitir inicio automático"
          variant="ghost"
          icon="open-outline"
          iconPosition="left"
          onPress={() => void openAutostartSettings()}
          accessibilityHint="Algunos teléfonos (Xiaomi, Huawei, Oppo…) lo necesitan para que las alarmas suenen tras reiniciar"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 12 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 3 },
  title: { fontSize: 15.5, fontWeight: '900' },
  body: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
