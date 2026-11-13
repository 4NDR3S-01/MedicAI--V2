import { useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet, useReducedMotion } from '../../../shared/ui';
import { ERROR_COLOR } from '../../../shared/ui/FormField';
import { syncOwnReminders } from '../../tabs/services/reminders-sync';
import { promptAlarmSetupIfNeeded } from '../../../shared/services/alarm-setup.service';
import { getStoredSession } from '../../auth';
import * as circleAPI from '../services/circle.service';
import type { CircleGroup, CircleMember, ReminderMode } from '../services/circle.service';
import { PERMISSION_KEYS, PERMISSION_PRESETS, presetOf, samePermissions, type PermissionSet } from '../utils/permissions';
import {
  CARE_OPTIONS,
  COMMON_RELATIONS,
  careSummary,
  displayName,
  firstName,
  relationLabel,
  relationToMe,
  type CareValue,
  type RelationCode,
} from '../utils/relations';
import { Avatar, CarePicker, PermissionEditor, PermissionList, RelationPicker, REMINDER_OPTIONS, ReminderModePicker, SectionTitle } from './CircleParts';
import { CoCaregiverSheet, DependentSheet, HandoverSheet } from './DependentSheets';
import { GroupPicker } from './CircleGroups';


export type CareTab = 'medications' | 'appointments' | 'health';

type View_ = 'main' | 'relation' | 'theyCan' | 'iCan' | 'reminders' | 'groups';

export type MemberDetailSheetProps = {
  theme: AppTheme;
  member: CircleMember | null;
  /** Viendo el Círculo de otra persona (como administrador). */
  ownerId?: string;
  ownerName?: string;
  onClose: () => void;
  onChanged: (member: CircleMember) => void;
  onRemoved: (member: CircleMember) => void;
  onOpenCare: (member: CircleMember, tab: CareTab) => void;
  onManageCircle: (member: CircleMember) => void;
  /** Mis grupos (solo en mi propio Círculo). */
  groups?: CircleGroup[];
  onGroupsChange?: (groups: CircleGroup[]) => void;
};

