import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { FloatingActionButton, SelectField, useEnterAnimation, useReducedMotion, useSwapAnimation } from '../../../shared/ui';
import { appStorage } from '../../../shared/storage';
import {
  cancelNotificationsByDataId,
  rescheduleAppointmentsAfterLaunch,
  scheduleAppointmentReminder,
} from '../../../shared/services/notifications.service';
import { getStoredSession } from '../../auth';
import * as appointmentsAPI from '../services/appointments.service';
import type { AppointmentAttendanceStatus, AppointmentData } from '../services/appointments.service';
import { AppointmentCard } from '../components/AppointmentCard';
import { AppointmentFormSheet } from '../components/AppointmentFormSheet';
import { AttendanceSheet } from '../components/AttendanceSheet';
import { EmptyState, SkeletonList } from '../components/ScreenStates';
import {
  appointmentDate,
  bucketAppointments,
  countdownLabel,
  dateParts,
  formatClock,
  getAppointmentState,
  isInProgress,
  relativeDayLabel,
  type AppointmentState,
} from '../utils/appointment-status';

const CACHE_KEY = 'medicai_appointments_cache_v1';
const CLOCK_TICK_MS = 60_000;

type Segment = 'upcoming' | 'history';
type HistoryFilter = 'all' | Exclude<AppointmentState, 'upcoming'>;

const HISTORY_FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'awaiting', label: 'Por confirmar' },
  { value: 'attended', label: 'Asistidas' },
  { value: 'missed', label: 'No asistidas' },
];

const animateLayout = (reducedMotion: boolean) => {
  if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
};

