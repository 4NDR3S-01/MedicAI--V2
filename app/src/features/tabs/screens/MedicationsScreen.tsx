import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Alert } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import * as medicationsAPI from '../services/medications.service';
import type { MedicationData } from '../services/medications.service';
import { getStoredSession } from '../../auth';
import { AddMedicationModal } from '../components/AddMedicationModal';

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
  const isEmpty = medications.length === 0;

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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar medicamentos';
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    void loadMedications();
  }, [loadMedications]);

  const handleDeleteMedication = (medicationId: string, name: string) => {
    Alert.alert('Eliminar medicamento', `¿Estás seguro de que quieres eliminar "${name}"?`, [
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

            await medicationsAPI.deleteMedication(medicationId, session.accessToken);
            setMedications((current) => current.filter((med) => med.id !== medicationId));
            Alert.alert('Éxito', 'Medicamento eliminado.');
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al eliminar';
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
        contentContainerStyle={[
          styles.listContent,
          isEmpty && styles.listContentEmpty,
          { paddingBottom: contentBottomInset },
        ]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => {
          setIsRefreshing(true);
          void loadMedications();
        }} />}
        ListEmptyComponent={
          error ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={48}
                color={theme.colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>{error}</Text>
              <Pressable
                onPress={() => {
                  setIsLoading(true);
                  void loadMedications();
                }}
                style={[styles.retryButton, { backgroundColor: theme.colors.accentPrimary }]}
              >
                <Text style={[styles.retryButtonText, { color: theme.colors.buttonText }]}>
                  Intentar de nuevo
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="pill"
                size={48}
                color={theme.colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>
                No hay medicamentos registrados
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textMuted }]}>
                Agrega tus medicamentos para tener un control
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.medicationCard,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
            ]}
          >
            <View style={styles.medicationInfo}>
              <Text style={[styles.medicationName, { color: theme.colors.textPrimary }]}>
                {item.name}
              </Text>
              <View style={styles.medicationDetails}>
                <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Dosis:</Text>
                <Text style={[styles.detailValue, { color: theme.colors.textSecondary }]}>
                  {item.dosage}
                </Text>
              </View>
              <View style={styles.medicationDetails}>
                <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Frecuencia:</Text>
                <Text style={[styles.detailValue, { color: theme.colors.textSecondary }]}>
                  {item.frequency}
                </Text>
              </View>
              {item.notes ? (
                <View style={styles.medicationDetails}>
                  <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>Notas:</Text>
                  <Text style={[styles.detailValue, { color: theme.colors.textSecondary }]}>
                    {item.notes}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.medicationActions}>
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}
                onPress={() => handleDeleteMedication(item.id, item.name)}
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
          { backgroundColor: theme.colors.accentPrimary, right: 18, bottom: contentBottomInset + 18 },
        ]}
        onPress={() => setShowAddModal(true)}
      >
        <MaterialCommunityIcons name="plus" size={28} color={theme.colors.buttonText} />
      </Pressable>

      <AddMedicationModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onMedicationAdded={(medication) => {
          setMedications((current) => [medication, ...current]);
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
  },
  emptySubtext: {
    fontSize: 13,
    fontWeight: '500',
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
  medicationCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  medicationInfo: {
    flex: 1,
    gap: 8,
  },
  medicationName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  medicationDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  medicationActions: {
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
