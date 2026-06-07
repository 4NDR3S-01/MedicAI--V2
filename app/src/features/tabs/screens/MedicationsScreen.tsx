import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { appStorage } from '../../../shared/storage';
import { onDoseAction } from '../../../shared/services/dose-refresh-bus';
import type { AppTheme } from '../../../shared/theme';
import * as medicationsAPI from '../services/medications.service';
import type { MedicationData } from '../services/medications.service';
import { getStoredSession } from '../../auth';
import { AddMedicationModal } from '../components/AddMedicationModal';
import {
  scheduleMedicationNotifications,
  cancelNotificationsByDataId,
  rescheduleMedicationsAfterLaunch,
  detectTimezoneChangeAndReschedule,
  reconcileMissedDoses,
} from '../../../shared/services/notifications.service';
import { ensureAlarmPermissions } from '../../../shared/services/alarm-permissions.service';

type DoseStatus = 'pending' | 'taken' | 'skipped';

type Segment = 'active' | 'paused';

const DOSE_CACHE_KEY = 'medicai_dose_status_cache_v1';
const RECONCILE_DAILY_KEY = 'medicai_reconciled_today_v1';

const isToday = (date: Date): boolean => {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

const getTodayDoses = (
  times: string[],
  medication?: { firstDoseTime?: string | null; createdAt?: string },
): string[] => {
  const now = new Date();
  const isFirstDay = medication?.createdAt
    ? isToday(new Date(medication.createdAt))
    : false;

  return times.filter((t) => {
    const [h, m] = t.split(':').map(Number);
    const doseDate = new Date(now);
    doseDate.setHours(h, m, 0, 0);
    if (isFirstDay && medication?.firstDoseTime && t < medication.firstDoseTime) return false;
    return isToday(doseDate);
  });
};

const parseDoseTime = (timeStr: string, baseDate?: Date): Date => {
  const [h, m] = timeStr.split(':').map(Number);
  const d = baseDate ? new Date(baseDate) : new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

const getNextDose = (
  medication: MedicationData,
  doseStatusMap: Record<string, Record<string, DoseStatus>>,
): string | null => {
  const now = new Date();
  const doses = getTodayDoses(medication.times, medication);
  const statuses = doseStatusMap[medication.id] ?? {};
  return doses.find((t) => {
    if (statuses[t] === 'taken' || statuses[t] === 'skipped') return false;
    return parseDoseTime(t).getTime() >= now.getTime();
  }) ?? null;
};

const getNextDoseCountdown = (timeStr: string): string => {
  const target = parseDoseTime(timeStr);
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'Ahora';
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
};

const getMotivationalPhrase = (progress: number): string => {
  if (progress === 0) return 'Cada dosis cuenta — empieza ahora';
  if (progress < 0.5) return 'Vas bien, mantén el ritmo';
  if (progress < 1) return 'Casi terminas el día';
  return 'Tratamiento completo, excelente trabajo';
};

const getGreeting = (): { emoji: string; text: string; subtitle: string } => {
  const h = new Date().getHours();
  if (h < 12) return { emoji: '🌅', text: 'Buenos días', subtitle: 'Tu rutina matutina' };
  if (h < 18) return { emoji: '☀️', text: 'Buenas tardes', subtitle: 'No olvides tus dosis' };
  return { emoji: '🌙', text: 'Buenas noches', subtitle: 'Últimos recordatorios del día' };
};

const formatRelativeDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const days = Math.ceil(diffMs / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days <= 7) return `En ${days} días`;
  if (days <= 30) return `En ${Math.ceil(days / 7)} semanas`;
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
};

type SkeletonProps = { theme: AppTheme };
function SkeletonCard({ theme }: Readonly<SkeletonProps>) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.surfaceBorder,
          opacity: pulseAnim,
          gap: 16,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.skelCircle, { backgroundColor: theme.colors.surfaceBorder }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skelLine, { backgroundColor: theme.colors.surfaceBorder, width: '60%' }]} />
          <View style={[styles.skelLine, { backgroundColor: theme.colors.surfaceBorder, width: '40%', height: 10 }]} />
        </View>
        <View style={[styles.skelCircle, { backgroundColor: theme.colors.surfaceBorder, width: 40, height: 24, borderRadius: 12 }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.skelPill, { backgroundColor: theme.colors.surfaceBorder }]} />
        ))}
      </View>
    </Animated.View>
  );
}

