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
import type { AppointmentAttendanceStatus, AppointmentData, SeriesScope } from '../services/appointments.service';
import { askSeriesScope } from '../utils/appointment-series';
import { AppointmentCard } from '../components/AppointmentCard';
import { AppointmentFormSheet } from '../components/AppointmentFormSheet';
import { AttendanceSheet } from '../components/AttendanceSheet';
import { EmptyState, SkeletonList } from '../components/ScreenStates';
import {
  appointmentDate,
  bucketAppointments,
  countdownLabel,
  formatClock,
  getAppointmentState,
  isInProgress,
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

  const removeAppointment = useCallback(async (appointment: AppointmentData, scope: SeriesScope) => {
    try {
      await appointmentsAPI.deleteAppointment(appointment.id, await withToken(), undefined, scope);
      animateLayout(reducedMotion);
      // "Esta y las siguientes": las de la misma serie desde esta fecha.
      const from = new Date(appointment.scheduledAt).getTime();
      const removed = (item: AppointmentData) =>
        item.id === appointment.id
        || (scope === 'FOLLOWING' && !!appointment.seriesId && item.seriesId === appointment.seriesId && new Date(item.scheduledAt).getTime() >= from);
      appointmentsRef.current.filter(removed).forEach((item) => void cancelNotificationsByDataId(item.id).catch(() => undefined));
      const nextList = appointmentsRef.current.filter((item) => !removed(item));
      setAppointments(nextList);
      persist(nextList);
      void rescheduleAppointmentsAfterLaunch(nextList).catch(() => undefined);
    } catch (error) {
      Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    }
  }, [persist, reducedMotion]);

  const handleDelete = useCallback((appointment: AppointmentData) => {
    if (appointment.seriesId) {
      void askSeriesScope(appointment, {
        title: 'Eliminar cita que se repite',
        message: `¿Eliminar solo esta cita de "${appointment.title}" o también las siguientes? No se puede deshacer.`,
        destructive: true,
      }).then((scope) => {
        if (scope) void removeAppointment(appointment, scope);
      });
      return;
    }
    Alert.alert(
      'Eliminar cita',
      `Se eliminará "${appointment.title}" y sus recordatorios. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void removeAppointment(appointment, 'ONE') },
      ],
    );
  }, [removeAppointment]);

  const handleDirections = useCallback((appointment: AppointmentData) => {
    if (appointment.location) openDirections(appointment.location);
  }, []);

  const handleSaved = (saved: AppointmentData, isNew: boolean, reload = false) => {
    // Serie creada o "esta y las siguientes": cambiaron varias citas.
    if (reload) void load();
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
      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: theme.colors.textPrimary }]} accessibilityRole="header">Citas</Text>
        <View
          style={[styles.dateChip, { backgroundColor: `${theme.colors.accentSecondary}1A`, borderColor: `${theme.colors.accentSecondary}40` }]}
          accessibilityLabel={`Hoy es ${todayLabel}`}
        >
          <MaterialCommunityIcons name="calendar-today" size={16} color={theme.colors.accentSecondaryText} />
          <Text style={[styles.dateChipText, { color: theme.colors.accentSecondaryText }]}>{todayLabel}</Text>
        </View>
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
          <Text style={[styles.bannerAction, { color: theme.colors.warningText }]}>Revisar</Text>
        </Pressable>
      ) : null}

      {hasAppointments ? (
        <>
          {segment === 'upcoming' && nextAppointment ? (
            <AgendaSummary theme={theme} next={nextAppointment} upcoming={buckets.upcoming} awaitingCount={buckets.awaitingCount} now={now} />
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
          ListEmptyComponent={emptyState ? <Animated.View style={[swap, styles.listEmpty]}>{emptyState}</Animated.View> : null}
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
                Toca una cita para ver detalles y opciones
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

// ─── Resumen de la agenda ───────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const startOfDayMs = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * Panorama de las próximas semanas sin repetir ninguna cita de la lista:
 * cuánto falta para la próxima, cómo se reparten los próximos 30 días y
 * cuántas pasadas quedan por confirmar.
 */
function AgendaSummary({
  theme,
  next,
  upcoming,
  awaitingCount,
  now,
}: Readonly<{ theme: AppTheme; next: AppointmentData; upcoming: AppointmentData[]; awaitingCount: number; now: Date }>) {
  const date = appointmentDate(next);
  if (!date) return null;

  const inProgress = isInProgress(next, now);
  const days = Math.round((startOfDayMs(date) - startOfDayMs(now)) / DAY_MS);
  let big: string;
  let caption: string;
  if (inProgress) {
    big = 'Ahora';
    caption = 'tienes una cita en curso';
  } else if (days <= 0) {
    big = countdownLabel(date, now).replace(/^en /, '');
    caption = `para tu próxima cita · hoy a las ${formatClock(date)}`;
  } else if (days === 1) {
    big = 'Mañana';
    caption = `tu próxima cita · a las ${formatClock(date)}`;
  } else {
    big = `${days} días`;
    caption = 'para tu próxima cita';
  }

  // Mini calendario: las dos semanas (lunes a domingo) que empiezan esta semana.
  const todayMs = startOfDayMs(now);
  const mondayOffset = (now.getDay() + 6) % 7;
  const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  const days14 = Array.from({ length: 14 }, (_, i) => new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + i));
  const countByDay = new Map<number, number>();
  for (const item of upcoming) {
    const d = appointmentDate(item);
    if (d) countByDay.set(startOfDayMs(d), (countByDay.get(startOfDayMs(d)) ?? 0) + 1);
  }
  const lastShown = startOfDayMs(days14[13]);
  const later = upcoming.filter((item) => {
    const d = appointmentDate(item);
    return d ? startOfDayMs(d) > lastShown : false;
  }).length;
  const accent = theme.colors.accentSecondary;

  return (
    <View
      style={[styles.summaryCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
      accessible
      accessibilityLabel={`${big} ${caption}. ${upcoming.length} citas próximas.${awaitingCount ? ` ${awaitingCount} por confirmar.` : ''}`}
    >
      <View style={styles.summaryTop}>
        <View style={styles.flex}>
          <Text style={[styles.summaryBig, { color: inProgress ? theme.colors.accentPrimaryText : theme.colors.textPrimary }]}>{big}</Text>
          <Text style={[styles.summaryCaption, { color: theme.colors.textSecondary }]}>{caption}</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={[styles.summaryStatValue, { color: theme.colors.accentSecondaryText }]}>{upcoming.length}</Text>
          <Text style={[styles.summaryStatLabel, { color: theme.colors.textMuted }]}>{upcoming.length === 1 ? 'próxima' : 'próximas'}</Text>
        </View>
      </View>

      <View style={styles.calendar} importantForAccessibility="no-hide-descendants">
        <View style={styles.calendarRow}>
          {WEEKDAYS.map((label) => (
            <Text key={label} style={[styles.weekday, { color: theme.colors.textMuted }]}>{label}</Text>
          ))}
        </View>
        {[0, 7].map((offset) => (
          <View key={offset} style={styles.calendarRow}>
            {days14.slice(offset, offset + 7).map((day) => {
              const ms = startOfDayMs(day);
              const count = countByDay.get(ms) ?? 0;
              const isToday = ms === todayMs;
              const isPast = ms < todayMs;
              return (
                <View key={ms} style={styles.dayCell}>
                  <View
                    style={[
                      styles.dayCircle,
                      count ? { backgroundColor: accent } : null,
                      isToday && !count ? { borderWidth: 2, borderColor: accent } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        {
                          color: count ? theme.colors.background : isPast ? `${theme.colors.textMuted}80` : theme.colors.textPrimary,
                          fontWeight: count || isToday ? '700' : '500',
                        },
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  {count > 1 ? <Text style={[styles.dayCount, { color: theme.colors.accentSecondaryText }]}>×{count}</Text> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      {later || awaitingCount ? (
        <View style={styles.legend}>
          {later ? (
            <Text style={[styles.legendText, { color: theme.colors.textSecondary }]}>
              <Text style={styles.legendCount}>+{later}</Text> más adelante
            </Text>
          ) : null}
          {awaitingCount ? (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.accentTertiary }]} />
              <Text style={[styles.legendText, { color: theme.colors.warningText }]}>
                <Text style={styles.legendCount}>{awaitingCount}</Text> por confirmar
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function SegmentButton({
  theme,
  label,
  selected,
  badge,
  onPress,
}: Readonly<{ theme: AppTheme; label: string; selected: boolean; badge?: boolean; onPress: () => void }>) {
  return (
    <Pressable
      style={[styles.segmentBtn, selected && { backgroundColor: theme.colors.accentSecondaryText }]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityHint={badge ? 'Hay citas por confirmar' : undefined}
    >
      <Text style={[styles.segmentBtnText, { color: selected ? theme.colors.background : theme.colors.textSecondary }]}>{label}</Text>
      {badge ? <View style={[styles.segmentBadge, { backgroundColor: theme.colors.accentTertiary }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingTop: 14 },
  listContentEmpty: { flexGrow: 1 },
  listEmpty: { paddingTop: 40 },
  separator: { height: 10 },
  pressed: { opacity: 0.7 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  bannerAction: { fontSize: 13, fontWeight: '600' },

  summaryCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 14, marginBottom: 16 },
  summaryBig: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  summaryCaption: { fontSize: 14, fontWeight: '500' },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1 },
  summaryStat: { alignItems: 'center', minWidth: 56 },
  summaryStatValue: { fontSize: 24, lineHeight: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryStatLabel: { fontSize: 12, fontWeight: '600' },
  calendar: { gap: 4 },
  calendarRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  dayCell: { flex: 1, alignItems: 'center', minHeight: 40 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 14, fontVariant: ['tabular-nums'] },
  dayCount: { fontSize: 10, fontWeight: '700', marginTop: -2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, fontWeight: '500' },
  legendCount: { fontWeight: '700' },

  segmentBar: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, padding: 4, marginBottom: 12, gap: 4 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  segmentBtnText: { fontSize: 13, fontWeight: '600' },
  segmentBadge: { width: 8, height: 8, borderRadius: 4 },

  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  filterLabel: { fontSize: 13, fontWeight: '600' },
  filterSelect: { minWidth: 190, minHeight: 44 },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1 },
  dateChipText: { fontSize: 14, fontWeight: '700' },
  screenTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6, flexShrink: 1 },

  listFooterText: { textAlign: 'center', fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 12, paddingHorizontal: 12 },
});
