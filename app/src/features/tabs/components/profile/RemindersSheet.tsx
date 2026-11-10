import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { AppButton, FieldShell, FormSheet, PressableScale } from '../../../../shared/ui';
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
        <LeadStepper theme={theme} options={MEDICATION_LEAD_OPTIONS} value={medicationLead} onChange={setMedicationLead} />
        <Text style={[styles.help, { color: theme.colors.textMuted }]}>A la hora exacta siempre suena la alarma completa.</Text>
      </FieldShell>

      <FieldShell theme={theme} label="Citas">
        <LeadStepper theme={theme} options={APPOINTMENT_LEAD_OPTIONS} value={appointmentLead} onChange={setAppointmentLead} />
        <Text style={[styles.help, { color: theme.colors.textMuted }]}>
          También te avisamos a la hora y luego te preguntamos si asististe.
        </Text>
      </FieldShell>
    </FormSheet>
  );
}

/** − 5 min antes + : recorre las opciones permitidas. */
function LeadStepper({
  theme,
  options,
  value,
  onChange,
}: Readonly<{ theme: AppTheme; options: number[]; value: number; onChange: (minutes: number) => void }>) {
  const index = Math.max(0, options.indexOf(value));
  const button = (icon: 'remove' | 'add', next: number, label: string) => {
    const disabled = next < 0 || next >= options.length;
    return (
      <PressableScale
        onPress={() => !disabled && onChange(options[next])}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.stepButton, { backgroundColor: `${theme.colors.accentPrimary}14`, opacity: disabled ? 0.35 : 1 }]}
      >
        <Ionicons name={icon} size={22} color={theme.colors.accentPrimaryText} />
      </PressableScale>
    );
  };
  return (
    <View style={[styles.stepper, { borderColor: theme.colors.inputBorder, backgroundColor: theme.colors.inputBackground }]}>
      {button('remove', index - 1, 'Menos tiempo')}
      <Text style={[styles.stepValue, { color: theme.colors.textPrimary }]} accessibilityLiveRegion="polite">
        {formatLead(options[index])}
      </Text>
      {button('add', index + 1, 'Más tiempo')}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  help: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 6, gap: 8 },
  stepButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepValue: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
});
