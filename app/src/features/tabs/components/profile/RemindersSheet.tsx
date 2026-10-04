import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { AppButton, FieldShell, FormSheet, SelectableChip } from '../../../../shared/ui';
import {
  getAppointmentReminderLeadMinutes,
  getMedicationReminderLeadMinutes,
  registerForPushNotificationsAsync,
  rescheduleAppointmentsAfterLaunch,
  setAppointmentReminderLeadMinutes,
  setMedicationReminderLeadMinutes,
  syncMedicationAlarms,
} from '../../../../shared/services/notifications.service';
import { getStoredSession } from '../../../auth';
import { updateProfileOnBackend, type ProfileUser } from '../../../auth/services/auth.service';
import { fetchAppointments } from '../../services/appointments.service';
import { fetchMedications } from '../../services/medications.service';
import { ProfileNote } from './ProfileParts';

export const MEDICATION_LEAD_OPTIONS = [0, 5, 10, 15, 30, 60];
export const APPOINTMENT_LEAD_OPTIONS = [30, 60, 120, 1440];

export function formatLead(minutes: number) {
  if (minutes === 0) return 'Sin aviso previo';
  if (minutes < 60) return `${minutes} min antes`;
  if (minutes === 60) return '1 hora antes';
  if (minutes === 1440) return '1 día antes';
  return `${minutes / 60} horas antes`;
}

/** Con cuánta anticipación avisar antes de cada toma y de cada cita. */
export function RemindersSheet({
  theme,
  visible,
  onClose,
  onSaved,
}: Readonly<{
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  onSaved: (lead: { medication: number; appointment: number }, user?: ProfileUser) => void;
}>) {
  const [medicationLead, setMedicationLead] = useState(5);
  const [appointmentLead, setAppointmentLead] = useState(60);
  const [initial, setInitial] = useState({ medication: 5, appointment: 60 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void Promise.all([getMedicationReminderLeadMinutes(), getAppointmentReminderLeadMinutes()]).then(([medication, appointment]) => {
      setMedicationLead(medication);
      setAppointmentLead(appointment);
      setInitial({ medication, appointment });
    });
  }, [visible]);

  const save = async () => {
    if (medicationLead === initial.medication && appointmentLead === initial.appointment) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const permission = await registerForPushNotificationsAsync();
      if (permission !== 'granted') {
        Alert.alert('Notificaciones desactivadas', 'Actívalas en los ajustes del teléfono para recibir los avisos.');
        return;
      }
      await setMedicationReminderLeadMinutes(medicationLead);
      await setAppointmentReminderLeadMinutes(appointmentLead);

      let user: ProfileUser | undefined;
      const session = await getStoredSession();
      if (session?.accessToken) {
        user = (await updateProfileOnBackend({ notificationLeadMinutes: medicationLead }).catch(() => null))?.user;
        // Se reprograman los avisos ya puestos con la nueva anticipación.
        const [medications, appointments] = await Promise.all([
          fetchMedications(session.accessToken),
          fetchAppointments(session.accessToken),
        ]);
        await syncMedicationAlarms(medications, { force: true });
        await rescheduleAppointmentsAfterLaunch(appointments, { force: true });
      }
      onSaved({ medication: medicationLead, appointment: appointmentLead }, user);
      onClose();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title="Recordatorios"
      subtitle="Cuánto antes quieres un aviso, además del de la hora exacta."
      onClose={onClose}
      dismissDisabled={saving}
      footer={
        <>
          <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={onClose} disabled={saving} style={styles.flex} />
          <AppButton theme={theme} label="Guardar" icon="checkmark" onPress={() => void save()} loading={saving} style={styles.flexWide} />
        </>
      }
    >
      <FieldShell theme={theme} label="Medicamentos">
        <View style={styles.chips}>
          {MEDICATION_LEAD_OPTIONS.map((minutes) => (
            <SelectableChip key={minutes} theme={theme} label={formatLead(minutes)} selected={medicationLead === minutes} onPress={() => setMedicationLead(minutes)} />
          ))}
        </View>
      </FieldShell>
      <ProfileNote theme={theme} icon="alarm-light-outline" color={theme.colors.accentPrimary}>
        A la hora exacta de cada toma siempre suena la alarma completa. Esto solo agrega un aviso previo.
      </ProfileNote>

      <FieldShell theme={theme} label="Citas">
        <View style={styles.chips}>
          {APPOINTMENT_LEAD_OPTIONS.map((minutes) => (
            <SelectableChip key={minutes} theme={theme} label={formatLead(minutes)} selected={appointmentLead === minutes} onPress={() => setAppointmentLead(minutes)} />
          ))}
        </View>
      </FieldShell>
      <ProfileNote theme={theme} icon="calendar-clock" color={theme.colors.accentSecondary}>
        Para cada cita recibirás este aviso, otro a la hora y, al final del día, la pregunta de si asististe.
      </ProfileNote>
      <Text style={[styles.foot, { color: theme.colors.textMuted }]}>Al guardar se reprograman todos tus avisos.</Text>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foot: { fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
});
