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
  Keyboard,
} from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import * as medicationsAPI from '../services/medications.service';
import { getStoredSession } from '../../auth';
import type { MedicationData } from '../services/medications.service';
import { scheduleMedicationNotifications } from '../../../shared/services/notifications.service';

const DOSAGE_UNITS = ['mg', 'g', 'ml', 'gotas', 'comprimido'] as const;
const FREQUENCY_OPTIONS = [
  'Cada 4 horas',
  'Cada 6 horas',
  'Cada 8 horas',
  'Cada 12 horas',
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
  const [frequency, setFrequency] = useState('');
  const [firstDoseTime, setFirstDoseTime] = useState('');
  const [notes, setNotes] = useState('');
  const [unitModalVisible, setUnitModalVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [isCustomFrequency, setIsCustomFrequency] = useState(false);
  const [customFrequency, setCustomFrequency] = useState('');
  const [customIntervalHours, setCustomIntervalHours] = useState('');
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [endDatePickerVisible, setEndDatePickerVisible] = useState(false);
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
        setCustomIntervalHours('');
        setCustomEndDate(null);
      } else {
        setFrequency('');
        setIsCustomFrequency(true);
        setCustomFrequency(initialData.frequency);
        setCustomIntervalHours((initialData as any).customIntervalHours?.toString() || '6');
        setCustomEndDate((initialData as any).customEndDate ? new Date((initialData as any).customEndDate) : null);
      }
      
      setFirstDoseTime(initialData.times?.[0] || '');
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
      setCustomIntervalHours('6');
      setCustomEndDate(null);
    }
  }, [visible, initialData]);

  const calculateTimes = (startTime: string, freqStr: string, intervalHours?: number, endDate?: Date): string[] => {
    if (!startTime) return [];
    const [h, m] = startTime.split(':').map(Number);
    const times: string[] = [startTime];
    
    let interval = intervalHours || 0;
    
    // Si no hay intervalo personalizado, usar los predefinidos
    if (!intervalHours) {
      const freq = freqStr.toLowerCase();
      
      if (freq.includes('4 horas')) interval = 4;
      else if (freq.includes('6 horas')) interval = 6;
      else if (freq.includes('8 horas')) interval = 8;
      else if (freq.includes('12 horas') || freq.includes('dos veces')) interval = 12;
      else if (freq.includes('24 horas') || freq.includes('una vez')) interval = 24;
    }
    
    if (interval > 0 && interval < 24) {
      let nextH = h;
      const count = Math.floor(24 / interval);
      for (let i = 1; i < count; i++) {
        nextH = (nextH + interval) % 24;
        const timeStr = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (!times.includes(timeStr)) {
          times.push(timeStr);
        }
      }
    }
    
    return times.sort((a, b) => a.localeCompare(b));
  };

  const validateFormData = (): boolean => {
    if (!name.trim() || !dosageValue.trim() || (!frequency.trim() && !customFrequency.trim())) {
      Alert.alert('Campos requeridos', 'Por favor completa nombre, dosis y frecuencia.');
      return false;
    }

    if (!firstDoseTime) {
      Alert.alert('Primera toma requerida', 'Selecciona la hora de la primera toma.');
      return false;
    }

    if (isCustomFrequency) {
      const interval = customIntervalHours ? Number.parseInt(customIntervalHours, 10) : 0;
      if (Number.isNaN(interval) || interval < 1 || interval > 23) {
        Alert.alert('Intervalo inválido', 'El intervalo debe estar entre 1 y 23 horas.');
        return false;
      }
      if (!customEndDate) {
        Alert.alert('Fecha límite requerida', 'Por favor selecciona la fecha límite para las alarmas.');
        return false;
      }
    }

    return true;
  };

  const handleAddMedication = useCallback(async () => {
    if (!validateFormData()) {
      return;
    }

    try {
      setIsLoading(true);
      const session = await getStoredSession();
      if (!session?.accessToken) {
        Alert.alert('Error', 'No autorizado.');
        return;
      }

      const finalFreq = isCustomFrequency ? customFrequency.trim() : frequency;
      const intervalHours = isCustomFrequency && customIntervalHours ? Number.parseInt(customIntervalHours, 10) : undefined;
      const calculatedTimes = calculateTimes(firstDoseTime, finalFreq, intervalHours, customEndDate || undefined);

      const payload: any = {
        name: name.trim(),
        dosage: `${dosageValue.trim()} ${dosageUnit}`,
        frequency: finalFreq,
        times: calculatedTimes,
        notes: notes.trim() || undefined,
      };

      // Agregar campos personalizados si aplica
      if (isCustomFrequency && customIntervalHours && customEndDate) {
        payload.customIntervalHours = Number.parseInt(customIntervalHours, 10);
        payload.customEndDate = customEndDate.toISOString();
      }

      if (initialData) {
        const medication = await medicationsAPI.updateMedication(initialData.id, session.accessToken, payload);
        void scheduleMedicationNotifications(medication);
        onMedicationUpdated?.(medication);
        Alert.alert('Éxito', 'Alarma actualizada correctamente.');
      } else {
        const medication = await medicationsAPI.createMedication(session.accessToken, payload);
        void scheduleMedicationNotifications(medication);
        onMedicationAdded(medication);
        Alert.alert('Éxito', 'Alarmas programadas correctamente.');
      }

      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al procesar';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }, [name, dosageValue, dosageUnit, frequency, customFrequency, isCustomFrequency, firstDoseTime, customIntervalHours, customEndDate, initialData, onMedicationAdded, onMedicationUpdated, onClose]);

  const handleClose = () => {
    if (!isLoading) {
      Keyboard.dismiss();
      onClose();
    }
  };

  const incrementInterval = () => {
    const current = customIntervalHours ? Number.parseInt(customIntervalHours, 10) : 1;
    if (current < 23) {
      setCustomIntervalHours(String(current + 1));
    }
  };

  const decrementInterval = () => {
    const current = customIntervalHours ? Number.parseInt(customIntervalHours, 10) : 1;
    if (current > 1) {
      setCustomIntervalHours(String(current - 1));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
                {initialData ? 'Editar Alarma' : 'Programar Alarmas'}
              </Text>
              <Pressable onPress={handleClose} disabled={isLoading}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Nombre del medicamento*</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                  placeholder="Ej: Paracetamol"
                  placeholderTextColor={theme.colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  editable={!isLoading}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Dosis*</Text>
                <View style={styles.dosageRow}>
                  <TextInput
                    style={[styles.input, styles.dosageValueInput, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                    placeholder="Ej: 500"
                    placeholderTextColor={theme.colors.textMuted}
                    value={dosageValue}
                    onChangeText={setDosageValue}
                    keyboardType="decimal-pad"
                  />
                  <Pressable
                    onPress={() => setUnitModalVisible(true)}
                    style={[styles.unitDropdownButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
                  >
                    <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{dosageUnit}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Frecuencia*</Text>
                <View style={styles.optionList}>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => { setIsCustomFrequency(false); setFrequency(option); setCustomIntervalHours(''); setCustomEndDate(null); }}
                      style={[styles.optionChip, { borderColor: frequency === option && !isCustomFrequency ? theme.colors.accentPrimary : theme.colors.surfaceBorder, backgroundColor: frequency === option && !isCustomFrequency ? `${theme.colors.accentPrimary}15` : 'transparent' }]}
                    >
                      <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>{option}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={() => setIsCustomFrequency(true)}
                    style={[styles.optionChip, { borderColor: isCustomFrequency ? theme.colors.accentPrimary : theme.colors.surfaceBorder, backgroundColor: isCustomFrequency ? `${theme.colors.accentPrimary}15` : 'transparent' }]}
                  >
                    <Text style={[styles.optionChipText, { color: theme.colors.textPrimary }]}>Personalizado</Text>
                  </Pressable>
                </View>
                {isCustomFrequency && (
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'flex-start' }}>
                    {/* Selector de intervalo a la izquierda */}
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text style={[styles.label, { color: theme.colors.textPrimary, fontSize: 12 }]}>Cada: (horas)</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.surfaceBorder, paddingVertical: 4, paddingHorizontal: 8 }}>
                        <Pressable
                          onPress={decrementInterval}
                          disabled={isLoading || Number.parseInt(customIntervalHours || '1', 10) <= 1}
                          style={{ padding: 8 }}
                        >
                          <MaterialCommunityIcons
                            name="minus"
                            size={20}
                            color={Number.parseInt(customIntervalHours || '1', 10) <= 1 ? theme.colors.textMuted : theme.colors.accentPrimary}
                          />
                        </Pressable>
                        <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '900', color: theme.colors.textPrimary, minWidth: 40 }}>
                          {customIntervalHours || '1'}
                        </Text>
                        <Pressable
                          onPress={incrementInterval}
                          disabled={isLoading || Number.parseInt(customIntervalHours || '1', 10) >= 23}
                          style={{ padding: 8 }}
                        >
                          <MaterialCommunityIcons
                            name="plus"
                            size={20}
                            color={Number.parseInt(customIntervalHours || '1', 10) >= 23 ? theme.colors.textMuted : theme.colors.accentPrimary}
                          />
                        </Pressable>
                      </View>
                    </View>
                    {/* Date picker a la derecha */}
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text style={[styles.label, { color: theme.colors.textPrimary, fontSize: 12 }]}>Hasta: (fecha)</Text>
                      <Pressable
                        onPress={() => setEndDatePickerVisible(true)}
                        style={[styles.timeTriggerButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder, paddingHorizontal: 12, paddingVertical: 12 }]}
                      >
                        <View style={styles.timeTriggerContent}>
                          <MaterialCommunityIcons name="calendar-outline" size={18} color={theme.colors.accentPrimary} />
                          <Text style={[styles.timeTriggerText, { color: customEndDate ? theme.colors.textPrimary : theme.colors.textMuted, fontSize: 13 }]}>
                            {customEndDate ? customEndDate.toLocaleDateString('es-ES') : 'Fecha'}
                          </Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Primera toma*</Text>
                <Pressable
                  onPress={() => setTimePickerVisible(true)}
                  style={[styles.timeTriggerButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
                >
                  <View style={styles.timeTriggerContent}>
                    <MaterialCommunityIcons name="clock-outline" size={20} color={theme.colors.accentPrimary} />
                    <Text style={[styles.timeTriggerText, { color: firstDoseTime ? theme.colors.textPrimary : theme.colors.textMuted }]}>
                      {firstDoseTime || 'Seleccionar hora'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
                </Pressable>
                <Text style={[styles.helperText, { color: theme.colors.textMuted }]}>
                  Las alarmas posteriores se calcularán automáticamente según la frecuencia.
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Notas (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.noteInput, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                  placeholder="Ej: Evitar lácteos..."
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.actions}>
                <Pressable style={[styles.button, styles.cancelButton, { borderColor: theme.colors.surfaceBorder }]} onPress={handleClose}>
                  <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>Cancelar</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.submitButton, { backgroundColor: theme.colors.accentPrimary }]} onPress={handleAddMedication} disabled={isLoading}>
                  {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>{initialData ? 'Guardar' : 'Activar Alarmas'}</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={unitModalVisible} transparent animationType="fade">
        <Pressable style={styles.pickerOverlay} onPress={() => setUnitModalVisible(false)}>
          <View style={[styles.pickerContent, { backgroundColor: theme.colors.background }]}>
            {DOSAGE_UNITS.map((u) => (
              <Pressable key={u} onPress={() => { setDosageUnit(u); setUnitModalVisible(false); }} style={styles.pickerItem}>
                <Text style={{ color: theme.colors.textPrimary, fontSize: 16, fontWeight: '600' }}>{u}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {timePickerVisible && (
        <DateTimePicker
          value={(() => {
            if (firstDoseTime) {
              const [h, m] = firstDoseTime.split(':').map(Number);
              const d = new Date(); d.setHours(h, m, 0, 0); return d;
            }
            return new Date();
          })()}
          mode="time"
          is24Hour={true}
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setTimePickerVisible(false);
            if (selected) {
              const hh = String(selected.getHours()).padStart(2, '0');
              const mm = String(selected.getMinutes()).padStart(2, '0');
              setFirstDoseTime(`${hh}:${mm}`);
            }
          }}
        />
      )}

      {endDatePickerVisible && (
        <DateTimePicker
          value={customEndDate || new Date()}
          mode="date"
          is24Hour={true}
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setEndDatePickerVisible(false);
            if (selected) {
              setCustomEndDate(selected);
            }
          }}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  content: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  scrollContent: { gap: 20 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 16, padding: 14, fontSize: 16, fontWeight: '500' },
  dosageRow: { flexDirection: 'row', gap: 12 },
  dosageValueInput: { flex: 1 },
  unitDropdownButton: { width: 120, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  optionChipText: { fontSize: 13, fontWeight: '700' },
  timeTriggerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderWidth: 1, borderRadius: 16 },
  timeTriggerContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeTriggerText: { fontSize: 16, fontWeight: '800' },
  helperText: { fontSize: 12, fontStyle: 'italic', paddingLeft: 4 },
  noteInput: { textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { borderWidth: 1 },
  submitButton: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  pickerContent: { width: '80%', borderRadius: 24, padding: 20 },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
});
