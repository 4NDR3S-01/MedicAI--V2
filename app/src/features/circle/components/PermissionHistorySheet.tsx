import { useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet } from '../../../shared/ui';
import { withToken } from '../hooks/useCircle';
import * as circleAPI from '../services/circle.service';
import type { HistoryEvent, PermissionHistory } from '../services/circle.service';
import { PERMISSION_KEYS, PERMISSION_META, type PermissionKey } from '../utils/permissions';
import { InfoNote } from './CircleParts';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const nameOf = (person: HistoryEvent['owner']) => person?.fullName?.trim().split(/\s+/)[0] || 'Una persona';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const granted = (set: HistoryEvent['after']) => PERMISSION_KEYS.filter((key) => set?.[key] === true);

/** Permisos ganados (+) y perdidos (−) entre antes y después. */
function permissionDiff(event: HistoryEvent): { key: PermissionKey; added: boolean }[] {
  return PERMISSION_KEYS.flatMap((key) => {
    const before = event.before?.[key] === true;
    const after = event.after?.[key] === true;
    return before === after ? [] : [{ key, added: after }];
  });
}

/**
 * Texto de un evento visto desde la persona consultada (`target`): "tú", o el
 * nombre de un perfil a cargo cuando se consulta el suyo.
 */
function describe(event: HistoryEvent, targetId: string, targetName?: string) {
  const your = targetName ? `de ${targetName}` : 'tuya';
  const subject = nameOf(event.subject);
  const owner = nameOf(event.owner);
  const byOther = event.actor && event.actor.id !== targetId && event.actor.id !== event.owner?.id;
  const by = byOther ? `Lo hizo ${nameOf(event.actor)}.` : null;

  let icon: IconName = 'shield-account-outline';
  let title = '';
  let tone: 'add' | 'remove' | 'neutral' = 'neutral';
  const mine = event.direction === 'MINE';
  switch (event.action) {
    case 'LINK_CREATED':
      icon = 'account-plus-outline';
      tone = 'add';
      if (mine) title = targetName ? `${targetName} conectó con ${subject}` : `Conectaste con ${subject}`;
      else title = `${owner} ${targetName ? `le dio acceso a ${targetName}` : 'te dio acceso'} a su información`;
      break;
    case 'PERMISSIONS_CHANGED':
      icon = 'shield-edit-outline';
      title = mine ? `Cambió lo que ${subject} puede hacer con la información ${your}` : `${owner} cambió lo que ${targetName ? `${targetName} puede` : 'puedes'} hacer con su información`;
      break;
    case 'LINK_REVOKED':
      icon = 'account-remove-outline';
      tone = 'remove';
      title = mine ? `${subject} dejó de tener acceso a la información ${your}` : `${targetName ?? 'Ya no tienes'}${targetName ? ' ya no tiene' : ''} acceso a la información de ${owner}`;
      break;
    case 'DEPENDENT_CREATED':
      icon = 'account-child-outline';
      tone = 'add';
      title = `${nameOf(event.actor)} creó este perfil y lo cuida con acceso completo`;
      break;
    case 'HANDOVER_STARTED':
      icon = 'key-outline';
      title = `${nameOf(event.actor)} envió el enlace para entregarle su cuenta`;
      break;
  }

  let changes: { key: PermissionKey; added: boolean }[] = [];
  if (event.action === 'PERMISSIONS_CHANGED') changes = permissionDiff(event);
  else if (event.action === 'LINK_CREATED') changes = granted(event.after).map((key) => ({ key, added: true }));
  else if (event.action === 'LINK_REVOKED') changes = granted(event.before).map((key) => ({ key, added: false }));

  // Lo que la otra persona puede hacer: con mi información ("Puede ver tus…")
  // o lo que yo puedo hacer con la suya ("Puedes ver sus…").
  const label = (key: PermissionKey) => {
    if (targetName) return PERMISSION_META[key].label;
    return mine ? PERMISSION_META[key].theyCan : PERMISSION_META[key].iCan;
  };
  return { icon, title, tone, by, changes, label };
}

/**
 * Historial de accesos: quién dio, cambió o quitó permisos sobre la
 * información de una persona (y los que otras le dieron a ella), y cuándo.
 * `ownerId`: el de un perfil a cargo que administro.
 */
export function PermissionHistorySheet({
  theme,
  visible,
  onClose,
  ownerId,
  ownerName,
}: Readonly<{ theme: AppTheme; visible: boolean; onClose: () => void; ownerId?: string; ownerName?: string }>) {
  const [history, setHistory] = useState<PermissionHistory | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setStatus('loading');
    try {
      setHistory(await circleAPI.fetchPermissionHistory(await withToken(), ownerId));
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (visible) void load();
  }, [visible, ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  let content: React.ReactNode;
  if (status === 'loading') {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accentPrimary} />
      </View>
    );
  } else if (status === 'error' || !history) {
    content = (
      <>
        <InfoNote theme={theme} icon="alert-circle-outline" color={theme.colors.accentTertiary}>{error}</InfoNote>
        <AppButton theme={theme} label="Reintentar" variant="secondary" icon="refresh" iconPosition="left" onPress={() => void load()} />
      </>
    );
  } else if (!history.events.length) {
    content = (
      <InfoNote theme={theme} icon="history">
        Aún no hay cambios. Aquí verás cada vez que alguien reciba, cambie o pierda acceso a la información.
      </InfoNote>
    );
  } else {
    content = (
      <View style={styles.list}>
        {history.events.map((event) => {
          const item = describe(event, history.targetId, ownerName);
          let color = theme.colors.accentSecondary;
          if (item.tone === 'add') color = theme.colors.success;
          else if (item.tone === 'remove') color = theme.colors.accentTertiary;
          return (
            <View key={event.id} style={[styles.event, { borderColor: theme.colors.surfaceBorder, backgroundColor: theme.colors.surface }]}>
              <View style={[styles.icon, { backgroundColor: `${color}18` }]}>
                <MaterialCommunityIcons name={item.icon} size={20} color={color} />
              </View>
              <View style={styles.body}>
                <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{item.title}</Text>
                <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                  {formatWhen(event.createdAt)}
                  {item.by ? ` · ${item.by}` : ''}
                </Text>
                {item.changes.map(({ key, added }) => (
                  <View key={key} style={styles.change}>
                    <MaterialCommunityIcons
                      name={added ? 'plus-circle-outline' : 'minus-circle-outline'}
                      size={14}
                      color={added ? theme.colors.success : theme.colors.accentTertiary}
                    />
                    <Text style={[styles.changeText, { color: theme.colors.textSecondary }]}>{item.label(key)}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title={ownerName ? `Historial de accesos de ${ownerName}` : 'Historial de accesos'}
      subtitle="Quién recibió, cambió o perdió acceso, y cuándo."
      onClose={onClose}
      footer={<AppButton theme={theme} label="Cerrar" variant="secondary" onPress={onClose} style={styles.flex} />}
    >
      {content}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { paddingVertical: 32, alignItems: 'center' },
  list: { gap: 10 },
  event: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 14.5, fontWeight: '700', lineHeight: 20 },
  meta: { fontSize: 12, fontWeight: '600' },
  change: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeText: { fontSize: 12.5, flex: 1 },
});
