import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  LayoutAnimation,
  Platform,
} from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { getStoredSession } from '../../auth';
import { AddAppointmentModal } from '../components/AddAppointmentModal';
import type { AppointmentAttendanceStatus, AppointmentData } from '../services/appointments.service';
import * as appointmentsAPI from '../services/appointments.service';
import { FloatingActionButton } from '../../../shared/ui';
import {
  cancelNotificationsByDataId,
  rescheduleAppointmentsAfterLaunch,
  scheduleAppointmentReminder,
} from '../../../shared/services/notifications.service';

export type AppointmentsScreenProps = {
  theme: AppTheme;
  contentBottomInset: number;
};

const getDateParts = (date: Date) => ({
  day: String(date.getDate()).padStart(2, '0'),
  month: date.toLocaleString('es-ES', { month: 'short' }).replace('.', '').toUpperCase(),
});

const getRelativeDateLabel = (date: Date): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';
  if (diffDays > 1) return `En ${diffDays} días`;
  return `Hace ${Math.abs(diffDays)} días`;
};

const formatAppointmentTime = (date: Date): string =>
  date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export function AppointmentsScreen({ theme, contentBottomInset }: Readonly<AppointmentsScreenProps>) {
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const isEmpty = appointments.length === 0;

  const loadAppointments = useCallback(async () => {
    try {
      setError(null);
      const session = await getStoredSession();
      if (!session?.accessToken) {
        setError('No autorizado.');
        return;
      }

      const data = await appointmentsAPI.fetchAppointments(session.accessToken);
      setAppointments(data || []);
      void rescheduleAppointmentsAfterLaunch(data || []);

      // Trigger entry animation
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar citas';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    setIsLoading(true);
    void loadAppointments();
  }, [loadAppointments]);

  const handleDeleteAppointment = (appointmentId: string, title: string) => {
    Alert.alert('Eliminar cita', `¿Deseas eliminar "${title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (Platform.OS === 'android') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }
          try {
            const session = await getStoredSession();
            if (!session?.accessToken) {
              Alert.alert('Error', 'No autorizado.');
              return;
            }

            await appointmentsAPI.deleteAppointment(appointmentId, session.accessToken);
            
            // Cancel pending reminders
            await cancelNotificationsByDataId(appointmentId);
            
            setAppointments((current) => current.filter((item) => item.id !== appointmentId));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo eliminar la cita.';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
  };

  const updateAppointmentAttendance = async (
    appointment: AppointmentData,
    status: AppointmentAttendanceStatus,
  ) => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }

    try {
      const session = await getStoredSession();
      if (!session?.accessToken) {
        Alert.alert('Error', 'No autorizado.');
        return;
      }

      const updated = await appointmentsAPI.updateAppointment(appointment.id, session.accessToken, {
        attendanceStatus: status,
      });

      setAppointments((current) => current.map((item) => (item.id === updated.id ? updated : item)));

      if (updated.attendanceStatus === 'PENDING') {
        await scheduleAppointmentReminder(updated);
      } else {
        await cancelNotificationsByDataId(updated.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo marcar la asistencia.';
      Alert.alert('Error', message);
    }
  };

  const handleMarkAttendance = (appointment: AppointmentData) => {
    Alert.alert('Asistencia a la cita', 'Marca manualmente el estado de esta cita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Asistí',
        onPress: () => {
          void updateAppointmentAttendance(appointment, 'ATTENDED');
        },
      },
      {
        text: 'No asistí',
        style: 'destructive',
        onPress: () => {
          void updateAppointmentAttendance(appointment, 'MISSED');
        },
      },
      {
        text: 'Dejar pendiente',
        onPress: () => {
          void updateAppointmentAttendance(appointment, 'PENDING');
        },
      },
    ]);
  };

  const now = new Date();
  const upcomingAppointments = appointments.filter((appointment) => {
    const parsed = new Date(appointment.scheduledAt);
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() >= now.getTime();
  });
  const nextAppointment = upcomingAppointments[0] ?? null;
  const pendingAppointmentsCount = appointments.filter((appointment) => appointment.attendanceStatus === 'PENDING').length;
  const attendedAppointmentsCount = appointments.filter((appointment) => appointment.attendanceStatus === 'ATTENDED').length;
  const currentMonthLabel = now.toLocaleString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '');

  const renderHeader = () => {
    if (isLoading) return null;

    const nextDate = nextAppointment ? new Date(nextAppointment.scheduledAt) : null;
    const nextDateParts = nextDate && !Number.isNaN(nextDate.getTime()) ? getDateParts(nextDate) : null;

    return (
      <Animated.View style={[styles.headerWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}> 
        <View style={styles.headerTitleRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerEyebrow, { color: theme.colors.accentSecondary }]}>Citas médicas</Text>
            <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Agenda</Text>
            <Text style={[styles.headerSubtitle, { color: theme.colors.textSecondary }]}>Tus consultas, recordatorios y asistencia en un solo lugar.</Text>
          </View>
          <View style={[styles.dateBadge, { backgroundColor: `${theme.colors.accentSecondary}12`, borderColor: `${theme.colors.accentSecondary}30` }]}> 
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={theme.colors.accentSecondary} />
            <Text style={[styles.dateBadgeText, { color: theme.colors.accentSecondary }]}>{currentMonthLabel}</Text>
          </View>
        </View>

        {nextAppointment && nextDate && nextDateParts ? (
          <View style={[styles.nextCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
            <View style={[styles.nextDatePill, { backgroundColor: `${theme.colors.accentSecondary}14` }]}> 
              <Text style={[styles.nextDateDay, { color: theme.colors.textPrimary }]}>{nextDateParts.day}</Text>
              <Text style={[styles.nextDateMonth, { color: theme.colors.accentSecondary }]}>{nextDateParts.month}</Text>
            </View>
            <View style={styles.nextInfo}>
              <View style={styles.nextTopRow}>
                <Text style={[styles.nextKicker, { color: theme.colors.accentSecondary }]}>Próxima cita</Text>
                <Text style={[styles.nextTime, { color: theme.colors.textMuted }]}>{formatAppointmentTime(nextDate)}</Text>
              </View>
              <Text style={[styles.nextTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>{nextAppointment.title}</Text>
              <Text style={[styles.nextMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {getRelativeDateLabel(nextDate)} con {nextAppointment.doctorName}
              </Text>
              {nextAppointment.location ? (
                <Text style={[styles.nextLocation, { color: theme.colors.textMuted }]} numberOfLines={1}>{nextAppointment.location}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: `${theme.colors.accentSecondary}10`, borderColor: `${theme.colors.accentSecondary}20` }]}> 
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{upcomingAppointments.length}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Próximas</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: `${theme.colors.accentPrimary}10`, borderColor: `${theme.colors.accentPrimary}20` }]}> 
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{pendingAppointmentsCount}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Pendientes</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#16A34A15', borderColor: '#16A34A25' }]}> 
            <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{attendedAppointmentsCount}</Text>
            <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>Asistidas</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <View style={styles.centerContent}>
          <ActivityIndicator color={theme.colors.accentSecondary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={appointments}
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
              void loadAppointments();
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
                  void loadAppointments();
                }}
                style={[styles.retryButton, { backgroundColor: theme.colors.textPrimary }]}
              >
                <Text style={[styles.retryButtonText, { color: theme.colors.background }]}>Intentar de nuevo</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconBox, { backgroundColor: `${theme.colors.accentSecondary}15` }]}>
                <MaterialCommunityIcons name="calendar-blank" size={64} color={theme.colors.accentSecondary} />
              </View>
              <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>Tu agenda está libre</Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}> 
                Toca el botón + para crear tu primera cita y activar recordatorios automáticos.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const parsed = new Date(item.scheduledAt);
          const isValid = !Number.isNaN(parsed.getTime());
          const dateParts = isValid ? getDateParts(parsed) : { day: '--', month: '--' };
          const timeStr = isValid ? formatAppointmentTime(parsed) : '--:--';
          const relativeDate = isValid ? getRelativeDateLabel(parsed) : 'Sin fecha';
          const attendanceStatus = item.attendanceStatus ?? 'PENDING';
          const attendanceLabel = attendanceStatus === 'ATTENDED'
            ? 'Asistió'
            : attendanceStatus === 'MISSED'
              ? 'No asistió'
              : 'Pendiente';
          const attendanceColor = attendanceStatus === 'ATTENDED'
            ? '#16A34A'
            : attendanceStatus === 'MISSED'
              ? theme.colors.accentTertiary
              : theme.colors.accentSecondary;

          return (
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <View style={styles.appointmentCardWrapper}>
                <View style={styles.dateColumn}>
                  <View style={[styles.dateCapsule, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}> 
                    <Text style={[styles.dateDay, { color: theme.colors.textPrimary }]}>{dateParts.day}</Text>
                    <Text style={[styles.dateMonth, { color: theme.colors.accentSecondary }]}>{dateParts.month}</Text>
                  </View>
                  <View style={[styles.dateLine, { backgroundColor: theme.colors.surfaceBorder }]} />
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.cardBody,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
                    pressed && { transform: [{ scale: 0.98 }] },
                  ]}
                  onLongPress={() => {
                    setEditingAppointment(item);
                    setShowAddModal(true);
                  }}
                  delayLongPress={250}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.titleGroup}>
                      <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}> 
                        {item.title}
                      </Text>
                      <Text style={[styles.relativeDate, { color: theme.colors.textMuted }]}>{relativeDate}</Text>
                    </View>
                    <Pressable
                      onPress={() => handleMarkAttendance(item)}
                      style={[styles.attendanceTag, { backgroundColor: `${attendanceColor}15` }]}
                    >
                      <MaterialCommunityIcons
                        name={attendanceStatus === 'ATTENDED' ? 'check-circle-outline' : attendanceStatus === 'MISSED' ? 'close-circle-outline' : 'clock-alert-outline'}
                        size={14}
                        color={attendanceColor}
                      />
                      <Text style={[styles.attendanceLabel, { color: attendanceColor }]}>{attendanceLabel}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.detailsGroup}>
                    <View style={styles.detailItem}>
                      <View style={[styles.detailIconBox, { backgroundColor: `${theme.colors.accentSecondary}10` }]}> 
                        <MaterialCommunityIcons name="clock-outline" size={16} color={theme.colors.accentSecondary} />
                      </View>
                      <Text style={[styles.detailValue, { color: theme.colors.textPrimary }]} numberOfLines={1}> 
                        {timeStr}
                      </Text>
                    </View>
                    <View style={styles.detailItem}>
                      <View style={[styles.detailIconBox, { backgroundColor: `${theme.colors.accentSecondary}10` }]}> 
                        <MaterialCommunityIcons name="stethoscope" size={16} color={theme.colors.accentSecondary} />
                      </View>
                      <Text style={[styles.detailValue, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                        {item.doctorName}
                      </Text>
                    </View>
                    
                    {item.location ? (
                      <View style={styles.detailItem}>
                        <View style={[styles.detailIconBox, { backgroundColor: `${theme.colors.textMuted}10` }]}>
                          <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.colors.textSecondary} />
                        </View>
                        <Text style={[styles.detailValue, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                          {item.location}
                        </Text>
                      </View>
                    ) : null}
                    {item.notes ? (
                      <View style={styles.noteBox}>
                        <Text style={[styles.noteText, { color: theme.colors.textSecondary }]} numberOfLines={2}>{item.notes}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={[styles.cardFooter, { borderTopColor: theme.colors.background }]}>
                    <View style={styles.actionRow}>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => {
                          setEditingAppointment(item);
                          setShowAddModal(true);
                        }}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.textSecondary} />
                      </Pressable>
                      <Pressable style={styles.actionBtn} onPress={() => handleDeleteAppointment(item.id, item.title)}>
                        <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.accentTertiary} />
                      </Pressable>
                    </View>
                    <Pressable style={[styles.primaryAction, { backgroundColor: attendanceColor }]} onPress={() => handleMarkAttendance(item)}>
                      <Text style={[styles.primaryActionText, { color: theme.colors.buttonText }]}>Marcar asistencia</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </View>
            </Animated.View>
          );
        }}
      />

      <FloatingActionButton
        theme={theme}
        icon="calendar-plus"
        onPress={() => {
          setEditingAppointment(null);
          setShowAddModal(true);
        }}
        accessibilityLabel="Agregar cita"
        backgroundColor={theme.colors.accentSecondary}
      />

      <AddAppointmentModal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingAppointment(null);
        }}
        onAppointmentAdded={(appointment) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setAppointments((current) => [appointment, ...current]);
        }}
        onAppointmentUpdated={(appointment) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setAppointments((current) => current.map((a) => (a.id === appointment.id ? appointment : a)));
        }}
        initialData={editingAppointment}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 20, paddingTop: 20, gap: 18 },
  listContentEmpty: { justifyContent: 'center' },
  headerWrapper: { gap: 12, marginBottom: 10 },
  headerTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1, flexShrink: 1, gap: 3 },
  headerEyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  headerTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -1, lineHeight: 36 },
  headerSubtitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1, flexShrink: 0 },
  dateBadgeText: { fontSize: 12, fontWeight: '900', textTransform: 'capitalize' },
  nextCard: { flexDirection: 'row', gap: 14, borderWidth: 1, borderRadius: 28, padding: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  nextDatePill: { width: 62, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nextDateDay: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  nextDateMonth: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  nextInfo: { flex: 1, gap: 4, justifyContent: 'center' },
  nextTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  nextKicker: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  nextTime: { fontSize: 13, fontWeight: '800' },
  nextTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  nextMeta: { fontSize: 14, fontWeight: '700' },
  nextLocation: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 10, gap: 2 },
  statValue: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 20 },
  emptyIconBox: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  emptySubtext: { fontSize: 16, fontWeight: '500', textAlign: 'center', lineHeight: 24, opacity: 0.7 },
  retryButton: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, marginTop: 12 },
  retryButtonText: { fontSize: 16, fontWeight: '800' },
  appointmentCardWrapper: { flexDirection: 'row', gap: 10 },
  dateColumn: { width: 48, alignItems: 'center', paddingTop: 2 },
  dateCapsule: { width: 48, height: 58, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 22, fontWeight: '900', letterSpacing: -1, lineHeight: 24 },
  dateMonth: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  dateLine: { position: 'absolute', top: 62, bottom: -14, width: 2, left: 23, opacity: 0.45 },
  cardBody: { flex: 1, borderRadius: 22, borderWidth: 1, padding: 14, gap: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  titleGroup: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  relativeDate: { fontSize: 12, fontWeight: '800' },
  attendanceTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  attendanceLabel: { fontSize: 12, fontWeight: '800' },
  detailsGroup: { gap: 8 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIconBox: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  detailValue: { fontSize: 14, fontWeight: '600' },
  noteBox: { borderRadius: 14, padding: 10, backgroundColor: 'rgba(148, 163, 184, 0.10)' },
  noteText: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1 },
  actionRow: { flexDirection: 'row', gap: 6 },
  actionBtn: { padding: 6 },
  primaryAction: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  primaryActionText: { fontSize: 13, fontWeight: '800' },
});
