import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Alert, Platform, StyleSheet, Text } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FieldShell, FormSheet, PressableScale, TextField, useFieldColors } from '../../../shared/ui';
import { ensureAlarmPermissions } from '../../../shared/services/alarm-permissions.service';
import { shareInvitation, withToken } from '../hooks/useCircle';
import * as circleAPI from '../services/circle.service';
import type { CircleGroup, CircleInvitation, CircleMember } from '../services/circle.service';
import { EMPTY_MEDICAL_INFO, MedicalInfoEditor, type MedicalInfo } from '../../auth';
import { GroupPicker } from './CircleGroups';
import { NO_PERMISSIONS, PERMISSION_PRESETS, type PermissionSet } from '../utils/permissions';
import { firstName, reciprocalSuggestions, type RelationCode } from '../utils/relations';
import { InfoNote, PermissionEditor, RelationPicker, SectionTitle } from './CircleParts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEPENDENT_SUGGESTIONS: RelationCode[] = ['SON', 'DAUGHTER', 'GRANDCHILD', 'CARE_RECIPIENT', 'FATHER', 'MOTHER', 'GRANDPARENT'];

const toIsoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fromIsoDay = (value: string | null | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// ─── Crear / editar perfil a cargo ───────────────────────────────────────────

export function DependentSheet({
  theme,
  visible,
  member,
  onClose,
  onSaved,
  groups = [],
  onGroupCreated,
}: Readonly<{
  theme: AppTheme;
  visible: boolean;
  /** Si se indica, se edita ese perfil; si no, se crea uno nuevo. */
  member?: CircleMember | null;
  onClose: () => void;
  onSaved: (member: CircleMember, isNew: boolean) => void;
  /** Mis grupos, para colocar a la persona al crearla. */
  groups?: CircleGroup[];
  onGroupCreated?: (group: CircleGroup) => void;
}>) {
  const editing = Boolean(member);
  const [medical, setMedical] = useState<MedicalInfo>(EMPTY_MEDICAL_INFO);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [iosPicker, setIosPicker] = useState(false);
  const [relation, setRelation] = useState<RelationCode | null>(null);
  const [relationText, setRelationText] = useState('');
  const [myRelation, setMyRelation] = useState<RelationCode | null>(null);
  const [myRelationText, setMyRelationText] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const dateColors = useFieldColors(theme, iosPicker, false);

  useEffect(() => {
    if (!visible) return;
    setName(member?.person.fullName ?? '');
    setBirthDate(null);
    setIosPicker(false);
    setRelation(null);
    setRelationText('');
    setMyRelation(null);
    setMyRelationText('');
    setMedical(EMPTY_MEDICAL_INFO);
    setGroupIds([]);
    setShowErrors(false);
    if (member) {
      // Datos de salud actuales para editarlos.
      void withToken()
        .then((token) => circleAPI.fetchHealthInfo(token, member.person.id))
        .then((health) => {
          setBirthDate(fromIsoDay(health.birthDate));
          setMedical({
            conditions: health.conditions ?? '',
            allergies: health.allergies ?? '',
            pregnancy: health.pregnancy,
            lactation: health.lactation,
            recentSurgeries: health.recentSurgeries,
            immunosuppression: health.immunosuppression,
            anticoagulantTreatment: health.anticoagulantTreatment,
          });
        })
        .catch(() => undefined);
    }
  }, [visible, member]);

  const errors = showErrors
    ? {
      name: name.trim() ? null : 'Escribe su nombre.',
      relation: editing || (relation && (relation !== 'OTHER' || relationText.trim())) ? null : 'Elige qué es para ti.',
      myRelation: editing || (myRelation && (myRelation !== 'OTHER' || myRelationText.trim())) ? null : 'Elige qué eres tú.',
    }
    : { name: null, relation: null, myRelation: null };

  const openDatePicker = () => {
    const value = birthDate ?? new Date(new Date().getFullYear() - 5, 0, 1);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        maximumDate: new Date(),
        onChange: (event, selected) => {
          if (event.type === 'set' && selected) setBirthDate(selected);
        },
      });
    } else {
      if (!birthDate) setBirthDate(value);
      setIosPicker((current) => !current);
    }
  };

  const save = async () => {
    setShowErrors(true);
    const invalid = !name.trim()
      || (!editing && (!relation || (relation === 'OTHER' && !relationText.trim())))
      || (!editing && (!myRelation || (myRelation === 'OTHER' && !myRelationText.trim())));
    if (invalid) return;
    if (!editing) {
      // Sus alarmas sonarán en este teléfono.
      const { ready } = await ensureAlarmPermissions();
      if (!ready) {
        Alert.alert('Permisos incompletos', `Sin los permisos de notificaciones y alarmas no podremos avisarte de las tomas de ${name.trim() || 'esta persona'}.`);
      }
    }
    try {
      setSaving(true);
      const token = await withToken();
      const birth = birthDate ? toIsoDay(birthDate) : '';
      const saved = member
        ? await circleAPI.updateDependent(token, member.person.id, { fullName: name.trim(), birthDate: birth, ...medical })
        : await circleAPI.createDependent(token, {
          fullName: name.trim(),
          birthDate: birth || undefined,
          relation: relation as RelationCode,
          relationLabel: relation === 'OTHER' ? relationText.trim() : undefined,
          myRelation: myRelation as RelationCode,
          myRelationLabel: myRelation === 'OTHER' ? myRelationText.trim() : undefined,
          ...medical,
          allergies: medical.allergies || undefined,
          conditions: medical.conditions || undefined,
          groupIds,
        });
      onSaved(saved, !member);
      onClose();
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const shortName = name.trim().split(/\s+/)[0] || 'esta persona';

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title={editing ? 'Editar perfil' : 'Persona a tu cargo'}
      subtitle={editing ? undefined : 'Para quien no usa la app, como un hijo pequeño.'}
      onClose={onClose}
      dismissDisabled={saving}
      footer={
        <>
          <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={onClose} disabled={saving} style={styles.flex} />
          <AppButton theme={theme} label={editing ? 'Guardar cambios' : 'Crear perfil'} icon="checkmark" onPress={() => void save()} loading={saving} style={styles.flexWide} />
        </>
      }
    >
      <TextField theme={theme} label="Nombre" value={name} error={errors.name} onChangeText={setName} placeholder="Ej. Mateo" maxLength={80} autoCapitalize="words" />

      <FieldShell theme={theme} label="Fecha de nacimiento" optional>
        <PressableScale
          pressedScale={0.98}
          onPress={openDatePicker}
          accessibilityRole="button"
          accessibilityLabel="Elegir fecha de nacimiento"
          style={[styles.selector, dateColors]}
        >
          <Ionicons name="calendar-outline" size={20} color={theme.colors.accentSecondary} />
          <Text style={[styles.selectorText, { color: birthDate ? theme.colors.textPrimary : theme.colors.inputPlaceholder }]}>
            {birthDate ? birthDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Elegir fecha'}
          </Text>
        </PressableScale>
      </FieldShell>
      {Platform.OS === 'ios' && iosPicker ? (
        <DateTimePicker
          value={birthDate ?? new Date()}
          mode="date"
          display="inline"
          maximumDate={new Date()}
          locale="es-ES"
          themeVariant={theme.mode}
          onChange={(_event: DateTimePickerEvent, selected?: Date) => {
            if (selected) setBirthDate(selected);
          }}
        />
      ) : null}

      {!editing ? (
        <>
          <SectionTitle theme={theme} title={`¿Qué es ${shortName} para ti?`} />
          <RelationPicker
            theme={theme}
            value={relation}
            customLabel={relationText}
            onChange={(code) => {
              setRelation(code);
              const reciprocal = reciprocalSuggestions(code);
              if (reciprocal.length === 1) setMyRelation(reciprocal[0]);
            }}
            onCustomLabelChange={setRelationText}
            suggested={DEPENDENT_SUGGESTIONS}
            error={errors.relation}
          />
          {relation ? (
            <>
              <SectionTitle theme={theme} title={`¿Y tú qué eres para ${shortName}?`} />
              <RelationPicker
                theme={theme}
                value={myRelation}
                customLabel={myRelationText}
                onChange={setMyRelation}
                onCustomLabelChange={setMyRelationText}
                suggested={reciprocalSuggestions(relation)}
                error={errors.myRelation}
              />
            </>
          ) : null}
        </>
      ) : null}

      <SectionTitle theme={theme} title="Información médica" hint="Opcional. Ayuda a evitar medicamentos que no le convengan." />
      <MedicalInfoEditor theme={theme} value={medical} onChange={setMedical} subject="other" />

      {!editing ? (
        <>
          <SectionTitle theme={theme} title="Añadir a un grupo" hint="Opcional. Solo tú ves tus grupos." />
          <GroupPicker
            theme={theme}
            groups={groups}
            value={groupIds}
            onChange={setGroupIds}
            onCreate={(group, next) => {
              onGroupCreated?.(group);
              setGroupIds(next);
            }}
          />
        </>
      ) : null}

      {!editing ? (
        <InfoNote theme={theme} icon="alarm">
          Gestionarás sus medicamentos y citas, y sus alarmas sonarán en tu teléfono. Desde su ficha podrás agregar a otro cuidador, como tu pareja.
        </InfoNote>
      ) : null}
    </FormSheet>
  );
}

// ─── Agregar otro cuidador ──────────────────────────────────────────────────

/**
 * Invita a otra persona (p. ej. la pareja) a cuidar de un perfil a cargo. La
 * invitación sale "en nombre" del perfil, creada por quien lo administra.
 */
export function CoCaregiverSheet({
  theme,
  visible,
  member,
  onClose,
  onCreated,
}: Readonly<{
  theme: AppTheme;
  visible: boolean;
  member: CircleMember | null;
  onClose: () => void;
  onCreated?: (invitation: CircleInvitation) => void;
}>) {
  const [email, setEmail] = useState('');
  const [relation, setRelation] = useState<RelationCode | null>(null);
  const [relationText, setRelationText] = useState('');
  const [granted, setGranted] = useState<PermissionSet>(NO_PERMISSIONS);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CircleInvitation | null>(null);

  useEffect(() => {
    if (!visible || !member) return;
    setEmail('');
    // Lo más habitual: es lo mismo para el otro tutor que para mí (p. ej. hijo).
    setRelation(member.relation.code as RelationCode);
    setRelationText(member.relation.code === 'OTHER' ? member.relation.label ?? '' : '');
    setGranted({ ...(PERMISSION_PRESETS.find((item) => item.id === 'manage')?.value ?? NO_PERMISSIONS), manageCircle: true });
    setShowErrors(false);
    setCreated(null);
  }, [visible, member]);

  if (!member) return null;
  const name = firstName(member.person);
  const emailError = showErrors && !EMAIL_PATTERN.test(email.trim()) ? 'Escribe un correo válido.' : null;

  const submit = async () => {
    setShowErrors(true);
    if (!EMAIL_PATTERN.test(email.trim()) || !relation) return;
    try {
      setSaving(true);
      const invitation = await circleAPI.createInvitation(await withToken(), {
        email: email.trim(),
        relation,
        relationLabel: relation === 'OTHER' ? relationText.trim() : undefined,
        // Desde el punto de vista del perfil: la persona invitada lo cuida.
        care: 'CARES_FOR_ME',
        granted,
        requested: NO_PERMISSIONS,
        ownerId: member.person.id,
      });
      setCreated(invitation);
      onCreated?.(invitation);
    } catch (error) {
      Alert.alert('No se pudo invitar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <FormSheet
        theme={theme}
        visible={visible}
        title="Invitación enviada"
        onClose={onClose}
        footer={
          <>
            <AppButton theme={theme} label="Compartir" icon="share-social-outline" iconPosition="left" variant="secondary" onPress={() => shareInvitation(created)} style={styles.flex} />
            <AppButton theme={theme} label="Listo" onPress={onClose} style={styles.flex} />
          </>
        }
      >
        <InfoNote theme={theme} icon="email-check-outline" color={theme.colors.success}>
          {created.inviteeHasAccount === false
            ? `Enviamos la invitación a ${created.inviteeEmail}. Cuando cree su cuenta con ese correo, podrá aceptarla.`
            : `Enviamos la invitación a ${created.inviteeEmail}. Al aceptarla podrá cuidar de ${name} contigo.`}
        </InfoNote>
        <Text style={[styles.code, { color: theme.colors.textPrimary }]} selectable>{created.code}</Text>
        <Text style={[styles.codeHint, { color: theme.colors.textMuted }]}>También puede escribir este código en Círculo → «Tengo un código».</Text>
      </FormSheet>
    );
  }

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title={`Otro cuidador para ${name}`}
      subtitle="Por ejemplo, tu pareja u otro familiar."
      onClose={onClose}
      dismissDisabled={saving}
      footer={
        <>
          <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={onClose} disabled={saving} style={styles.flex} />
          <AppButton theme={theme} label="Enviar invitación" icon="paper-plane-outline" onPress={() => void submit()} loading={saving} style={styles.flexWide} />
        </>
      }
    >
      <TextField
        theme={theme}
        label="Correo de la persona"
        value={email}
        error={emailError}
        onChangeText={setEmail}
        placeholder="nombre@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <SectionTitle theme={theme} title={`¿Qué es ${name} para esta persona?`} />
      <RelationPicker theme={theme} value={relation} customLabel={relationText} onChange={setRelation} onCustomLabelChange={setRelationText} />
      <SectionTitle theme={theme} title={`Lo que podrá hacer con la información de ${name}`} hint="Si le permites administrar su Círculo, también podrá agregar o quitar cuidadores." />
      <PermissionEditor theme={theme} value={granted} onChange={setGranted} />
      <InfoNote theme={theme} icon="alarm">Al aceptar, también recibirá las alarmas de {name} en su teléfono (puede desactivarlas).</InfoNote>
    </FormSheet>
  );
}

// ─── Entregar la cuenta ─────────────────────────────────────────────────────

export function HandoverSheet({
  theme,
  visible,
  member,
  onClose,
}: Readonly<{ theme: AppTheme; visible: boolean; member: CircleMember | null; onClose: () => void }>) {
  const [email, setEmail] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEmail('');
    setShowErrors(false);
  }, [visible]);

  if (!member) return null;
  const name = firstName(member.person);
  const emailError = showErrors && !EMAIL_PATTERN.test(email.trim()) ? 'Escribe un correo válido.' : null;

  const submit = async () => {
    setShowErrors(true);
    if (!EMAIL_PATTERN.test(email.trim())) return;
    try {
      setSaving(true);
      const result = await circleAPI.handoverDependent(await withToken(), member.person.id, email.trim());
      Alert.alert('Enlace enviado', `${result.message} Mientras no la cree, sigues gestionando su información.`);
      onClose();
    } catch (error) {
      Alert.alert('No se pudo enviar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title={`Entregar su cuenta a ${name}`}
      subtitle="Para cuando ya pueda usar MedicAI por su cuenta."
      onClose={onClose}
      dismissDisabled={saving}
      footer={
        <>
          <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={onClose} disabled={saving} style={styles.flex} />
          <AppButton theme={theme} label="Enviar enlace" icon="paper-plane-outline" onPress={() => void submit()} loading={saving} style={styles.flexWide} />
        </>
      }
    >
      <TextField
        theme={theme}
        label={`Correo de ${name}`}
        value={email}
        error={emailError}
        onChangeText={setEmail}
        placeholder="nombre@correo.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <InfoNote theme={theme} icon="account-key-outline">
        {name} recibirá un enlace para crear su contraseña. Desde ese momento la cuenta será suya: tú conservarás tus permisos hasta que {name} decida cambiarlos.
      </InfoNote>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
  selectorText: { flex: 1, fontSize: 16 },
  code: { fontSize: 28, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  codeHint: { fontSize: 13, textAlign: 'center' },
});