export type MedicationsScreenProps = {
  theme: AppTheme;
  contentBottomInset: number;
};

export function MedicationsScreen({ theme, contentBottomInset }: Readonly<MedicationsScreenProps>) {
  const [medications, setMedications] = useState<MedicationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMedication, setEditingMedication] = useState<MedicationData | null>(null);
  const [doseStatusMap, setDoseStatusMap] = useState<Record<string, Record<string, DoseStatus>>>({});
  const [takenCount, setTakenCount] = useState(0);
  const [totalDosesToday, setTotalDosesToday] = useState(0);
  const [segment, setSegment] = useState<Segment>('active');
  const doseRefreshVersionRef = useRef(0);
  const [countdown, setCountdown] = useState<string>('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const isEmpty = medications.length === 0;
  const progress = totalDosesToday > 0 ? takenCount / totalDosesToday : 0;
  const greeting = useMemo(() => getGreeting(), []);
  const motivationalPhrase = useMemo(() => getMotivationalPhrase(progress), [progress]);

  const activeMeds = useMemo(() => medications.filter((m) => m.active), [medications]);
  const pausedMeds = useMemo(() => medications.filter((m) => !m.active), [medications]);
  const filteredMeds = segment === 'active' ? activeMeds : pausedMeds;

  const nextDoseInfo = useMemo(() => {
    let earliest: { medId: string; time: string } | null = null;
    for (const med of activeMeds) {
      const next = getNextDose(med, doseStatusMap);
      if (!next) continue;
      if (!earliest || next < earliest.time) earliest = { medId: med.id, time: next };
    }
    return earliest;
  }, [activeMeds, doseStatusMap]);

  useEffect(() => {
    const update = () => {
      if (nextDoseInfo) setCountdown(getNextDoseCountdown(nextDoseInfo.time));
      else setCountdown('');
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [nextDoseInfo?.time]);

  const computeDoseStatus = useCallback(async (
    meds: MedicationData[],
    accessToken: string,
  ) => {
    const now = new Date();
    const statusMap: Record<string, Record<string, DoseStatus>> = {};
    let taken = 0;
    let total = 0;

    for (const med of meds) {
      statusMap[med.id] = {};
      if (!med.active) continue;

      const doses = getTodayDoses(med.times, med);
      total += doses.length;

      try {
        const logs = await medicationsAPI.fetchMedicationLogs(med.id, accessToken);
        const todayLogs = logs.filter((l) => isToday(new Date(l.takenAt)));

        for (const doseTime of doses) {
          const [h, m] = doseTime.split(':').map(Number);
          const matchingLog = todayLogs.find((l) => {
            if (l.scheduledFor) {
              const logTime = new Date(l.scheduledFor);
              return logTime.getHours() === h && logTime.getMinutes() === m;
            }
            return false;
          });

          if (matchingLog?.action === 'TAKEN') {
            statusMap[med.id][doseTime] = 'taken';
            taken++;
          } else if (matchingLog?.action === 'SKIPPED') {
            statusMap[med.id][doseTime] = 'skipped';
          } else {
            statusMap[med.id][doseTime] = 'pending';
          }
        }
      } catch {
        for (const doseTime of doses) {
          statusMap[med.id][doseTime] = 'pending';
        }
      }
    }

    setDoseStatusMap(statusMap);
    setTakenCount(taken);
    setTotalDosesToday(total);

    try {
      await appStorage.setItem(DOSE_CACHE_KEY, JSON.stringify({
        date: now.toISOString().slice(0, 10),
        statusMap,
        takenCount: taken,
        totalDosesToday: total,
      }));
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    const restoreCache = async () => {
      try {
        const cached = await appStorage.getItem(DOSE_CACHE_KEY);
        if (!cached) return;
        const parsed = JSON.parse(cached) as {
          date: string;
          statusMap: Record<string, Record<string, DoseStatus>>;
          takenCount: number;
          totalDosesToday: number;
        };
        if (parsed.date === new Date().toISOString().slice(0, 10)) {
          setDoseStatusMap(parsed.statusMap);
          setTakenCount(parsed.takenCount);
          setTotalDosesToday(parsed.totalDosesToday);
        }
      } catch {
        // ignore cache errors
      }
    };
    void restoreCache();
  }, []);

  useEffect(() => {
    const unsubscribe = onDoseAction(() => {
      doseRefreshVersionRef.current += 1;
      const sessionPromise = getStoredSession();
      void sessionPromise.then((session) => {
        if (session?.accessToken) {
          void computeDoseStatus(medications, session.accessToken);
        }
      });
    });
    return unsubscribe;
  }, [medications, computeDoseStatus]);

  useEffect(() => {
    let lastDate = new Date().toISOString().slice(0, 10);

    const refreshAll = () => {
      const today = new Date().toISOString().slice(0, 10);
      const dateChanged = today !== lastDate;
      if (dateChanged) lastDate = today;

      doseRefreshVersionRef.current += 1;
      const sessionPromise = getStoredSession();
      void sessionPromise.then((session) => {
        if (session?.accessToken) {
          if (dateChanged) {
            void loadMedicationsInternal(session.accessToken, medications);
          } else {
            void computeDoseStatus(medications, session.accessToken);
          }
        }
      });
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAll();
    });
    const interval = setInterval(refreshAll, 60000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [medications]);

  const loadMedicationsInternal = useCallback(async (
    accessToken: string,
    currentMedications: MedicationData[],
  ) => {
    try {
      const data = await medicationsAPI.fetchMedications(accessToken);
      setMedications(data || []);
      void computeDoseStatus(data || [], accessToken);

      const tzChanged = await detectTimezoneChangeAndReschedule(data || []);
      if (!tzChanged) {
        void rescheduleMedicationsAfterLaunch(data || []);
      }

      const today = new Date().toISOString().slice(0, 10);
      const lastReconciled = await appStorage.getItem(RECONCILE_DAILY_KEY);
      if (lastReconciled !== today) {
        await appStorage.setItem(RECONCILE_DAILY_KEY, today);
        void reconcileMissedDoses(data || [], accessToken);
      }
    } catch {
      // refresh silently
    }
  }, [computeDoseStatus]);

  const loadMedications = useCallback(async () => {
    try {
      setError(null);
      const session = await getStoredSession();
      if (!session?.accessToken) {
        setError('No autorizado.');
        return;
      }

      const data = await medicationsAPI.fetchMedications(session.accessToken);
      setMedications(data || []);

      const tzChanged = await detectTimezoneChangeAndReschedule(data || []);
      if (!tzChanged) {
        void rescheduleMedicationsAfterLaunch(data || []);
      }

      void computeDoseStatus(data || [], session.accessToken);

      const today = new Date().toISOString().slice(0, 10);
      const lastReconciled = await appStorage.getItem(RECONCILE_DAILY_KEY);
      if (lastReconciled !== today) {
        await appStorage.setItem(RECONCILE_DAILY_KEY, today);
        void reconcileMissedDoses(data || [], session.accessToken);
      }

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar medicamentos';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fadeAnim, slideAnim, computeDoseStatus]);

  useEffect(() => {
    setIsLoading(true);
    void loadMedications();
  }, [loadMedications]);

  const deleteMedication = useCallback(async (medicationId: string) => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    const session = await getStoredSession();
    if (!session?.accessToken) {
      Alert.alert('Error', 'No autorizado.');
      return;
    }
    await medicationsAPI.deleteMedication(medicationId, session.accessToken);
    await cancelNotificationsByDataId(medicationId);
    setMedications((current) => current.filter((med) => med.id !== medicationId));
  }, []);

  const handleDeleteMedication = useCallback((medicationId: string, name: string) => {
    Alert.alert('Eliminar medicamento', `¿Eliminar "${name}" y todas sus alarmas?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void deleteMedication(medicationId).catch((err) => {
            const message = err instanceof Error ? err.message : 'Error al eliminar';
            Alert.alert('Error', message);
          });
        },
      },
    ]);
  }, [deleteMedication]);

  const toggleMedicationStatus = async (med: MedicationData) => {
    if (!med.active) {
      const { ready } = await ensureAlarmPermissions();
      if (!ready) {
        Alert.alert('Permisos incompletos', 'Completa la configuración de permisos para activar alarmas.');
        return;
      }
    }
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setMedications((current) =>
      current.map((m) => (m.id === med.id ? { ...m, active: !med.active } : m)),
    );
    try {
      const session = await getStoredSession();
      if (!session?.accessToken) {
        setMedications((current) =>
          current.map((m) => (m.id === med.id ? { ...m, active: med.active } : m)),
        );
        return;
      }
      const updated = await medicationsAPI.updateMedication(med.id, session.accessToken, {
        active: !med.active,
      });
      await scheduleMedicationNotifications(updated);
      setMedications((current) => current.map((m) => (m.id === med.id ? updated : m)));
    } catch (err) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMedications((current) =>
        current.map((m) => (m.id === med.id ? { ...m, active: med.active } : m)),
      );
      const message = err instanceof Error ? err.message : 'Error al actualizar el estado';
      Alert.alert('Error', message);
    }
  };

  const renderHero = () => {
    if (isLoading || isEmpty) return null;
    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.heroRow}>
          <View style={styles.heroGreeting}>
            <Text style={styles.greetingEmoji}>{greeting.emoji}</Text>
            <Text style={[styles.greetingText, { color: theme.colors.textPrimary }]}>
              {greeting.text}
            </Text>
            <Text style={[styles.greetingSubtitle, { color: theme.colors.textMuted }]}>
              {greeting.subtitle}
            </Text>
          </View>
          {nextDoseInfo ? (
            <View style={[styles.countdownChip, { backgroundColor: `${theme.colors.accentPrimary}12`, borderColor: `${theme.colors.accentPrimary}30` }]}>
              <MaterialCommunityIcons name="timer-sand" size={18} color={theme.colors.accentPrimary} />
              <Text style={[styles.countdownText, { color: theme.colors.accentPrimary }]}>
                Próxima: {countdown || getNextDoseCountdown(nextDoseInfo.time)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.progressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
          <View style={styles.progressHeader}>
            <View style={styles.progressLeftStat}>
              <Text style={[styles.progressBigNumber, { color: theme.colors.textPrimary }]}>
                {takenCount}<Text style={[styles.progressSmall, { color: theme.colors.textMuted }]}>/{totalDosesToday}</Text>
              </Text>
              <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>dosis hoy</Text>
            </View>
            <View style={styles.progressRightStat}>
              <View style={styles.progressStatItem}>
                <Text style={[styles.progressStatValue, { color: theme.colors.accentPrimary }]}>{activeMeds.length}</Text>
                <Text style={[styles.progressStatLabel, { color: theme.colors.textMuted }]}>activos</Text>
              </View>
              <View style={[styles.progressStatDivider, { backgroundColor: theme.colors.surfaceBorder }]} />
              <View style={styles.progressStatItem}>
                <Text style={[styles.progressStatValue, { color: theme.colors.textMuted }]}>{pausedMeds.length}</Text>
                <Text style={[styles.progressStatLabel, { color: theme.colors.textMuted }]}>pausados</Text>
              </View>
            </View>
          </View>

          <View style={[styles.progressBarBg, { backgroundColor: `${theme.colors.accentPrimary}10` }]}>
            <Animated.View style={[
              styles.progressBarFill,
              {
                backgroundColor: progress >= 1 ? theme.colors.success : theme.colors.accentPrimary,
                width: `${Math.round(progress * 100)}%`,
              },
            ]} />
          </View>

          <View style={[styles.motivationRow, { backgroundColor: `${theme.colors.accentPrimary}08` }]}>
            <MaterialCommunityIcons
              name={progress >= 1 ? 'trophy' : progress >= 0.5 ? 'thumb-up-outline' : 'run-fast'}
              size={16}
              color={progress >= 1 ? theme.colors.success : theme.colors.accentPrimary}
            />
            <Text style={[styles.motivationText, { color: theme.colors.accentPrimary }]}>
              {motivationalPhrase}
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderSegmentBar = () => {
    if (isEmpty || isLoading) return null;
    return (
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
            Pausados ({pausedMeds.length})
          </Text>
        </Pressable>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <ScrollableContainer contentBottomInset={contentBottomInset}>
          <View style={{ marginTop: 20 }}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={{ marginBottom: 12 }}>
                <SkeletonCard theme={theme} />
              </View>
            ))}
          </View>
        </ScrollableContainer>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={filteredMeds}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {renderHero()}
            {renderSegmentBar()}
          </>
        }
        stickyHeaderIndices={!isEmpty && !isLoading ? [1] : undefined}
        contentContainerStyle={[
          styles.listContent,
          isEmpty && styles.listContentEmpty,
          { paddingBottom: contentBottomInset + 100 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              void loadMedications();
            }}
            tintColor={theme.colors.accentPrimary}
            colors={[theme.colors.accentPrimary]}
          />
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconBox, { backgroundColor: `${theme.colors.accentTertiary}14` }]}>
                <MaterialCommunityIcons name="connection" size={44} color={theme.colors.accentTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>{error}</Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
                Verifica tu conexión e inténtalo de nuevo.
              </Text>
              <Pressable
                onPress={() => {
                  setIsLoading(true);
                  void loadMedications();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.colors.accentPrimary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <MaterialCommunityIcons name="refresh" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconBox, { backgroundColor: `${theme.colors.accentPrimary}12` }]}>
                <MaterialCommunityIcons name="pill" size={52} color={theme.colors.accentPrimary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
                Tu botiquín está vacío
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
                Añade tus medicamentos y recibe recordatorios inteligentes para no olvidar ninguna dosis.
              </Text>
              <Pressable
                onPress={() => {
                  setEditingMedication(null);
                  setShowAddModal(true);
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: theme.colors.accentPrimary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <MaterialCommunityIcons name="plus" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Agregar primer medicamento</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item }) => {
          const todayDoses = getTodayDoses(item.times, item);
          const doseStatuses = doseStatusMap[item.id];
          const pendingCount = todayDoses.filter((t) => {
            const status = doseStatuses?.[t];
            return status !== 'taken' && status !== 'skipped';
          }).length;
          const completedCount = todayDoses.filter((t) => doseStatusMap[item.id]?.[t] === 'taken').length;
          const allCompleted = todayDoses.length > 0 && pendingCount === 0;

          const accentColor = !item.active
            ? theme.colors.textMuted
            : allCompleted
              ? theme.colors.success
              : theme.colors.accentPrimary;
          const accentBg = !item.active
            ? `${theme.colors.textMuted}10`
            : allCompleted
              ? `${theme.colors.success}12`
              : `${theme.colors.accentPrimary}10`;

          return (
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: theme.colors.surface,
                    borderLeftColor: accentColor,
                    borderLeftWidth: 4,
                    borderColor: theme.colors.surfaceBorder,
                  },
                  !item.active && styles.cardPaused,
                  pressed && { transform: [{ scale: 0.99 }], backgroundColor: accentBg },
                ]}
                onLongPress={() => {
                  setEditingMedication(item);
                  setShowAddModal(true);
                }}
                onPress={() => {
                  if (todayDoses.length > 0 && pendingCount > 0 && item.active) {
                    setEditingMedication(item);
                    setShowAddModal(true);
                  }
                }}
                accessibilityLabel={`${item.name}, ${item.dosage}, ${item.active ? 'activo' : 'pausado'}, ${completedCount} de ${todayDoses.length} tomadas`}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.medIconCircle, { backgroundColor: accentBg }]}>
                    <MaterialCommunityIcons
                      name={!item.active ? 'sleep' : allCompleted ? 'check-circle' : 'pill'}
                      size={22}
                      color={accentColor}
                    />
                  </View>
                  <View style={styles.cardHeaderInfo}>
                    <Text
                      style={[styles.medName, { color: item.active ? theme.colors.textPrimary : theme.colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <View style={styles.medMetaRow}>
                      <Text style={[styles.dosageText, { color: accentColor }]}>{item.dosage}</Text>
                      <View style={[styles.metaDot, { backgroundColor: accentColor }]} />
                      <Text style={[styles.frequencyText, { color: theme.colors.textSecondary }]}>
                        {item.frequency}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={item.active}
                    onValueChange={() => toggleMedicationStatus(item)}
                    trackColor={{ false: theme.colors.surfaceBorder, true: `${theme.colors.accentPrimary}60` }}
                    thumbColor={item.active ? theme.colors.accentPrimary : theme.colors.textMuted}
                    accessibilityLabel={item.active ? 'Desactivar alarma' : 'Activar alarma'}
                  />
                </View>

                {todayDoses.length > 0 && item.active && (
                  <View style={styles.doseTimeline}>
                    {todayDoses.map((t) => {
                      const status = doseStatusMap[item.id]?.[t];
                      const isTaken = status === 'taken';
                      const isSkipped = status === 'skipped';
                      const isPending = !isTaken && !isSkipped;
                      const isNow = isPending && parseDoseTime(t).getTime() <= Date.now();

                      let pillBg = `${theme.colors.accentPrimary}08`;
                      let pillBorder = `${theme.colors.accentPrimary}18`;
                      let dotColor = theme.colors.accentPrimary;
                      let iconName: keyof typeof MaterialCommunityIcons.glyphMap = 'clock-outline';

                      if (isTaken) {
                        pillBg = `${theme.colors.success}10`;
                        pillBorder = `${theme.colors.success}25`;
                        dotColor = theme.colors.success;
                        iconName = 'check-circle';
                      } else if (isSkipped) {
                        pillBg = `${theme.colors.textMuted}08`;
                        pillBorder = `${theme.colors.textMuted}15`;
                        dotColor = theme.colors.textMuted;
                        iconName = 'minus-circle-outline';
                      } else if (isNow) {
                        pillBg = `${theme.colors.accentTertiary}10`;
                        pillBorder = `${theme.colors.accentTertiary}25`;
                        dotColor = theme.colors.accentTertiary;
                        iconName = 'alarm-light';
                      }

                      return (
                        <View
                          key={`${item.id}-${t}`}
                          style={[styles.dosePill, { backgroundColor: pillBg, borderColor: pillBorder }]}
                        >
                          <View style={[styles.doseDot, { backgroundColor: dotColor }]} />
                          <Text style={[styles.dosePillTime, {
                            color: dotColor,
                            fontWeight: isNow ? '900' : '700',
                          }]}>
                            {t}
                          </Text>
                          <MaterialCommunityIcons name={iconName} size={12} color={dotColor} />
                        </View>
                      );
                    })}
                  </View>
                )}

                {item.notes ? (
                  <View style={[styles.notesRow, { backgroundColor: `${theme.colors.accentPrimary}05` }]}>
                    <MaterialCommunityIcons name="note-text-outline" size={13} color={theme.colors.textMuted} />
                    <Text style={[styles.notesText, { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {item.notes}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  {todayDoses.length > 0 && item.active ? (
                    <View style={[styles.statusPill, { backgroundColor: accentBg }]}>
                      <MaterialCommunityIcons
                        name={allCompleted ? 'check-circle' : 'progress-check'}
                        size={14}
                        color={accentColor}
                      />
                      <Text style={[styles.statusPillText, { color: accentColor }]}>
                        {allCompleted ? 'Completado' : `${completedCount}/${todayDoses.length} tomadas`}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: `${theme.colors.textMuted}08` }]}>
                      <MaterialCommunityIcons name="information-outline" size={14} color={theme.colors.textMuted} />
                      <Text style={[styles.statusPillText, { color: theme.colors.textMuted }]}>
                        {!item.active ? 'Pausado' : todayDoses.length === 0 ? 'Sin dosis hoy' : ''}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionBtn,
                        { backgroundColor: `${theme.colors.textSecondary}08` },
                        pressed && styles.actionBtnPressed,
                      ]}
                      onPress={() => {
                        setEditingMedication(item);
                        setShowAddModal(true);
                      }}
                      accessibilityLabel="Editar medicamento"
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionBtn,
                        { backgroundColor: `${theme.colors.accentTertiary}10` },
                        pressed && styles.actionBtnPressed,
                      ]}
                      onPress={() => handleDeleteMedication(item.id, item.name)}
                      accessibilityLabel="Eliminar medicamento"
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.accentTertiary} />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListFooterComponent={
          filteredMeds.length > 0 ? (
            <Text style={[styles.listFooterText, { color: theme.colors.textMuted }]}>
              Mantén presionada una tarjeta para editar
            </Text>
          ) : null
        }
      />

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.colors.accentPrimary,
            bottom: contentBottomInset + 24,
            transform: [{ scale: pressed ? 0.9 : 1 }],
          },
        ]}
        onPress={() => {
          setEditingMedication(null);
          setShowAddModal(true);
        }}
        accessibilityLabel="Agregar medicamento"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="plus" size={28} color="#fff" />
      </Pressable>

      <AddMedicationModal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingMedication(null);
        }}
        onMedicationAdded={(medication) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setMedications((current) => {
            const updated = [medication, ...current];
            getStoredSession().then((session) => {
              if (session?.accessToken) computeDoseStatus(updated, session.accessToken);
            });
            return updated;
          });
        }}
        onMedicationUpdated={(medication) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setMedications((current) => {
            const updated = current.map((m) => (m.id === medication.id ? medication : m));
            getStoredSession().then((session) => {
              if (session?.accessToken) computeDoseStatus(updated, session.accessToken);
            });
            return updated;
          });
        }}
        initialData={editingMedication}
        theme={theme}
      />
    </View>
  );
}

function ScrollableContainer({
  children,
  contentBottomInset,
}: Readonly<{ children: React.ReactNode; contentBottomInset: number }>) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 20, paddingBottom: contentBottomInset + 100 }}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingHorizontal: 18, paddingTop: 14 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },

  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroGreeting: { gap: 2 },
  greetingEmoji: { fontSize: 24, marginBottom: 2 },
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
  progressLeftStat: { gap: 0 },
  progressBigNumber: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  progressSmall: { fontSize: 16, fontWeight: '700' },
  progressLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  progressRightStat: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressStatItem: { alignItems: 'center', gap: 2 },
  progressStatValue: { fontSize: 18, fontWeight: '900' },
  progressStatLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressStatDivider: { width: 1, height: 28, borderRadius: 1 },

  progressBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: 6, borderRadius: 3 },

  motivationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  motivationText: { fontSize: 12, fontWeight: '700', flex: 1 },

  segmentBar: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 18,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
  },
  segmentBtnText: { fontSize: 13, fontWeight: '800' },

  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardPaused: { opacity: 0.7 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  medIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderInfo: { flex: 1, gap: 3 },
  medName: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  medMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dosageText: { fontSize: 13, fontWeight: '700' },
  metaDot: { width: 3, height: 3, borderRadius: 2 },
  frequencyText: { fontSize: 12, fontWeight: '600' },

  doseTimeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dosePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  doseDot: { width: 6, height: 6, borderRadius: 3 },
  dosePillTime: { fontSize: 11, fontVariant: ['tabular-nums'] },

  notesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  notesText: { fontSize: 11, fontWeight: '600', flex: 1 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  cardActions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPressed: { opacity: 0.6 },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyIconBox: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  emptySubtext: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingHorizontal: 16, opacity: 0.7 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  listFooterText: { textAlign: 'center', fontSize: 11, fontWeight: '600', marginTop: 6, marginBottom: 12 },

  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },

  skelCircle: { width: 46, height: 46, borderRadius: 16 },
  skelLine: { height: 12, borderRadius: 6 },
  skelPill: { width: 50, height: 24, borderRadius: 12 },
});
