import { memo } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import type { CircleInvitation, CircleMember } from '../services/circle.service';
import { accessHeadline, hasAnyPermission } from '../utils/permissions';
import { careSummary, displayName, firstName, relationLabel, relationToMe } from '../utils/relations';
import { Avatar, Badge } from './CircleParts';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

// ─── Miembro ─────────────────────────────────────────────────────────────────

function MemberCardBase({
  theme,
  member,
  managing,
  onPress,
  onOpenCare,
}: Readonly<{
  theme: AppTheme;
  member: CircleMember;
  /** Viendo el Círculo de otra persona: los textos no hablan de "tú". */
  managing?: boolean;
  onPress: (member: CircleMember) => void;
  onOpenCare: (member: CircleMember) => void;
}>) {
  const name = displayName(member.person);
  const first = firstName(member.person);
  const careLine = managing ? null : careSummary(member.care, first);
  const canSeeSomething = !managing && (member.iCan.viewMedications || member.iCan.viewAppointments || member.iCan.viewHealth);

  return (
    <Pressable
      onPress={() => onPress(member)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${managing ? relationLabel(member.relation) : relationToMe(member.relation)}${careLine ? `, ${careLine}` : ''}`}
      accessibilityHint="Abre la relación y los permisos"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.row}>
        <Avatar name={name} seed={member.person.id} />
        <View style={styles.flex}>
          <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.relation, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {managing ? relationLabel(member.relation) : relationToMe(member.relation)}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
      </View>

      {member.person.isManaged ? (
        <Badge label="A tu cargo · sin cuenta propia" color={theme.colors.accentTertiary} icon="human-child" />
      ) : null}
      {careLine && !member.person.isManaged ? (
        <Badge label={careLine} color={member.care === 'CARES_FOR_ME' ? theme.colors.accentSecondary : theme.colors.accentPrimary} icon="hand-heart-outline" />
      ) : null}

      <View style={[styles.access, { borderTopColor: theme.colors.surfaceBorder }]}>
        <AccessLine theme={theme} icon="account-arrow-right-outline" text={accessHeadline(member.theyCan, managing ? 'thirdParty' : 'theyCan')} active={hasAnyPermission(member.theyCan)} />
        {!managing ? (
          <AccessLine theme={theme} icon="account-arrow-left-outline" text={accessHeadline(member.iCan, 'iCan')} active={hasAnyPermission(member.iCan)} />
        ) : null}
      </View>

      {canSeeSomething ? (
        <Pressable
          onPress={() => onOpenCare(member)}
          accessibilityRole="button"
          accessibilityLabel={`Ver lo que comparte ${first}`}
          style={({ pressed }) => [styles.careButton, { backgroundColor: `${theme.colors.accentSecondary}12` }, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="eye-outline" size={18} color={theme.colors.accentSecondary} />
          <Text style={[styles.careButtonText, { color: theme.colors.accentSecondary }]}>Ver lo que comparte {first}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const MemberCard = memo(MemberCardBase);

function AccessLine({ theme, icon, text, active }: Readonly<{ theme: AppTheme; icon: IconName; text: string; active: boolean }>) {
  return (
    <View style={styles.accessLine}>
      <MaterialCommunityIcons name={icon} size={16} color={active ? theme.colors.accentPrimary : theme.colors.textMuted} />
      <Text style={[styles.accessText, { color: active ? theme.colors.textSecondary : theme.colors.textMuted }]} numberOfLines={2}>{text}</Text>
    </View>
  );
}

// ─── Invitación recibida ─────────────────────────────────────────────────────

export function ReceivedInvitationCard({
  theme,
  invitation,
  onOpen,
}: Readonly<{ theme: AppTheme; invitation: CircleInvitation; onOpen: (invitation: CircleInvitation) => void }>) {
  const name = displayName(invitation.inviter);
  const forDependent = Boolean(invitation.inviter.isManaged);
  const sender = forDependent ? displayName(invitation.createdBy) : name;
  const days = daysLeft(invitation.expiresAt);
  return (
    <Pressable
      onPress={() => onOpen(invitation)}
      accessibilityRole="button"
      accessibilityLabel={forDependent ? `${sender} te invita a cuidar a ${name}. Ver invitación` : `${name} te invitó a su Círculo. Ver invitación`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: `${theme.colors.accentSecondary}0D`, borderColor: `${theme.colors.accentSecondary}55` },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.row}>
        <Avatar name={name} seed={invitation.inviter.id} />
        <View style={styles.flex}>
          <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
            {forDependent ? `Cuidar a ${name}` : `${name} te invitó`}
          </Text>
          <Text style={[styles.relation, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            {forDependent ? `Te invita ${sender}` : `Dice ser ${relationToMe(invitation.inviterRelation).toLowerCase()}`}
          </Text>
        </View>
      </View>
      <View style={styles.footerRow}>
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{days <= 1 ? 'Vence hoy' : `Vence en ${days} días`}</Text>
        <View style={[styles.cta, { backgroundColor: theme.colors.accentSecondary }]}>
          <Text style={styles.ctaText}>Ver invitación</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

// ─── Invitación enviada ──────────────────────────────────────────────────────

export function SentInvitationCard({
  theme,
  invitation,
  busy,
  onShare,
  onResend,
  onCancel,
}: Readonly<{
  theme: AppTheme;
  invitation: CircleInvitation;
  busy: boolean;
  onShare: (invitation: CircleInvitation) => void;
  onResend: (invitation: CircleInvitation) => void;
  onCancel: (invitation: CircleInvitation) => void;
}>) {
  const title = invitation.inviteeName?.trim() || invitation.inviteeEmail || 'Invitación por código';
  const pending = invitation.state === 'PENDING';
  let badge: { label: string; color: string; icon: IconName };
  if (invitation.state === 'DECLINED') badge = { label: 'Rechazada', color: theme.colors.textMuted, icon: 'close-circle-outline' };
  else if (invitation.state === 'EXPIRED') badge = { label: 'Vencida', color: theme.colors.accentTertiary, icon: 'clock-alert-outline' };
  else if (invitation.inviteeHasAccount === false) badge = { label: 'Aún no tiene cuenta', color: theme.colors.accentTertiary, icon: 'account-clock-outline' };
  else badge = { label: 'Pendiente', color: theme.colors.accentSecondary, icon: 'clock-outline' };

  const subtitle = invitation.inviteeName && invitation.inviteeEmail
    ? invitation.inviteeEmail
    : invitation.inviteeEmail
      ? null
      : `Código ${invitation.code}`;
  const explanation =
    invitation.state === 'DECLINED'
      ? 'No aceptó la invitación. Puedes reenviarla si fue un error.'
      : invitation.state === 'EXPIRED'
        ? 'Pasaron 7 días sin respuesta. Reenvíala para darle más tiempo.'
        : invitation.inviteeHasAccount === false
          ? 'Cuando se registre con este correo, verá la invitación.'
          : null;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: `${badge.color}14` }]}>
          <MaterialCommunityIcons name={invitation.inviteeEmail ? 'email-fast-outline' : 'link-variant'} size={22} color={badge.color} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.relation, { color: theme.colors.textMuted }]} numberOfLines={1}>{subtitle}</Text> : null}
          <Text style={[styles.relation, { color: theme.colors.textSecondary }]} numberOfLines={1}>
            Como su {relationLabel(invitation.inviterRelation).toLowerCase()}
          </Text>
        </View>
        <Badge label={badge.label} color={badge.color} icon={badge.icon} />
      </View>
      {explanation ? <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{explanation}</Text> : null}
      <View style={[styles.actions, { borderTopColor: theme.colors.surfaceBorder }]}>
        {pending ? <TextAction theme={theme} icon="share-variant-outline" label="Compartir" onPress={() => onShare(invitation)} disabled={busy} /> : null}
        {!pending || invitation.inviteeEmail ? (
          <TextAction theme={theme} icon="send-outline" label="Reenviar" onPress={() => onResend(invitation)} disabled={busy} />
        ) : null}
        <TextAction theme={theme} icon="close" label={pending ? 'Cancelar' : 'Quitar'} onPress={() => onCancel(invitation)} disabled={busy} danger />
      </View>
    </View>
  );
}

function TextAction({
  theme,
  icon,
  label,
  onPress,
  disabled,
  danger,
}: Readonly<{ theme: AppTheme; icon: IconName; label: string; onPress: () => void; disabled: boolean; danger?: boolean }>) {
  const color = danger ? theme.colors.accentTertiary : theme.colors.accentSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      style={({ pressed }) => [styles.textAction, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
    >
      <MaterialCommunityIcons name={icon} size={16} color={color} />
      <Text style={[styles.textActionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  card: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16.5, fontWeight: '800', letterSpacing: -0.2 },
  relation: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  access: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 6 },
  accessLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accessText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  careButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: 12 },
  careButtonText: { fontSize: 13.5, fontWeight: '800' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  meta: { fontSize: 12.5, lineHeight: 17 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  ctaText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  iconCircle: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 18, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  textActionLabel: { fontSize: 13.5, fontWeight: '800' },
});
