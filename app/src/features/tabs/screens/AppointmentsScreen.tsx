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

  const formatAppointmentDate = useMemo(() => {
    return (isoDate: string) => {
      const parsed = new Date(isoDate);
      if (Number.isNaN(parsed.getTime())) {
        return 'Fecha invalida';
      }

      return parsed.toLocaleString('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    };
  }, []);

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
        renderItem={({ item }) => (
          <View
            style={[
              styles.appointmentCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
            ]}
          >
            <View style={styles.appointmentInfo}>
              <Text style={[styles.appointmentTitle, { color: theme.colors.textPrimary }]}>{item.title}</Text>
              <Text style={[styles.appointmentMeta, { color: theme.colors.textSecondary }]}>{item.doctorName}</Text>
              <Text style={[styles.appointmentMeta, { color: theme.colors.textSecondary }]}>{formatAppointmentDate(item.scheduledAt)}</Text>
              {item.location ? (
                <Text style={[styles.appointmentMeta, { color: theme.colors.textMuted }]}>📍 {item.location}</Text>
              ) : null}
              {item.notes ? (
                <Text style={[styles.appointmentNotes, { color: theme.colors.textMuted }]}>{item.notes}</Text>
              ) : null}
            </View>

            <View style={styles.appointmentActions}>
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}
                onPress={() => handleDeleteAppointment(item.id, item.title)}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={theme.colors.accentTertiary} />
              </Pressable>
            </View>
          </View>
        )}
      />

      <Pressable
        style={[
          styles.fab,
          { backgroundColor: theme.colors.accentSecondary, right: 18, bottom: contentBottomInset + 18 },
        ]}
        onPress={() => setShowAddModal(true)}
      >
        <MaterialCommunityIcons name="plus" size={28} color={theme.colors.buttonText} />
      </Pressable>

      <AddAppointmentModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAppointmentAdded={(appointment) => {
          setAppointments((current) => [appointment, ...current]);
        }}
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
  appointmentCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  appointmentInfo: {
    flex: 1,
    gap: 6,
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  appointmentMeta: {
    fontSize: 13,
    fontWeight: '600',
  },
  appointmentNotes: {
    fontSize: 12,
    lineHeight: 18,
  },
  appointmentActions: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 998,
  },
});
