import { useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet, TextField } from '../../../shared/ui';
import { getStoredSession } from '../../auth';
import * as circleAPI from '../services/circle.service';
import type { CircleGroup, CircleInvitation, ReminderMode } from '../services/circle.service';
import { ensureAlarmPermissions } from '../../../shared/services/alarm-permissions.service';
import {
  NO_PERMISSIONS,
  PERMISSION_PRESETS,
  hasAnyPermission,
  permissionPhrases,
  type PermissionSet,
} from '../utils/permissions';
import {
  CARE_OPTIONS,
  relationLabel,
  suggestedCare,
  type CareValue,
  type RelationCode,
} from '../utils/relations';
import { shareInvitation } from '../hooks/useCircle';
import { CarePicker, InfoNote, PermissionEditor, RelationPicker, REMINDER_OPTIONS, ReminderModePicker, SectionTitle } from './CircleParts';
import { GroupPicker } from './CircleGroups';

type Method = 'email' | 'code';
type Step = 0 | 1 | 2 | 3;

const STEP_TITLES = ['Persona', 'Relación', 'Permisos', 'Revisar'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const preset = (id: 'none' | 'view' | 'help' | 'manage'): PermissionSet =>
  PERMISSION_PRESETS.find((item) => item.id === id)?.value ?? NO_PERMISSIONS;

/**
 * Permisos iniciales (siempre editables) según quién cuida a quién y la
 * relación. Un médico suele necesitar ver, no gestionar; un cuidador, gestionar.
 */
function defaultsFor(care: CareValue, relation: RelationCode | null) {
  if (relation === 'DOCTOR') return { granted: NO_PERMISSIONS, requested: preset('view') };
  if (relation === 'PATIENT') return { granted: preset('view'), requested: NO_PERMISSIONS };
  return {
    // Lo que la otra persona podrá hacer con MI información.
    granted: care === 'CARES_FOR_ME' ? preset('manage') : care === 'MUTUAL' ? preset('help') : NO_PERMISSIONS,
    // Lo que YO pido sobre su información.
    requested: care === 'I_CARE' ? preset('manage') : care === 'MUTUAL' ? preset('help') : NO_PERMISSIONS,
  };
}

export type InviteSheetProps = {
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  onCreated: (invitation: CircleInvitation) => void;
  /** Invitar en nombre de otra persona (administrando su Círculo). */
  ownerId?: string;
  ownerName?: string;
  initialEmail?: string;
  /** Mis grupos (solo al invitar en mi nombre). */
  groups?: CircleGroup[];
  onGroupCreated?: (group: CircleGroup) => void;
};

export function InviteSheet({
  theme,
  visible,
  onClose,
  onCreated,
  ownerId,
  ownerName,
  initialEmail,
  groups = [],
  onGroupCreated,
}: Readonly<InviteSheetProps>) {
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [reminderMode, setReminderMode] = useState<ReminderMode>('OFF');
  const [step, setStep] = useState<Step>(0);
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<RelationCode | null>(null);
  const [relationText, setRelationText] = useState('');
  const [care, setCare] = useState<CareValue>('NONE');
  const [careTouched, setCareTouched] = useState(false);
  const [granted, setGranted] = useState<PermissionSet>(NO_PERMISSIONS);
  const [requested, setRequested] = useState<PermissionSet>(NO_PERMISSIONS);
  const [permissionsTouched, setPermissionsTouched] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CircleInvitation | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setMethod('email');
    setEmail(initialEmail ?? '');
    setName('');
    setRelation(null);
    setRelationText('');
    setCare('NONE');
    setCareTouched(false);
    setGranted(NO_PERMISSIONS);
    setRequested(NO_PERMISSIONS);
    setPermissionsTouched(false);
    setShowErrors(false);
    setCreated(null);
    setGroupIds([]);
    setReminderMode('OFF');
  }, [visible, initialEmail]);

  // Solo tiene sentido si pides ver sus medicamentos o citas (y lo pides para ti).
  const canAskReminders = !ownerId && (requested.viewMedications || requested.viewAppointments);
  const wantsReminders = canAskReminders && reminderMode !== 'OFF';
  const personName = name.trim() || (method === 'email' && email.includes('@') ? email.split('@')[0] : 'esta persona');
  const ownerInfo = ownerId ? `la información de ${ownerName ?? 'esta persona'}` : 'tu información';
  const subject = ownerId ? (ownerName ?? 'Esta persona') : 'Tú';

  const stepError = (): string | null => {
    if (step === 0 && method === 'email' && !EMAIL_PATTERN.test(email.trim())) return 'Escribe un correo válido.';
    if (step === 1 && !relation) return 'Elige qué relación tienen.';
    if (step === 1 && relation === 'OTHER' && !relationText.trim()) return 'Escribe qué relación tienen.';
    return null;
  };
  const error = showErrors ? stepError() : null;

  const goNext = () => {
    setShowErrors(true);
    if (stepError()) return;
    setShowErrors(false);
    if (step === 1 && !permissionsTouched) {
      const defaults = defaultsFor(care, relation);
      setGranted(defaults.granted);
      setRequested(defaults.requested);
      // Si la cuidas, por defecto recibes sus avisos (lo puedes cambiar).
      setReminderMode(!ownerId && (care === 'I_CARE' || care === 'MUTUAL') && relation !== 'DOCTOR' ? 'NOTIFY' : 'OFF');
    }
    setStep((current) => Math.min(3, current + 1) as Step);
  };

  const submit = async () => {
    if (!relation) return;
    const session = await getStoredSession();
    if (!session?.accessToken) {
      Alert.alert('Sesión expirada', 'Vuelve a iniciar sesión para continuar.');
      return;
    }
    if (wantsReminders) await ensureAlarmPermissions();
    try {
      setSaving(true);
      const invitation = await circleAPI.createInvitation(session.accessToken, {
        email: method === 'email' ? email.trim() : undefined,
        inviteeName: name.trim() || undefined,
        relation,
        relationLabel: relation === 'OTHER' ? relationText.trim() : undefined,
        care,
        granted,
        requested,
        ownerId,
        groupIds: ownerId ? undefined : groupIds,
        reminderMode: wantsReminders ? reminderMode : 'OFF',
      });
      setCreated(invitation);
      onCreated(invitation);
    } catch (submitError) {
      Alert.alert('No se pudo invitar', submitError instanceof Error ? submitError.message : 'Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };


  // ── Pantalla final ──────────────────────────────────────────────────────
  if (created) {
    return (
      <FormSheet
        theme={theme}
        visible={visible}
        title="Invitación lista"
        onClose={onClose}
        footer={<AppButton theme={theme} label="Listo" onPress={onClose} style={styles.flex} />}
      >
        <View style={styles.doneHero}>
          <View style={[styles.doneIcon, { backgroundColor: `${theme.colors.success}18` }]}>
            <MaterialCommunityIcons name="email-check-outline" size={40} color={theme.colors.success} />
          </View>
          <Text style={[styles.doneTitle, { color: theme.colors.textPrimary }]}>
            {created.inviteeEmail ? 'Invitación enviada' : 'Comparte la invitación'}
          </Text>
          <Text style={[styles.doneText, { color: theme.colors.textSecondary }]}>
            {created.inviteeEmail
              ? created.inviteeHasAccount === false
                ? `Enviamos un correo a ${created.inviteeEmail}. Todavía no tiene cuenta: cuando se registre con ese correo, verá la invitación.`
                : `Enviamos un correo a ${created.inviteeEmail}. También la verá en su app, en Círculo.`
              : 'Envía el enlace o dicta el código. La primera cuenta que lo abra podrá aceptarla.'}
          </Text>
        </View>
        <View style={[styles.codeBox, { borderColor: theme.colors.surfaceBorder, backgroundColor: theme.colors.inputBackground }]}>
          <Text style={[styles.codeLabel, { color: theme.colors.textMuted }]}>Código de invitación</Text>
          <Text style={[styles.code, { color: theme.colors.textPrimary }]} selectable accessibilityLabel={`Código ${created.code.split('').join(' ')}`}>
            {created.code}
          </Text>
          <Text style={[styles.codeHint, { color: theme.colors.textMuted }]}>Vence en 7 días</Text>
        </View>
        <AppButton theme={theme} label="Compartir enlace y código" icon="share-social-outline" iconPosition="left" variant="secondary" onPress={() => shareInvitation(created)} />
        <InfoNote theme={theme} icon="shield-check-outline">
          Nada se comparte hasta que la persona acepte. Podrás cambiar los permisos o quitarla cuando quieras.
        </InfoNote>
      </FormSheet>
    );
  }

  const careOption = CARE_OPTIONS.find((option) => option.value === care);

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title={ownerId ? `Invitar al Círculo de ${ownerName ?? 'esta persona'}` : 'Invitar a tu Círculo'}
      subtitle={`Paso ${step + 1} de 4 · ${STEP_TITLES[step]}`}
      scrollToTopKey={step}
      onClose={onClose}
      dismissDisabled={saving}
      footer={
        <>
          <AppButton
            theme={theme}
            label={step === 0 ? 'Cancelar' : 'Atrás'}
            variant="secondary"
            onPress={() => (step === 0 ? onClose() : setStep((current) => (current - 1) as Step))}
            disabled={saving}
            style={styles.flex}
          />
          <AppButton
            theme={theme}
            label={step === 3 ? 'Enviar invitación' : 'Siguiente'}
            icon={step === 3 ? 'paper-plane-outline' : 'arrow-forward'}
            onPress={() => (step === 3 ? void submit() : goNext())}
            loading={saving}
            style={styles.flexWide}
          />
        </>
      }
    >
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 4, now: step + 1 }}>
        {STEP_TITLES.map((title, index) => (
          <View
            key={title}
            style={[styles.progressSegment, { backgroundColor: index <= step ? theme.colors.accentPrimary : theme.colors.surfaceBorder }]}
          />
        ))}
      </View>

      {step === 0 ? (
        <>
          <SectionTitle theme={theme} title="¿Cómo quieres invitarla?" />
          <View style={[styles.segment, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}>
            {(
              [
                { value: 'email', label: 'Por correo', icon: 'email-outline' },
                { value: 'code', label: 'Código o enlace', icon: 'link-variant' },
              ] as const
            ).map((option) => {
              const selected = method === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMethod(option.value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  style={[styles.segmentButton, selected && { backgroundColor: theme.colors.accentPrimary }]}
                >
                  <MaterialCommunityIcons name={option.icon} size={18} color={selected ? theme.colors.buttonText : theme.colors.textSecondary} />
                  <Text style={[styles.segmentText, { color: selected ? theme.colors.buttonText : theme.colors.textSecondary }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {method === 'email' ? (
            <TextField
              theme={theme}
              label="Correo de la persona"
              value={email}
              error={error}
              onChangeText={setEmail}
              placeholder="nombre@correo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
          ) : (
            <InfoNote theme={theme} icon="link-variant">
              Crearemos un código y un enlace para que se los envíes por WhatsApp, SMS o como prefieras. Sirve aunque aún no tenga cuenta.
            </InfoNote>
          )}
          <TextField
            theme={theme}
            label="¿Cómo se llama?"
            optional
            value={name}
            onChangeText={setName}
            placeholder="Ej. Mamá, Carlos"
            maxLength={80}
            autoCapitalize="words"
            helper="Solo para que la reconozcas en tu lista mientras responde."
          />
          {!ownerId ? (
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
        </>
      ) : null}

      {step === 1 ? (
        <>
          <SectionTitle
            theme={theme}
            title={ownerId ? `¿Qué es ${ownerName ?? 'esta persona'} para ${personName}?` : `¿Qué eres tú para ${personName}?`}
            hint={`${personName} confirmará qué es para ${ownerId ? ownerName ?? 'esta persona' : 'ti'} al aceptar.`}
          />
          <RelationPicker
            theme={theme}
            value={relation}
            customLabel={relationText}
            onChange={(code) => {
              setRelation(code);
              if (!careTouched) setCare(suggestedCare(code));
            }}
            onCustomLabelChange={setRelationText}
            error={error}
          />
          <SectionTitle theme={theme} title="¿Quién cuida a quién?" hint="Sirve para organizar tu Círculo. No da acceso por sí solo." />
          <CarePicker
            theme={theme}
            value={care}
            name={personName}
            onChange={(value) => {
              setCareTouched(true);
              setCare(value);
            }}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <SectionTitle
            theme={theme}
            title={`Lo que ${personName} podrá hacer con ${ownerInfo}`}
            hint="Tú decides. Puedes cambiarlo cuando quieras."
          />
          <PermissionEditor
            theme={theme}
            value={granted}
            onChange={(value) => {
              setPermissionsTouched(true);
              setGranted(value);
            }}
          />
          <SectionTitle
            theme={theme}
            title={ownerId ? `Lo que ${ownerName ?? 'esta persona'} pide poder hacer con su información` : 'Lo que te gustaría poder hacer con su información'}
            hint={`Es una solicitud: ${personName} la revisará y decidirá qué acepta.`}
          />
          <PermissionEditor
            theme={theme}
            value={requested}
            allowCircleAdmin={false}
            onChange={(value) => {
              setPermissionsTouched(true);
              setRequested(value);
            }}
          />
          {canAskReminders ? (
            <ReminderModePicker theme={theme} value={reminderMode} name={personName} onChange={setReminderMode} />
          ) : null}
        </>
      ) : null}

      {step === 3 && relation ? (
        <>
          <ReviewRow theme={theme} icon={method === 'email' ? 'email-outline' : 'link-variant'} label="Invitación" value={method === 'email' ? email.trim() : 'Por código o enlace'} />
          <ReviewRow
            theme={theme}
            icon="account-heart-outline"
            label="Relación"
            value={`${subject} ${ownerId ? 'es' : 'eres'} su ${relationLabel({ code: relation, label: relationText }).toLowerCase()}`}
          />
          <ReviewRow theme={theme} icon={careOption?.icon ?? 'account-multiple-outline'} label="Cuidado" value={careOption?.title(personName) ?? ''} />
          <View style={[styles.reviewCard, { borderColor: theme.colors.surfaceBorder }]}>
            <Text style={[styles.reviewLabel, { color: theme.colors.textMuted }]}>{personName} podrá</Text>
            <PhraseList theme={theme} phrases={permissionPhrases(granted, 'theyCan')} empty={`No verá ${ownerInfo}`} />
          </View>
          <View style={[styles.reviewCard, { borderColor: theme.colors.surfaceBorder }]}>
            <Text style={[styles.reviewLabel, { color: theme.colors.textMuted }]}>Solicitas</Text>
            <PhraseList theme={theme} phrases={permissionPhrases(requested, 'iCan')} empty="No pides acceso a su información" />
          </View>
          {canAskReminders ? (
            <ReviewRow
              theme={theme}
              icon="bell-ring-outline"
              label="Sus recordatorios en tu teléfono"
              value={REMINDER_OPTIONS.find((option) => option.value === reminderMode)?.label ?? ''}
            />
          ) : null}
          {!hasAnyPermission(granted) && !hasAnyPermission(requested) ? (
            <InfoNote theme={theme} color={theme.colors.accentTertiary} icon="alert-circle-outline">
              Estarán conectados, pero ninguno verá la información del otro. Podrán dar permisos más adelante.
            </InfoNote>
          ) : null}
        </>
      ) : null}
    </FormSheet>
  );
}

function ReviewRow({ theme, icon, label, value }: Readonly<{ theme: AppTheme; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }>) {
  return (
    <View style={styles.reviewRow}>
      <MaterialCommunityIcons name={icon} size={20} color={theme.colors.accentSecondary} />
      <View style={styles.flex}>
        <Text style={[styles.reviewLabel, { color: theme.colors.textMuted }]}>{label}</Text>
        <Text style={[styles.reviewValue, { color: theme.colors.textPrimary }]}>{value}</Text>
      </View>
    </View>
  );
}

function PhraseList({ theme, phrases, empty }: Readonly<{ theme: AppTheme; phrases: string[]; empty: string }>) {
  if (!phrases.length) return <Text style={[styles.phrase, { color: theme.colors.textMuted }]}>{empty}</Text>;
  return (
    <View style={styles.phrases}>
      {phrases.map((phrase) => (
        <View key={phrase} style={styles.phraseRow}>
          <MaterialCommunityIcons name="check" size={16} color={theme.colors.success} />
          <Text style={[styles.phrase, { color: theme.colors.textPrimary }]}>{phrase}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  progress: { flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  segment: { flexDirection: 'row', borderWidth: 1.5, borderRadius: 16, padding: 4, gap: 4 },
  segmentButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 12 },
  segmentText: { fontSize: 13.5, fontWeight: '800' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reviewLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  reviewValue: { fontSize: 15, fontWeight: '700', marginTop: 1 },
  reviewCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  phrases: { gap: 6 },
  phraseRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phrase: { flex: 1, fontSize: 14, fontWeight: '600' },
  doneHero: { alignItems: 'center', gap: 10, paddingTop: 8 },
  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  doneText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  codeBox: { alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 18, paddingVertical: 16 },
  codeLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  code: { fontSize: 30, fontWeight: '900', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  codeHint: { fontSize: 12 },
});
