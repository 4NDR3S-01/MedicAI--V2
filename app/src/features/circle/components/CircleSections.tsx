import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { useReducedMotion } from '../../../shared/ui';
import type { CircleInvitation, CircleMember, CircleOverview, PreviousLink } from '../services/circle.service';
import { displayName, relationLabel } from '../utils/relations';
import { MemberCard, SentInvitationCard } from './CircleCards';
import { Avatar, SectionTitle } from './CircleParts';

type Group = { id: string; title: string; hint: string; members: CircleMember[] };

/** Con muchas personas (p. ej. un médico) se dibujan por tandas. */
const PAGE_SIZE = 20;

/**
 * Agrupa por "quién está a cargo de quién", que es lo que más importa al
 * entrar: a quién cuido yo, quién me cuida a mí y el resto.
 */
function groupMembers(members: CircleMember[], managing: boolean, ownerName: string): Group[] {
  const who = managing ? ownerName : 'Tú';
  const groups: Group[] = [
    {
      id: 'cares',
      title: managing ? `Personas que ${ownerName} cuida` : 'Personas que cuidas',
      hint: `${who} ${managing ? 'está' : 'estás'} a cargo o ${managing ? 'ayuda' : 'ayudas'} con su tratamiento.`,
      members: members.filter((member) => member.care === 'I_CARE' || member.care === 'MUTUAL'),
    },
    {
      id: 'caredBy',
      title: managing ? `Cuidan a ${ownerName}` : 'Te cuidan',
      hint: managing ? 'Le ayudan con sus medicamentos o citas.' : 'Te ayudan con tus medicamentos o citas.',
      members: members.filter((member) => member.care === 'CARES_FOR_ME'),
    },
    {
      id: 'others',
      title: 'Otros miembros',
      hint: 'Conectados, sin nadie a cargo.',
      members: members.filter((member) => member.care === 'NONE'),
    },
  ];
  return groups.filter((group) => group.members.length);
}

export function CircleSections({
  theme,
  overview,
  managing = false,
  busyInvitationIds,
  onOpenMember,
  onOpenCare,
  onShareInvitation,
  onResendInvitation,
  onCancelInvitation,
  onReinvite,
}: Readonly<{
  theme: AppTheme;
  overview: CircleOverview;
  managing?: boolean;
  busyInvitationIds: Set<string>;
  onOpenMember: (member: CircleMember) => void;
  onOpenCare: (member: CircleMember) => void;
  onShareInvitation: (invitation: CircleInvitation) => void;
  onResendInvitation: (invitation: CircleInvitation) => void;
  onCancelInvitation: (invitation: CircleInvitation) => void;
  onReinvite?: (previous: PreviousLink) => void;
}>) {
  const reducedMotion = useReducedMotion();
  const [showPrevious, setShowPrevious] = useState(false);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const ownerName = displayName(overview.owner).split(/\s+/)[0];
  const groups = groupMembers(overview.members, managing, ownerName);
  const sent = overview.invitations.sent;

  return (
    <View style={styles.sections}>
      {groups.map((group) => {
        const limit = limits[group.id] ?? PAGE_SIZE;
        const hidden = group.members.length - limit;
        return (
          <View key={group.id} style={styles.section}>
            <SectionTitle theme={theme} title={`${group.title} · ${group.members.length}`} hint={group.hint} />
            {group.members.slice(0, limit).map((member) => (
              <MemberCard key={member.linkId} theme={theme} member={member} managing={managing} onPress={onOpenMember} onOpenCare={onOpenCare} />
            ))}
            {hidden > 0 ? (
              <Pressable
                onPress={() => setLimits((current) => ({ ...current, [group.id]: limit + PAGE_SIZE }))}
                accessibilityRole="button"
                style={({ pressed }) => [styles.more, { borderColor: theme.colors.surfaceBorder }, pressed && styles.pressed]}
              >
                <Text style={[styles.moreText, { color: theme.colors.accentSecondary }]}>
                  Mostrar {Math.min(hidden, PAGE_SIZE)} más · quedan {hidden}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {sent.length ? (
        <View style={styles.section}>
          <SectionTitle theme={theme} title={`Invitaciones enviadas · ${sent.length}`} hint="Esperando respuesta. Nada se comparte hasta que acepten." />
          {sent.map((invitation) => (
            <SentInvitationCard
              key={invitation.id}
              theme={theme}
              invitation={invitation}
              busy={busyInvitationIds.has(invitation.id)}
              onShare={onShareInvitation}
              onResend={onResendInvitation}
              onCancel={onCancelInvitation}
            />
          ))}
        </View>
      ) : null}

      {overview.previous.length ? (
        <View style={styles.section}>
          <Pressable
            onPress={() => {
              if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setShowPrevious((current) => !current);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: showPrevious }}
            style={({ pressed }) => [styles.previousToggle, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="history" size={18} color={theme.colors.textMuted} />
            <Text style={[styles.previousToggleText, { color: theme.colors.textMuted }]}>
              Vínculos anteriores · {overview.previous.length}
            </Text>
            <MaterialCommunityIcons name={showPrevious ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
          </Pressable>
          {showPrevious
            ? overview.previous.map((item) => (
              <View key={item.linkId} style={[styles.previous, { borderColor: theme.colors.surfaceBorder }]}>
                <Avatar name={displayName(item.person)} seed={item.person.id} size={38} />
                <View style={styles.flex}>
                  <Text style={[styles.previousName, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {displayName(item.person)} · {relationLabel(item.relation)}
                  </Text>
                  <Text style={[styles.previousMeta, { color: theme.colors.textMuted }]}>
                    {item.revokedByMe ? (managing ? `${ownerName} lo quitó` : 'Lo quitaste') : 'Salió del Círculo'}
                    {item.revokedAt ? ` el ${new Date(item.revokedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : ''}
                    {' · Sin permisos'}
                  </Text>
                </View>
                {onReinvite ? (
                  <Pressable onPress={() => onReinvite(item)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Invitar de nuevo a ${displayName(item.person)}`}>
                    <Text style={[styles.reinvite, { color: theme.colors.accentSecondary }]}>Invitar</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
            : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  sections: { gap: 22 },
  section: { gap: 10 },
  previousToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  previousToggleText: { flex: 1, fontSize: 13.5, fontWeight: '800' },
  previous: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, padding: 12 },
  previousName: { fontSize: 14, fontWeight: '700' },
  previousMeta: { fontSize: 12, marginTop: 2 },
  reinvite: { fontSize: 13.5, fontWeight: '800' },
  more: { alignItems: 'center', paddingVertical: 12, borderWidth: 1, borderRadius: 14, borderStyle: 'dashed' },
  moreText: { fontSize: 13.5, fontWeight: '800' },
});
