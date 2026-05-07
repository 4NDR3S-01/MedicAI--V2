import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';

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
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          try {
            const session = await getStoredSession();
            if (!session?.accessToken) {
              Alert.alert('Error', 'No autorizado.');
              return;
            }

            await appointmentsAPI.deleteAppointment(appointmentId, session.accessToken);
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
      <View style={styles.headerContainer}>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Mis Citas</Text>
        <View style={[styles.headerBadge, { backgroundColor: `${theme.colors.accentSecondary}15` }]}>
          <MaterialCommunityIcons name="calendar-check" size={16} color={theme.colors.accentSecondary} />
          <Text style={[styles.headerBadgeText, { color: theme.colors.accentSecondary }]}>
            {appointments.length} programada{appointments.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
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
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[
          styles.listContent,
          isEmpty && styles.listContentEmpty,
          { paddingBottom: contentBottomInset + 80 },
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
                <MaterialCommunityIcons name="calendar-blank" size={56} color={theme.colors.accentSecondary} />
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
          const isLast = index === appointments.length - 1;

          return (
            <View style={styles.appointmentRow}>
              <View style={styles.dateColumn}>
                <Text style={[styles.dateDay, { color: theme.colors.textPrimary }]}>{day}</Text>
                <Text style={[styles.dateMonth, { color: theme.colors.accentSecondary }]}>{month}</Text>
                {!isLast && <View style={[styles.timelineLine, { backgroundColor: theme.colors.surfaceBorder }]} />}
              </View>

              <View
                style={[
                  styles.cardContent,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.titleWrapper}>
                    <Text style={[styles.appointmentTitle, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </View>
                  <View style={[styles.timeChip, { backgroundColor: theme.colors.background }]}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={[styles.timeText, { color: theme.colors.textSecondary }]}>{timeStr}</Text>
                  </View>
                </View>

                <View style={styles.detailsContainer}>
                  <View style={styles.detailItem}>
                    <MaterialCommunityIcons name="stethoscope" size={16} color={theme.colors.accentSecondary} />
                    <Text style={[styles.detailText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                      {item.doctorName}
                    </Text>
                  </View>
                  {item.location ? (
                    <View style={styles.detailItem}>
                      <MaterialCommunityIcons name="map-marker-outline" size={16} color={theme.colors.textSecondary} />
                      <Text style={[styles.detailText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {item.location}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={[styles.cardFooter, { borderTopColor: theme.colors.surfaceBorder }]}>
                  <View style={styles.notesContainer}>
                    {item.notes ? (
                      <Text style={[styles.notesText, { color: theme.colors.textMuted }]} numberOfLines={2}>
                        <MaterialCommunityIcons name="information-outline" size={12} /> {item.notes}
                      </Text>
                    ) : (
                      <View />
                    )}
                  </View>

                  <View style={styles.actionsContainer}>
                    <Pressable
                      style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
                      onPress={() => {
                        setEditingAppointment(item);
                        setShowAddModal(true);
                      }}
                    >
                      <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
                      onPress={() => handleDeleteAppointment(item.id, item.title)}
                    >
                      <MaterialCommunityIcons name="trash-can" size={20} color={theme.colors.accentTertiary} />
                    </Pressable>
                  </View>
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
            {
              backgroundColor: theme.colors.accentSecondary,
              right: 20,
              bottom: contentBottomInset + 20,
              shadowColor: theme.colors.accentSecondary,
            },
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
  screen: { flex: 1, position: 'relative' },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  listContentEmpty: {
    justifyContent: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  headerBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 24,
    gap: 16,
  },
  emptyIconBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  emptySubtext: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  appointmentRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dateColumn: {
    width: 64,
    alignItems: 'center',
    paddingTop: 8,
  },
  dateDay: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  dateMonth: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  timelineLine: {
    position: 'absolute',
    top: 56,
    bottom: -24,
    width: 2,
    borderRadius: 1,
    opacity: 0.5,
  },
  cardContent: {
    flex: 1,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleWrapper: {
    flex: 1,
    paddingRight: 16,
  },
  appointmentTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  detailsContainer: {
    marginTop: 12,
    marginBottom: 16,
    gap: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  notesContainer: {
    flex: 1,
    paddingRight: 16,
  },
  notesText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 6,
  },
  fab: {
    position: 'absolute',
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 998,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    gap: 8,
  },
  fabText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
