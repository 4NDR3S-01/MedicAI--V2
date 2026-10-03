import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  LayoutAnimation,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { FloatingActionButton, useEnterAnimation, useReducedMotion, useSwapAnimation } from '../../../shared/ui';
import { appStorage } from '../../../shared/storage';
import { onDoseAction } from '../../../shared/services/dose-refresh-bus';
import { ensureAlarmPermissions } from '../../../shared/services/alarm-permissions.service';
import {
  cancelDoseAlarm,
  cancelNotificationsByDataId,
  syncMedicationAlarms,
} from '../../../shared/services/notifications.service';
import { getStoredSession } from '../../auth';
import * as medicationsAPI from '../services/medications.service';
import type { MedicationData, MedicationLog } from '../services/medications.service';
import { DoseActionSheet } from '../components/DoseActionSheet';
import { MedicationCard } from '../components/MedicationCard';
import { MedicationFormSheet } from '../components/MedicationFormSheet';
import { EmptyState, SkeletonList } from '../components/ScreenStates';
import {
  getHandledDoseKeys,
  getTodayDoseSlots,
  type DoseSlot,
} from '../utils/dose-status';

const CACHE_KEY = 'medicai_medications_cache_v2';
const CLOCK_TICK_MS = 30_000;

type Segment = 'active' | 'paused';
type ScreenCache = { day: string; medications: MedicationData[]; logs: MedicationLog[] };
type DoseTarget = { medication: MedicationData; slot: DoseSlot };

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const animateLayout = (reducedMotion: boolean) => {
  if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
};

export type MedicationsScreenProps = {
  theme: AppTheme;
  contentBottomInset: number;
};

