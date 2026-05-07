import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  Switch,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
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
  const activeCount = medications.filter((m) => m.active).length;

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
          if (Platform.OS === 'android') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          }
          try {
            const session = await getStoredSession();
            if (!session?.accessToken) {
              Alert.alert('Error', 'No autorizado.');
              return;
            }

            await medicationsAPI.deleteMedication(medicationId, session.accessToken);
            setMedications((current) => current.filter((med) => med.id !== medicationId));
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al eliminar';
            Alert.alert('Error', message);
          }
        },
      },
    ]);
  };

  const toggleMedicationStatus = async (med: MedicationData) => {
    // Disable LayoutAnimation on iOS to prevent weird animations
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setMedications((current) =>
      current.map((m) => (m.id === med.id ? { ...m, active: !med.active } : m))
    );

    try {
      const session = await getStoredSession();
      if (!session?.accessToken) {
        if (Platform.OS === 'android') {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        }
        setMedications((current) =>
          current.map((m) => (m.id === med.id ? { ...m, active: med.active } : m))
        );
        return;
      }

      const updated = await medicationsAPI.updateMedication(med.id, session.accessToken, {
        active: !med.active,
      });
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
      <View style={styles.headerContainer}>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Mi Tratamiento</Text>
        <View style={[styles.headerBadge, { backgroundColor: `${theme.colors.accentPrimary}15` }]}>
          <MaterialCommunityIcons name="shield-check" size={16} color={theme.colors.accentPrimary} />
          <Text style={[styles.headerBadgeText, { color: theme.colors.accentPrimary }]}>
            {activeCount} activo{activeCount !== 1 ? 's' : ''} de {medications.length}
          </Text>
        </View>
      </View>
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
          { paddingBottom: contentBottomInset + 80 }, // extra padding for FAB
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
                <MaterialCommunityIcons name="medical-bag" size={56} color={theme.colors.accentPrimary} />
              </View>
              <Text style={[styles.emptyText, { color: theme.colors.textPrimary }]}>Tu botiquín está vacío</Text>
              <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>
                Añade tus medicamentos para llevar un seguimiento moderno y preciso de tu salud.
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const isLast = index === medications.length - 1;
          return (
            <View style={styles.medicationRow}>
              <View style={[styles.timeColumn, !item.active && styles.medicationRowInactive]}>
                {item.firstDoseTime ? (
                  <>
                    <Text style={[styles.timeText, { color: theme.colors.textPrimary }]}>{item.firstDoseTime}</Text>
                    <Text style={[styles.timeLabel, { color: theme.colors.textMuted }]}>INICIO</Text>
                  </>
                ) : (
                  <View style={[styles.noTimeIcon, { backgroundColor: theme.colors.background }]}>
                    <MaterialCommunityIcons name="all-inclusive" size={20} color={theme.colors.textMuted} />
                  </View>
                )}
                {!isLast && <View style={[styles.timelineLine, { backgroundColor: theme.colors.surfaceBorder }]} />}
              </View>

              <View
                style={[
                  styles.cardContent,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
                  !item.active && { opacity: 0.5 },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.titleWrapper}>
                    <Text style={[styles.medName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.medDosage, { color: theme.colors.accentPrimary }]}>{item.dosage}</Text>
                  </View>
                  <Switch
                    value={item.active}
                    onValueChange={() => toggleMedicationStatus(item)}
                    trackColor={{ false: theme.colors.surfaceBorder, true: theme.colors.accentPrimary }}
                  />
                </View>

                <View style={styles.detailsRow}>
                  <View style={[styles.detailChip, { backgroundColor: theme.colors.background }]}>
                    <MaterialCommunityIcons name="update" size={14} color={theme.colors.textSecondary} />
                    <Text style={[styles.detailText, { color: theme.colors.textSecondary }]}>{item.frequency}</Text>
                  </View>
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
                        setEditingMedication(item);
                        setShowAddModal(true);
                      }}
                    >
                      <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.5 }]}
                      onPress={() => handleDeleteMedication(item.id, item.name)}
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
              backgroundColor: theme.colors.accentPrimary,
              right: 20,
              bottom: contentBottomInset + 20,
              shadowColor: theme.colors.accentPrimary,
            },
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
  medicationRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  medicationRowInactive: {
    opacity: 0.5,
  },
  timeColumn: {
    width: 64,
    alignItems: 'center',
    paddingTop: 16,
  },
  timeText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },
  noTimeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    position: 'absolute',
    top: 60,
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
  medName: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  medDosage: {
    fontSize: 15,
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 16,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  detailText: {
    fontSize: 13,
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