export function MemberDetailSheet({
  theme,
  member,
  ownerId,
  ownerName,
  onClose,
  onChanged,
  onRemoved,
  onOpenCare,
  onManageCircle,
  groups = [],
  onGroupsChange,
}: Readonly<MemberDetailSheetProps>) {
  const reducedMotion = useReducedMotion();
  const last = useRef(member);
  if (member) last.current = member;
  const shown = member ?? last.current;

  const [draft, setDraft] = useState<PermissionSet | null>(null);
  const [editingRelation, setEditingRelation] = useState(false);
  const [relation, setRelation] = useState<RelationCode | null>(null);
  const [relationText, setRelationText] = useState('');
  const [care, setCare] = useState<CareValue>('NONE');
  const [busy, setBusy] = useState<'permissions' | 'relation' | 'remove' | 'reminders' | null>(null);
  const [dependentSheet, setDependentSheet] = useState<'edit' | 'caregiver' | 'handover' | null>(null);
  /** Pantalla dentro de la hoja: la lista de ajustes o el detalle de una fila. */
  const [view, setView] = useState<View_>('main');
  const [careOpen, setCareOpen] = useState(false);

  useEffect(() => {
    if (!member) return;
    setDraft(member.theyCan);
    setEditingRelation(false);
    setView('main');
  }, [member?.linkId, Boolean(member)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;

  const name = displayName(shown.person);
  const first = firstName(shown.person);
  const managing = Boolean(ownerId);
  const subject = managing ? ownerName ?? 'esta persona' : 'tu';
  const permissionsDirty = draft !== null && !samePermissions(draft, shown.theyCan);
  const careLine = careSummary(shown.care, first);
  const iCan = shown.iCan;
  const isDependent = Boolean(shown.person.isManaged);
  const canReceiveReminders = !managing && (iCan.viewMedications || iCan.viewAppointments);
  const reminders: ReminderMode = shown.reminders ?? 'OFF';

  const animate = () => {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const withToken = async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return session.accessToken;
  };

  const savePermissions = async () => {
    if (!draft) return;
    try {
      setBusy('permissions');
      const updated = await circleAPI.updatePermissions(await withToken(), shown.linkId, draft, ownerId);
      setDraft(updated.theyCan);
      onChanged(updated);
    } catch (error) {
      Alert.alert('No se pudieron guardar los permisos', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  const startEditRelation = () => {
    animate();
    const code = shown.myRelation.code as RelationCode;
    setRelation(code);
    setRelationText(code === 'OTHER' ? shown.myRelation.label ?? '' : '');
    setCare(shown.care);
    setCareOpen(false);
    setEditingRelation(true);
    setView('relation');
  };

  const saveRelation = async () => {
    if (!relation || (relation === 'OTHER' && !relationText.trim())) {
      Alert.alert('Falta la relación', 'Elige qué eres para esta persona.');
      return;
    }
    try {
      setBusy('relation');
      const updated = await circleAPI.updateLink(await withToken(), shown.linkId, {
        relation,
        relationLabel: relation === 'OTHER' ? relationText.trim() : undefined,
        care,
      });
      animate();
      setEditingRelation(false);
      setView('main');
      onChanged(updated);
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  const remove = () => {
    Alert.alert(
      managing ? `Quitar a ${first}` : `Quitar a ${first} del Círculo`,
      managing
        ? `${first} y ${ownerName ?? 'esta persona'} dejarán de compartir información en ambos sentidos.`
        : `Dejarán de compartir información en ambos sentidos: ${first} perderá los permisos que le diste y tú los que te dio. Si quieres volver a conectar, tendrás que enviar una nueva invitación.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setBusy('remove');
                await circleAPI.revokeLink(await withToken(), shown.linkId, ownerId);
                onRemoved(shown);
              } catch (error) {
                Alert.alert('No se pudo quitar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  const memberGroupIds = groups.filter((group) => group.linkIds.includes(shown.linkId)).map((group) => group.id);

  const changeGroups = async (groupIds: string[], all: CircleGroup[] = groups) => {
    // Optimista: los chips responden al instante.
    const apply = (ids: string[]) =>
      all.map((group) => ({
        ...group,
        linkIds: ids.includes(group.id)
          ? [...new Set([...group.linkIds, shown.linkId])]
          : group.linkIds.filter((linkId) => linkId !== shown.linkId),
      }));
    onGroupsChange?.(apply(groupIds));
    try {
      const result = await circleAPI.setLinkGroups(await withToken(), shown.linkId, groupIds);
      onGroupsChange?.(apply(result.groupIds));
    } catch (error) {
      onGroupsChange?.(apply(memberGroupIds));
      Alert.alert('No se pudieron guardar los grupos', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    }
  };

  const changeReminders = async (mode: ReminderMode) => {
    try {
      setBusy('reminders');
      const updated = await circleAPI.updateReminders(await withToken(), shown.linkId, mode);
      onChanged(updated);
      // Se aplican ya en este teléfono (sin esperar a reabrir la app).
      void syncOwnReminders({ force: true }).catch(() => undefined);
      if (mode !== 'OFF') void promptAlarmSetupIfNeeded();
    } catch (error) {
      Alert.alert('No se pudo cambiar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  const deleteDependent = () => {
    Alert.alert(
      `Eliminar el perfil de ${first}`,
      `Se borrarán sus medicamentos, citas y alarmas para todos sus cuidadores. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar perfil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setBusy('remove');
                await circleAPI.deleteDependent(await withToken(), shown.person.id);
                onRemoved(shown);
                void syncOwnReminders({ force: true }).catch(() => undefined);
              } catch (error) {
                Alert.alert('No se pudo eliminar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };


  // ── Resúmenes de cada fila (cómo está ahora) ──
  const permissionSummary = (value: PermissionSet, empty: string) => {
    const count = PERMISSION_KEYS.filter((key) => value[key]).length;
    if (!count) return empty;
    const preset = PERMISSION_PRESETS.find((item) => item.id === presetOf({ ...value, manageCircle: false }));
    return `${preset?.label ?? 'Personalizado'} · ${count} ${count === 1 ? 'permiso' : 'permisos'}`;
  };
  const groupSummary = groups.filter((group) => memberGroupIds.includes(group.id)).map((group) => group.name).join(', ') || 'Ninguno';
  const reminderSummary = REMINDER_OPTIONS.find((option) => option.value === reminders)?.label ?? 'No recibir';

  const open = (next: View_) => {
    animate();
    setView(next);
  };
  const back = () => open('main');

  const subTitle: Record<Exclude<View_, 'main'>, string> = {
    relation: 'Relación y cuidado',
    theyCan: `Lo que ${first} puede hacer`,
    iCan: 'Lo que tú puedes hacer',
    reminders: 'Sus recordatorios',
    groups: 'Grupo',
  };

  let footer: React.ReactNode;
  if (view === 'theyCan' && permissionsDirty) {
    footer = (
      <>
        <AppButton theme={theme} label="Descartar" variant="secondary" onPress={() => setDraft(shown.theyCan)} disabled={busy !== null} style={styles.flex} />
        <AppButton theme={theme} label="Guardar permisos" icon="checkmark" onPress={() => void savePermissions().then(back)} loading={busy === 'permissions'} style={styles.flexWide} />
      </>
    );
  } else if (view === 'relation') {
    footer = (
      <>
        <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={back} disabled={busy === 'relation'} style={styles.flex} />
        <AppButton theme={theme} label="Guardar" icon="checkmark" onPress={() => void saveRelation()} loading={busy === 'relation'} style={styles.flexWide} />
      </>
    );
  } else if (view !== 'main') {
    footer = <AppButton theme={theme} label="Listo" variant="secondary" onPress={back} style={styles.flex} />;
  } else {
    footer = <AppButton theme={theme} label="Cerrar" variant="secondary" onPress={onClose} style={styles.flex} />;
  }

  return (
    <>
      <FormSheet
        theme={theme}
        visible={Boolean(member)}
        title={view === 'main' ? name : subTitle[view]}
        subtitle={view === 'main' ? (isDependent ? 'Perfil a cargo · sin cuenta propia' : shown.person.email) : name}
        onClose={onClose}
        dismissDisabled={busy !== null}
        footer={footer}
      >
        {view !== 'main' ? (
          <Pressable onPress={back} accessibilityRole="button" style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.accentPrimaryText} />
            <Text style={[styles.backText, { color: theme.colors.accentPrimaryText }]}>Volver</Text>
          </Pressable>
        ) : null}

        {view === 'main' ? (
          <>
            {/* Relación (toca el lápiz para cambiarla) */}
            <Pressable
              disabled={managing}
              onPress={startEditRelation}
              accessibilityRole={managing ? undefined : 'button'}
              accessibilityHint={managing ? undefined : 'Cambiar relación o cuidado'}
              style={({ pressed }) => [styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }, pressed && styles.pressed]}
            >
              <View style={styles.headerRow}>
                <Avatar name={name} seed={shown.person.id} size={48} />
                <View style={styles.flex}>
                  <Text style={[styles.relationTitle, { color: theme.colors.textPrimary }]}>
                    {managing ? `${relationLabel(shown.relation)} de ${ownerName ?? 'esta persona'}` : relationToMe(shown.relation)}
                  </Text>
                  <Text style={[styles.relationSub, { color: theme.colors.textMuted }]}>
                    {managing ? `${ownerName ?? 'Esta persona'} es su` : 'Tú eres su'} {relationLabel(shown.myRelation).toLowerCase()}
                    {careLine && !managing ? ` · ${careLine}` : ''}
                  </Text>
                </View>
                {managing ? null : <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.textMuted} />}
              </View>
            </Pressable>

            {/* Permisos, recordatorios y grupo */}
            <RowGroup theme={theme}>
              {!isDependent ? (
                <SettingsRow
                  theme={theme}
                  label={managing ? `Lo que ${first} puede hacer con su información` : `Lo que ${first} puede hacer con tu información`}
                  value={permissionSummary(shown.theyCan, 'Sin acceso')}
                  onPress={() => open('theyCan')}
                />
              ) : null}
              {!managing ? (
                <SettingsRow
                  theme={theme}
                  label="Lo que tú puedes hacer"
                  value={permissionSummary(iCan, `${first} no comparte su información contigo`)}
                  onPress={() => open('iCan')}
                />
              ) : null}
              {canReceiveReminders ? (
                <SettingsRow theme={theme} label="Sus recordatorios en tu teléfono" value={reminderSummary} onPress={() => open('reminders')} />
              ) : null}
              {!managing && onGroupsChange ? (
                <SettingsRow theme={theme} label="Grupo" value={groupSummary} onPress={() => open('groups')} />
              ) : null}
            </RowGroup>

            {/* Su perfil y quién lo cuida */}
            {!managing && iCan.manageCircle ? (
              <RowGroup theme={theme}>
                {isDependent ? <SettingsRow theme={theme} label="Editar su perfil" onPress={() => setDependentSheet('edit')} /> : null}
                <SettingsRow
                  theme={theme}
                  label={isDependent ? `Quién cuida a ${first}` : `Administrar el Círculo de ${first}`}
                  value={isDependent ? 'Ver cuidadores · Agregar otro' : undefined}
                  onPress={() => onManageCircle(shown)}
                />
                {isDependent ? (
                  <SettingsRow theme={theme} label="Entregarle su cuenta" value="Cuando ya pueda usar la app" onPress={() => setDependentSheet('handover')} />
                ) : null}
              </RowGroup>
            ) : null}

            {/* Quitar */}
            <RowGroup theme={theme}>
              <SettingsRow
                theme={theme}
                label={isDependent ? `Dejar de cuidar a ${first}` : `Quitar a ${first} del Círculo`}
                value={isDependent ? 'Solo si otra persona también lo cuida' : 'Se quitan los permisos en ambos sentidos'}
                destructive
                disabled={busy !== null}
                onPress={remove}
              />
              {isDependent && iCan.manageCircle ? (
                <SettingsRow
                  theme={theme}
                  label="Eliminar el perfil"
                  value="Borra sus medicamentos, citas y alarmas"
                  destructive
                  disabled={busy !== null}
                  onPress={deleteDependent}
                />
              ) : null}
            </RowGroup>
          </>
        ) : null}

        {view === 'relation' ? (
          <View style={styles.section}>
            <SectionTitle theme={theme} title={`¿Qué eres para ${first}?`} />
            <RelationPicker
              theme={theme}
              value={relation}
              customLabel={relationText}
              onChange={setRelation}
              onCustomLabelChange={setRelationText}
              suggested={COMMON_RELATIONS}
            />
            <SectionTitle theme={theme} title="¿Quién cuida a quién?" />
            {careOpen ? (
              <CarePicker theme={theme} value={care} name={first} onChange={setCare} />
            ) : (
              <RowGroup theme={theme}>
                <SettingsRow
                  theme={theme}
                  label={CARE_OPTIONS.find((option) => option.value === care)?.title(first) ?? ''}
                  value="Toca para cambiar"
                  onPress={() => {
                    animate();
                    setCareOpen(true);
                  }}
                />
              </RowGroup>
            )}
          </View>
        ) : null}

        {view === 'theyCan' ? (
          <View style={styles.section}>
            <Text style={[styles.subHint, { color: theme.colors.textMuted }]}>
              {managing ? `Estás administrando el Círculo de ${subject}.` : 'Solo tú decides. Los cambios se aplican al guardar.'}
            </Text>
            {draft ? <PermissionEditor theme={theme} value={draft} onChange={setDraft} disabled={busy === 'permissions'} /> : null}
          </View>
        ) : null}

        {view === 'iCan' ? (
          <View style={styles.section}>
            <Text style={[styles.subHint, { color: theme.colors.textMuted }]}>
              {isDependent ? `Estás a cargo de ${first}.` : `Lo decide ${first}.`}
            </Text>
            <PermissionList theme={theme} value={iCan} perspective="iCan" emptyText={`${first} no comparte su información contigo`} />
          </View>
        ) : null}

        {view === 'reminders' ? (
          <ReminderModePicker theme={theme} value={reminders} name={first} onChange={(mode) => void changeReminders(mode)} disabled={busy !== null} />
        ) : null}

        {view === 'groups' ? (
          <View style={styles.section}>
            <Text style={[styles.subHint, { color: theme.colors.textMuted }]}>Solo tú los ves. No cambian los permisos.</Text>
            <GroupPicker
              theme={theme}
              groups={groups}
              value={memberGroupIds}
              onChange={(ids) => void changeGroups(ids)}
              onCreate={(group, next) => {
                // El grupo nuevo se crea y se le añade a esta persona.
                void changeGroups(next, [...groups, group]);
              }}
            />
          </View>
        ) : null}
      </FormSheet>

      <DependentSheet
        theme={theme}
        visible={dependentSheet === 'edit'}
        member={shown}
        onClose={() => setDependentSheet(null)}
        onSaved={(updated) => onChanged(updated)}
      />
      <CoCaregiverSheet theme={theme} visible={dependentSheet === 'caregiver'} member={shown} onClose={() => setDependentSheet(null)} />
      <HandoverSheet theme={theme} visible={dependentSheet === 'handover'} member={shown} onClose={() => setDependentSheet(null)} />
    </>
  );
}

/** Grupo de filas de ajustes (una tarjeta con separadores). */
function RowGroup({ theme, children }: Readonly<{ theme: AppTheme; children: React.ReactNode }>) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!items.length) return null;
  return (
    <View style={[styles.rowGroup, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
      {items.map((child, index) => (
        <View key={index} style={index > 0 ? [styles.rowDivider, { borderTopColor: theme.colors.surfaceBorder }] : null}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** Una fila: qué es, cómo está ahora y «›» para cambiarlo. */
function SettingsRow({
  theme,
  label,
  value,
  onPress,
  destructive = false,
  disabled = false,
}: Readonly<{ theme: AppTheme; label: string; value?: string; onPress: () => void; destructive?: boolean; disabled?: boolean }>) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}. ${value}` : label}
      style={({ pressed }) => [styles.row, (pressed || disabled) && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: destructive ? ERROR_COLOR : theme.colors.textPrimary }]}>{label}</Text>
        {value ? (
          <Text style={[styles.rowValue, { color: theme.colors.textMuted }]} numberOfLines={2}>
            {value}
          </Text>
        ) : null}
      </View>
      {destructive ? null : <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowGroup: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  rowValue: { fontSize: 13, marginTop: 2 },
  backLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 36, marginLeft: -6 },
  backText: { fontSize: 15, fontWeight: '700' },
  subHint: { fontSize: 13.5, lineHeight: 19 },
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  pressed: { opacity: 0.7 },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  relationTitle: { fontSize: 18, fontWeight: '700' },
  relationSub: { fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 8 },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  linkButtonText: { fontSize: 14, fontWeight: '700' },
  section: { gap: 12 },
  inlineActions: { flexDirection: 'row', gap: 10 },
  danger: { borderTopWidth: 1, paddingTop: 16, gap: 8 },
  dependentActions: { gap: 8 },
});