const openDirections = (location: string) => {
  const query = encodeURIComponent(location);
  const url = Platform.OS === 'ios' ? `maps:0,0?q=${query}` : `geo:0,0?q=${query}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() =>
      Alert.alert('No se pudo abrir el mapa', 'No encontramos una aplicación de mapas en tu dispositivo.'),
    ),
  );
};

export type AppointmentsScreenProps = {
  theme: AppTheme;
  contentBottomInset: number;
};

export function AppointmentsScreen({ theme, contentBottomInset }: Readonly<AppointmentsScreenProps>) {
  const reducedMotion = useReducedMotion();
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [segment, setSegment] = useState<Segment>('upcoming');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [now, setNow] = useState(() => new Date());
  const [form, setForm] = useState<{ visible: boolean; appointment: AppointmentData | null }>({
    visible: false,
    appointment: null,
  });
  const [attendanceTarget, setAttendanceTarget] = useState<AppointmentData | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const appointmentsRef = useRef(appointments);
  appointmentsRef.current = appointments;

  const enter = useEnterAnimation(status !== 'loading');
  const swap = useSwapAnimation(`${segment}:${historyFilter}`);

  // ── Carga de datos ────────────────────────────────────────────────────────
  const persist = useCallback((list: AppointmentData[]) => {
    void appStorage.setItem(CACHE_KEY, JSON.stringify(list)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) {
      setErrorMessage('Tu sesión expiró. Vuelve a iniciar sesión.');
      setStatus((current) => (current === 'ready' ? current : 'error'));
      return;
    }
    try {
      const data = (await appointmentsAPI.fetchAppointments(session.accessToken)) ?? [];
      setAppointments(data);
      setErrorMessage(null);
      setStatus('ready');
      setNow(new Date());
      persist(data);
      void rescheduleAppointmentsAfterLaunch(data).catch(() => undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudieron cargar tus citas.');
      // Con datos en pantalla (caché) no se sustituye la lista por el error.
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, [persist]);

  // Primer render: caché (sin esqueleto) y luego datos frescos.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await appStorage.getItem(CACHE_KEY);
        const cached = raw ? (JSON.parse(raw) as AppointmentData[]) : null;
        if (!cancelled && Array.isArray(cached)) {
          setAppointments(cached);
          setStatus('ready');
        }
      } catch {
        // caché corrupta: se ignora
      }
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Reloj: las citas pasan de "Próximas" a "Por confirmar" sin recargar.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  // ── Datos derivados ───────────────────────────────────────────────────────
  const buckets = useMemo(() => bucketAppointments(appointments, now), [appointments, now]);
  const nextAppointment = buckets.upcoming[0] ?? null;

  const visibleAppointments = useMemo(() => {
    if (segment === 'upcoming') return buckets.upcoming;
    if (historyFilter === 'all') return buckets.history;
    return buckets.history.filter((item) => getAppointmentState(item, now) === historyFilter);
  }, [segment, historyFilter, buckets, now]);

  // ── Acciones ──────────────────────────────────────────────────────────────
  const withToken = async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return session.accessToken;
  };

  const setBusy = (id: string, value: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  const markAttendance = useCallback(async (appointment: AppointmentData, attendanceStatus: AppointmentAttendanceStatus) => {
    setBusy(appointment.id, true);
    animateLayout(reducedMotion);
    // Actualización optimista: la tarjeta cambia al instante.
    setAppointments((current) =>
      current.map((item) => (item.id === appointment.id ? { ...item, attendanceStatus } : item)),
    );
    try {
      const updated = await appointmentsAPI.updateAppointment(appointment.id, await withToken(), { attendanceStatus });
      const nextList = appointmentsRef.current.map((item) => (item.id === updated.id ? updated : item));
      setAppointments(nextList);
      persist(nextList);
      setAttendanceTarget(null);
      if (updated.attendanceStatus === 'PENDING') void scheduleAppointmentReminder(updated).catch(() => undefined);
      else void cancelNotificationsByDataId(updated.id).catch(() => undefined);
    } catch (error) {
      animateLayout(reducedMotion);
      setAppointments((current) => current.map((item) => (item.id === appointment.id ? appointment : item)));
      Alert.alert('No se pudo guardar la asistencia', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(appointment.id, false);
    }
  }, [persist, reducedMotion]);

  const handleEdit = useCallback((appointment: AppointmentData) => {
    setForm({ visible: true, appointment });
  }, []);

  const handleDelete = useCallback((appointment: AppointmentData) => {
    Alert.alert(
      'Eliminar cita',
      `Se eliminará "${appointment.title}" y sus recordatorios. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await appointmentsAPI.deleteAppointment(appointment.id, await withToken());
                void cancelNotificationsByDataId(appointment.id).catch(() => undefined);
                animateLayout(reducedMotion);
                const nextList = appointmentsRef.current.filter((item) => item.id !== appointment.id);
                setAppointments(nextList);
                persist(nextList);
              } catch (error) {
                Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
              }
            })();
          },
        },
      ],
    );
  }, [persist, reducedMotion]);

  const handleDirections = useCallback((appointment: AppointmentData) => {
    if (appointment.location) openDirections(appointment.location);
  }, []);

  const handleSaved = (saved: AppointmentData, isNew: boolean) => {
    const targetSegment: Segment = getAppointmentState(saved, new Date()) === 'upcoming' ? 'upcoming' : 'history';
    // Si cambia de pestaña, la transición la hace useSwapAnimation.
    if (targetSegment === segment) animateLayout(reducedMotion);
    const nextList = isNew
      ? [...appointmentsRef.current, saved]
      : appointmentsRef.current.map((item) => (item.id === saved.id ? saved : item));
    setAppointments(nextList);
    persist(nextList);
    setNow(new Date());
    // Muestra la cita donde quedó tras guardarla.
    setSegment(targetSegment);
  };

  const openNewForm = () => setForm({ visible: true, appointment: null });

  const changeSegment = (next: Segment) => {
    if (next !== segment) setSegment(next);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const hasAppointments = appointments.length > 0;

  const todayLabel = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

  const header = (
    <View>
      <View style={styles.titleBlock}>
        <View style={styles.titleTopRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.accentSecondary }]}>Citas médicas</Text>
          <View style={[styles.monthBadge, { backgroundColor: `${theme.colors.accentSecondary}12`, borderColor: `${theme.colors.accentSecondary}30` }]}>
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={theme.colors.accentSecondary} />
            <Text style={[styles.monthBadgeText, { color: theme.colors.accentSecondary }]}>{todayLabel}</Text>
          </View>
        </View>
        <Text style={[styles.screenTitle, { color: theme.colors.textPrimary }]} accessibilityRole="header">Agenda</Text>
        <Text style={[styles.screenSubtitle, { color: theme.colors.textSecondary }]}>
          Tus consultas, recordatorios y asistencia en un solo lugar.
        </Text>
      </View>

      {buckets.awaitingCount > 0 && !(segment === 'history' && historyFilter === 'awaiting') ? (
        <Pressable
          onPress={() => {
            setSegment('history');
            setHistoryFilter('awaiting');
          }}
          accessibilityRole="button"
          style={[styles.banner, { backgroundColor: `${theme.colors.accentTertiary}14`, borderColor: `${theme.colors.accentTertiary}40` }]}
        >
          <MaterialCommunityIcons name="clipboard-check-outline" size={20} color={theme.colors.accentTertiary} />
          <Text style={[styles.bannerText, { color: theme.colors.textPrimary }]}>
            {buckets.awaitingCount === 1
              ? '1 cita pasada espera que confirmes tu asistencia.'
              : `${buckets.awaitingCount} citas pasadas esperan que confirmes tu asistencia.`}
          </Text>
          <Text style={[styles.bannerAction, { color: theme.colors.accentTertiary }]}>Revisar</Text>
        </Pressable>
      ) : null}

      {hasAppointments ? (
        <>
          {segment === 'upcoming' && nextAppointment ? (
            <NextAppointmentCard theme={theme} appointment={nextAppointment} now={now} onDirections={handleDirections} />
          ) : null}

          <View style={[styles.segmentBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
            <SegmentButton
              theme={theme}
              label={`Próximas (${buckets.upcoming.length})`}
              selected={segment === 'upcoming'}
              onPress={() => changeSegment('upcoming')}
            />
            <SegmentButton
              theme={theme}
              label={`Historial (${buckets.history.length})`}
              selected={segment === 'history'}
              badge={buckets.awaitingCount > 0}
              onPress={() => changeSegment('history')}
            />
          </View>

          {segment === 'history' && buckets.history.length > 0 ? (
            <View style={styles.filterRow}>
              <Text style={[styles.filterLabel, { color: theme.colors.textSecondary }]}>Mostrar</Text>
              <SelectField
                theme={theme}
                value={historyFilter}
                options={HISTORY_FILTERS.map((filter) => ({
                  value: filter.value,
                  label: `${filter.label} (${{
                    all: buckets.history.length,
                    awaiting: buckets.awaitingCount,
                    attended: buckets.attendedCount,
                    missed: buckets.missedCount,
                  }[filter.value]})`,
                }))}
                onChange={setHistoryFilter}
                accessibilityLabel="Filtrar historial"
                style={styles.filterSelect}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  if (status === 'loading') {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <SkeletonList theme={theme} bottomInset={contentBottomInset + 100} />
      </View>
    );
  }

  let emptyState: React.ReactNode = null;
  if (status === 'error' && !hasAppointments) {
    emptyState = (
      <EmptyState
        theme={theme}
        icon="connection"
        iconColor={theme.colors.accentTertiary}
        title={errorMessage ?? 'No pudimos cargar tus citas'}
        text="Verifica tu conexión e inténtalo de nuevo."
        actionIcon="refresh"
        actionLabel="Reintentar"
        actionColor={theme.colors.accentSecondary}
        onAction={() => {
          setStatus('loading');
          void load();
        }}
      />
    );
  } else if (!hasAppointments) {
    emptyState = (
      <EmptyState
        theme={theme}
        icon="calendar-heart"
        iconColor={theme.colors.accentSecondary}
        title="Tu agenda está libre"
        text="Registra tus consultas médicas y te recordaremos cada una a tiempo."
        actionIcon="calendar-plus"
        actionLabel="Agregar primera cita"
        actionColor={theme.colors.accentSecondary}
        onAction={openNewForm}
      />
    );
  } else if (!visibleAppointments.length) {
    emptyState =
      segment === 'upcoming' ? (
        <EmptyState
          theme={theme}
          icon="calendar-check-outline"
          iconColor={theme.colors.accentSecondary}
          title="No tienes citas próximas"
          text="Tus citas pasadas siguen en el historial. Agrega una nueva con el botón +."
        />
      ) : (
        <EmptyState
          theme={theme}
          icon="history"
          iconColor={theme.colors.accentSecondary}
          title={historyFilter === 'awaiting' ? 'Todo al día' : 'Nada por aquí'}
          text={
            historyFilter === 'awaiting'
              ? 'Ya confirmaste la asistencia de todas tus citas pasadas.'
              : 'Aquí verás tus citas pasadas cuando las haya.'
          }
        />
      );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Animated.View
        style={[styles.screen, enter.style]}
        renderToHardwareTextureAndroid={enter.animating}
        needsOffscreenAlphaCompositing={enter.animating}
      >
        <FlatList
          data={visibleAppointments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyState ? <Animated.View style={swap}>{emptyState}</Animated.View> : null}
          renderItem={({ item }) => (
            <Animated.View style={swap}>
              <AppointmentCard
                theme={theme}
                appointment={item}
                now={now}
                busy={busyIds.has(item.id)}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onMarkAttendance={markAttendance}
                onChangeAttendance={setAttendanceTarget}
                onDirections={handleDirections}
              />
            </Animated.View>
          )}
          ItemSeparatorComponent={Separator}
          ListFooterComponent={
            visibleAppointments.length > 0 ? (
              <Text style={[styles.listFooterText, { color: theme.colors.textMuted }]}>
                Mantén presionada una cita para editarla
              </Text>
            ) : null
          }
          contentContainerStyle={[
            styles.listContent,
            !visibleAppointments.length && styles.listContentEmpty,
            { paddingBottom: contentBottomInset + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void load().finally(() => setIsRefreshing(false));
              }}
              tintColor={theme.colors.accentSecondary}
              colors={[theme.colors.accentSecondary]}
            />
          }
        />
      </Animated.View>

      {hasAppointments ? (
        <FloatingActionButton
          theme={theme}
          icon="calendar-plus"
          onPress={openNewForm}
          accessibilityLabel="Agregar cita"
          backgroundColor={theme.colors.accentSecondary}
        />
      ) : null}

      <AppointmentFormSheet
        theme={theme}
        visible={form.visible}
        appointment={form.appointment}
        existingAppointments={appointments}
        onClose={() => setForm((current) => ({ ...current, visible: false }))}
        onSaved={handleSaved}
      />

      <AttendanceSheet
        theme={theme}
        appointment={attendanceTarget}
        busy={attendanceTarget ? busyIds.has(attendanceTarget.id) : false}
        onClose={() => setAttendanceTarget(null)}
        onSelect={(attendanceStatus) => {
          if (attendanceTarget) void markAttendance(attendanceTarget, attendanceStatus);
        }}
      />
    </View>
  );
}

const Separator = () => <View style={styles.separator} />;

// ─── Próxima cita ───────────────────────────────────────────────────────────

function NextAppointmentCard({
  theme,
  appointment,
  now,
  onDirections,
}: Readonly<{
  theme: AppTheme;
  appointment: AppointmentData;
  now: Date;
  onDirections: (appointment: AppointmentData) => void;
}>) {
  const date = appointmentDate(appointment);
  if (!date) return null;
  const parts = dateParts(date);
  const inProgress = isInProgress(appointment, now);
  const accent = inProgress ? theme.colors.accentPrimary : theme.colors.accentSecondary;

  return (
    <View
      style={[styles.nextCard, { backgroundColor: theme.colors.surface, borderColor: `${accent}40` }]}
      accessible
      accessibilityLabel={`Próxima cita: ${appointment.title} con ${appointment.doctorName}, ${relativeDayLabel(date, now)} a las ${formatClock(date)}`}
    >
      <View style={styles.nextTop}>
        <Text style={[styles.nextKicker, { color: accent }]}>{inProgress ? 'Cita en curso' : 'Próxima cita'}</Text>
        <View style={[styles.countdownChip, { backgroundColor: `${accent}14` }]}>
          <MaterialCommunityIcons name="timer-sand" size={14} color={accent} />
          <Text style={[styles.countdownText, { color: accent }]}>
            {inProgress ? 'Ahora' : countdownLabel(date, now).replace(/^./, (char) => char.toUpperCase())}
          </Text>
        </View>
      </View>

      <View style={styles.nextBody}>
        <View style={[styles.nextDate, { backgroundColor: `${accent}14` }]}>
          <Text style={[styles.nextWeekday, { color: accent }]}>{parts.weekday}</Text>
          <Text style={[styles.nextDay, { color: theme.colors.textPrimary }]}>{parts.day}</Text>
          <Text style={[styles.nextMonth, { color: accent }]}>{parts.month}</Text>
        </View>
        <View style={styles.nextInfo}>
          <Text style={[styles.nextTitle, { color: theme.colors.textPrimary }]} numberOfLines={2}>
            {appointment.title}
          </Text>
          <Text style={[styles.nextMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {formatClock(date)} · {appointment.doctorName}
          </Text>
          {appointment.location ? (
            <Text style={[styles.nextLocation, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {appointment.location}
            </Text>
          ) : null}
        </View>
      </View>

      {appointment.location ? (
        <Pressable
          onPress={() => onDirections(appointment)}
          accessibilityRole="button"
          accessibilityLabel={`Cómo llegar a ${appointment.location}`}
          style={({ pressed }) => [styles.directions, { backgroundColor: `${accent}14` }, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="directions" size={18} color={accent} />
          <Text style={[styles.directionsText, { color: accent }]}>Cómo llegar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SegmentButton({
  theme,
  label,
  selected,
  badge,
  onPress,
}: Readonly<{ theme: AppTheme; label: string; selected: boolean; badge?: boolean; onPress: () => void }>) {
  return (
    <Pressable
      style={[styles.segmentBtn, selected && { backgroundColor: theme.colors.accentSecondary }]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityHint={badge ? 'Hay citas por confirmar' : undefined}
    >
      <Text style={[styles.segmentBtnText, { color: selected ? '#fff' : theme.colors.textSecondary }]}>{label}</Text>
      {badge ? <View style={[styles.segmentBadge, { backgroundColor: theme.colors.accentTertiary }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingTop: 14 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  separator: { height: 10 },
  pressed: { opacity: 0.7 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  bannerAction: { fontSize: 13, fontWeight: '800' },

  nextCard: { borderRadius: 24, borderWidth: 1, padding: 16, marginBottom: 16, gap: 14 },
  nextTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  nextKicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  countdownChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  countdownText: { fontSize: 12.5, fontWeight: '800' },
  nextBody: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  nextDate: { width: 64, paddingVertical: 8, borderRadius: 18, alignItems: 'center' },
  nextWeekday: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  nextDay: { fontSize: 28, fontWeight: '900', letterSpacing: -1, lineHeight: 32 },
  nextMonth: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  nextInfo: { flex: 1, gap: 3 },
  nextTitle: { fontSize: 19, fontWeight: '900', letterSpacing: -0.4 },
  nextMeta: { fontSize: 14, fontWeight: '700' },
  nextLocation: { fontSize: 12.5, fontWeight: '600' },
  directions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 14 },
  directionsText: { fontSize: 14, fontWeight: '800' },

  segmentBar: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, padding: 4, marginBottom: 12, gap: 4 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 14 },
  segmentBtnText: { fontSize: 13, fontWeight: '800' },
  segmentBadge: { width: 8, height: 8, borderRadius: 4 },

  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  filterLabel: { fontSize: 13, fontWeight: '800' },
  filterSelect: { minWidth: 190, minHeight: 44 },

  titleBlock: { gap: 3, marginBottom: 16 },
  titleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  monthBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  monthBadgeText: { fontSize: 12, fontWeight: '900' },
  screenTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -1, lineHeight: 36 },
  screenSubtitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },

  listFooterText: { textAlign: 'center', fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 12, paddingHorizontal: 12 },
});
