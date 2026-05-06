import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { getStoredSession } from '../../auth';
import { AddAppointmentModal } from '../components/AddAppointmentModal';
import type { AppointmentData } from '../services/appointments.service';
import * as appointmentsAPI from '../services/appointments.service';

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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar citas';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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
          try {
            const session = await getStoredSession();
            if (!session?.accessToken) {
              Alert.alert('Error', 'No autorizado.');
              return;
            }

            await appointmentsAPI.deleteAppointment(appointmentId, session.accessToken);
            setAppointments((current) => current.filter((item) => item.id !== appointmentId));
            Alert.alert('Cita eliminada', 'La cita fue eliminada correctamente.');
          } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo eliminar la cita.';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
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
        contentContainerStyle={[
          styles.listContent,
          isEmpty && styles.listContentEmpty,
          { paddingBottom: contentBottomInset },
        ]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => {
          setIsRefreshing(true);
          void loadAppointments();
        }} />}
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="alert-circle-outline" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>{error}</Text>
              <Pressable
                onPress={() => {
                  setIsLoading(true);
                  void loadAppointments();
                }}
                style={[styles.retryButton, { backgroundColor: theme.colors.accentSecondary }]}
              >
                <Text style={[styles.retryButtonText, { color: theme.colors.buttonText }]}>Intentar de nuevo</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="calendar-clock" size={48} color={theme.colors.textMuted} />
              <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>No hay citas registradas</Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textMuted }]}>Agrega tu proxima cita medica</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const parsed = new Date(item.scheduledAt);
          const isValid = !Number.isNaN(parsed.getTime());
          const day = isValid ? parsed.getDate() : '--';
          const month = isValid ? parsed.toLocaleString('es-ES', { month: 'short' }).toUpperCase() : '--';
          const timeStr = isValid ? parsed.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '--:--';
          const isLast = index === appointments.length - 1;

          return (
            <View style={styles.timelineRow}>
              <View style={styles.timelineLeft}>
                <Text style={[styles.timelineDay, { color: theme.colors.textPrimary }]}>{day}</Text>
                <Text style={[styles.timelineMonth, { color: theme.colors.accentSecondary }]}>{month}</Text>
                <Text style={[styles.timelineTime, { color: theme.colors.textMuted }]}>{timeStr}</Text>
              </View>
              
              <View style={styles.timelineSeparator}>
                <View style={[styles.timelineDot, { backgroundColor: theme.colors.accentSecondary, borderColor: theme.colors.background }]} />
                {!isLast && <View style={[styles.timelineLine, { backgroundColor: theme.colors.surfaceBorder }]} />}
              </View>
              
              <View style={styles.timelineContent}>
                <View style={[styles.appointmentCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.headerTexts}>
                      <Text style={[styles.appointmentTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                      <View style={styles.doctorBadge}>
                        <MaterialCommunityIcons name="stethoscope" size={14} color={theme.colors.accentSecondary} />
                        <Text style={[styles.doctorName, { color: theme.colors.accentSecondary }]} numberOfLines={1}>{item.doctorName}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.actionsWrapper}>
                      <Pressable
                        style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                        onPress={() => { setEditingAppointment(item); setShowAddModal(true); }}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.textSecondary} />
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                        onPress={() => handleDeleteAppointment(item.id, item.title)}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.accentTertiary} />
                      </Pressable>
                    </View>
                  </View>

                  {item.location ? (
                    <View style={styles.locationBlock}>
                      <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.colors.textSecondary} />
                      <Text style={[styles.locationText, { color: theme.colors.textSecondary }]} numberOfLines={2}>{item.location}</Text>
                    </View>
                  ) : null}

                  {item.notes ? (
                    <View style={[styles.notesBlock, { borderLeftColor: theme.colors.surfaceBorder }]}>
                      <Text style={[styles.notesText, { color: theme.colors.textMuted }]} numberOfLines={3}>{item.notes}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
      />

      {!error && (
        <Pressable
          style={[
            styles.fab,
            { backgroundColor: theme.colors.accentSecondary, right: 18, bottom: contentBottomInset + 18, shadowColor: theme.colors.accentSecondary },
          ]}
          onPress={() => {
            setEditingAppointment(null);
            setShowAddModal(true);
          }}
        >
          <MaterialCommunityIcons name="plus" size={24} color={theme.colors.buttonText} />
          <Text style={[styles.fabText, { color: theme.colors.buttonText }]}>Agendar</Text>
        </Pressable>
      )}

      <AddAppointmentModal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingAppointment(null);
        }}
        onAppointmentAdded={(appointment) => {
          setAppointments((current) => [appointment, ...current]);
        }}
        onAppointmentUpdated={(appointment) => {
          setAppointments((current) => current.map((a) => (a.id === appointment.id ? appointment : a)));
        }}
        initialData={editingAppointment}
        theme={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, position: 'relative' },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  listContentEmpty: {
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineLeft: {
    width: 64,
    alignItems: 'center',
    paddingTop: 12,
  },
  timelineDay: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  timelineMonth: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timelineTime: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  timelineSeparator: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 20,
    zIndex: 1,
    borderWidth: 3,
  },
  timelineLine: {
    position: 'absolute',
    top: 34,
    bottom: -16,
    width: 2,
    zIndex: 0,
    opacity: 0.5,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 4,
  },
  appointmentCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTexts: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  appointmentTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  doctorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionsWrapper: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(150,150,150,0.1)',
  },
  locationBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  notesBlock: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    marginTop: 4,
  },
  notesText: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  fab: {
    position: 'absolute',
    flexDirection: 'row',
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 998,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 6,
  },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
