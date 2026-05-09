import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useState, useEffect } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
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
import { scheduleAppointmentReminder } from '../../../shared/services/notifications.service';

export type AddAppointmentModalProps = {
  visible: boolean;
  onClose: () => void;
  onAppointmentAdded: (appointment: AppointmentData) => void;
  onAppointmentUpdated?: (appointment: AppointmentData) => void;
  initialData?: AppointmentData | null;
  theme: AppTheme;
};

export function AddAppointmentModal({
  visible,
  onClose,
  onAppointmentAdded,
  onAppointmentUpdated,
  initialData,
  theme,
}: Readonly<AddAppointmentModalProps>) {
  const [title, setTitle] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: -34.6037,
    longitude: -58.3816,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [selectedCoords, setSelectedCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [selectedPoiName, setSelectedPoiName] = useState('');

  const handleOpenMap = async () => {
    setMapVisible(true);
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMapRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setSelectedCoords({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    } catch (e) {
      console.log(e);
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleConfirmMap = async () => {
    setMapVisible(false);
    if (selectedPoiName) {
      setLocation(selectedPoiName);
      return;
    }
    
    if (!selectedCoords) return;
    
    setIsLoading(true);
    try {
      const geocode = await Location.reverseGeocodeAsync(selectedCoords);
      if (geocode.length > 0) {
        const place = geocode[0];
        if (place.name && place.name !== place.street && place.name !== place.streetNumber) {
          setLocation(place.name);
        } else {
          const address = [place.street, place.streetNumber].filter(Boolean).join(' ');
          setLocation(address || place.city || 'Ubicación seleccionada');
        }
      }
    } catch (e) {
      console.log(e);
    } finally {
      setIsLoading(false);
    }
  };


  const clearForm = () => {
    setTitle('');
    setDoctorName('');
    setDate('');
    setTime('');
    setLocation('');
    setNotes('');
  };

  useEffect(() => {
    if (visible && initialData) {
      setTitle(initialData.title);
      setDoctorName(initialData.doctorName);
      
      const parsed = new Date(initialData.scheduledAt);
      if (!Number.isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        setDate(`${yyyy}-${mm}-${dd}`);
        
        const hh = String(parsed.getHours()).padStart(2, '0');
        const min = String(parsed.getMinutes()).padStart(2, '0');
        setTime(`${hh}:${min}`);
      }
      setLocation(initialData.location || '');
      setNotes(initialData.notes || '');
    } else if (visible && !initialData) {
      clearForm();
    }
  }, [visible, initialData]);

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

      if (initialData) {
        const appointment = await appointmentsAPI.updateAppointment(initialData.id, session.accessToken, {
          title: title.trim(),
          doctorName: doctorName.trim(),
          scheduledAt,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        
        // Schedule notification
        void scheduleAppointmentReminder(appointment);
        
        onAppointmentUpdated?.(appointment);
        Alert.alert('Cita actualizada', 'La cita se actualizó correctamente.');
      } else {
        const appointment = await appointmentsAPI.createAppointment(session.accessToken, {
          title: title.trim(),
          doctorName: doctorName.trim(),
          scheduledAt,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        
        // Schedule notification
        void scheduleAppointmentReminder(appointment);
        
        onAppointmentAdded(appointment);
        Alert.alert('Cita creada', 'La cita se registro correctamente.');
      }

      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear la cita.';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }, [title, doctorName, date, time, location, notes, onAppointmentAdded, onClose]);

  const handleClose = () => {
    if (!isLoading) {
      Keyboard.dismiss();
      setDatePickerVisible(false);
      setTimePickerVisible(false);
      setMapVisible(false);
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
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{initialData ? 'Editar cita' : 'Nueva cita'}</Text>
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
                  <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Fecha*</Text>
                  <Pressable
                    onPress={() => setDatePickerVisible(true)}
                    disabled={isLoading}
                    style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder, flexDirection: 'row', alignItems: 'center' }]}
                  >
                    <MaterialCommunityIcons name="calendar" size={18} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 15, fontWeight: '500', color: date ? theme.colors.textPrimary : theme.colors.textMuted }}>
                      {date || 'Seleccionar'}
                    </Text>
                  </Pressable>
                </View>

                <View style={[styles.fieldGroup, styles.inlineField]}>
                  <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Hora*</Text>
                  <Pressable
                    onPress={() => setTimePickerVisible(true)}
                    disabled={isLoading}
                    style={[styles.input, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder, flexDirection: 'row', alignItems: 'center' }]}
                  >
                    <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 15, fontWeight: '500', color: time ? theme.colors.textPrimary : theme.colors.textMuted }}>
                      {time || 'Seleccionar'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Native Date Picker */}
              {datePickerVisible && (
                <DateTimePicker
                  value={date ? new Date(`${date}T12:00:00`) : new Date()}
                  mode="date"
                  display="default"
                  themeVariant={theme.mode}
                  textColor={Platform.OS === 'ios' ? theme.colors.textPrimary : undefined}
                  onChange={(event: DateTimePickerEvent, selected?: Date) => {
                    setDatePickerVisible(false);
                    if (selected) {
                      const yyyy = selected.getFullYear();
                      const mm = String(selected.getMonth() + 1).padStart(2, '0');
                      const dd = String(selected.getDate()).padStart(2, '0');
                      setDate(`${yyyy}-${mm}-${dd}`);
                    }
                  }}
                />
              )}

              {/* Native Time Picker */}
              {timePickerVisible && (
                <DateTimePicker
                  value={time ? (() => { const d = new Date(); const [h, m] = time.split(':'); d.setHours(Number(h), Number(m), 0, 0); return d; })() : new Date()}
                  mode="time"
                  is24Hour={true}
                  display="default"
                  themeVariant={theme.mode}
                  textColor={Platform.OS === 'ios' ? theme.colors.textPrimary : undefined}
                  onChange={(event: DateTimePickerEvent, selected?: Date) => {
                    setTimePickerVisible(false);
                    if (selected) {
                      const hh = String(selected.getHours()).padStart(2, '0');
                      const min = String(selected.getMinutes()).padStart(2, '0');
                      setTime(`${hh}:${min}`);
                    }
                  }}
                />
              )}

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.colors.textPrimary }]}>Centro de atencion (opcional)</Text>
                <View style={styles.locationContainer}>
                  <TextInput
                    style={[styles.input, styles.locationInput, { backgroundColor: theme.colors.surface, color: theme.colors.textPrimary, borderColor: theme.colors.surfaceBorder }]}
                    placeholder="Ej: Clinica Central"
                    placeholderTextColor={theme.colors.textMuted}
                    value={location}
                    onChangeText={setLocation}
                    editable={!isLoading}
                    maxLength={160}
                  />
                  <Pressable
                    style={[styles.mapButton, { backgroundColor: theme.colors.accentSecondary }]}
                    onPress={handleOpenMap}
                    disabled={isLoading}
                  >
                    <MaterialCommunityIcons name="map-marker-radius" size={24} color={theme.colors.buttonText} />
                  </Pressable>
                </View>
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
                    <Text style={[styles.submitButtonText, { color: theme.colors.buttonText }]}>{initialData ? 'Guardar' : 'Crear'}</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Map Modal */}
      <Modal visible={mapVisible} transparent animationType="slide" onRequestClose={() => setMapVisible(false)}>
        <View style={styles.mapOverlay}>
          <View style={[styles.mapContent, { backgroundColor: theme.colors.background }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Elegir ubicacion</Text>
              <Pressable onPress={() => setMapVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.mapWrapper}>
              <MapView
                style={styles.map}
                region={mapRegion}
                onRegionChangeComplete={(region, details) => {
                  setMapRegion(region);
                  setSelectedCoords({ latitude: region.latitude, longitude: region.longitude });
                  if (details?.isGesture) {
                    setSelectedPoiName('');
                  }
                }}
                showsUserLocation={true}
                showsPointsOfInterest={true}
                onPoiClick={(e) => {
                  const { coordinate, name } = e.nativeEvent;
                  setMapRegion({ ...mapRegion, latitude: coordinate.latitude, longitude: coordinate.longitude });
                  setSelectedCoords(coordinate);
                  setSelectedPoiName(name);
                }}
              />
              <View style={styles.mapPinOverlay} pointerEvents="none">
                <MaterialCommunityIcons name="map-marker" size={40} color={theme.colors.accentSecondary} style={{ marginTop: -20 }} />
              </View>
              
              <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: theme.colors.surface, padding: 12, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, flexDirection: 'row', alignItems: 'center' }}>
                <MaterialCommunityIcons name={selectedPoiName ? "hospital-building" : "map-marker-outline"} size={24} color={theme.colors.accentSecondary} style={{ marginRight: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: theme.colors.textMuted, fontWeight: '600' }}>{selectedPoiName ? 'Centro seleccionado' : 'Ubicación'}</Text>
                  <Text style={{ fontSize: 15, color: theme.colors.textPrimary, fontWeight: '700' }} numberOfLines={1}>{selectedPoiName || 'Ubicación en el mapa'}</Text>
                </View>
              </View>

              {isGettingLocation && (
                <View style={[StyleSheet.absoluteFill, styles.mapLoadingOverlay]}>
                  <ActivityIndicator size="large" color={theme.colors.accentSecondary} />
                  <Text style={[styles.label, { color: theme.colors.textPrimary, marginTop: 8 }]}>Buscando...</Text>
                </View>
              )}
            </View>

            <Pressable
              style={{
                marginTop: 16,
                backgroundColor: theme.colors.accentSecondary,
                paddingVertical: 14,
                paddingHorizontal: 32,
                borderRadius: 12,
                alignItems: 'center',
                alignSelf: 'center'
              }}
              onPress={handleConfirmMap}
            >
              <Text style={[styles.submitButtonText, { color: theme.colors.buttonText }]}>Confirmar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  locationContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  locationInput: {
    flex: 1,
  },
  mapButton: {
    width: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  mapContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 32,
    height: '80%',
  },
  mapWrapper: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapPinOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLoadingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
