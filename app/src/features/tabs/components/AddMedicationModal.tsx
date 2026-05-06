import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
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

export type AddMedicationModalProps = {
  visible: boolean;
  onClose: () => void;
  onMedicationAdded: (medication: MedicationData) => void;
  theme: AppTheme;
};

export function AddMedicationModal({
  visible,
  onClose,
  onMedicationAdded,
  theme,
}: Readonly<AddMedicationModalProps>) {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAddMedication = useCallback(async () => {
    if (!name.trim() || !dosage.trim() || !frequency.trim()) {
      Alert.alert('Campos requeridos', 'Por favor completa nombre, dosis y frecuencia.');
      return;
    }

    try {
      setIsLoading(true);
      const session = await getStoredSession();
      if (!session?.accessToken) {
        Alert.alert('Error', 'No autorizado.');
        return;
      }

      const medication = await medicationsAPI.createMedication(session.accessToken, {
        name: name.trim(),
        dosage: dosage.trim(),
        frequency: frequency.trim(),
        notes: notes.trim() || undefined,
      });

      onMedicationAdded(medication);
      setName('');
      setDosage('');
      setFrequency('');
      setNotes('');
      onClose();
      Alert.alert('Éxito', 'Medicamento agregado correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al agregar medicamento';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }, [name, dosage, frequency, notes, onMedicationAdded, onClose]);

  const handleClose = () => {
    if (!isLoading) {
      setName('');
      setDosage('');
      setFrequency('');
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
                Agregar Medicamento
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
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.surfaceBorder,
                    },
                  ]}
                  placeholder="Ej: 500mg"
                  placeholderTextColor={theme.colors.textMuted}
                  value={dosage}
                  onChangeText={setDosage}
                  editable={!isLoading}
                  maxLength={100}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                  Frecuencia*
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
                  placeholder="Ej: Cada 8 horas"
                  placeholderTextColor={theme.colors.textMuted}
                  value={frequency}
                  onChangeText={setFrequency}
                  editable={!isLoading}
                  maxLength={200}
                />
              </View>

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
                      Agregar
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
});
