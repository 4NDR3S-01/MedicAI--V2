import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Switch,
  LayoutAnimation,
  Platform,
  Alert,
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

const DOSE_CACHE_KEY = 'medicai_dose_status_cache_v1';
const RECONCILE_DAILY_KEY = 'medicai_reconciled_today_v1';

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

const isToday = (date: Date): boolean => {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

function getGreeting(): { emoji: string; text: string } {
  const h = new Date().getHours();
  if (h < 12) return { emoji: '🌅', text: 'Buenos días' };
  if (h < 18) return { emoji: '☀️', text: 'Buenas tardes' };
  return { emoji: '🌙', text: 'Buenas noches' };
}

function getMotivationalPhrase(progress: number): string {
  if (progress === 0) return 'Empieza tu día cumpliendo tu rutina';
  if (progress < 0.5) return '¡Vas bien, sigue así!';
  if (progress < 1) return '¡Ya casi terminas!';
  return '¡Tratamiento completado, excelente!';
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
  const doseRefreshVersionRef = useRef(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const isEmpty = medications.length === 0;
  const progress = totalDosesToday > 0 ? takenCount / totalDosesToday : 0;
  const greeting = useMemo(() => getGreeting(), []);
  const motivationalPhrase = useMemo(() => getMotivationalPhrase(progress), [progress]);

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
      if (state === 'active') {
        refreshAll();
      }
    });

    const interval = setInterval(refreshAll, 60_000);

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
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
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

  const handleDeleteMedication = useCallback((medicationId: string, name: string) => {
    Alert.alert('Eliminar medicamento', `¿Estás seguro de que quieres eliminar "${name}"?`, [
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
        Alert.alert(
          'Permisos incompletos',
          'Completa la configuración de permisos para poder activar alarmas.',
        );
        return;
      }
    }

    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setMedications((current) =>
      current.map((m) => (m.id === med.id ? { ...m, active: !med.active } : m))
    );

    try {
      const session = await getStoredSession();
      if (!session?.accessToken) {
        setMedications((current) =>
          current.map((m) => (m.id === med.id ? { ...m, active: med.active } : m))
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
        current.map((m) => (m.id === med.id ? { ...m, active: med.active } : m))
      );
      const message = err instanceof Error ? err.message : 'Error al actualizar el estado';
      Alert.alert('Error', message);
    }
  };

  const renderHeader = () => {
    if (isLoading || isEmpty) return null;
    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.greetingRow}>
          <View>
            <Text style={[styles.greetingEmoji]}>{greeting.emoji}</Text>
            <Text style={[styles.greetingText, { color: theme.colors.textPrimary }]}>
              {greeting.text}
            </Text>
          </View>
        </View>

        <View style={[styles.progressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
          <View style={styles.progressTopRow}>
            <View style={styles.progressLeft}>
              <View style={[styles.progressRing, { borderColor: theme.colors.surfaceBorder }]}>
                <View style={[styles.progressRingFill, {
                  borderColor: progress >= 1 ? theme.colors.success : theme.colors.accentPrimary,
                  borderTopColor: 'transparent',
                  borderRightColor: 'transparent',
                  transform: [{ rotate: `${Math.min(progress, 1) * 360}deg` }],
                  opacity: progress > 0 ? 1 : 0,
                }]} />
                {/* Second half ring for >50% */}
                {progress > 0.5 && (
                  <View style={[styles.progressRingFill, styles.progressRingFillSecond, {
                    borderColor: progress >= 1 ? theme.colors.success : theme.colors.accentPrimary,
                    borderBottomColor: 'transparent',
                    borderLeftColor: 'transparent',
                    transform: [{ rotate: `${(progress - 0.5) * 360}deg` }],
                  }]} />
                )}
                <View style={styles.progressRingInner}>
                  <Text style={[styles.progressRingValue, { color: theme.colors.textPrimary }]}>
                    {Math.round(progress * 100)}
                  </Text>
                  <Text style={[styles.progressRingUnit, { color: theme.colors.textMuted }]}>%</Text>
                </View>
              </View>
            </View>

            <View style={styles.progressRight}>
              <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>
                Progreso de hoy
              </Text>
              <Text style={[styles.progressValue, { color: theme.colors.textPrimary }]}>
                {takenCount} de {totalDosesToday}
              </Text>
              <Text style={[styles.progressSubtext, { color: theme.colors.textMuted }]}>
                dosis completadas
              </Text>
            </View>
          </View>

          <View style={[styles.motivationBox, { backgroundColor: `${theme.colors.accentPrimary}08` }]}>
            <Text style={[styles.motivationText, { color: theme.colors.accentPrimary }]}>
              {motivationalPhrase}
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator color={theme.colors.accentPrimary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={medications}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
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
              <View style={[styles.emptyIconBox, { backgroundColor: `${theme.colors.accentTertiary}15` }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.accentTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>{error}</Text>
              <Pressable
                onPress={() => {
                  setIsLoading(true);
                  void loadMedications();
                }}
                style={[styles.retryButton, { backgroundColor: theme.colors.textPrimary }]}
              >
                <Text style={[styles.retryButtonText, { color: theme.colors.background }]}>Intentar de nuevo</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconBox, { backgroundColor: `${theme.colors.accentPrimary}15` }]}>
                <MaterialCommunityIcons name="pill" size={48} color={theme.colors.accentPrimary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>
                Tu botiquín está vacío
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
                Añade tus medicamentos y recibe recordatorios inteligentes para no olvidar ninguna dosis.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const todayDoses = getTodayDoses(item.times, item);
          const doseStatuses = doseStatusMap[item.id];
          const pendingCount = todayDoses.filter((t) => {
            const status = doseStatuses?.[t];
            return status !== 'taken' && status !== 'skipped';
          }).length;
          const allCompleted = todayDoses.length > 0 && pendingCount === 0;
          const completedCount = todayDoses.filter((t) => doseStatusMap[item.id]?.[t] === 'taken').length;
          const cardOpacity = !item.active ? 0.5 : allCompleted ? 0.75 : 1;

          return (
            <Animated.View
              style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              }}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: allCompleted ? `${theme.colors.success}30` : theme.colors.surfaceBorder,
                    opacity: cardOpacity,
                  },
                  pressed && styles.cardPressed,
                ]}
                onLongPress={() => {
                  setEditingMedication(item);
                  setShowAddModal(true);
                }}
              >
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={[styles.medIconCircle, { backgroundColor: `${theme.colors.accentPrimary}12` }]}>
                    <MaterialCommunityIcons name="pill" size={20} color={theme.colors.accentPrimary} />
                  </View>

                  <View style={styles.cardHeaderInfo}>
                    <Text style={[styles.medName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.medMetaRow}>
                      <Text style={[styles.dosageText, { color: theme.colors.accentPrimary }]}>
                        {item.dosage}
                      </Text>
                      <View style={[styles.metaDot, { backgroundColor: theme.colors.textMuted }]} />
                      <Text style={[styles.frequencyText, { color: theme.colors.textSecondary }]}>
                        {item.frequency}
                      </Text>
                    </View>
                  </View>

                  <Switch
                    value={item.active}
                    onValueChange={() => toggleMedicationStatus(item)}
                    trackColor={{ false: theme.colors.surfaceBorder, true: `${theme.colors.accentPrimary}70` }}
                    thumbColor={item.active ? theme.colors.accentPrimary : theme.colors.textMuted}
                    style={styles.cardSwitch}
                  />
                </View>

                {/* Dose Timeline */}
                {todayDoses.length > 0 && (
                  <View style={styles.doseTimeline}>
                    {todayDoses.map((t, i) => {
                      const status = doseStatusMap[item.id]?.[t];
                      const isTaken = status === 'taken';
                      const isSkipped = status === 'skipped';

                      let pillBg = `${theme.colors.accentPrimary}12`;
                      let pillBorder = `${theme.colors.accentPrimary}20`;
                      let iconColor = theme.colors.accentPrimary;
                      let textColor = theme.colors.accentPrimary;
                      let iconName: keyof typeof MaterialCommunityIcons.glyphMap = 'clock-outline';

                      if (isTaken) {
                        pillBg = `${theme.colors.success}15`;
                        pillBorder = `${theme.colors.success}30`;
                        iconColor = theme.colors.success;
                        textColor = theme.colors.success;
                        iconName = 'check-circle';
                      } else if (isSkipped) {
                        pillBg = `${theme.colors.textMuted}10`;
                        pillBorder = `${theme.colors.textMuted}20`;
                        iconColor = theme.colors.textMuted;
                        textColor = theme.colors.textMuted;
                        iconName = 'close-circle-outline';
                      }

                      return (
                        <View
                          key={`${item.id}-${t}`}
                          style={[
                            styles.dosePill,
                            {
                              backgroundColor: pillBg,
                              borderColor: pillBorder,
                            },
                          ]}
                        >
                          <Text style={[styles.dosePillTime, { color: textColor }]}>{t}</Text>
                          <MaterialCommunityIcons name={iconName} size={14} color={iconColor} />
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Notes */}
                {item.notes ? (
                  <View style={[styles.notesBox, { backgroundColor: `${theme.colors.accentPrimary}06` }]}>
                    <MaterialCommunityIcons name="note-text-outline" size={14} color={theme.colors.textMuted} />
                    <Text style={[styles.notesText, { color: theme.colors.textMuted }]} numberOfLines={2}>
                      {item.notes}
                    </Text>
                  </View>
                ) : null}

                {/* Card Footer */}
                <View style={styles.cardFooter}>
                  {todayDoses.length > 0 ? (
                    <View style={[styles.statusPill, {
                      backgroundColor: allCompleted ? `${theme.colors.success}12` : `${theme.colors.accentPrimary}10`,
                    }]}>
                      <MaterialCommunityIcons
                        name={allCompleted ? 'check-circle' : 'progress-check'}
                        size={14}
                        color={allCompleted ? theme.colors.success : theme.colors.accentPrimary}
                      />
                      <Text style={[styles.statusPillText, {
                        color: allCompleted ? theme.colors.success : theme.colors.accentPrimary,
                      }]}>
                        {allCompleted
                          ? 'Completado'
                          : `${completedCount}/${todayDoses.length} tomadas`}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: `${theme.colors.textMuted}10` }]}>
                      <MaterialCommunityIcons name="calendar-blank" size={14} color={theme.colors.textMuted} />
                      <Text style={[styles.statusPillText, { color: theme.colors.textMuted }]}>
                        Sin dosis hoy
                      </Text>
                    </View>
                  )}

                  <View style={styles.cardActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionBtn,
                        { backgroundColor: `${theme.colors.textSecondary}10` },
                        pressed && styles.actionBtnPressed,
                      ]}
                      onPress={() => {
                        setEditingMedication(item);
                        setShowAddModal(true);
                      }}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionBtn,
                        { backgroundColor: `${theme.colors.accentTertiary}12` },
                        pressed && styles.actionBtnPressed,
                      ]}
                      onPress={() => handleDeleteMedication(item.id, item.name)}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.accentTertiary} />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: theme.colors.accentPrimary,
            bottom: contentBottomInset + 24,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          },
        ]}
        onPress={() => {
          setEditingMedication(null);
          setShowAddModal(true);
        }}
      >
        <MaterialCommunityIcons name="plus" size={26} color={theme.colors.buttonText} />
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
              if (session?.accessToken) {
                computeDoseStatus(updated, session.accessToken);
              }
            });
            return updated;
          });
        }}
        onMedicationUpdated={(medication) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setMedications((current) => {
            const updated = current.map((m) => (m.id === medication.id ? medication : m));
            getStoredSession().then((session) => {
              if (session?.accessToken) {
                computeDoseStatus(updated, session.accessToken);
              }
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* ── List ── */
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  /* ── Greeting ── */
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  greetingEmoji: { fontSize: 28, marginBottom: 4 },
  greetingText: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },

  /* ── Progress Card ── */
  progressCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  progressLeft: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  progressRingFill: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 6,
    top: -6,
    left: -6,
  },
  progressRingFillSecond: {
    // Second half ring starts from the bottom (rotated 0 = bottom)
  },
  progressRingInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingValue: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  progressRingUnit: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressRight: {
    flex: 1,
    gap: 2,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  progressValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  progressSubtext: {
    fontSize: 14,
    fontWeight: '600',
  },
  motivationBox: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  motivationText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  /* ── Empty State ── */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 14,
  },
  emptyIconBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.75,
    paddingHorizontal: 20,
  },

  /* ── Retry ── */
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },

  /* ── Medication Card ── */
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  medIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  medName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  medMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dosageText: {
    fontSize: 14,
    fontWeight: '700',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    opacity: 0.4,
  },
  frequencyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardSwitch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },

  /* ── Dose Timeline ── */
  doseTimeline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dosePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  dosePillTime: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  /* ── Notes ── */
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 12,
  },
  notesText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    flex: 1,
  },

  /* ── Card Footer ── */
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPressed: {
    opacity: 0.7,
  },

  /* ── FAB ── */
  fab: {
    position: 'absolute',
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
});
