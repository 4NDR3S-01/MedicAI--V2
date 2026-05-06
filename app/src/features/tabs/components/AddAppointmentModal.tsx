import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getStoredSession } from '../../auth';
import type { AppTheme } from '../../../shared/theme';
import type { AppointmentData } from '../services/appointments.service';
import * as appointmentsAPI from '../services/appointments.service';

export type AddAppointmentModalProps = {
  visible: boolean;
  onClose: () => void;
  onAppointmentAdded: (appointment: AppointmentData) => void;
  theme: AppTheme;
};

export function AddAppointmentModal({
  visible,
  onClose,
  onAppointmentAdded,
  theme,
}: Readonly<AddAppointmentModalProps>) {
  const [title, setTitle] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const clearForm = () => {
    setTitle('');
    setDoctorName('');
    setDate('');
    setTime('');
    setLocation('');
    setNotes('');
  };

  const buildIsoDateTime = () => {
    const normalizedDate = date.trim();
    const normalizedTime = time.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return null;
    }

    if (!/^\d{2}:\d{2}$/.test(normalizedTime)) {
      return null;
    }

    const parsed = new Date(`${normalizedDate}T${normalizedTime}:00`);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  };

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !doctorName.trim() || !date.trim() || !time.trim()) {
      Alert.alert('Campos requeridos', 'Completa titulo, profesional, fecha y hora.');
      return;
    }

    const scheduledAt = buildIsoDateTime();
    if (!scheduledAt) {
      Alert.alert('Fecha u hora invalida', 'Usa formato YYYY-MM-DD para fecha y HH:mm para hora.');
      return;
    }

    try {
      setIsLoading(true);
      const session = await getStoredSession();
      if (!session?.accessToken) {
        Alert.alert('Error', 'No autorizado.');
        return;
      }

      const appointment = await appointmentsAPI.createAppointment(session.accessToken, {
        title: title.trim(),
        doctorName: doctorName.trim(),
        scheduledAt,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      onAppointmentAdded(appointment);
      clearForm();
      onClose();
      Alert.alert('Cita creada', 'La cita se registro correctamente.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear la cita.';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }, [title, doctorName, date, time, location, notes, onAppointmentAdded, onClose]);

  const handleClose = () => {
    if (!isLoading) {
      clearForm();
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.content, { backgroundColor: theme.colors.background }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Nueva cita</Text>
              <Pressable onPress={handleClose} disabled={isLoading}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Titulo*</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                  placeholder="Ej: Control cardiologico"
                  placeholderTextColor={theme.colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  editable={!isLoading}
                  maxLength={120}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Profesional*</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                  placeholder="Ej: Dr. Perez"
                  placeholderTextColor={theme.colors.textMuted}
                  value={doctorName}
                  onChangeText={setDoctorName}
                  editable={!isLoading}
                  maxLength={120}
                />
              </View>

              <View style={styles.inlineFields}>
                <View style={[styles.fieldGroup, styles.inlineField]}>
                  <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Fecha* (YYYY-MM-DD)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                    placeholder="2026-05-20"
                    placeholderTextColor={theme.colors.textMuted}
                    value={date}
                    onChangeText={setDate}
                    editable={!isLoading}
                    maxLength={10}
                  />
                </View>

                <View style={[styles.fieldGroup, styles.inlineField]}>
                  <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Hora* (HH:mm)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                    placeholder="14:30"
                    placeholderTextColor={theme.colors.textMuted}
                    value={time}
                    onChangeText={setTime}
                    editable={!isLoading}
                    maxLength={5}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Ubicacion (opcional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                  placeholder="Ej: Clinica Central"
                  placeholderTextColor={theme.colors.textMuted}
                  value={location}
                  onChangeText={setLocation}
                  editable={!isLoading}
                  maxLength={160}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Notas (opcional)</Text>
                <TextInput
                  style={[styles.input, styles.noteInput, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                  placeholder="Indicaciones o motivo de consulta"
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
                  style={[styles.button, styles.cancelButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }, isLoading && { opacity: 0.5 }]}
                  onPress={handleClose}
                  disabled={isLoading}
                >
                  <Text style={[styles.cancelButtonText, { color: theme.colors.textPrimary }]}>Cancelar</Text>
                </Pressable>

                <Pressable
                  style={[styles.button, styles.submitButton, { backgroundColor: theme.colors.accentSecondary }, isLoading && { opacity: 0.7 }]}
                  onPress={handleCreate}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color={theme.colors.buttonText} size="small" />
                  ) : (
                    <Text style={[styles.submitButtonText, { color: theme.colors.buttonText }]}>Guardar</Text>
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
  inlineFields: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineField: {
    flex: 1,
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
