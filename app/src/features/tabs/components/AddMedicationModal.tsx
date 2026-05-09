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
  const [times, setTimes] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [unitModalVisible, setUnitModalVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
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
      
      setTimes(initialData.times || []);
      setNotes(initialData.notes || '');
    } else if (visible && !initialData) {
      setName('');
      setDosageValue('');
      setDosageUnit('mg');
      setFrequency('');
      setTimes([]);
      setNotes('');
      setIsCustomFrequency(false);
      setCustomFrequency('');
    }
  }, [visible, initialData]);

  const handleAddMedication = useCallback(async () => {
    if (!name.trim() || !dosageValue.trim() || !frequency.trim() && !customFrequency.trim()) {
      Alert.alert('Campos requeridos', 'Por favor completa nombre, dosis y frecuencia.');
      return;
    }

    if (times.length === 0) {
      Alert.alert('Horarios requeridos', 'Debes configurar al menos un horario para la alarma.');
      return;
    }

    try {
      setIsLoading(true);
      const session = await getStoredSession();
      if (!session?.accessToken) {
        Alert.alert('Error', 'No autorizado.');
        return;
      }

      const payload = {
        name: name.trim(),
        dosage: `${dosageValue.trim()} ${dosageUnit}`,
        frequency: isCustomFrequency ? customFrequency.trim() : frequency,
        times,
        notes: notes.trim() || undefined,
      };

      if (initialData) {
        const medication = await medicationsAPI.updateMedication(initialData.id, session.accessToken, payload);
        void scheduleMedicationNotifications(medication);
        onMedicationUpdated?.(medication);
        Alert.alert('Éxito', 'Medicamento actualizado correctamente.');
      } else {
        const medication = await medicationsAPI.createMedication(session.accessToken, payload);
        void scheduleMedicationNotifications(medication);
        onMedicationAdded(medication);
        Alert.alert('Éxito', 'Medicamento agregado correctamente.');
      }

      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al procesar';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }, [name, dosageValue, dosageUnit, frequency, customFrequency, isCustomFrequency, times, initialData, onMedicationAdded, onMedicationUpdated, onClose]);

  const removeTime = (index: number) => {
    setTimes((current) => current.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    if (!isLoading) {
      Keyboard.dismiss();
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
                {initialData ? 'Editar Alarma' : 'Nueva Alarma de Medicación'}
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
                  placeholder="Ej: Ibuprofeno"
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
                    placeholder="Ej: 400"
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
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Frecuencia y Repeticiones*</Text>
                <View style={styles.optionList}>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => { setIsCustomFrequency(false); setFrequency(option); }}
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
                  <TextInput
                    style={[styles.input, { marginTop: 8, backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder, color: theme.colors.textPrimary }]}
                    placeholder="Ej: Cada 4 horas por 3 días"
                    value={customFrequency}
                    onChangeText={setCustomFrequency}
                  />
                )}
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Horarios de Alarma*</Text>
                <View style={styles.timesContainer}>
                  {times.map((time, index) => (
                    <View key={index} style={[styles.timeItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
                      <Text style={[styles.timeText, { color: theme.colors.textPrimary }]}>{time}</Text>
                      <Pressable onPress={() => removeTime(index)}>
                        <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.accentTertiary} />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => setTimePickerVisible(true)}
                    style={[styles.addTimeButton, { backgroundColor: `${theme.colors.accentPrimary}10`, borderColor: theme.colors.accentPrimary }]}
                  >
                    <MaterialCommunityIcons name="plus" size={20} color={theme.colors.accentPrimary} />
                    <Text style={{ color: theme.colors.accentPrimary, fontWeight: '800' }}>Añadir horario</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Notas (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.noteInput, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                  placeholder="Instrucciones adicionales..."
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
                  {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>{initialData ? 'Guardar' : 'Activar Alarma'}</Text>}
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
          value={new Date()}
          mode="time"
          is24Hour={true}
          onChange={(event: DateTimePickerEvent, selected?: Date) => {
            setTimePickerVisible(false);
            if (selected) {
              const hh = String(selected.getHours()).padStart(2, '0');
              const mm = String(selected.getMinutes()).padStart(2, '0');
              const newTime = `${hh}:${mm}`;
              if (!times.includes(newTime)) {
                setTimes((curr) => [...curr, newTime].sort());
              }
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
  timesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  timeText: { fontSize: 15, fontWeight: '800' },
  addTimeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  noteInput: { textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  button: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cancelButton: { borderWidth: 1 },
  submitButton: { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  pickerContent: { width: '80%', borderRadius: 24, padding: 20 },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
});
