import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState, useEffect } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import * as medicationsAPI from '../services/medications.service';
import { getStoredSession } from '../../auth';
import type { MedicationData } from '../services/medications.service';

const DOSAGE_UNITS = ['mg', 'g', 'ml', 'gotas', 'comprimido'] as const;
// Reorder to surface most popular choices first and add a "Personalizado" option
const FREQUENCY_OPTIONS = [
  'Cada 8 horas',
  'Cada 12 horas',
  'Cada 24 horas',
  'Una vez al dia',
  'Dos veces al dia',
] as const;

export type AddMedicationModalProps = {
  visible: boolean;
  onClose: () => void;
  onMedicationAdded: (medication: MedicationData) => void;
  onMedicationUpdated?: (medication: MedicationData) => void;
  initialData?: MedicationData | null;
  theme: AppTheme;
};

export function AddMedicationModal({
  visible,
  onClose,
  onMedicationAdded,
  onMedicationUpdated,
  initialData,
  theme,
}: Readonly<AddMedicationModalProps>) {
  const [name, setName] = useState('');
  const [dosageValue, setDosageValue] = useState('');
  const [dosageUnit, setDosageUnit] = useState<(typeof DOSAGE_UNITS)[number]>('mg');
  const [frequency, setFrequency] = useState<(typeof FREQUENCY_OPTIONS)[number] | ''>('');
  const [firstDoseTime, setFirstDoseTime] = useState<string | ''>('');
  const [notes, setNotes] = useState('');
  const [unitModalVisible, setUnitModalVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timeHour, setTimeHour] = useState<number>(8);
  const [timeMinute, setTimeMinute] = useState<number>(0);
  const [isCustomFrequency, setIsCustomFrequency] = useState(false);
  const [customFrequency, setCustomFrequency] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (visible && initialData) {
      setName(initialData.name);
      const [val, unit] = initialData.dosage.split(' ');
      setDosageValue(val || '');
      setDosageUnit((unit as any) || 'mg');
      
      if (FREQUENCY_OPTIONS.includes(initialData.frequency as any)) {
        setFrequency(initialData.frequency as any);
        setIsCustomFrequency(false);
        setCustomFrequency('');
      } else {
        setFrequency('');
        setIsCustomFrequency(true);
        setCustomFrequency(initialData.frequency);
      }
      
      setFirstDoseTime(initialData.firstDoseTime || '');
      if (initialData.firstDoseTime) {
        const [h, m] = initialData.firstDoseTime.split(':');
        setTimeHour(Number(h));
        setTimeMinute(Number(m));
      }
      setNotes(initialData.notes || '');
    } else if (visible && !initialData) {
      setName('');
      setDosageValue('');
      setDosageUnit('mg');
      setFrequency('');
      setFirstDoseTime('');
      setNotes('');
      setIsCustomFrequency(false);
      setCustomFrequency('');
    }
  }, [visible, initialData]);

  const handleAddMedication = useCallback(async () => {
    if (!name.trim() || !dosageValue.trim() || !frequency.trim()) {
      Alert.alert('Campos requeridos', 'Por favor completa nombre, dosis y frecuencia.');
      return;
    }

    const dosageAsNumber = Number(dosageValue.replace(',', '.'));
    if (!Number.isFinite(dosageAsNumber) || dosageAsNumber <= 0) {
      Alert.alert('Dosis invalida', 'Ingresa un valor numerico valido para la dosis.');
      return;
    }

    if (!firstDoseTime) {
      Alert.alert('Primera toma requerida', 'Selecciona la hora de la primera toma.');
      return;
    }

    try {
      setIsLoading(true);
      const session = await getStoredSession();
      if (!session?.accessToken) {
        Alert.alert('Error', 'No autorizado.');
        return;
      }

      if (initialData) {
        const medication = await medicationsAPI.updateMedication(initialData.id, session.accessToken, {
          name: name.trim(),
          dosage: `${dosageValue.trim()} ${dosageUnit}`,
          frequency: isCustomFrequency ? customFrequency.trim() || frequency : frequency,
          firstDoseTime,
          notes: notes.trim() || undefined,
        });
        onMedicationUpdated?.(medication);
        Alert.alert('Éxito', 'Medicamento actualizado correctamente.');
      } else {
        const medication = await medicationsAPI.createMedication(session.accessToken, {
          name: name.trim(),
          dosage: `${dosageValue.trim()} ${dosageUnit}`,
          frequency: isCustomFrequency ? customFrequency.trim() || frequency : frequency,
          firstDoseTime,
          notes: notes.trim() || undefined,
        });
        onMedicationAdded(medication);
        Alert.alert('Éxito', 'Medicamento agregado correctamente.');
      }

      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al agregar medicamento';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }, [name, dosageValue, dosageUnit, frequency, firstDoseTime, notes, onMedicationAdded, onClose]);

  const handleClose = () => {
    if (!isLoading) {
      setName('');
      setDosageValue('');
      setDosageUnit('mg');
      setFrequency('');
      setFirstDoseTime('');
      setNotes('');
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View
            style={[
              styles.content,
              { backgroundColor: theme.colors.background },
            ]}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
                {initialData ? 'Editar Medicamento' : 'Agregar Medicamento'}
              </Text>
              <Pressable onPress={handleClose} disabled={isLoading}>
                <MaterialCommunityIcons
                  name="close"
                  size={24}
                  color={theme.colors.textPrimary}
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                  Nombre del medicamento*
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.surfaceBorder,
                    },
                  ]}
                  placeholder="Ej: Paracetamol"
                  placeholderTextColor={theme.colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  editable={!isLoading}
                  maxLength={100}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                  Dosis*
                </Text>
                <View style={styles.dosageRow}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.dosageValueInput,
                      {
                        backgroundColor: theme.colors.surface,
                        color: theme.colors.textPrimary,
                        borderColor: theme.colors.surfaceBorder,
                      },
                    ]}
                    placeholder="Ej: 500"
                    placeholderTextColor={theme.colors.textMuted}
                    value={dosageValue}
                    onChangeText={setDosageValue}
                    editable={!isLoading}
                    keyboardType="decimal-pad"
                    maxLength={8}
                  />

                  <View style={styles.unitDropdownContainer}>
                    <Pressable
                      onPress={() => setUnitModalVisible(true)}
                      disabled={isLoading}
                      style={[
                        styles.unitDropdownButton,
                        { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
                      ]}
                    >
                      <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>{dosageUnit}</Text>
                      <MaterialCommunityIcons name="chevron-down" size={18} color={theme.colors.textMuted} />
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                  Frecuencia*
                </Text>
                <View style={styles.optionList}>
                  {FREQUENCY_OPTIONS.map((option) => {
                    const selected = frequency === option && !isCustomFrequency;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setIsCustomFrequency(false);
                          setCustomFrequency('');
                          setFrequency(option);
                        }}
                        disabled={isLoading}
                        style={[
                          styles.optionChip,
                          {
                            borderColor: selected ? theme.colors.accentPrimary : theme.colors.surfaceBorder,
                            backgroundColor: selected ? `${theme.colors.accentPrimary}22` : theme.colors.surface,
                          },
                        ]}
                      >
                        <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>{option}</Text>
                      </Pressable>
                    );
                  })}

                  <Pressable
                    onPress={() => {
                      setIsCustomFrequency(true);
                      setFrequency('');
                    }}
                    disabled={isLoading}
                    style={[
                      styles.optionChip,
                      {
                        borderColor: isCustomFrequency ? theme.colors.accentPrimary : theme.colors.surfaceBorder,
                        backgroundColor: isCustomFrequency ? `${theme.colors.accentPrimary}22` : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>Personalizado</Text>
                  </Pressable>
                </View>

                {isCustomFrequency && (
                  <TextInput
                    style={[
                      styles.input,
                      { marginTop: 8, backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder, color: theme.colors.textPrimary },
                    ]}
                    placeholder="Ej: 1 al dia por 5 días"
                    placeholderTextColor={theme.colors.textMuted}
                    value={customFrequency}
                    onChangeText={setCustomFrequency}
                    editable={!isLoading}
                    maxLength={60}
                  />
                )}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}> 
                  Primera toma*
                </Text>
                <Pressable
                  onPress={() => setTimePickerVisible(true)}
                  disabled={isLoading}
                  style={[
                    styles.timeTriggerButton,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.surfaceBorder,
                    },
                  ]}
                >
                  <View style={styles.timeTriggerContent}>
                    <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.textMuted} />
                    <Text style={[styles.timeTriggerText, { color: firstDoseTime ? theme.colors.textPrimary : theme.colors.textMuted }]}>
                      {firstDoseTime || 'Seleccionar hora'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
                </Pressable>
              </View>

              {/* Unit selection modal */}
              <Modal visible={unitModalVisible} transparent animationType="fade" onRequestClose={() => setUnitModalVisible(false)}>
                <View style={styles.pickerOverlay}>
                  <View style={[styles.pickerContent, { backgroundColor: theme.colors.background }]}>
                    <Text style={[styles.title, { color: theme.colors.textPrimary, marginBottom: 12 }]}>Selecciona unidad</Text>
                    <ScrollView>
                      {DOSAGE_UNITS.map((u) => (
                        <Pressable
                          key={u}
                          onPress={() => {
                            setDosageUnit(u);
                            setUnitModalVisible(false);
                          }}
                          style={[styles.pickerItem, { borderColor: theme.colors.surfaceBorder }]}
                        >
                          <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{u}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Pressable onPress={() => setUnitModalVisible(false)} style={[styles.button, { marginTop: 12, backgroundColor: theme.colors.surface }]}> 
                      <Text style={{ color: theme.colors.textPrimary }}>Cerrar</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>

              {/* Native time picker (react-native-datetimepicker) */}
              {timePickerVisible && (
                <DateTimePicker
                  value={(() => { const d = new Date(); d.setHours(timeHour, timeMinute, 0, 0); return d; })()}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant={theme.mode}
                  textColor={Platform.OS === 'ios' ? theme.colors.textPrimary : undefined}
                  onChange={(event: DateTimePickerEvent, selected?: Date | undefined) => {
                    if (Platform.OS === 'android') setTimePickerVisible(false);
                    if (selected) {
                      const hh = String(selected.getHours()).padStart(2, '0');
                      const mm = String(selected.getMinutes()).padStart(2, '0');
                      setFirstDoseTime(`${hh}:${mm}`);
                      setTimeHour(selected.getHours());
                      setTimeMinute(selected.getMinutes());
                    }
                  }}
                />
              )}

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                  Notas (opcional)
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.noteInput,
                    {
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.surfaceBorder,
                    },
                  ]}
                  placeholder="Ej: Tomar con comida"
                  placeholderTextColor={theme.colors.textMuted}
                  value={notes}
                  onChangeText={setNotes}
                  editable={!isLoading}
                  maxLength={500}
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.actions}>
                <Pressable
                  style={[
                    styles.button,
                    styles.cancelButton,
                    { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
                    isLoading && { opacity: 0.5 },
                  ]}
                  onPress={handleClose}
                  disabled={isLoading}
                >
                  <Text style={[styles.cancelButtonText, { color: theme.colors.textPrimary }]}>
                    Cancelar
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.button,
                    styles.submitButton,
                    { backgroundColor: theme.colors.accentPrimary },
                    isLoading && { opacity: 0.7 },
                  ]}
                  onPress={handleAddMedication}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={theme.colors.buttonText} size="small" />
                  ) : (
                    <Text style={[styles.submitButtonText, { color: theme.colors.buttonText }]}>
                      {initialData ? 'Guardar' : 'Agregar'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  scrollContent: {
    gap: 16,
  },
  fieldGroup: {
    gap: 8,
  },
  dosageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dosageValueInput: {
    flex: 1,
  },
  unitList: {
    width: 118,
    gap: 6,
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  noteInput: {
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  submitButton: {
    flexDirection: 'row',
    gap: 8,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  unitDropdownContainer: {
    width: 118,
    justifyContent: 'center',
  },
  unitDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)'.replace('undefined',''),
  },
  pickerContent: {
    width: '92%',
    borderRadius: 14,
    padding: 14,
    maxHeight: '80%',
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
  },
  timeTriggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  timeTriggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeTriggerText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
