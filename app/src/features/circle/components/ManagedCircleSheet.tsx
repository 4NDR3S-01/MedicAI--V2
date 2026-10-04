import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet } from '../../../shared/ui';
import { shareInvitation, useCircle } from '../hooks/useCircle';
import type { CircleMember } from '../services/circle.service';
import { firstName } from '../utils/relations';
import { CircleSections } from './CircleSections';
import { InfoNote } from './CircleParts';
import { CoCaregiverSheet } from './DependentSheets';
import { InviteSheet } from './InviteSheet';
import { MemberDetailSheet } from './MemberDetailSheet';
import { PermissionHistorySheet } from './PermissionHistorySheet';

/**
 * El Círculo de otra persona, para quien tiene permiso de administrarlo:
 * puede ver sus vínculos, invitar en su nombre, cambiar los permisos que esa
 * persona da a otros (nunca los que le da a uno mismo) y quitar vínculos.
 */
export function ManagedCircleSheet({
  theme,
  member,
  onClose,
}: Readonly<{ theme: AppTheme; member: CircleMember | null; onClose: () => void }>) {
  const last = useRef(member);
  if (member) last.current = member;
  const shown = member ?? last.current;
  const ownerId = shown?.person.id;
  const circle = useCircle(ownerId, Boolean(member));
  const [inviteVisible, setInviteVisible] = useState(false);
  const [selected, setSelected] = useState<CircleMember | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

  if (!shown) return null;
  const name = firstName(shown.person);

  return (
    <>
      <FormSheet
        theme={theme}
        visible={Boolean(member)}
        title={shown.person.isManaged ? `Quién cuida a ${name}` : `Círculo de ${name}`}
        subtitle={shown.person.isManaged ? 'Sus cuidadores y lo que puede hacer cada uno.' : 'Lo administras con el permiso que te dio.'}
        onClose={onClose}
        footer={
          <>
            <AppButton theme={theme} label="Cerrar" variant="secondary" onPress={onClose} style={styles.flex} />
            <AppButton
              theme={theme}
              label={shown.person.isManaged ? 'Agregar cuidador' : 'Invitar'}
              icon="person-add-outline"
              iconPosition="left"
              onPress={() => setInviteVisible(true)}
              disabled={circle.status !== 'ready'}
              style={styles.flexWide}
            />
          </>
        }
      >
        {circle.status === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.accentPrimary} />
          </View>
        ) : circle.status === 'error' || !circle.overview ? (
          <>
            <InfoNote theme={theme} icon="alert-circle-outline" color={theme.colors.accentTertiary}>
              {circle.errorMessage ?? 'No se pudo cargar.'}
            </InfoNote>
            <AppButton theme={theme} label="Reintentar" variant="secondary" icon="refresh" iconPosition="left" onPress={() => void circle.load()} />
          </>
        ) : (
          <>
            <InfoNote theme={theme} icon="shield-account-outline">
              Las invitaciones que envíes saldrán a nombre de {name}. No puedes cambiar los permisos que {name} te da a ti.
            </InfoNote>
            {circle.overview.members.length || circle.overview.invitations.sent.length ? (
              <CircleSections
                theme={theme}
                overview={circle.overview}
                managing
                busyInvitationIds={circle.busyInvitationIds}
                onOpenMember={setSelected}
                onOpenCare={setSelected}
                onShareInvitation={shareInvitation}
                onResendInvitation={(invitation) => void circle.resend(invitation)}
                onCancelInvitation={circle.cancel}
              />
            ) : (
              <InfoNote theme={theme} icon="account-group-outline">El Círculo de {name} no tiene más personas todavía.</InfoNote>
            )}
            <AppButton
              theme={theme}
              label="Historial de accesos"
              icon="time-outline"
              iconPosition="left"
              variant="secondary"
              onPress={() => setHistoryVisible(true)}
            />
          </>
        )}
      </FormSheet>

      <PermissionHistorySheet
        theme={theme}
        visible={historyVisible && Boolean(member)}
        ownerId={ownerId}
        ownerName={name}
        onClose={() => setHistoryVisible(false)}
      />

      <CoCaregiverSheet
        theme={theme}
        visible={inviteVisible && Boolean(shown.person.isManaged)}
        member={shown}
        onClose={() => setInviteVisible(false)}
        onCreated={(invitation) =>
          circle.update((current) => ({
            ...current,
            invitations: { ...current.invitations, sent: [invitation, ...current.invitations.sent] },
          }))
        }
      />

      <InviteSheet
        theme={theme}
        visible={inviteVisible && !shown.person.isManaged}
        ownerId={ownerId}
        ownerName={name}
        onClose={() => setInviteVisible(false)}
        onCreated={(invitation) =>
          circle.update((current) => ({
            ...current,
            invitations: { ...current.invitations, sent: [invitation, ...current.invitations.sent] },
          }))
        }
      />

      <MemberDetailSheet
        theme={theme}
        member={selected}
        ownerId={ownerId}
        ownerName={name}
        onClose={() => setSelected(null)}
        onChanged={(updated) => {
          circle.replaceMember(updated);
          setSelected(updated);
        }}
        onRemoved={(removed) => {
          setSelected(null);
          circle.update((current) => ({ ...current, members: current.members.filter((item) => item.linkId !== removed.linkId) }));
          // Recarga para que aparezca en "Vínculos anteriores".
          void circle.load();
        }}
        onOpenCare={() => undefined}
        onManageCircle={() => undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  center: { paddingVertical: 32, alignItems: 'center' },
});