export function MedicationsScreen({ theme, contentBottomInset }: Readonly<MedicationsScreenProps>) {
  const reducedMotion = useReducedMotion();
  const [medications, setMedications] = useState<MedicationData[]>([]);
  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [segment, setSegment] = useState<Segment>('active');
  const [now, setNow] = useState(() => new Date());
  const [form, setForm] = useState<{ visible: boolean; medication: MedicationData | null }>({
    visible: false,
    medication: null,
  });
  const [doseTarget, setDoseTarget] = useState<DoseTarget | null>(null);
  const [doseBusy, setDoseBusy] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [alarmIssue, setAlarmIssue] = useState<string | null>(null);

  // Referencias a los últimos datos para callbacks estables (tarjetas memoizadas).
  const medicationsRef = useRef(medications);
  const logsRef = useRef(logs);
  medicationsRef.current = medications;
  logsRef.current = logs;

  const enter = useEnterAnimation(status !== 'loading');
  const swap = useSwapAnimation(segment);

  // ── Alarmas ───────────────────────────────────────────────────────────────
  const syncAlarms = useCallback(async (meds: MedicationData[], dayLogs: MedicationLog[], force: boolean) => {
    const current = new Date();
    const handled = new Set<string>();
    for (const med of meds) {
      getHandledDoseKeys(getTodayDoseSlots(med, dayLogs, current), current).forEach((key) => handled.add(key));
    }
    try {
      const result = await syncMedicationAlarms(meds, { force, handledDoseKeys: handled });
      setAlarmIssue(
        result.status === 'no-permission' && meds.some((med) => med.active)
          ? 'Las notificaciones están desactivadas: no sonarán las alarmas.'
          : null,
      );
    } catch {
      setAlarmIssue('No pudimos programar algunas alarmas.');
    }
  }, []);

  // ── Carga de datos ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) {
      setErrorMessage('Tu sesión expiró. Vuelve a iniciar sesión.');
      setStatus((current) => (current === 'ready' ? current : 'error'));
      return;
    }

    const [medsResult, logsResult] = await Promise.allSettled([
      medicationsAPI.fetchMedications(session.accessToken),
      medicationsAPI.fetchTodayMedicationLogs(session.accessToken),
    ]);

    if (medsResult.status === 'rejected') {
      const message = medsResult.reason instanceof Error ? medsResult.reason.message : 'No se pudieron cargar tus medicamentos.';
      setErrorMessage(message);
      // Con datos en pantalla (caché) no se sustituye la lista por el error.
      setStatus((current) => (current === 'ready' ? current : 'error'));
      return;
    }

    const meds = medsResult.value ?? [];
    const dayLogs = logsResult.status === 'fulfilled' ? logsResult.value ?? [] : logsRef.current;
    setMedications(meds);
    setLogs(dayLogs);
    setErrorMessage(null);
    setStatus('ready');
    setNow(new Date());
    void appStorage
      .setItem(CACHE_KEY, JSON.stringify({ day: dayKey(new Date()), medications: meds, logs: dayLogs } satisfies ScreenCache))
      .catch(() => undefined);
    void syncAlarms(meds, dayLogs, false);
  }, [syncAlarms]);

  // Primer render: caché del día (sin esqueleto) y luego datos frescos.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await appStorage.getItem(CACHE_KEY);
        const cache = raw ? (JSON.parse(raw) as ScreenCache) : null;
        if (!cancelled && cache?.medications) {
          setMedications(cache.medications);
          setLogs(cache.day === dayKey(new Date()) ? cache.logs ?? [] : []);
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

  // Reloj: estados de las tomas ("es la hora", "sin registrar") y cambio de día.
  useEffect(() => {
    let lastDay = dayKey(new Date());
    const timer = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (dayKey(current) !== lastDay) {
        lastDay = dayKey(current);
        setLogs([]);
        void load();
      }
    }, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Al volver a la app (p. ej. tras responder una alarma) y tras acciones de alarmas.
  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    const unsubscribe = onDoseAction(() => void load());
    return () => {
      appStateSub.remove();
      unsubscribe();
    };
  }, [load]);

  // ── Datos derivados ───────────────────────────────────────────────────────
  const slotsById = useMemo(() => {
    const map = new Map<string, DoseSlot[]>();
    for (const med of medications) map.set(med.id, getTodayDoseSlots(med, logs, now));
    return map;
  }, [medications, logs, now]);

  const activeMeds = useMemo(() => medications.filter((med) => med.active), [medications]);
  const pausedMeds = useMemo(() => medications.filter((med) => !med.active), [medications]);
  const visibleMeds = segment === 'active' ? activeMeds : pausedMeds;

  const summary = useMemo(() => {
    const slots = activeMeds.flatMap((med) => (slotsById.get(med.id) ?? []).map((slot) => ({ med, slot })));
    const taken = slots.filter(({ slot }) => slot.state === 'taken').length;
    const missed = slots.filter(({ slot }) => slot.state === 'missed').length;
    const next = slots
      .filter(({ slot }) => slot.state === 'due' || slot.state === 'upcoming')
      .sort((a, b) => a.slot.at.getTime() - b.slot.at.getTime())[0];
    return { total: slots.length, taken, missed, next };
  }, [activeMeds, slotsById]);

  // ── Acciones ──────────────────────────────────────────────────────────────
  const withToken = async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return session.accessToken;
  };

  const handleToggle = useCallback(async (medication: MedicationData) => {
    const nextActive = !medication.active;
    if (nextActive) {
      const { ready } = await ensureAlarmPermissions();
      if (!ready) {
        Alert.alert('Permisos incompletos', 'Concede los permisos de notificaciones y alarmas para poder avisarte.');
        return;
      }
    }

    setTogglingIds((current) => new Set(current).add(medication.id));
    animateLayout(reducedMotion);
    setMedications((current) => current.map((med) => (med.id === medication.id ? { ...med, active: nextActive } : med)));

    try {
      const updated = await medicationsAPI.updateMedication(medication.id, await withToken(), { active: nextActive });
      const nextList = medicationsRef.current.map((med) => (med.id === updated.id ? updated : med));
      setMedications(nextList);
      void syncAlarms(nextList, logsRef.current, true);
    } catch (error) {
      animateLayout(reducedMotion);
      setMedications((current) => current.map((med) => (med.id === medication.id ? { ...med, active: medication.active } : med)));
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setTogglingIds((current) => {
        const next = new Set(current);
        next.delete(medication.id);
        return next;
      });
    }
  }, [reducedMotion, syncAlarms]);

  const handleEdit = useCallback((medication: MedicationData) => {
    setForm({ visible: true, medication });
  }, []);

  const handleDelete = useCallback((medication: MedicationData) => {
    Alert.alert(
      'Eliminar medicamento',
      `Se eliminará "${medication.name}" con su historial de tomas y sus alarmas. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await medicationsAPI.deleteMedication(medication.id, await withToken());
                await cancelNotificationsByDataId(medication.id);
                animateLayout(reducedMotion);
                const nextList = medicationsRef.current.filter((med) => med.id !== medication.id);
                setMedications(nextList);
                void syncAlarms(nextList, logsRef.current, true);
              } catch (error) {
                Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
              }
            })();
          },
        },
      ],
    );
  }, [reducedMotion, syncAlarms]);

  const handleDosePress = useCallback((medication: MedicationData, slot: DoseSlot) => {
    setDoseTarget({ medication, slot });
  }, []);

  const registerDose = async (action: 'TAKEN' | 'SKIPPED') => {
    if (!doseTarget) return;
    const { medication, slot } = doseTarget;
    setDoseBusy(true);
    try {
      const log = await medicationsAPI.logMedicationAction(medication.id, await withToken(), action, slot.at.toISOString());
      setLogs((current) => [log, ...current]);
      // Si se registra antes de la hora, esa alarma ya no debe sonar.
      if (slot.at.getTime() > Date.now()) void cancelDoseAlarm(medication.id, slot.at);
      setDoseTarget(null);
    } catch (error) {
      Alert.alert('No se pudo registrar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setDoseBusy(false);
    }
  };

  const undoDose = async () => {
    const log = doseTarget?.slot.log;
    if (!doseTarget || !log) return;
    const { medication, slot } = doseTarget;
    setDoseBusy(true);
    try {
      await medicationsAPI.deleteMedicationLog(medication.id, log.id, await withToken());
      const nextLogs = logsRef.current.filter((item) => item.id !== log.id);
      setLogs(nextLogs);
      // Una toma futura vuelve a necesitar su alarma.
      if (slot.at.getTime() > Date.now()) void syncAlarms(medicationsRef.current, nextLogs, true);
      setDoseTarget(null);
    } catch (error) {
      Alert.alert('No se pudo deshacer', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setDoseBusy(false);
    }
  };

  const handleSaved = (saved: MedicationData, isNew: boolean) => {
    // Si cambia de pestaña, la transición la hace useSwapAnimation.
    if (!isNew || segment === 'active') animateLayout(reducedMotion);
    const nextList = isNew
      ? [saved, ...medicationsRef.current]
      : medicationsRef.current.map((med) => (med.id === saved.id ? saved : med));
    setMedications(nextList);
    if (isNew) setSegment('active');
    void syncAlarms(nextList, logsRef.current, true);
  };

  const fixAlarms = async () => {
    const { ready } = await ensureAlarmPermissions();
    if (ready) void syncAlarms(medicationsRef.current, logsRef.current, true);
  };

  const openNewForm = () => setForm({ visible: true, medication: null });


  // ── Render ────────────────────────────────────────────────────────────────
  const hasMedications = medications.length > 0;
  const progress = summary.total ? summary.taken / summary.total : 0;
  const greeting = getGreeting(now);

  const header = (
    <View>
      {alarmIssue ? (
        <Pressable
          onPress={() => void fixAlarms()}
          accessibilityRole="button"
          style={[styles.issue, { backgroundColor: `${theme.colors.accentTertiary}14`, borderColor: `${theme.colors.accentTertiary}40` }]}
        >
          <MaterialCommunityIcons name="bell-off-outline" size={20} color={theme.colors.accentTertiary} />
          <Text style={[styles.issueText, { color: theme.colors.textPrimary }]}>{alarmIssue}</Text>
          <Text style={[styles.issueAction, { color: theme.colors.accentTertiary }]}>Revisar</Text>
        </Pressable>
      ) : null}

      {hasMedications ? (
        <>
          <View style={styles.heroRow}>
            <View style={styles.heroGreeting}>
              <MaterialCommunityIcons name={greeting.icon} size={26} color={theme.colors.accentTertiary} style={styles.greetingIcon} />
              <Text style={[styles.greetingText, { color: theme.colors.textPrimary }]}>{greeting.text}</Text>
              <Text style={[styles.greetingSubtitle, { color: theme.colors.textMuted }]}>{greeting.subtitle}</Text>
            </View>
            {summary.next ? (
              <View style={[styles.countdownChip, { backgroundColor: `${theme.colors.accentPrimary}12`, borderColor: `${theme.colors.accentPrimary}30` }]}>
                <MaterialCommunityIcons name="timer-sand" size={18} color={theme.colors.accentPrimary} />
                <Text style={[styles.countdownText, { color: theme.colors.accentPrimary }]}>
                  Próxima: {countdownLabel(summary.next.slot.at, now)}
                </Text>
              </View>
            ) : null}
          </View>

          <ProgressCard
            theme={theme}
            taken={summary.taken}
            total={summary.total}
            missed={summary.missed}
            activeCount={activeMeds.length}
            inactiveCount={pausedMeds.length}
            progress={progress}
            reducedMotion={reducedMotion}
          />

          <View style={[styles.segmentBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
            <Pressable
              style={[styles.segmentBtn, segment === 'active' && { backgroundColor: theme.colors.accentPrimary }]}
              onPress={() => setSegment('active')}
              accessibilityRole="tab"
              accessibilityState={{ selected: segment === 'active' }}
            >
              <Text style={[styles.segmentBtnText, { color: segment === 'active' ? '#fff' : theme.colors.textSecondary }]}>
                Activos ({activeMeds.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, segment === 'paused' && { backgroundColor: `${theme.colors.textMuted}40` }]}
              onPress={() => setSegment('paused')}
              accessibilityRole="tab"
              accessibilityState={{ selected: segment === 'paused' }}
            >
              <Text style={[styles.segmentBtnText, { color: segment === 'paused' ? '#fff' : theme.colors.textSecondary }]}>
                Inactivos ({pausedMeds.length})
              </Text>
            </Pressable>
          </View>
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
  if (status === 'error' && !hasMedications) {
    emptyState = (
      <EmptyState
        theme={theme}
        icon="connection"
        iconColor={theme.colors.accentTertiary}
        title={errorMessage ?? 'No pudimos cargar tus medicamentos'}
        text="Verifica tu conexión e inténtalo de nuevo."
        actionIcon="refresh"
        actionLabel="Reintentar"
        onAction={() => {
          setStatus('loading');
          void load();
        }}
      />
    );
  } else if (!hasMedications) {
    emptyState = (
      <EmptyState
        theme={theme}
        icon="pill"
        title="Tu botiquín está vacío"
        text="Añade tus medicamentos y recibe recordatorios inteligentes para no olvidar ninguna dosis."
        actionIcon="plus"
        actionLabel="Agregar primer medicamento"
        onAction={openNewForm}
      />
    );
  } else if (!visibleMeds.length) {
    emptyState = (
      <EmptyState
        theme={theme}
        icon={segment === 'paused' ? 'pause-circle-outline' : 'pill-multiple'}
        title={segment === 'paused' ? 'No hay medicamentos inactivos' : 'No hay medicamentos activos'}
        text={
          segment === 'paused'
            ? 'Cuando desactives un medicamento aparecerá aquí.'
            : 'Activa un medicamento inactivo o agrega uno nuevo con el botón +.'
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
          data={visibleMeds}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyState ? <Animated.View style={swap}>{emptyState}</Animated.View> : null}
          renderItem={({ item }) => (
            <Animated.View style={swap}>
              <MedicationCard
                theme={theme}
                medication={item}
                slots={slotsById.get(item.id) ?? []}
                isToggling={togglingIds.has(item.id)}
                onToggleActive={handleToggle}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDosePress={handleDosePress}
              />
            </Animated.View>
          )}
          ItemSeparatorComponent={Separator}
          ListFooterComponent={
            visibleMeds.length > 0 ? (
              <Text style={[styles.listFooterText, { color: theme.colors.textMuted }]}>
                Toca una hora para registrar la toma · Mantén presionada una tarjeta para editar
              </Text>
            ) : null
          }
          contentContainerStyle={[
            styles.listContent,
            !visibleMeds.length && styles.listContentEmpty,
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
              tintColor={theme.colors.accentPrimary}
              colors={[theme.colors.accentPrimary]}
            />
          }
        />
      </Animated.View>

      {hasMedications && segment === 'active' ? (
        <FloatingActionButton
          theme={theme}
          icon="plus"
          onPress={openNewForm}
          accessibilityLabel="Agregar medicamento"
          backgroundColor={theme.colors.accentPrimary}
        />
      ) : null}

      <MedicationFormSheet
        theme={theme}
        visible={form.visible}
        medication={form.medication}
        onClose={() => setForm((current) => ({ ...current, visible: false }))}
        onSaved={handleSaved}
      />

      <DoseActionSheet
        theme={theme}
        target={doseTarget}
        busy={doseBusy}
        onClose={() => setDoseTarget(null)}
        onRegister={(action) => void registerDose(action)}
        onUndo={() => void undoDose()}
      />
    </View>
  );
}

const Separator = () => <View style={styles.separator} />;

// ─── Textos del encabezado ──────────────────────────────────────────────────

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const getGreeting = (date: Date): { icon: IconName; text: string; subtitle: string } => {
  const hour = date.getHours();
  if (hour < 12) return { icon: 'weather-sunset-up', text: 'Buenos días', subtitle: 'Tu rutina matutina' };
  if (hour < 18) return { icon: 'white-balance-sunny', text: 'Buenas tardes', subtitle: 'No olvides tus dosis' };
  return { icon: 'weather-night', text: 'Buenas noches', subtitle: 'Últimos recordatorios del día' };
};

const getMotivationalPhrase = (progress: number): string => {
  if (progress === 0) return 'Cada dosis cuenta, empieza ahora';
  if (progress < 0.5) return 'Vas bien, mantén el ritmo';
  if (progress < 1) return 'Casi terminas el día';
  return 'Tratamiento completo, excelente trabajo';
};

const countdownLabel = (target: Date, now: Date): string => {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Ahora';
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};

// ─── Tarjeta de progreso ────────────────────────────────────────────────────

function ProgressCard({
  theme,
  taken,
  total,
  missed,
  activeCount,
  inactiveCount,
  progress,
  reducedMotion,
}: Readonly<{
  theme: AppTheme;
  taken: number;
  total: number;
  missed: number;
  activeCount: number;
  inactiveCount: number;
  progress: number;
  reducedMotion: boolean;
}>) {
  const fill = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    if (reducedMotion) {
      fill.setValue(progress);
      return;
    }
    Animated.timing(fill, { toValue: progress, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [progress, reducedMotion, fill]);

  const complete = progress >= 1;
  let motivationIcon: IconName = 'run-fast';
  if (complete) motivationIcon = 'trophy';
  else if (progress >= 0.5) motivationIcon = 'thumb-up-outline';

  return (
    <View style={[styles.progressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
      <View style={styles.progressHeader}>
        <View>
          <Text style={[styles.progressBigNumber, { color: theme.colors.textPrimary }]}>
            {taken}
            <Text style={[styles.progressSmall, { color: theme.colors.textMuted }]}>/{total}</Text>
          </Text>
          <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>dosis hoy</Text>
        </View>
        <View style={styles.progressRightStat}>
          <View style={styles.progressStatItem}>
            <Text style={[styles.progressStatValue, { color: theme.colors.accentPrimary }]}>{activeCount}</Text>
            <Text style={[styles.progressStatLabel, { color: theme.colors.textMuted }]}>activos</Text>
          </View>
          <View style={[styles.progressStatDivider, { backgroundColor: theme.colors.surfaceBorder }]} />
          <View style={styles.progressStatItem}>
            <Text style={[styles.progressStatValue, { color: theme.colors.textMuted }]}>{inactiveCount}</Text>
            <Text style={[styles.progressStatLabel, { color: theme.colors.textMuted }]}>inactivos</Text>
          </View>
        </View>
      </View>

      <View
        style={[styles.progressBarBg, { backgroundColor: `${theme.colors.accentPrimary}10` }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: taken }}
      >
        <Animated.View
          style={[
            styles.progressBarFill,
            { backgroundColor: complete ? theme.colors.success : theme.colors.accentPrimary, transform: [{ scaleX: fill }] },
          ]}
        />
      </View>

      <View style={[styles.motivationRow, { backgroundColor: `${theme.colors.accentPrimary}08` }]}>
        <MaterialCommunityIcons name={motivationIcon} size={16} color={complete ? theme.colors.success : theme.colors.accentPrimary} />
        <Text style={[styles.motivationText, { color: theme.colors.accentPrimary }]}>{getMotivationalPhrase(progress)}</Text>
      </View>

      {missed > 0 ? (
        <View style={[styles.motivationRow, { backgroundColor: `${theme.colors.accentTertiary}10` }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={theme.colors.accentTertiary} />
          <Text style={[styles.motivationText, { color: theme.colors.accentTertiary }]}>
            {missed === 1 ? '1 toma sin registrar: tócala para registrarla' : `${missed} tomas sin registrar: tócalas para registrarlas`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingTop: 14 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  separator: { height: 10 },

  issue: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  issueText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  issueAction: { fontSize: 13, fontWeight: '800' },

  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
  heroGreeting: { gap: 2, flexShrink: 1 },
  greetingIcon: { marginBottom: 2 },
  greetingText: { fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  greetingSubtitle: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  countdownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 4,
  },
  countdownText: { fontSize: 13, fontWeight: '800' },

  progressCard: { borderRadius: 24, borderWidth: 1, padding: 16, marginBottom: 16, gap: 14 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressBigNumber: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  progressSmall: { fontSize: 16, fontWeight: '700' },
  progressLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  progressRightStat: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressStatItem: { alignItems: 'center', gap: 2 },
  progressStatValue: { fontSize: 18, fontWeight: '900' },
  progressStatLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressStatDivider: { width: 1, height: 28, borderRadius: 1 },
  progressBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { flex: 1, borderRadius: 3, transformOrigin: 'left' },
  motivationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  motivationText: { fontSize: 12, fontWeight: '700', flex: 1 },

  segmentBar: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, padding: 4, marginBottom: 16, gap: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 14 },
  segmentBtnText: { fontSize: 13, fontWeight: '800' },

  listFooterText: { textAlign: 'center', fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 12, paddingHorizontal: 12 },
});
