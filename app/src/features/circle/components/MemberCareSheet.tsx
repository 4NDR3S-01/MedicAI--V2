import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Animated, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet, useSwapAnimation } from '../../../shared/ui';
import { getStoredSession } from '../../auth';
import { AppointmentCard } from '../../tabs/components/AppointmentCard';
import { AppointmentFormSheet } from '../../tabs/components/AppointmentFormSheet';
import { DoseActionSheet } from '../../tabs/components/DoseActionSheet';
import { MedicationCard } from '../../tabs/components/MedicationCard';
import { MedicationFormSheet } from '../../tabs/components/MedicationFormSheet';
import * as appointmentsAPI from '../../tabs/services/appointments.service';
import type { AppointmentAttendanceStatus, AppointmentData } from '../../tabs/services/appointments.service';
import * as medicationsAPI from '../../tabs/services/medications.service';
import { logDose, pendingDoseLogs, removeQueuedDose } from '../../tabs/services/dose-queue';
import type { MedicationData, MedicationLog } from '../../tabs/services/medications.service';
import { bucketAppointments } from '../../tabs/utils/appointment-status';
import { getTodayDoseSlots, type DoseSlot } from '../../tabs/utils/dose-status';
import { cancelDoseAlarm } from '../../../shared/services/notifications.service';
import { isForeignTimeZone } from '../../../shared/services/dose-schedule';
import * as circleAPI from '../services/circle.service';
import type { CircleMember, HealthInfo } from '../services/circle.service';
import { firstName, relationToMe } from '../utils/relations';
import { InfoNote } from './CircleParts';
import type { CareTab } from './MemberDetailSheet';

const TABS: { id: CareTab; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { id: 'medications', label: 'Medicamentos', icon: 'pill' },
  { id: 'appointments', label: 'Citas', icon: 'calendar-heart' },
  { id: 'health', label: 'Salud', icon: 'heart-pulse' },
];

type Status = 'loading' | 'ready' | 'error';

export type MemberCareSheetProps = {
  theme: AppTheme;
  member: CircleMember | null;
  initialTab: CareTab;
  onClose: () => void;
};

/**
 * Lo que una persona del Círculo comparte contigo. Cada acción aparece solo
 * si tienes ese permiso, y el servidor lo vuelve a comprobar.
 */
