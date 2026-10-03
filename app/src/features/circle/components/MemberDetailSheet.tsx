import { useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet, useReducedMotion } from '../../../shared/ui';
import { syncOwnReminders } from '../../tabs/services/reminders-sync';
import { ensureAlarmPermissions } from '../../../shared/services/alarm-permissions.service';
import { getStoredSession } from '../../auth';
import * as circleAPI from '../services/circle.service';
import type { CircleGroup, CircleMember, ReminderMode } from '../services/circle.service';
import { samePermissions, type PermissionSet } from '../utils/permissions';
import {
  careSummary,
  displayName,
  firstName,
  relationLabel,
  relationToMe,
  type CareValue,
  type RelationCode,
} from '../utils/relations';
import { Avatar, Badge, CarePicker, InfoNote, PermissionEditor, PermissionList, RelationPicker, ReminderModePicker, SectionTitle } from './CircleParts';
import { CoCaregiverSheet, DependentSheet, HandoverSheet } from './DependentSheets';
import { GroupPicker } from './CircleGroups';


export type CareTab = 'medications' | 'appointments' | 'health';

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

  useEffect(() => {
    if (!member) return;
    setDraft(member.theyCan);
    setEditingRelation(false);
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
    setEditingRelation(true);
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
    if (mode !== 'OFF') {
      const { ready } = await ensureAlarmPermissions();
      if (!ready) {
        Alert.alert('Permisos incompletos', 'Concede los permisos de notificaciones y alarmas para recibir sus recordatorios.');
        return;
      }
    }
    try {
      setBusy('reminders');
      const updated = await circleAPI.updateReminders(await withToken(), shown.linkId, mode);
      onChanged(updated);
      // Se aplican ya en este teléfono (sin esperar a reabrir la app).
      void syncOwnReminders({ force: true }).catch(() => undefined);
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

  const careActions: { tab: CareTab; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; allowed: boolean }[] = [
    { tab: 'medications', label: 'Medicamentos', icon: 'pill', allowed: iCan.viewMedications },
    { tab: 'appointments', label: 'Citas', icon: 'calendar-heart', allowed: iCan.viewAppointments },
    { tab: 'health', label: 'Salud', icon: 'heart-pulse', allowed: iCan.viewHealth },
  ];
  const visibleCareActions = managing ? [] : careActions.filter((action) => action.allowed);

  return (
    <>
      <FormSheet
        theme={theme}
        visible={Boolean(member)}
        title={name}
        subtitle={isDependent ? 'Perfil a cargo · sin cuenta propia' : shown.person.email}
        onClose={onClose}
        dismissDisabled={busy !== null}
        footer={
          permissionsDirty ? (
            <>
              <AppButton theme={theme} label="Descartar" variant="secondary" onPress={() => setDraft(shown.theyCan)} disabled={busy !== null} style={styles.flex} />
              <AppButton theme={theme} label="Guardar permisos" icon="checkmark" onPress={() => void savePermissions()} loading={busy === 'permissions'} style={styles.flexWide} />
            </>
          ) : (
            <AppButton theme={theme} label="Cerrar" variant="secondary" onPress={onClose} style={styles.flex} />
          )
        }
      >
        {/* Relación */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
          <View style={styles.headerRow}>
            <Avatar name={name} seed={shown.person.id} size={56} />
            <View style={styles.flex}>
              <Text style={[styles.relationTitle, { color: theme.colors.textPrimary }]}>
                {managing ? `${relationLabel(shown.relation)} de ${ownerName ?? 'esta persona'}` : relationToMe(shown.relation)}
              </Text>
              <Text style={[styles.relationSub, { color: theme.colors.textMuted }]}>
                {managing ? `${ownerName ?? 'Esta persona'} es su` : 'Tú eres su'} {relationLabel(shown.myRelation).toLowerCase()}
              </Text>
              {careLine && !managing ? (
                <View style={styles.badgeRow}>
                  <Badge label={careLine} color={theme.colors.accentPrimary} icon="hand-heart-outline" />
                </View>
              ) : null}
            </View>
          </View>
          {!managing && !editingRelation ? (
            <Pressable onPress={startEditRelation} accessibilityRole="button" style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="pencil-outline" size={16} color={theme.colors.accentSecondary} />
              <Text style={[styles.linkButtonText, { color: theme.colors.accentSecondary }]}>Cambiar relación o cuidado</Text>
            </Pressable>
          ) : null}
        </View>

        {editingRelation ? (
          <View style={styles.section}>
            <SectionTitle theme={theme} title={`¿Qué eres para ${first}?`} />
            <RelationPicker theme={theme} value={relation} customLabel={relationText} onChange={setRelation} onCustomLabelChange={setRelationText} />
            <SectionTitle theme={theme} title="¿Quién cuida a quién?" />
            <CarePicker theme={theme} value={care} name={first} onChange={setCare} />
            <View style={styles.inlineActions}>
              <AppButton
                theme={theme}
                label="Cancelar"
                variant="secondary"
                onPress={() => {
                  animate();
                  setEditingRelation(false);
                }}
                disabled={busy === 'relation'}
                style={styles.flex}
              />
              <AppButton theme={theme} label="Guardar" icon="checkmark" onPress={() => void saveRelation()} loading={busy === 'relation'} style={styles.flexWide} />
            </View>
          </View>
        ) : null}

        {/* Grupos (privados) */}
      {!managing && onGroupsChange ? (
        <View style={styles.section}>
          <SectionTitle theme={theme} title="Grupos" hint="Solo tú los ves. No cambian los permisos." />
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

      {/* Lo que puedo hacer yo con su información */}
        {!managing ? (
          <View style={styles.section}>
            <SectionTitle theme={theme} title="Tú puedes" hint={isDependent ? `Estás a cargo de ${first}.` : `Lo decide ${first}.`} />
            <PermissionList theme={theme} value={iCan} perspective="iCan" emptyText={`${first} no comparte su información contigo`} />
            {visibleCareActions.length ? (
              <View style={styles.careActions}>
                {visibleCareActions.map((action) => (
                  <Pressable
                    key={action.tab}
                    onPress={() => onOpenCare(shown, action.tab)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ver ${action.label.toLowerCase()} de ${first}`}
                    style={({ pressed }) => [
                      styles.careAction,
                      { backgroundColor: `${theme.colors.accentSecondary}12`, borderColor: `${theme.colors.accentSecondary}30` },
                      pressed && styles.pressed,
                    ]}
                  >
                    <MaterialCommunityIcons name={action.icon} size={20} color={theme.colors.accentSecondary} />
                    <Text style={[styles.careActionText, { color: theme.colors.accentSecondary }]}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {canReceiveReminders ? (
              <ReminderModePicker
                theme={theme}
                value={reminders}
                name={first}
                onChange={(mode) => void changeReminders(mode)}
                disabled={busy !== null}
              />
            ) : null}
            {isDependent && iCan.manageCircle ? (
              <View style={styles.dependentActions}>
                <AppButton theme={theme} label="Editar su perfil" icon="create-outline" iconPosition="left" variant="secondary" onPress={() => setDependentSheet('edit')} />
                <AppButton theme={theme} label="Agregar otro cuidador" icon="person-add-outline" iconPosition="left" variant="secondary" onPress={() => setDependentSheet('caregiver')} />
                <AppButton theme={theme} label="Entregarle su cuenta" icon="key-outline" iconPosition="left" variant="ghost" onPress={() => setDependentSheet('handover')} />
              </View>
            ) : null}
            {iCan.manageCircle ? (
              <AppButton
                theme={theme}
                label={isDependent ? `Ver quién cuida a ${first}` : `Administrar el Círculo de ${first}`}
                icon="people-outline"
                iconPosition="left"
                variant="secondary"
                onPress={() => onManageCircle(shown)}
              />
            ) : null}
          </View>
        ) : null}

        {/* Lo que la otra persona puede hacer con mi información (un perfil a cargo no usa la app) */}
        {!isDependent ? (
          <View style={styles.section}>
            <SectionTitle
              theme={theme}
              title={`Lo que ${first} puede hacer con ${managing ? `la información de ${subject}` : 'tu información'}`}
              hint={managing ? `Estás administrando el Círculo de ${subject}.` : 'Solo tú decides. Los cambios se aplican al guardar.'}
            />
            {draft ? <PermissionEditor theme={theme} value={draft} onChange={setDraft} disabled={busy === 'permissions'} /> : null}
          </View>
        ) : null}

        {/* Quitar */}
        <View style={[styles.danger, { borderColor: `${theme.colors.accentTertiary}40` }]}>
          <InfoNote theme={theme} icon="link-variant-off" color={theme.colors.accentTertiary}>
            {isDependent
              ? `Si dejas de cuidar a ${first}, perderás el acceso a su información. Solo es posible si otra persona también lo administra.`
              : `Al quitar a ${first}, se eliminan todos los permisos entre ${managing ? `${first} y ${subject}` : 'ustedes'} de inmediato.`}
          </InfoNote>
          {isDependent && iCan.manageCircle ? (
            <AppButton
              theme={theme}
              label={`Eliminar el perfil de ${first}`}
              icon="trash-outline"
              iconPosition="left"
              variant="ghost"
              onPress={deleteDependent}
              disabled={busy !== null}
            />
          ) : null}
          <AppButton
            theme={theme}
            label={isDependent ? `Dejar de cuidar a ${first}` : `Quitar a ${first} del Círculo`}
            icon="person-remove-outline"
            iconPosition="left"
            variant="ghost"
            onPress={remove}
            loading={busy === 'remove'}
            disabled={busy !== null && busy !== 'remove'}
          />
        </View>
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  pressed: { opacity: 0.7 },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  relationTitle: { fontSize: 18, fontWeight: '900' },
  relationSub: { fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 8 },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  linkButtonText: { fontSize: 13.5, fontWeight: '800' },
  section: { gap: 12 },
  inlineActions: { flexDirection: 'row', gap: 10 },
  careActions: { flexDirection: 'row', gap: 8 },
  careAction: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  careActionText: { fontSize: 12.5, fontWeight: '800' },
  danger: { borderTopWidth: 1, paddingTop: 16, gap: 8 },
  dependentActions: { gap: 8 },
});
