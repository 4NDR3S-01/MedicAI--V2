import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, Switch } from 'react-native';
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
  const [editingMedication, setEditingMedication] = useState<MedicationData | null>(null);
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

  const toggleMedicationStatus = async (med: MedicationData) => {
    try {
      const session = await getStoredSession();
      if (!session?.accessToken) return;
      
      const updated = await medicationsAPI.updateMedication(med.id, session.accessToken, { active: !med.active });
      setMedications((current) => current.map((m) => (m.id === med.id ? updated : m)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar el estado';
      Alert.alert('Error', message);
    }
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
              !item.active && { opacity: 0.6 }
            ]}
          >
            <View style={styles.cardTop}>
               <View style={styles.cardTopLeft}>
                  <View style={[styles.iconBox, { backgroundColor: `${theme.colors.accentPrimary}15` }]}>
                     <MaterialCommunityIcons name="pill" size={28} color={theme.colors.accentPrimary} />
                  </View>
                  <View style={styles.medHeaderInfo}>
                     <Text style={[styles.medName, { color: theme.colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                     <Text style={[styles.medDosage, { color: theme.colors.textSecondary }]}>{item.dosage}</Text>
                  </View>
               </View>
               <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, { backgroundColor: item.active ? theme.colors.accentSecondary : theme.colors.textMuted }]} />
                  <Text style={[styles.statusText, { color: item.active ? theme.colors.accentSecondary : theme.colors.textMuted }]}>
                    {item.active ? 'Activo' : 'Pausado'}
                  </Text>
               </View>
            </View>
            
            <View style={styles.chipsRow}>
               <View style={[styles.chip, { borderColor: theme.colors.surfaceBorder }]}>
                  <MaterialCommunityIcons name="clock-outline" size={14} color={theme.colors.textSecondary} />
                  <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>{item.frequency}</Text>
               </View>
               {item.firstDoseTime ? (
                 <View style={[styles.chip, { borderColor: theme.colors.surfaceBorder }]}>
                    <MaterialCommunityIcons name="alarm" size={14} color={theme.colors.textSecondary} />
                    <Text style={[styles.chipText, { color: theme.colors.textSecondary }]}>{item.firstDoseTime}</Text>
                 </View>
               ) : null}
            </View>

            <View style={[styles.cardFooter, { borderTopColor: theme.colors.surfaceBorder }]}>
               <View style={styles.footerLeft}>
                  {item.notes ? (
                    <Text style={[styles.medNotes, { color: theme.colors.textMuted }]} numberOfLines={1}>{item.notes}</Text>
                  ) : null}
               </View>
               <View style={styles.footerRight}>
                  <Switch
                    value={item.active}
                    onValueChange={() => toggleMedicationStatus(item)}
                    trackColor={{ false: theme.colors.surfaceBorder, true: theme.colors.accentPrimary }}
                    style={{ transform: [{ scale: 0.8 }], marginRight: 4 }}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => {
                      setEditingMedication(item);
                      setShowAddModal(true);
                    }}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                    onPress={() => handleDeleteMedication(item.id, item.name)}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.accentTertiary} />
                  </Pressable>
               </View>
            </View>
          </View>
        )}
      />

      {!error && (
        <Pressable
          style={[
            styles.fab,
            { backgroundColor: theme.colors.accentPrimary, right: 18, bottom: contentBottomInset + 18, shadowColor: theme.colors.accentPrimary },
          ]}
          onPress={() => {
            setEditingMedication(null);
            setShowAddModal(true);
          }}
        >
          <MaterialCommunityIcons name="plus" size={24} color={theme.colors.buttonText} />
          <Text style={[styles.fabText, { color: theme.colors.buttonText }]}>Agregar</Text>
        </Pressable>
      )}

      <AddMedicationModal
        visible={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingMedication(null);
        }}
        onMedicationAdded={(medication) => {
          setMedications((current) => [medication, ...current]);
        }}
        onMedicationUpdated={(medication) => {
          setMedications((current) => current.map((m) => (m.id === medication.id ? medication : m)));
        }}
        initialData={editingMedication}
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
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  medName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  medDosage: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  medNotes: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(150,150,150,0.1)',
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
