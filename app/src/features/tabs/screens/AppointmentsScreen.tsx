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
import type { AppointmentData } from '../services/appointments.service';
import * as appointmentsAPI from '../services/appointments.service';
import { cancelNotificationsByDataId } from '../../../shared/services/notifications.service';

export type AppointmentsScreenProps = {
  theme: AppTheme;
  contentBottomInset: number;
};

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

  const renderHeader = () => {
    if (isLoading || isEmpty) return null;
    return (
      <Animated.View style={[styles.headerWrapper, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Mi Agenda</Text>
          <View style={[styles.dateBadge, { backgroundColor: `${theme.colors.accentSecondary}10` }]}>
            <Text style={[styles.dateBadgeText, { color: theme.colors.accentSecondary }]}>Mayo 2026</Text>
          </View>
        </View>

        {/* Weekly Mini Calendar Selector (Visual only for now) */}
        <View style={styles.calendarStrip}>
          {[
            { day: 'Lun', num: '04' },
            { day: 'Mar', num: '05' },
            { day: 'Mié', num: '06' },
            { day: 'Jue', num: '07' },
            { day: 'Vie', num: '08' },
            { day: 'Sáb', num: '09', active: true },
            { day: 'Dom', num: '10' },
          ].map((item) => (
            <View
              key={item.num}
              style={[
                styles.calendarDay,
                item.active && { backgroundColor: theme.colors.accentSecondary, borderColor: theme.colors.accentSecondary },
                !item.active && { borderColor: theme.colors.surfaceBorder },
              ]}
            >
              <Text style={[styles.dayName, { color: item.active ? '#FFF' : theme.colors.textMuted }]}>{item.day}</Text>
              <Text style={[styles.dayNum, { color: item.active ? '#FFF' : theme.colors.textPrimary }]}>{item.num}</Text>
            </View>
          ))}
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
                Programa tus próximas citas médicas para mantener un control óptimo de tu salud.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const parsed = new Date(item.scheduledAt);
          const isValid = !Number.isNaN(parsed.getTime());
          const day = isValid ? parsed.getDate() : '--';
          const month = isValid ? parsed.toLocaleString('es-ES', { month: 'short' }).toUpperCase() : '--';
          const timeStr = isValid
            ? parsed.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
            : '--:--';

          return (
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              <View style={styles.appointmentCardWrapper}>
                <View style={styles.dateColumn}>
                  <Text style={[styles.dateDay, { color: theme.colors.textPrimary }]}>{day}</Text>
                  <Text style={[styles.dateMonth, { color: theme.colors.accentSecondary }]}>{month}</Text>
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
                >
                  <View style={styles.cardTop}>
                    <View style={styles.titleGroup}>
                      <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View style={[styles.timeTag, { backgroundColor: `${theme.colors.accentSecondary}10` }]}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.accentSecondary} />
                        <Text style={[styles.timeLabel, { color: theme.colors.accentSecondary }]}>{timeStr}</Text>
                      </View>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.textMuted} />
                  </View>

                  <View style={styles.detailsGroup}>
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
                    <Pressable style={[styles.primaryAction, { backgroundColor: theme.colors.accentSecondary }]}>
                      <Text style={[styles.primaryActionText, { color: theme.colors.buttonText }]}>Ver Mapa</Text>
                    </Pressable>
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
            backgroundColor: theme.colors.accentSecondary,
            bottom: contentBottomInset + 24,
          },
        ]}
        onPress={() => {
          setEditingAppointment(null);
          setShowAddModal(true);
        }}
      >
        <MaterialCommunityIcons name="calendar-plus" size={26} color={theme.colors.buttonText} />
      </Pressable>

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
  listContent: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },
  listContentEmpty: { justifyContent: 'center' },
  headerWrapper: { gap: 20, marginBottom: 8 },
  headerTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  dateBadge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  dateBadgeText: { fontSize: 14, fontWeight: '800' },
  calendarStrip: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  calendarDay: { flex: 1, height: 74, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dayName: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  dayNum: { fontSize: 18, fontWeight: '900' },
  emptyState: { alignItems: 'center', paddingVertical: 80, gap: 20 },
  emptyIconBox: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  emptySubtext: { fontSize: 16, fontWeight: '500', textAlign: 'center', lineHeight: 24, opacity: 0.7 },
  retryButton: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, marginTop: 12 },
  retryButtonText: { fontSize: 16, fontWeight: '800' },
  appointmentCardWrapper: { flexDirection: 'row', gap: 16 },
  dateColumn: { width: 50, alignItems: 'center', paddingTop: 10 },
  dateDay: { fontSize: 28, fontWeight: '900', letterSpacing: -1, lineHeight: 30 },
  dateMonth: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  dateLine: { position: 'absolute', top: 60, bottom: -20, width: 2, left: 24, opacity: 0.5 },
  cardBody: { flex: 1, borderRadius: 28, borderWidth: 1, padding: 20, gap: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleGroup: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  timeLabel: { fontSize: 13, fontWeight: '800' },
  detailsGroup: { gap: 12 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailValue: { fontSize: 15, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTopWidth: 1 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 8 },
  primaryAction: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  primaryActionText: { fontSize: 14, fontWeight: '800' },
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