export function MemberCareSheet({ theme, member, initialTab, onClose }: Readonly<MemberCareSheetProps>) {
  const last = useRef(member);
  if (member) last.current = member;
  const shown = member ?? last.current;
  const ownerId = shown?.person.id;
  const can = shown?.iCan;

  const allowedTabs = TABS.filter((tab) =>
    tab.id === 'medications' ? can?.viewMedications : tab.id === 'appointments' ? can?.viewAppointments : can?.viewHealth,
  );
  const [tab, setTab] = useState<CareTab>(initialTab);
  const swap = useSwapAnimation(tab);

  const [now, setNow] = useState(() => new Date());
  const [medications, setMedications] = useState<MedicationData[]>([]);
  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [status, setStatus] = useState<Record<CareTab, Status>>({ medications: 'loading', appointments: 'loading', health: 'loading' });
  const [errors, setErrors] = useState<Partial<Record<CareTab, string>>>({});

  const [doseTarget, setDoseTarget] = useState<{ medication: MedicationData; slot: DoseSlot } | null>(null);
  const [doseBusy, setDoseBusy] = useState(false);
  const [medForm, setMedForm] = useState<{ visible: boolean; medication: MedicationData | null }>({ visible: false, medication: null });
  const [apptForm, setApptForm] = useState<{ visible: boolean; appointment: AppointmentData | null }>({ visible: false, appointment: null });
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const withToken = async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return session.accessToken;
  };

  const load = useCallback(async (which: CareTab) => {
    if (!ownerId) return;
    setStatus((current) => ({ ...current, [which]: current[which] === 'ready' ? 'ready' : 'loading' }));
    try {
      const token = await withToken();
      if (which === 'medications') {
        const [meds, dayLogs, pending] = await Promise.all([
          medicationsAPI.fetchMedications(token, ownerId),
          medicationsAPI.fetchTodayMedicationLogs(token, ownerId),
          pendingDoseLogs(ownerId),
        ]);
        // Sus horas de toma son de SU zona horaria.
        setMedications((meds ?? []).map((medication) => ({ ...medication, timeZone: shown?.person.timezone })));
        // Tomas registradas sin conexión que aún no llegaron al servidor.
        setLogs([...pending, ...(dayLogs ?? [])]);
      } else if (which === 'appointments') {
        setAppointments((await appointmentsAPI.fetchAppointments(token, ownerId)) ?? []);
      } else {
        setHealth(await circleAPI.fetchHealthInfo(token, ownerId));
      }
      setNow(new Date());
      setErrors((current) => ({ ...current, [which]: undefined }));
      setStatus((current) => ({ ...current, [which]: 'ready' }));
    } catch (error) {
      setErrors((current) => ({ ...current, [which]: error instanceof Error ? error.message : 'No se pudo cargar.' }));
      setStatus((current) => ({ ...current, [which]: 'error' }));
    }
  }, [ownerId]);

  useEffect(() => {
    if (!member) return;
    const firstAllowed = allowedTabs.some((item) => item.id === initialTab) ? initialTab : allowedTabs[0]?.id ?? 'medications';
    setTab(firstAllowed);
    setStatus({ medications: 'loading', appointments: 'loading', health: 'loading' });
    setMedications([]);
    setLogs([]);
    setAppointments([]);
    setHealth(null);
  }, [member?.linkId, Boolean(member)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (member && allowedTabs.some((item) => item.id === tab)) void load(tab);
  }, [member, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const slotsById = useMemo(() => {
    const map = new Map<string, DoseSlot[]>();
    for (const medication of medications) map.set(medication.id, getTodayDoseSlots(medication, logs, now));
    return map;
  }, [medications, logs, now]);
  const buckets = useMemo(() => bucketAppointments(appointments, now), [appointments, now]);

  if (!shown || !can) return null;
  const first = firstName(shown.person);

  const fail = (title: string) => (error: unknown) =>
    Alert.alert(title, error instanceof Error ? error.message : 'Inténtalo de nuevo.');

  const setBusy = (id: string, value: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });

  // ── Medicamentos ─────────────────────────────────────────────────────────
  const toggleMedication = async (medication: MedicationData) => {
    setBusy(medication.id, true);
    try {
      const updated = await medicationsAPI.updateMedication(medication.id, await withToken(), { active: !medication.active }, ownerId);
      setMedications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      fail('No se pudo actualizar')(error);
    } finally {
      setBusy(medication.id, false);
    }
  };

  const deleteMedication = (medication: MedicationData) => {
    Alert.alert('Eliminar medicamento', `Se eliminará "${medication.name}" de ${first}, con su historial y sus alarmas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await medicationsAPI.deleteMedication(medication.id, await withToken(), ownerId);
              setMedications((current) => current.filter((item) => item.id !== medication.id));
            } catch (error) {
              fail('No se pudo eliminar')(error);
            }
          })();
        },
      },
    ]);
  };

  const registerDose = async (action: 'TAKEN' | 'SKIPPED') => {
    if (!doseTarget) return;
    setDoseBusy(true);
    try {
      const log = await logDose(doseTarget.medication.id, action, doseTarget.slot.at.toISOString(), ownerId);
      setLogs((current) => [log, ...current]);
      // Si sus alarmas suenan en este teléfono, esa toma ya no debe sonar.
      if (doseTarget.slot.at.getTime() > Date.now()) void cancelDoseAlarm(doseTarget.medication.id, doseTarget.slot.at).catch(() => undefined);
      setDoseTarget(null);
    } catch (error) {
      fail('No se pudo registrar')(error);
    } finally {
      setDoseBusy(false);
    }
  };

  const undoDose = async () => {
    const log = doseTarget?.slot.log;
    if (!doseTarget || !log) return;
    setDoseBusy(true);
    try {
      if (!(await removeQueuedDose(log.id))) {
        await medicationsAPI.deleteMedicationLog(doseTarget.medication.id, log.id, await withToken(), ownerId);
      }
      setLogs((current) => current.filter((item) => item.id !== log.id));
      setDoseTarget(null);
    } catch (error) {
      fail('No se pudo deshacer')(error);
    } finally {
      setDoseBusy(false);
    }
  };

  // ── Citas ────────────────────────────────────────────────────────────────
  const markAttendance = async (appointment: AppointmentData, attendanceStatus: AppointmentAttendanceStatus) => {
    setBusy(appointment.id, true);
    try {
      const updated = await appointmentsAPI.updateAppointment(appointment.id, await withToken(), { attendanceStatus }, ownerId);
      setAppointments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      fail('No se pudo guardar la asistencia')(error);
    } finally {
      setBusy(appointment.id, false);
    }
  };

  const changeAttendance = (appointment: AppointmentData) => {
    Alert.alert('Asistencia', `¿${first} asistió a "${appointment.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'No asistió', onPress: () => void markAttendance(appointment, 'MISSED') },
      { text: 'Asistió', onPress: () => void markAttendance(appointment, 'ATTENDED') },
    ]);
  };

  const deleteAppointment = (appointment: AppointmentData) => {
    Alert.alert('Eliminar cita', `Se eliminará "${appointment.title}" de ${first} y sus recordatorios.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await appointmentsAPI.deleteAppointment(appointment.id, await withToken(), ownerId);
              setAppointments((current) => current.filter((item) => item.id !== appointment.id));
            } catch (error) {
              fail('No se pudo eliminar')(error);
            }
          })();
        },
      },
    ]);
  };

  const openDirections = (appointment: AppointmentData) => {
    if (!appointment.location) return;
    const query = encodeURIComponent(appointment.location);
    const url = Platform.OS === 'ios' ? `maps:0,0?q=${query}` : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => undefined));
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const tabStatus = status[tab];
  const tabError = errors[tab];

  const renderState = () => {
    if (tabStatus === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accentSecondary} />
        </View>
      );
    }
    if (tabStatus === 'error') {
      return (
        <View style={styles.center}>
          <InfoNote theme={theme} icon="alert-circle-outline" color={theme.colors.accentTertiary}>
            {tabError ?? 'No se pudo cargar.'}
          </InfoNote>
          <AppButton theme={theme} label="Reintentar" variant="secondary" icon="refresh" iconPosition="left" onPress={() => void load(tab)} />
        </View>
      );
    }
    return null;
  };

  let content: React.ReactNode = renderState();
  if (!content && tab === 'medications') {
    content = (
      <View style={styles.list}>
        {can.addMedications ? (
          <AppButton theme={theme} label={`Agregar medicamento a ${first}`} icon="add" iconPosition="left" variant="secondary" onPress={() => setMedForm({ visible: true, medication: null })} />
        ) : null}
        {!medications.length ? (
          <Empty theme={theme} icon="pill" text={`${first} no tiene medicamentos registrados.`} />
        ) : (
          medications.map((medication) => (
            <MedicationCard
              key={medication.id}
              theme={theme}
              medication={medication}
              slots={slotsById.get(medication.id) ?? []}
              isToggling={busyIds.has(medication.id)}
              onToggleActive={(item) => void toggleMedication(item)}
              onEdit={(item) => setMedForm({ visible: true, medication: item })}
              onDelete={deleteMedication}
              onDosePress={(item, slot) => setDoseTarget({ medication: item, slot })}
              canToggle={can.manageReminders}
              canEdit={can.editMedications || can.manageReminders}
              canDelete={can.deleteMedications}
            />
          ))
        )}
      </View>
    );
  } else if (!content && tab === 'appointments') {
    const renderAppointment = (appointment: AppointmentData) => (
      <AppointmentCard
        key={appointment.id}
        theme={theme}
        appointment={appointment}
        now={now}
        busy={busyIds.has(appointment.id)}
        canManage={can.manageAppointments}
        ownerTimeZone={shown.person.timezone}
        onEdit={(item) => setApptForm({ visible: true, appointment: item })}
        onDelete={deleteAppointment}
        onMarkAttendance={(item, value) => void markAttendance(item, value)}
        onChangeAttendance={changeAttendance}
        onDirections={openDirections}
      />
    );
    content = (
      <View style={styles.list}>
        {can.manageAppointments ? (
          <AppButton theme={theme} label={`Agregar cita a ${first}`} icon="add" iconPosition="left" variant="secondary" onPress={() => setApptForm({ visible: true, appointment: null })} />
        ) : null}
        {!appointments.length ? <Empty theme={theme} icon="calendar-blank-outline" text={`${first} no tiene citas registradas.`} /> : null}
        {buckets.upcoming.length ? <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>Próximas</Text> : null}
        {buckets.upcoming.map(renderAppointment)}
        {buckets.history.length ? <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>Pasadas</Text> : null}
        {buckets.history.slice(0, 10).map(renderAppointment)}
      </View>
    );
  } else if (!content && tab === 'health' && health) {
    const flags = [
      health.pregnancy && 'Embarazo',
      health.lactation && 'Lactancia',
      health.recentSurgeries && 'Cirugía reciente',
      health.immunosuppression && 'Inmunosupresión',
      health.anticoagulantTreatment && 'Tratamiento anticoagulante',
    ].filter(Boolean) as string[];
    content = (
      <View style={styles.list}>
        <HealthRow theme={theme} icon="alert-octagon-outline" label="Alergias" value={health.allergies} tone={theme.colors.accentTertiary} />
        <HealthRow theme={theme} icon="clipboard-pulse-outline" label="Condiciones" value={health.conditions} tone={theme.colors.accentSecondary} />
        <HealthRow theme={theme} icon="information-outline" label="Situaciones especiales" value={flags.length ? flags.join(' · ') : null} tone={theme.colors.accentPrimary} />
        {health.birthDate ? <HealthRow theme={theme} icon="cake-variant-outline" label="Fecha de nacimiento" value={health.birthDate} tone={theme.colors.textMuted} /> : null}
      </View>
    );
  }

  const doseReadOnly = !can.logDoses;

  return (
    <>
      <FormSheet
        theme={theme}
        visible={Boolean(member)}
        title={first}
        subtitle={`${relationToMe(shown.relation)} · Lo que comparte contigo`}
        scrollToTopKey={tab}
        onClose={onClose}
        footer={<AppButton theme={theme} label="Cerrar" variant="secondary" onPress={onClose} style={styles.flex} />}
      >
        {allowedTabs.length > 1 ? (
          <View style={[styles.tabs, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}>
            {allowedTabs.map((item) => {
              const selected = item.id === tab;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setTab(item.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[styles.tab, selected && { backgroundColor: theme.colors.accentSecondary }]}
                >
                  <MaterialCommunityIcons name={item.icon} size={20} color={selected ? '#fff' : theme.colors.textSecondary} />
                  <Text
                    style={[styles.tabText, { color: selected ? '#fff' : theme.colors.textSecondary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!allowedTabs.length ? (
          <InfoNote theme={theme} icon="eye-off-outline">{first} no comparte información contigo.</InfoNote>
        ) : (
          <Animated.View style={swap}>{content}</Animated.View>
        )}

        {tab === 'medications' && tabStatus === 'ready' && isForeignTimeZone(shown.person.timezone) ? (
          <InfoNote theme={theme} icon="earth">
            {first} está en otra zona horaria ({shown.person.timezone?.split('/').pop()?.replace(/_/g, ' ')}). Las horas son las suyas; «tú» indica la hora para ti.
          </InfoNote>
        ) : null}

        {tab === 'medications' && tabStatus === 'ready' ? (
          <InfoNote theme={theme} icon="cellphone-check">
            {shown.person.isManaged
              ? shown.reminders === 'OFF'
                ? `${first} no usa la app: activa sus recordatorios en su ficha para que suenen en tu teléfono.`
                : `Sus alarmas suenan en tu teléfono y en el de los cuidadores que las tengan activadas.`
              : `Las alarmas suenan en el teléfono de ${first}${shown.reminders !== 'OFF' ? ' y también en el tuyo' : ''}. Los cambios le llegan la próxima vez que abra MedicAI.`}
          </InfoNote>
        ) : null}
      </FormSheet>

      <DoseActionSheet
        theme={theme}
        target={doseTarget}
        busy={doseBusy}
        readOnly={doseReadOnly}
        onClose={() => setDoseTarget(null)}
        onRegister={(action) => void registerDose(action)}
        onUndo={() => void undoDose()}
      />

      <MedicationFormSheet
        theme={theme}
        visible={medForm.visible}
        medication={medForm.medication}
        ownerId={ownerId}
        canEditDetails={can.editMedications}
        ownerTimeZone={shown.person.timezone}
        timeZoneNote={
          isForeignTimeZone(shown.person.timezone)
            ? `Las horas son las de ${first}, en su zona horaria (${shown.person.timezone?.split('/').pop()?.replace(/_/g, ' ')}).`
            : undefined
        }
        canEditSchedule={can.manageReminders}
        onClose={() => setMedForm((current) => ({ ...current, visible: false }))}
        onSaved={(saved, isNew) =>
          setMedications((current) => (isNew ? [saved, ...current] : current.map((item) => (item.id === saved.id ? saved : item))))
        }
      />

      <AppointmentFormSheet
        theme={theme}
        visible={apptForm.visible}
        appointment={apptForm.appointment}
        ownerId={ownerId}
        ownerIsDependent={Boolean(shown.person.isManaged)}
        ownerTimeZone={shown.person.timezone}
        onClose={() => setApptForm((current) => ({ ...current, visible: false }))}
        onSaved={(saved, isNew) =>
          setAppointments((current) => (isNew ? [...current, saved] : current.map((item) => (item.id === saved.id ? saved : item))))
        }
      />
    </>
  );
}

function Empty({ theme, icon, text }: Readonly<{ theme: AppTheme; icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }>) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={36} color={theme.colors.textMuted} />
      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{text}</Text>
    </View>
  );
}

function HealthRow({
  theme,
  icon,
  label,
  value,
  tone,
}: Readonly<{ theme: AppTheme; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string | null; tone: string }>) {
  return (
    <View style={[styles.healthRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
      <View style={[styles.healthIcon, { backgroundColor: `${tone}14` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={tone} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.healthLabel, { color: theme.colors.textMuted }]}>{label}</Text>
        <Text style={[styles.healthValue, { color: value ? theme.colors.textPrimary : theme.colors.textMuted }]}>{value?.trim() || 'Sin registrar'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { flexDirection: 'row', borderWidth: 1.5, borderRadius: 16, padding: 4, gap: 4 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 54, borderRadius: 12, paddingHorizontal: 4, paddingVertical: 6 },
  tabText: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  center: { alignItems: 'stretch', gap: 12, paddingVertical: 24 },
  list: { gap: 10 },
  groupTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  healthRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14 },
  healthIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  healthLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  healthValue: { fontSize: 15, fontWeight: '600', marginTop: 2, lineHeight: 21 },
});
