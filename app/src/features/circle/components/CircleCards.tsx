import { memo } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { readableText, type AppTheme } from '../../../shared/theme';
import type { CircleInvitation, CircleMember } from '../services/circle.service';
import { accessHeadline } from '../utils/permissions';
import { careParts, type CareRowData } from './CareTodayPanel';
import { displayName, relationLabel, relationToMe } from '../utils/relations';
import { Avatar, Badge } from './CircleParts';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

// ─── Miembro ─────────────────────────────────────────────────────────────────

function MemberCardBase({
  theme,
  member,
  managing,
  care,
  careLoading,
  now,
  onPress,
  onOpenCare,
}: Readonly<{
  theme: AppTheme;
  member: CircleMember;
  /** Viendo el Círculo de otra persona: los textos no hablan de "tú". */
  managing?: boolean;
  /** Su día (tomas y citas), si comparte contigo. */
  care?: CareRowData;
  /** Su día aún se está cargando. */
  careLoading?: boolean;
  now?: Date;
  onPress: (member: CircleMember) => void;
  onOpenCare: (member: CircleMember) => void;
}>) {
  const name = displayName(member.person);
  const relation = managing ? relationLabel(member.relation) : relationToMe(member.relation);
  const canSeeSomething = !managing && (member.iCan.viewMedications || member.iCan.viewAppointments || member.iCan.viewHealth);
  // Con tomas hoy, el progreso va en la barra; el texto queda para lo que hay que hacer.
  const showBar = Boolean(care?.total);
  const parts = care ? careParts(care, now ?? new Date(), { omitProgress: showBar }) : null;
  const needsAttention = Boolean(parts?.some((part) => part.tone === 'alert'));
  // Sin datos del día: una sola línea con lo que se comparte (lo relevante según quién cuida a quién).
  const accessText = member.care === 'I_CARE' && !managing
    ? accessHeadline(member.iCan, 'iCan')
    : accessHeadline(member.theyCan, managing ? 'thirdParty' : 'theyCan');
  const toneColor = { alert: theme.colors.warningText, ok: theme.colors.successText, muted: theme.colors.textSecondary };

  // Lo más usado es ver su día; la relación y los permisos quedan a un toque largo (o desde su ficha).
  const open = canSeeSomething ? () => onOpenCare(member) : () => onPress(member);

  return (
    <Pressable
      onPress={open}
      onLongPress={canSeeSomething ? () => onPress(member) : undefined}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${relation}${member.person.isManaged ? ', a tu cargo' : ''}. ${parts ? parts.map((part) => part.text).join(', ') : accessText}`}
      accessibilityHint={canSeeSomething ? 'Abre lo que comparte. Mantén presionado para relación y permisos' : 'Abre la relación y los permisos'}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: needsAttention ? `${theme.colors.accentTertiary}66` : theme.colors.surfaceBorder },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.row}>
        <View>
          <Avatar name={name} seed={member.person.id} />
          {needsAttention ? <View style={[styles.attentionDot, { backgroundColor: theme.colors.accentTertiary, borderColor: theme.colors.surface }]} /> : null}
        </View>
        <View style={styles.flex}>
          <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.relation, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {relation}
            {member.person.isManaged ? <Text style={{ color: theme.colors.warningText }}> · A tu cargo</Text> : null}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
      </View>

      <View style={[styles.status, { borderTopColor: theme.colors.surfaceBorder }]}>
        {care && showBar ? <DayBar theme={theme} care={care} /> : null}
        {parts?.length ? (
          <Text style={styles.statusText} numberOfLines={2}>
            {parts.map((part, index) => (
              <Text key={part.text} style={{ color: toneColor[part.tone], fontWeight: part.tone === 'muted' ? '500' : '700' }}>
                {index > 0 ? ' · ' : ''}
                {part.text}
              </Text>
            ))}
          </Text>
        ) : care ? null : careLoading && canSeeSomething ? (
          <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>Cargando su día…</Text>
        ) : (
          <Text style={[styles.statusText, { color: theme.colors.textSecondary }]} numberOfLines={2}>{accessText}</Text>
        )}
      </View>
    </Pressable>
  );
}

export const MemberCard = memo(MemberCardBase);

/** Tomas del día de una persona: barra fina + "2/4". */
function DayBar({ theme, care }: Readonly<{ theme: AppTheme; care: CareRowData }>) {
  const complete = care.taken === care.total;
  const pending = care.missed > 0 || care.due > 0;
  const tone = pending ? theme.colors.accentTertiary : complete ? theme.colors.success : theme.colors.accentPrimary;
  const toneText = pending ? theme.colors.warningText : complete ? theme.colors.successText : theme.colors.accentPrimaryText;
  return (
    <View style={styles.dayBar}>
      <View style={[styles.dayTrack, { backgroundColor: `${tone}22` }]}>
        <View style={[styles.dayFill, { backgroundColor: tone, width: `${Math.round((care.taken / care.total) * 100)}%` }]} />
      </View>
      <Text style={[styles.dayCount, { color: toneText }]}>
        {care.taken}/{care.total}
      </Text>
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
        <View style={[styles.cta, { backgroundColor: theme.colors.accentSecondaryText }]}>
          <Text style={[styles.ctaText, { color: theme.colors.background }]}>Ver invitación</Text>
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
  else if (invitation.state === 'EXPIRED') badge = { label: 'Vencida', color: theme.colors.warningText, icon: 'clock-alert-outline' };
  else if (invitation.inviteeHasAccount === false) badge = { label: 'Aún no tiene cuenta', color: theme.colors.warningText, icon: 'account-clock-outline' };
  else badge = { label: 'Pendiente', color: theme.colors.accentSecondaryText, icon: 'clock-outline' };

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
      <Text style={[styles.textActionLabel, { color: readableText(theme, color) }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  card: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  relation: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  cardPressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
  attentionDot: { position: 'absolute', right: -2, top: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  status: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  dayBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  dayFill: { height: '100%', borderRadius: 3 },
  dayCount: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 28, textAlign: 'right' },
  statusText: { fontSize: 14, lineHeight: 19 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  meta: { fontSize: 13, lineHeight: 17 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  iconCircle: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 18, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  textAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  textActionLabel: { fontSize: 14, fontWeight: '700' },
});
