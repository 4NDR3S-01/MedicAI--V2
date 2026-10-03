import { useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet } from '../../../shared/ui';
import { getStoredSession } from '../../auth';
import { closeOtherSessions, closeSession, fetchSessions, type DeviceSession } from '../services/account.service';

const platformIcon = (platform: string | null): keyof typeof MaterialCommunityIcons.glyphMap =>
  platform === 'ios' ? 'apple' : platform === 'web' ? 'web' : 'android';

const lastUsedLabel = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 5) return 'Activo ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Último uso: ${new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
};

/** Dónde está abierta mi cuenta, con opción de cerrarla (p. ej. un teléfono perdido). */
export function SessionsSheet({ theme, visible, onClose }: Readonly<{ theme: AppTheme; visible: boolean; onClose: () => void }>) {
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const token = async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return session.accessToken;
  };

  const load = async () => {
    try {
      setError(null);
      setSessions(await fetchSessions(await token()));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar tus dispositivos.');
    }
  };

  useEffect(() => {
    if (!visible) return;
    setSessions(null);
    void load();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = (session: DeviceSession) => {
    Alert.alert('Cerrar sesión en este dispositivo', `${session.deviceName ?? 'El dispositivo'} tendrá que volver a iniciar sesión.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setBusyId(session.id);
              await closeSession(await token(), session.id);
              setSessions((current) => current?.filter((item) => item.id !== session.id) ?? null);
            } catch (closeError) {
              Alert.alert('No se pudo cerrar', closeError instanceof Error ? closeError.message : 'Inténtalo de nuevo.');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const closeOthers = () => {
    Alert.alert('Cerrar las demás sesiones', 'Todos los demás dispositivos tendrán que volver a iniciar sesión.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar las demás',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setBusyId('others');
              const result = await closeOtherSessions(await token());
              setSessions((current) => current?.filter((item) => item.current) ?? null);
              Alert.alert('Listo', result.message);
            } catch (closeError) {
              Alert.alert('No se pudieron cerrar', closeError instanceof Error ? closeError.message : 'Inténtalo de nuevo.');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const others = sessions?.filter((item) => !item.current) ?? [];

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title="Dispositivos con sesión"
      subtitle="Si no reconoces alguno, cierra su sesión y cambia tu contraseña."
      onClose={onClose}
      footer={
        <>
          <AppButton theme={theme} label="Cerrar" variant="secondary" onPress={onClose} style={styles.flex} />
          {others.length ? (
            <AppButton theme={theme} label="Cerrar las demás" onPress={closeOthers} loading={busyId === 'others'} style={styles.flexWide} />
          ) : null}
        </>
      }
    >
      {error ? (
        <Text style={[styles.error, { color: theme.colors.accentTertiary }]}>{error}</Text>
      ) : !sessions ? (
        <ActivityIndicator color={theme.colors.accentPrimary} />
      ) : (
        sessions.map((session) => (
          <View key={session.id} style={[styles.row, { borderColor: theme.colors.surfaceBorder, backgroundColor: theme.colors.surface }]}>
            <View style={[styles.icon, { backgroundColor: `${theme.colors.accentSecondary}14` }]}>
              <MaterialCommunityIcons name={platformIcon(session.platform)} size={22} color={theme.colors.accentSecondary} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {session.deviceName ?? 'Dispositivo'}
              </Text>
              <Text style={[styles.meta, { color: session.current ? theme.colors.success : theme.colors.textMuted }]}>
                {session.current ? 'Este dispositivo' : lastUsedLabel(session.lastUsedAt)}
              </Text>
            </View>
            {!session.current ? (
              <Pressable
                onPress={() => close(session)}
                disabled={busyId !== null}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Cerrar sesión en ${session.deviceName ?? 'este dispositivo'}`}
              >
                {busyId === session.id ? (
                  <ActivityIndicator color={theme.colors.accentTertiary} />
                ) : (
                  <MaterialCommunityIcons name="logout" size={22} color={theme.colors.accentTertiary} />
                )}
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  error: { fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12.5, marginTop: 2, fontWeight: '600' },
});
