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

  /** Cierra todas las sesiones de un grupo (mismo modelo de teléfono). */
  const close = (group: SessionGroup) => {
    const many = group.sessions.length > 1;
    Alert.alert(
      many ? `Cerrar ${group.sessions.length} sesiones` : 'Cerrar sesión en este dispositivo',
      `${group.name} tendrá que volver a iniciar sesión.`,
      [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setBusyId(group.key);
              const accessToken = await token();
              for (const session of group.sessions) await closeSession(accessToken, session.id);
              const closed = new Set(group.sessions.map((session) => session.id));
              setSessions((current) => current?.filter((item) => !closed.has(item.id)) ?? null);
            } catch (closeError) {
              Alert.alert('No se pudo cerrar', closeError instanceof Error ? closeError.message : 'Inténtalo de nuevo.');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
      ],
    );
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
  const current = sessions?.find((item) => item.current) ?? null;
  const groups = groupSessions(others, current?.deviceName ?? null);

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
        <Text style={[styles.error, { color: theme.colors.warningText }]}>{error}</Text>
      ) : !sessions ? (
        <ActivityIndicator color={theme.colors.accentPrimary} />
      ) : (
        <>
          {current ? (
            <View style={[styles.card, { borderColor: theme.colors.surfaceBorder, backgroundColor: theme.colors.surface }]}>
              <SessionRow theme={theme} platform={current.platform} name={current.deviceName ?? 'Este dispositivo'} meta="Este dispositivo" metaColor={theme.colors.success} />
            </View>
          ) : null}
          {groups.length ? (
            <>
              <Text style={[styles.section, { color: theme.colors.textMuted }]}>Otros · {others.length}</Text>
              <View style={[styles.card, { borderColor: theme.colors.surfaceBorder, backgroundColor: theme.colors.surface }]}>
                {groups.map((group, index) => (
                  <View key={group.key} style={index > 0 ? [styles.divider, { borderTopColor: theme.colors.surfaceBorder }] : null}>
                    <SessionRow
                      theme={theme}
                      platform={group.sessions[0].platform}
                      name={group.name}
                      meta={group.meta}
                      metaColor={theme.colors.textMuted}
                      action={
                        <Pressable
                          onPress={() => close(group)}
                          disabled={busyId !== null}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Cerrar sesión en ${group.name}`}
                          style={styles.closeButton}
                        >
                          {busyId === group.key ? (
                            <ActivityIndicator color={theme.colors.accentTertiary} />
                          ) : (
                            <Text style={[styles.closeText, { color: theme.colors.accentTertiary }]}>Cerrar</Text>
                          )}
                        </Pressable>
                      }
                    />
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </FormSheet>
  );
}

type SessionGroup = { key: string; name: string; meta: string; sessions: DeviceSession[] };

/** Mismo modelo en una sola fila (p. ej. sesiones viejas de antes de reinstalar). */
function groupSessions(sessions: DeviceSession[], currentName: string | null): SessionGroup[] {
  const byName = new Map<string, DeviceSession[]>();
  for (const session of sessions) {
    const name = session.deviceName ?? 'Dispositivo';
    byName.set(name, [...(byName.get(name) ?? []), session]);
  }
  return [...byName.entries()]
    .map(([name, list]) => {
      const sorted = [...list].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
      const last = lastUsedLabel(sorted[0].lastUsedAt);
      const parts = [sorted.length > 1 ? `${sorted.length} sesiones · ${last.charAt(0).toLowerCase()}${last.slice(1)}` : last];
      if (name === currentName) parts.push('sesión anterior');
      return { key: `group:${name}`, name, meta: parts.join(' · '), sessions: sorted };
    })
    .sort((a, b) => b.sessions[0].lastUsedAt.localeCompare(a.sessions[0].lastUsedAt));
}

function SessionRow({
  theme,
  platform,
  name,
  meta,
  metaColor,
  action,
}: Readonly<{ theme: AppTheme; platform: string | null; name: string; meta: string; metaColor: string; action?: React.ReactNode }>) {
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: `${theme.colors.accentSecondary}14` }]}>
        <MaterialCommunityIcons name={platformIcon(platform)} size={20} color={theme.colors.accentSecondary} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.meta, { color: metaColor }]}>{meta}</Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  section: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: -4 },
  closeButton: { minHeight: 40, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 14, fontWeight: '800' },
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  error: { fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2, fontWeight: '600' },
});
