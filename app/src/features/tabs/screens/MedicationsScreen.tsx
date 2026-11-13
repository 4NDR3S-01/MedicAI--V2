import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Alert,
  Animated,
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
import { openAlarmSetup, promptAlarmSetupIfNeeded } from '../../../shared/services/alarm-setup.service';
import { ALARM_READINESS_LABEL } from '../../../shared/services/alarm-setup-steps';
import { useAlarmReadiness } from '../../../shared/services/useAlarmReadiness';
import {
  cancelDoseAlarm,
  cancelNotificationsByDataId,
} from '../../../shared/services/notifications.service';
import { logDose, undoDoseLog } from '../services/dose-queue';
import { applyDoseLog, deleteMedication, refreshOwnData, syncOwnDataReminders, updateMedication, useOwnData } from '../data/own-data-store';
import type { MedicationData } from '../services/medications.service';
import { DoseActionSheet } from '../components/DoseActionSheet';
import { MedicationCard, doseStateColor } from '../components/MedicationCard';
import { MedicationFormSheet } from '../components/MedicationFormSheet';
import { EmptyState, SkeletonList } from '../components/ScreenStates';
import { isAsNeeded } from '../../../shared/services/dose-schedule';
import {
  asNeededWarning,
  getDaySlots,
  type DoseSlot,
  type DoseState,
} from '../utils/dose-status';

const CLOCK_TICK_MS = 30_000;

