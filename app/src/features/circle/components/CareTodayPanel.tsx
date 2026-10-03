import { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppState, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { useReducedMotion } from '../../../shared/ui';
import { bucketAppointments, formatClock, relativeDayLabel } from '../../tabs/utils/appointment-status';
import { getTodayDoseSlots } from '../../tabs/utils/dose-status';
import { formatClockIn, isForeignTimeZone } from '../../../shared/services/dose-schedule';
import { withToken } from '../hooks/useCircle';
import * as circleAPI from '../services/circle.service';
import type { CareData, CircleMember } from '../services/circle.service';
import { displayName } from '../utils/relations';
import { Avatar, SectionTitle } from './CircleParts';

const VISIBLE_ROWS = 5;
const TICK_MS = 60_000;

type Row = {
  member: CircleMember;
  missed: number;
  due: number;
  taken: number;
  total: number;
  nextDose: Date | null;
  awaiting: number;
  nextAppointment: Date | null;
  score: number;
};

/** Datos de seguimiento de todas las personas que comparten conmigo. */
export function useCareData(enabled: boolean) {
  const [data, setData] = useState<CareData[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await circleAPI.fetchCareData(await withToken()));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void load();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [enabled, load]);

  return { data, error, load };
}

function buildRows(members: CircleMember[], data: CareData[], now: Date): Row[] {
  const byOwner = new Map(data.map((entry) => [entry.ownerId, entry]));
  return members.flatMap((member) => {
    const entry = byOwner.get(member.person.id);
    if (!entry) return [];
    let missed = 0;
    let due = 0;
    let taken = 0;
    let total = 0;
    let nextDose: Date | null = null;
    for (const medication of entry.medications ?? []) {
      if (!medication.active) continue;
      // Sus horas de toma son de SU zona horaria.
      for (const slot of getTodayDoseSlots({ ...medication, timeZone: member.person.timezone }, entry.logs ?? [], now)) {
        total += 1;
        if (slot.state === 'missed') missed += 1;
        else if (slot.state === 'due') due += 1;
        else if (slot.state === 'taken') taken += 1;
        if ((slot.state === 'upcoming' || slot.state === 'due') && (!nextDose || slot.at < nextDose)) nextDose = slot.at;
      }
    }
    const buckets = bucketAppointments(entry.appointments ?? [], now);
    const nextAppointmentData = buckets.upcoming[0];
    const nextAppointment = nextAppointmentData ? new Date(nextAppointmentData.scheduledAt) : null;
    const appointmentSoon = nextAppointment && nextAppointment.getTime() - now.getTime() < 24 * 3_600_000 ? 1 : 0;
    return [{
      member,
      missed,
      due,
      taken,
      total,
      nextDose,
      awaiting: buckets.awaitingCount,
      nextAppointment,
      score: missed * 100 + due * 60 + buckets.awaitingCount * 10 + appointmentSoon * 5,
    }];
  }).sort((a, b) => b.score - a.score || displayName(a.member.person).localeCompare(displayName(b.member.person)));
}

/**
 * Resumen del día de todas las personas que acompañas, ordenado por lo que
 * requiere atención: tomas sin registrar, tomas de ahora y citas.
 */
export function CareTodayPanel({
  theme,
  members,
  data,
  onOpen,
}: Readonly<{
  theme: AppTheme;
  members: CircleMember[];
  data: CareData[];
  onOpen: (member: CircleMember) => void;
}>) {
  const reducedMotion = useReducedMotion();
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const rows = useMemo(() => buildRows(members, data, now), [members, data, now]);
  if (!rows.length) return null;

  const attention = rows.filter((row) => row.missed || row.due || row.awaiting).length;
  const visible = expanded ? rows : rows.slice(0, VISIBLE_ROWS);

  return (
    <View style={styles.section}>
      <SectionTitle
        theme={theme}
        title="Seguimiento de hoy"
        hint={attention ? `${attention === 1 ? '1 persona necesita' : `${attention} personas necesitan`} atención.` : 'Todo al día por ahora.'}
      />
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
        {visible.map((row, index) => (
          <CareRow key={row.member.linkId} theme={theme} row={row} now={now} divider={index > 0} onPress={() => onOpen(row.member)} />
        ))}
        {rows.length > VISIBLE_ROWS ? (
          <Pressable
            onPress={() => {
              if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setExpanded((current) => !current);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.more, { borderTopColor: theme.colors.surfaceBorder }, pressed && styles.pressed]}
          >
            <Text style={[styles.moreText, { color: theme.colors.accentSecondary }]}>
              {expanded ? 'Ver menos' : `Ver a las ${rows.length} personas`}
            </Text>
            <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.accentSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function CareRow({ theme, row, now, divider, onPress }: Readonly<{ theme: AppTheme; row: Row; now: Date; divider: boolean; onPress: () => void }>) {
  const name = displayName(row.member.person);
  const parts: { text: string; tone: 'alert' | 'ok' | 'muted' }[] = [];
  if (row.missed) parts.push({ text: row.missed === 1 ? '1 toma sin registrar' : `${row.missed} tomas sin registrar`, tone: 'alert' });
  if (row.due) parts.push({ text: row.due === 1 ? 'Toma ahora' : `${row.due} tomas ahora`, tone: 'alert' });
  if (row.awaiting) parts.push({ text: row.awaiting === 1 ? '1 cita por confirmar' : `${row.awaiting} citas por confirmar`, tone: 'alert' });
  if (!row.missed && !row.due && row.total) {
    parts.push({ text: row.taken === row.total ? 'Tomas del día completas' : `${row.taken}/${row.total} tomas`, tone: row.taken === row.total ? 'ok' : 'muted' });
  }
  const timeZone = row.member.person.timezone;
  if (row.nextDose && !row.due) {
    parts.push({
      text: isForeignTimeZone(timeZone)
        ? `Próxima toma ${formatClockIn(row.nextDose, timeZone)} su hora (${formatClock(row.nextDose)} tuya)`
        : `Próxima toma ${formatClock(row.nextDose)}`,
      tone: 'muted',
    });
  }
  if (row.nextAppointment) parts.push({ text: `Cita ${relativeDayLabel(row.nextAppointment, now).toLowerCase()} ${formatClock(row.nextAppointment)}`, tone: 'muted' });
  if (!parts.length) parts.push({ text: 'Sin tomas ni citas próximas', tone: 'muted' });

  const needsAttention = parts.some((part) => part.tone === 'alert');
  const toneColor = { alert: theme.colors.accentTertiary, ok: theme.colors.success, muted: theme.colors.textMuted };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}: ${parts.map((part) => part.text).join(', ')}`}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.surfaceBorder }, pressed && styles.pressed]}
    >
      <View>
        <Avatar name={name} seed={row.member.person.id} size={40} />
        {needsAttention ? <View style={[styles.dot, { backgroundColor: theme.colors.accentTertiary, borderColor: theme.colors.surface }]} /> : null}
      </View>
      <View style={styles.flex}>
        <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>{name}</Text>
        <Text style={styles.parts} numberOfLines={2}>
          {parts.map((part, index) => (
            <Text key={part.text} style={{ color: toneColor[part.tone], fontWeight: part.tone === 'alert' ? '800' : '600' }}>
              {index > 0 ? ' · ' : ''}
              {part.text}
            </Text>
          ))}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  section: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  dot: { position: 'absolute', right: -2, top: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  name: { fontSize: 15, fontWeight: '800' },
  parts: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  moreText: { fontSize: 13.5, fontWeight: '800' },
});
