import { useCallback, useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

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
  else if (status.alarmChannelBlocked) items.push('Las alarmas de MedicAI están silenciadas en los ajustes del teléfono.');
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
      await ensureAlarmPermissions({ force: true });
    } finally {
      setFixing(false);
      void refresh();
    }
  };

  // Todo en orden: una línea discreta. La tarjeta grande solo cuando hay que actuar.
  if (ready) {
    return (
      <View style={styles.okRow} accessibilityRole="summary">
        <MaterialCommunityIcons name="alarm-check" size={18} color={theme.colors.successText} />
        <Text style={[styles.okText, { color: theme.colors.textSecondary }]}>
          <Text style={{ color: theme.colors.successText, fontWeight: '700' }}>Alarmas listas</Text>
          {autostart ? '' : ' en este teléfono'}
        </Text>
        {autostart ? (
          <Pressable
            onPress={() => void openAutostartSettings()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Permitir inicio automático"
            accessibilityHint="Algunos teléfonos (Xiaomi, Huawei, Oppo…) lo necesitan para que las alarmas suenen tras reiniciar"
          >
            <Text style={[styles.okLink, { color: theme.colors.accentSecondaryText }]}>Inicio automático</Text>
          </Pressable>
        ) : null}
      </View>
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
