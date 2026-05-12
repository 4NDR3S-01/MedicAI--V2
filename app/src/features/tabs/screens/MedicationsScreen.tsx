import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, useRef } from 'react';
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
} from '../../../shared/services/notifications.service';
import { ensureAlarmPermissions } from '../../../shared/services/alarm-permissions.service';

type DoseStatus = 'pending' | 'taken' | 'skipped';

const DOSE_CACHE_KEY = 'medicai_dose_status_cache_v1';

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

    // On the first day, exclude times before firstDoseTime
    // (they belong to subsequent days due to interval wrapping past midnight)
    if (isFirstDay && medication?.firstDoseTime && t < medication.firstDoseTime) return false;

    // Use local date comparison (not toISOString) to correctly handle
    // doses near midnight across timezone offsets
    return isToday(doseDate);
  });
};

const isToday = (date: Date): boolean => {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

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

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const isEmpty = medications.length === 0;

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
    medications: MedicationData[],
    accessToken: string,
  ) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const statusMap: Record<string, Record<string, DoseStatus>> = {};
    let taken = 0;
    let total = 0;

    for (const med of medications) {
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

    // Cache to AsyncStorage for offline resilience
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

  // Restore from cache on mount for instant display
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

  // Auto-refresh when alarm action events fire (in-app modal)
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

  // Auto-refresh on foreground + date change detection (handles midnight rollover
  // even when app stays in foreground continuously)
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

    // Poll every 60s to catch midnight transition while app stays in foreground
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
      void rescheduleMedicationsAfterLaunch(data || []);
    } catch {
      // refresh silently — user can pull-to-refresh for errors
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

      void rescheduleMedicationsAfterLaunch(data || []);

      void computeDoseStatus(data || [], session.accessToken);

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
    // When ENABLING: check permissions first, before any state change or API call.
    // If permissions are incomplete, block the toggle entirely.
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

  const progress = totalDosesToday > 0 ? takenCount / totalDosesToday : 0;

  const renderHeader = () => {
    if (isLoading || isEmpty) return null;
    return (
      <Animated.View style={[styles.headerWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Mi Tratamiento</Text>
          <Pressable style={[styles.historyButton, { backgroundColor: `${theme.colors.accentPrimary}10` }]}>
            <MaterialCommunityIcons name="history" size={20} color={theme.colors.accentPrimary} />
          </Pressable>
        </View>

        <View style={[styles.progressCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
          <View style={styles.progressTextRow}>
            <View>
              <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>Progreso de hoy</Text>
              <Text style={[styles.progressValue, { color: theme.colors.textPrimary }]}>
                {takenCount} de {totalDosesToday} <Text style={styles.progressSubtext}>dosis completadas</Text>
              </Text>
            </View>
            <View style={[styles.progressIcon, { backgroundColor: `${theme.colors.success}15` }]}>
              <MaterialCommunityIcons name="check-decagram" size={24} color={theme.colors.success} />
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: `${theme.colors.textMuted}20` }]}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: theme.colors.accentPrimary }]} />
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
          />
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconBox, { backgroundColor: `${theme.colors.accentTertiary}15` }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.accentTertiary} />
              </View>
              <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>{error}</Text>
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
                <MaterialCommunityIcons name="medical-bag" size={64} color={theme.colors.accentPrimary} />
              </View>
              <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>Tu botiquín está vacío</Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
                Añade tus medicamentos para llevar un seguimiento moderno y preciso de tu salud.
              </Text>
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
          const allCompleted = todayDoses.length > 0 && pendingCount === 0;
          const completedCount = todayDoses.filter((t) => doseStatusMap[item.id]?.[t] === 'taken').length;
          const cardOpacity = !item.active ? 0.5 : allCompleted ? 0.7 : 1;

          return (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.medicationCardWrapper}>
              <View style={styles.timeSection}>
                <Text style={[styles.timeText, { color: theme.colors.textPrimary }]}>
                  {item.firstDoseTime || item.times?.[0] || '--:--'}
                </Text>
                <View style={[styles.timeDot, { backgroundColor: item.active ? theme.colors.accentPrimary : theme.colors.textMuted }]} />
                <View style={[styles.timeLine, { backgroundColor: theme.colors.surfaceBorder }]} />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.cardBody,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder, opacity: cardOpacity },
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
                onLongPress={() => {
                  setEditingMedication(item);
                  setShowAddModal(true);
                }}
              >
                <View style={styles.cardTop}>
                  <View style={styles.infoGroup}>
                    <Text style={[styles.medName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.dosageRow}>
                      <Text style={[styles.dosageText, { color: theme.colors.accentPrimary }]}>{item.dosage}</Text>
                      <View style={[styles.separator, { backgroundColor: theme.colors.textMuted }]} />
                      <Text style={[styles.frequencyText, { color: theme.colors.textSecondary }]}>{item.frequency}</Text>
                    </View>

                    {item.times && item.times.length > 0 && (
                      <View style={styles.timesBadgeList}>
                        {item.times.map((t) => {
                          const status = doseStatusMap[item.id]?.[t];
                          let bgColor = `${theme.colors.accentPrimary}10`;
                          let iconColor = theme.colors.accentPrimary;
                          let textColor = theme.colors.accentPrimary;
                          let iconName: keyof typeof MaterialCommunityIcons.glyphMap = 'alarm';

                          if (status === 'taken') {
                            bgColor = `${theme.colors.textMuted}20`;
                            iconColor = theme.colors.textMuted;
                            textColor = theme.colors.textMuted;
                            iconName = 'check-circle';
                          } else if (status === 'skipped') {
                            bgColor = `${theme.colors.textMuted}15`;
                            iconColor = theme.colors.textMuted;
                            textColor = theme.colors.textMuted;
                            iconName = 'close-circle-outline';
                          }

                          return (
                            <View key={`${item.id}-${t}`} style={[styles.timeBadge, { backgroundColor: bgColor }]}>
                              <MaterialCommunityIcons name={iconName} size={12} color={iconColor} />
                              <Text style={[styles.timeBadgeText, { color: textColor }]}>{t}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                  <Switch
                    value={item.active}
                    onValueChange={() => toggleMedicationStatus(item)}
                    trackColor={{ false: theme.colors.surfaceBorder, true: theme.colors.accentPrimary }}
                  />
                </View>

                {item.notes && (
                  <View style={[styles.notesBox, { backgroundColor: theme.colors.background }]}>
                    <Text style={[styles.notesText, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                      {item.notes}
                    </Text>
                  </View>
                )}

                <View style={styles.cardActions}>
                  {todayDoses.length > 0 && (
                    <View style={[
                      styles.statusBadge,
                      {
                        backgroundColor: allCompleted ? `${theme.colors.textMuted}20` : `${theme.colors.accentPrimary}10`,
                      },
                    ]}>
                      <MaterialCommunityIcons
                        name={allCompleted ? 'check-circle' : 'progress-clock'}
                        size={16}
                        color={allCompleted ? theme.colors.textMuted : theme.colors.accentPrimary}
                      />
                      <Text style={[
                        styles.statusBadgeText,
                        { color: allCompleted ? theme.colors.textMuted : theme.colors.accentPrimary },
                      ]}>
                        {allCompleted
                          ? 'Completado hoy'
                          : `${completedCount}/${todayDoses.length} tomada${todayDoses.length !== 1 ? 's' : ''}`
                        }
                      </Text>
                    </View>
                  )}

                  <View style={styles.iconActions}>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => {
                        setEditingMedication(item);
                        setShowAddModal(true);
                      }}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={22} color={theme.colors.textSecondary} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => handleDeleteMedication(item.id, item.name)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.colors.accentTertiary} />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </View>
          </Animated.View>
          );
        }}
      />

      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: theme.colors.accentPrimary,
            bottom: contentBottomInset + 24,
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
  listContent: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },
  listContentEmpty: { justifyContent: 'center' },
  headerWrapper: { gap: 16, marginBottom: 8 },
  headerTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  historyButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressCard: { borderRadius: 28, borderWidth: 1, padding: 20, gap: 16 },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  progressValue: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  progressSubtext: { fontSize: 14, fontWeight: '600', opacity: 0.6 },
  progressIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 20 },
  emptyIconBox: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  emptySubtext: { fontSize: 16, fontWeight: '500', textAlign: 'center', lineHeight: 24, opacity: 0.7 },
  retryButton: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, marginTop: 12 },
  retryButtonText: { fontSize: 16, fontWeight: '800' },
  medicationCardWrapper: { flexDirection: 'row', gap: 16 },
  timeSection: { width: 50, alignItems: 'center', paddingTop: 10 },
  timeText: { fontSize: 15, fontWeight: '900', marginBottom: 8 },
  timeDot: { width: 10, height: 10, borderRadius: 5, zIndex: 2 },
  timeLine: { position: 'absolute', top: 40, bottom: -20, width: 2, left: 24 },
  cardBody: { flex: 1, borderRadius: 28, borderWidth: 1, padding: 20, gap: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  infoGroup: { flex: 1, paddingRight: 10 },
  medName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  dosageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dosageText: { fontSize: 15, fontWeight: '700' },
  frequencyText: { fontSize: 14, fontWeight: '600' },
  separator: { width: 4, height: 4, borderRadius: 2, opacity: 0.3 },
  notesBox: { padding: 12, borderRadius: 16 },
  notesText: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18 },
  statusBadgeText: { fontSize: 13, fontWeight: '800' },
  iconActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8 },
  timesBadgeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  timeBadgeText: { fontSize: 11, fontWeight: '800' },
  fab: {
    position: 'absolute',
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
});

