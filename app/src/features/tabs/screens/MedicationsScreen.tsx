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

import type { AppTheme } from '../../../shared/theme';
import * as medicationsAPI from '../services/medications.service';
import type { MedicationData } from '../services/medications.service';
import { getStoredSession } from '../../auth';
import { AddMedicationModal } from '../components/AddMedicationModal';
import {
  scheduleMedicationNotifications,
  cancelNotificationsByDataId,
  rescheduleMedicationsAfterLaunch,
  NotificationPermissionError,
} from '../../../shared/services/notifications.service';
import {
  type AlarmPermissionsStatus,
  getAlarmPermissionsStatus,
  requestNotificationPermission,
  openNotificationSettings,
  openBatteryOptimizationSettings,
} from '../../../shared/services/alarm-permissions.service';

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
  const [alarmPermissions, setAlarmPermissions] = useState<AlarmPermissionsStatus | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const isEmpty = medications.length === 0;
  const takenToday = 3; // Mock value for progress
  const totalToday = medications.length > 0 ? medications.length : 4;
  const progress = totalToday > 0 ? takenToday / totalToday : 0;

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

      // Re-schedule any alarms lost after a device reboot (Android clears AlarmManager on restart).
      // Safe to call on every launch — skips medications that already have pending notifications.
      void rescheduleMedicationsAfterLaunch(data || []);

      // Trigger entry animation
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
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    setIsLoading(true);
    void loadMedications();
  }, [loadMedications]);

  const checkAlarmPermissions = useCallback(async () => {
    try {
      const status = await getAlarmPermissionsStatus();
      setAlarmPermissions(status);
    } catch {
      // Non-critical — permission status unavailable
    }
  }, []);

  useEffect(() => {
    void checkAlarmPermissions();
  }, [checkAlarmPermissions]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkAlarmPermissions();
    });
    return () => sub.remove();
  }, [checkAlarmPermissions]);

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
      
      // Update notifications schedule
      await scheduleMedicationNotifications(updated);
      
      setMedications((current) => current.map((m) => (m.id === med.id ? updated : m)));
    } catch (err) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMedications((current) =>
        current.map((m) => (m.id === med.id ? { ...m, active: med.active } : m))
      );

      if (err instanceof NotificationPermissionError) {
        Alert.alert(
          'Notificaciones desactivadas',
          'El medicamento fue actualizado pero las alarmas no se programaron. Activa las notificaciones en Configuración.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Configuración', onPress: () => void openNotificationSettings() },
          ],
        );
      } else {
        const message = err instanceof Error ? err.message : 'Error al actualizar el estado';
        Alert.alert('Error', message);
      }
    }
  };

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
                {takenToday} de {totalToday} <Text style={styles.progressSubtext}>dosis completadas</Text>
              </Text>
            </View>
            <View style={[styles.progressIcon, { backgroundColor: `${theme.colors.success}15` }]}>
              <MaterialCommunityIcons name="check-decagram" size={24} color={theme.colors.success} />
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: `${theme.colors.textMuted}20` }]}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.colors.accentPrimary }]} />
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
      {/* Notification permission banner */}
      {alarmPermissions && !alarmPermissions.isAlarmReady && (
        <View style={[styles.permissionBanner, { backgroundColor: `${theme.colors.accentTertiary}12`, borderColor: `${theme.colors.accentTertiary}40` }]}>
          <MaterialCommunityIcons name="bell-alert-outline" size={22} color={theme.colors.accentTertiary} />
          <View style={styles.permissionBannerText}>
            <Text style={[styles.permissionBannerTitle, { color: theme.colors.textPrimary }]}>Alarmas desactivadas</Text>
            <Text style={[styles.permissionBannerSubtext, { color: theme.colors.textSecondary }]}>
              Las notificaciones de medicación no funcionarán sin este permiso.
            </Text>
          </View>
          <Pressable
            style={[styles.permissionBannerBtn, { backgroundColor: theme.colors.accentTertiary }]}
            onPress={async () => {
              if (alarmPermissions.notifications === 'undetermined') {
                const result = await requestNotificationPermission();
                if (result === 'granted') void checkAlarmPermissions();
              } else {
                await openNotificationSettings();
              }
            }}
          >
            <Text style={[styles.permissionBannerBtnText, { color: '#fff' }]}>
              {alarmPermissions.notifications === 'undetermined' ? 'Activar' : 'Configuración'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Battery optimization banner — Android only */}
      {alarmPermissions?.shouldPromptBatteryOptimization && alarmPermissions.isAlarmReady && (
        <View style={[styles.permissionBanner, { backgroundColor: `${theme.colors.accentSecondary}12`, borderColor: `${theme.colors.accentSecondary}40` }]}>
          <MaterialCommunityIcons name="battery-alert-variant-outline" size={22} color={theme.colors.accentSecondary} />
          <View style={styles.permissionBannerText}>
            <Text style={[styles.permissionBannerTitle, { color: theme.colors.textPrimary }]}>Optimización de batería</Text>
            <Text style={[styles.permissionBannerSubtext, { color: theme.colors.textSecondary }]}>
              Exime la app para garantizar la entrega de alarmas en segundo plano.
            </Text>
          </View>
          <Pressable
            style={[styles.permissionBannerBtn, { backgroundColor: theme.colors.accentSecondary }]}
            onPress={() => void openBatteryOptimizationSettings()}
          >
            <Text style={[styles.permissionBannerBtnText, { color: '#fff' }]}>Ver</Text>
          </Pressable>
        </View>
      )}

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
        renderItem={({ item }) => (
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
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
                  !item.active && { opacity: 0.6 },
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
                    
                    {/* Display multiple times */}
                    {item.times && item.times.length > 0 && (
                      <View style={styles.timesBadgeList}>
                        {item.times.map((t) => (
                          <View key={`${item.id}-${t}`} style={[styles.timeBadge, { backgroundColor: `${theme.colors.accentPrimary}10` }]}> 
                            <MaterialCommunityIcons name="alarm" size={12} color={theme.colors.accentPrimary} />
                            <Text style={[styles.timeBadgeText, { color: theme.colors.accentPrimary }]}>{t}</Text>
                          </View>
                        ))}
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
                  <Pressable
                    style={({ pressed }) => [
                      styles.takeButton,
                      { backgroundColor: theme.colors.accentPrimary },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={async () => {
                      try {
                        const session = await getStoredSession();
                        if (!session?.accessToken) return;
                        await medicationsAPI.logMedicationAction(item.id, session.accessToken, 'TAKEN');
                        Alert.alert('Completado', `${item.name} marcado como tomado.`);
                      } catch (err) {
                        console.error(err);
                        Alert.alert('Error', 'No se pudo registrar la toma.');
                      }
                    }}
                  >
                    <MaterialCommunityIcons name="check" size={18} color={theme.colors.buttonText} />
                    <Text style={[styles.takeButtonText, { color: theme.colors.buttonText }]}>Tomar dosis</Text>
                  </Pressable>
                  
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
        )}
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
          setMedications((current) => [medication, ...current]);
        }}
        onMedicationUpdated={(medication) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setMedications((current) => current.map((m) => (m.id === medication.id ? medication : m)));
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
  takeButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18 },
  takeButtonText: { fontSize: 14, fontWeight: '800' },
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
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  permissionBannerText: { flex: 1 },
  permissionBannerTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  permissionBannerSubtext: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  permissionBannerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  permissionBannerBtnText: { fontSize: 13, fontWeight: '800' },
});