type Segment = 'active' | 'paused';
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
  // Datos compartidos con Inicio y guardados en el teléfono: se ven al instante, también sin red.
  const own = useOwnData();
  const { medications, logs } = own;
  const status: 'loading' | 'ready' | 'error' = own.hasData ? 'ready' : own.loadError ? 'error' : 'loading';
  const errorMessage = own.loadError;
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
  // Cada tarjeta dice si su alarma sonará en este teléfono (el medicamento sigue activo).
  const readiness = useAlarmReadiness();
  const alarmWarning = useMemo(
    () => (readiness && readiness !== 'ready' ? { text: ALARM_READINESS_LABEL[readiness], severe: readiness !== 'untested' } : null),
    [readiness],
  );

  let alarmIssue: string | null = null;
  if (own.alarmStatus === 'no-permission') alarmIssue = 'Las notificaciones están desactivadas: no sonarán las alarmas.';
  else if (own.alarmStatus === 'error') alarmIssue = 'No pudimos programar algunas alarmas.';

  // Referencias a los últimos datos para callbacks estables (tarjetas memoizadas).
  const logsRef = useRef(logs);
  logsRef.current = logs;

  const enter = useEnterAnimation(status !== 'loading');
  const swap = useSwapAnimation(segment);

  // ── Datos y alarmas (los gestiona el almacén compartido) ──────────────────
  const syncAlarms = useCallback(() => syncOwnDataReminders({ force: true }), []);
  const load = useCallback(() => refreshOwnData({ force: true }), []);

  // Reloj: estados de las tomas ("es la hora", "sin registrar") y cambio de día.
  useEffect(() => {
    let lastDay = dayKey(new Date());
    const timer = setInterval(() => {
      const current = new Date();
      setNow(current);
      if (dayKey(current) !== lastDay) {
        lastDay = dayKey(current);
        void refreshOwnData({ force: true });
      }
    }, CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // ── Datos derivados ───────────────────────────────────────────────────────
  const slotsById = useMemo(() => {
    const map = new Map<string, DoseSlot[]>();
    for (const med of medications) map.set(med.id, getDaySlots(med, logs, now));
    return map;
  }, [medications, logs, now]);

  const activeMeds = useMemo(() => medications.filter((med) => med.active), [medications]);
  const pausedMeds = useMemo(() => medications.filter((med) => !med.active), [medications]);
  const visibleMeds = segment === 'active' ? activeMeds : pausedMeds;

  const summary = useMemo(() => {
    // Las de "según necesidad" no tienen horario: no cuentan para el progreso.
    const slots = activeMeds
      .filter((med) => !isAsNeeded(med))
      .flatMap((med) => (slotsById.get(med.id) ?? []).map((slot) => ({ med, slot })));
    const taken = slots.filter(({ slot }) => slot.state === 'taken').length;
    const missedSlots = slots.filter(({ slot }) => slot.state === 'missed');
    const missed = missedSlots.length;
    const next = slots
      .filter(({ slot }) => slot.state === 'due' || slot.state === 'upcoming')
      .sort((a, b) => a.slot.at.getTime() - b.slot.at.getTime())[0];
    const states = [...slots].sort((a, b) => a.slot.at.getTime() - b.slot.at.getTime()).map(({ slot }) => slot.state);
    return { total: slots.length, taken, missed, next, firstMissed: missedSlots[0], states };
  }, [activeMeds, slotsById]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const handleToggle = useCallback(async (medication: MedicationData) => {
    const nextActive = !medication.active;
    // Desde el mismo toque: el interruptor ya muestra el valor nuevo.
    setTogglingIds((current) => new Set(current).add(medication.id));
    try {
      animateLayout(reducedMotion);
      // Se ve al instante y queda guardado; sin red, se envía al volver la conexión.
      await updateMedication(medication.id, { active: nextActive });
      // Reactivado: si a este teléfono le falta algo para que suene, "Prepara tus alarmas".
      if (nextActive && medication.scheduleType !== 'AS_NEEDED') void promptAlarmSetupIfNeeded();
    } catch (error) {
      // El servidor lo rechazó: la lista ya volvió a su estado real.
      animateLayout(reducedMotion);
      Alert.alert('No se pudo actualizar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setTogglingIds((current) => {
        const next = new Set(current);
        next.delete(medication.id);
        return next;
      });
    }
  }, [reducedMotion]);

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
                animateLayout(reducedMotion);
                void cancelNotificationsByDataId(medication.id).catch(() => undefined);
                await deleteMedication(medication.id);
              } catch (error) {
                Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
              }
            })();
          },
        },
      ],
    );
  }, [reducedMotion]);

  const handleDosePress = useCallback((medication: MedicationData, slot: DoseSlot) => {
    setDoseTarget({ medication, slot });
  }, []);

  const registerDose = async (action: 'TAKEN' | 'SKIPPED') => {
    if (!doseTarget) return;
    const { medication, slot } = doseTarget;
    setDoseBusy(true);
    try {
      const log = await logDose(medication.id, action, slot.at.toISOString());
      applyDoseLog(log, 1);
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
      await undoDoseLog(medication.id, log.id);
      applyDoseLog(log, -1);
      // Una toma futura vuelve a necesitar su alarma.
      if (slot.at.getTime() > Date.now()) void syncAlarms();
      setDoseTarget(null);
    } catch (error) {
      Alert.alert('No se pudo deshacer', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setDoseBusy(false);
    }
  };

  /** Según necesidad: confirma (avisando si supera el máximo o el tiempo mínimo) y registra. */
  const handleLogAsNeeded = useCallback((medication: MedicationData) => {
    const current = new Date();
    const warning = asNeededWarning(medication, getDaySlots(medication, logsRef.current, current), current);
    const time = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
    const register = async () => {
      try {
        const log = await logDose(medication.id, 'TAKEN');
        applyDoseLog(log, 1);
      } catch (error) {
        Alert.alert('No se pudo registrar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
      }
    };
    Alert.alert(
      warning ? 'Revisa antes de tomarla' : `¿Registrar ${medication.name}?`,
      warning ? `${warning} ¿Registrar la toma de las ${time} de todas formas?` : `Se registrará una toma a las ${time}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: warning ? 'Registrar igual' : 'Registrar', style: warning ? 'destructive' : 'default', onPress: () => void register() },
      ],
    );
  }, []);

  // El formulario ya guardó en el almacén compartido (y programa las alarmas).
  const handleSaved = (_saved: MedicationData, isNew: boolean) => {
    // Si cambia de pestaña, la transición la hace useSwapAnimation.
    if (!isNew || segment === 'active') animateLayout(reducedMotion);
    if (isNew) setSegment('active');
  };

  // Al volver de los ajustes del sistema, MainAppShell reprograma las alarmas.
  const fixAlarms = () => {
    openAlarmSetup();
    void syncAlarms();
  };

  const openNewForm = () => setForm({ visible: true, medication: null });


  // ── Render ────────────────────────────────────────────────────────────────
  const hasMedications = medications.length > 0;

  const header = (
    <View>
      {alarmIssue ? (
        <Pressable
          onPress={fixAlarms}
          accessibilityRole="button"
          style={[styles.issue, { backgroundColor: `${theme.colors.accentTertiary}14`, borderColor: `${theme.colors.accentTertiary}40` }]}
        >
          <MaterialCommunityIcons name="bell-off-outline" size={20} color={theme.colors.accentTertiary} />
          <Text style={[styles.issueText, { color: theme.colors.textPrimary }]}>{alarmIssue}</Text>
          <Text style={[styles.issueAction, { color: theme.colors.warningText }]}>Revisar</Text>
        </Pressable>
      ) : null}

      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: theme.colors.textPrimary }]} accessibilityRole="header">Medicinas</Text>
        {hasMedications && summary.total ? (
          <NextDoseChip theme={theme} summary={summary} now={now} onOpen={(target) => setDoseTarget(target)} />
        ) : null}
      </View>

      {hasMedications && summary.total ? (
        <DayProgress theme={theme} states={summary.states} />
      ) : null}

      {hasMedications ? (
        <>

          <View style={[styles.segmentBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
            <Pressable
              style={[styles.segmentBtn, segment === 'active' && { backgroundColor: theme.colors.accentPrimary }]}
              onPress={() => setSegment('active')}
              accessibilityRole="tab"
              accessibilityState={{ selected: segment === 'active' }}
            >
              <Text style={[styles.segmentBtnText, { color: segment === 'active' ? theme.colors.buttonText : theme.colors.textSecondary }]}>
                Activos ({activeMeds.length})
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, segment === 'paused' && { backgroundColor: `${theme.colors.textMuted}40` }]}
              onPress={() => setSegment('paused')}
              accessibilityRole="tab"
              accessibilityState={{ selected: segment === 'paused' }}
            >
              <Text style={[styles.segmentBtnText, { color: segment === 'paused' ? theme.colors.textPrimary : theme.colors.textSecondary }]}>
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
          ListEmptyComponent={emptyState ? <Animated.View style={[swap, styles.listEmpty]}>{emptyState}</Animated.View> : null}
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
                onLogAsNeeded={handleLogAsNeeded}
                canAsk
                alarmWarning={alarmWarning}
                onAlarmWarningPress={openAlarmSetup}
              />
            </Animated.View>
          )}
          ItemSeparatorComponent={Separator}
          ListFooterComponent={
            visibleMeds.length > 0 && segment === 'active' ? (
              <Text style={[styles.listFooterText, { color: theme.colors.textMuted }]}>
                Toca una hora para registrarla · Toca la tarjeta para ver opciones
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
        existingMedications={medications}
        onClose={() => setForm((current) => ({ ...current, visible: false }))}
        onSaved={handleSaved}
      />

      <DoseActionSheet
        theme={theme}
        canAsk
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


const countdownLabel = (target: Date, now: Date): string => {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Ahora';
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};

// ─── Encabezado: próxima toma y progreso del día ───────────────────────────

type DaySummary = {
  total: number;
  taken: number;
  missed: number;
  next?: { med: MedicationData; slot: DoseSlot };
  firstMissed?: { med: MedicationData; slot: DoseSlot };
};

/**
 * Lo que toca ahora, de un vistazo. Teal mientras se espera; naranja cuando
 * hay que actuar (es la hora o quedó una atrás); verde con el día completo.
 * Tocarlo abre esa toma.
 */
function NextDoseChip({
  theme,
  summary,
  now,
  onOpen,
}: Readonly<{ theme: AppTheme; summary: DaySummary; now: Date; onOpen: (target: DoseTarget) => void }>) {
  let label: string;
  let icon: keyof typeof MaterialCommunityIcons.glyphMap;
  let tone: string;
  let toneText: string;
  let target: { med: MedicationData; slot: DoseSlot } | undefined;

  if (summary.next?.slot.state === 'due') {
    label = 'Es la hora';
    icon = 'alarm-light';
    tone = theme.colors.accentTertiary;
    toneText = theme.colors.warningText;
    target = summary.next;
  } else if (summary.firstMissed) {
    label = summary.missed === 1 ? '1 atrasada' : `${summary.missed} atrasadas`;
    icon = 'alert-circle-outline';
    tone = theme.colors.accentTertiary;
    toneText = theme.colors.warningText;
    target = summary.firstMissed;
  } else if (summary.next) {
    label = `Próxima: ${countdownLabel(summary.next.slot.at, now)}`;
    icon = 'timer-sand';
    tone = theme.colors.accentPrimary;
    toneText = theme.colors.accentPrimaryText;
    target = summary.next;
  } else {
    label = 'Todo al día';
    icon = 'check-circle';
    tone = theme.colors.success;
    toneText = theme.colors.successText;
  }

  const style = [styles.chip, { backgroundColor: `${tone}1A`, borderColor: `${tone}40` }];
  const content = (
    <>
      <MaterialCommunityIcons name={icon} size={16} color={toneText} />
      <Text style={[styles.chipText, { color: toneText }]} numberOfLines={1}>{label}</Text>
    </>
  );

  if (!target) return <View style={style}>{content}</View>;
  const open = target;
  return (
    <Pressable
      onPress={() => onOpen({ medication: open.med, slot: open.slot })}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${open.med.name} a las ${open.slot.time}`}
      accessibilityHint="Abre esta toma"
      style={({ pressed }) => [...style, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

const LEGEND: { state: DoseState; one: string; many: string }[] = [
  { state: 'taken', one: 'tomada', many: 'tomadas' },
  { state: 'skipped', one: 'omitida', many: 'omitidas' },
  { state: 'missed', one: 'sin registrar', many: 'sin registrar' },
  { state: 'due', one: 'es la hora', many: 'es la hora' },
  { state: 'upcoming', one: 'pendiente', many: 'pendientes' },
];

/**
 * El día en una tarjeta: cifra, porcentaje y una barra con un tramo por toma
 * (mismos colores que las horas de cada medicamento) + leyenda con conteos.
 */
function DayProgress({ theme, states }: Readonly<{ theme: AppTheme; states: DoseState[] }>) {
  const total = states.length;
  const taken = states.filter((state) => state === 'taken').length;
  const percent = total ? Math.round((taken / total) * 100) : 0;
  const complete = total > 0 && taken === total;
  const counts = LEGEND.map((item) => ({ ...item, count: states.filter((state) => state === item.state).length })).filter(
    (item) => item.count > 0,
  );
  const segmentColor = (state: DoseState) =>
    state === 'upcoming' ? `${theme.colors.accentPrimary}40` : doseStateColor(theme, state);

  return (
    <View
      style={[styles.progressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
      accessible
      accessibilityLabel={`${taken} de ${total} tomas hoy. ${counts.map((item) => `${item.count} ${item.count === 1 ? item.one : item.many}`).join(', ')}.`}
    >
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { color: theme.colors.textSecondary }]}>
          <Text style={[styles.progressNumber, { color: theme.colors.textPrimary }]}>{taken}</Text>
          <Text style={{ color: theme.colors.textMuted }}>/{total}</Text>  tomas hoy
        </Text>
        <Text style={[styles.progressPercent, { color: complete ? theme.colors.successText : theme.colors.accentPrimaryText }]}>
          {complete ? '¡Completo!' : `${percent}%`}
        </Text>
      </View>

      <View style={styles.segments}>
        {states.map((state, index) => (
          <View key={index} style={[styles.segment, { backgroundColor: segmentColor(state) }]} />
        ))}
      </View>

      <View style={styles.legend}>
        {counts.map((item) => (
          <View key={item.state} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: segmentColor(item.state) }]} />
            <Text style={[styles.legendText, { color: item.state === 'missed' || item.state === 'due' ? theme.colors.warningText : theme.colors.textSecondary }]}>
              <Text style={styles.legendCount}>{item.count}</Text> {item.count === 1 ? item.one : item.many}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingTop: 14 },
  listContentEmpty: { flexGrow: 1 },
  listEmpty: { paddingTop: 40 },
  separator: { height: 10 },

  issue: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 14 },
  issueText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  issueAction: { fontSize: 13, fontWeight: '600' },

  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  screenTitle: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6, flexShrink: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12, marginBottom: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  progressText: { fontSize: 15, fontWeight: '500' },
  progressNumber: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressPercent: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  segments: { flexDirection: 'row', gap: 4, height: 10 },
  segment: { flex: 1, borderRadius: 999 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 13, fontWeight: '500' },
  legendCount: { fontWeight: '700' },

  segmentBar: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, padding: 4, marginBottom: 16, gap: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12 },
  segmentBtnText: { fontSize: 13, fontWeight: '600' },

  listFooterText: { textAlign: 'center', fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 12, paddingHorizontal: 12 },
});
