import { useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet } from '../../../shared/ui';
import { getStoredSession } from '../../auth';
import * as circleAPI from '../services/circle.service';
import type { CircleInvitation, CircleMember } from '../services/circle.service';
import { hasAnyPermission, normalizePermissions, type PermissionSet } from '../utils/permissions';
import {
  careSummary,
  displayName,
  firstName,
  flipCare,
  reciprocalSuggestions,
  relationToMe,
  type RelationCode,
} from '../utils/relations';
import { Avatar, Badge, InfoNote, PermissionEditor, PermissionList, RelationPicker, SectionTitle } from './CircleParts';

const STATE_MESSAGES: Record<Exclude<CircleInvitation['state'], 'PENDING'>, { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }> = {
  ACCEPTED: { icon: 'check-circle-outline', text: 'Ya aceptaste esta invitación. La persona está en tu Círculo.' },
  DECLINED: { icon: 'close-circle-outline', text: 'Rechazaste esta invitación. Si cambias de opinión, pide que te la reenvíen.' },
  CANCELED: { icon: 'cancel', text: 'Quien te invitó canceló esta invitación.' },
  EXPIRED: { icon: 'clock-alert-outline', text: 'Esta invitación venció. Pide a quien te invitó que la reenvíe.' },
};

export type InvitationReviewSheetProps = {
  theme: AppTheme;
  invitation: CircleInvitation | null;
  onClose: () => void;
  onAccepted: (member: CircleMember, invitation: CircleInvitation) => void;
  onDeclined: (invitation: CircleInvitation) => void;
};

/**
 * Antes de aceptar, la persona ve quién la invita, qué relación propone, qué
 * podrá hacer ella y qué le piden; responde "¿Qué eres para esta persona?" y
 * decide qué permisos concede (por defecto, lo solicitado).
 */
export function InvitationReviewSheet({ theme, invitation, onClose, onAccepted, onDeclined }: Readonly<InvitationReviewSheetProps>) {
  // Mantiene el contenido mientras el panel se cierra.
  const last = useRef(invitation);
  if (invitation) last.current = invitation;
  const shown = invitation ?? last.current;

  const [relation, setRelation] = useState<RelationCode | null>(null);
  const [relationText, setRelationText] = useState('');
  const [granted, setGranted] = useState<PermissionSet>(normalizePermissions(null));
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    if (!invitation) return;
    const suggestions = reciprocalSuggestions(invitation.inviterRelation.code);
    setRelation(suggestions.length === 1 ? suggestions[0] : null);
    setRelationText('');
    setGranted(normalizePermissions(invitation.requested));
    setShowErrors(false);
  }, [invitation]);

  if (!shown) return null;

  const inviterName = displayName(shown.inviter);
  const inviterFirst = firstName(shown.inviter);
  const pending = shown.state === 'PENDING';
  const careLine = careSummary(flipCare(shown.care), inviterFirst);
  const relationError = showErrors
    ? !relation
      ? `Elige qué eres para ${inviterFirst}.`
      : relation === 'OTHER' && !relationText.trim()
        ? 'Escribe qué relación tienen.'
        : null
    : null;

  const withToken = async () => {
    const session = await getStoredSession();
    if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return session.accessToken;
  };

  const accept = async () => {
    setShowErrors(true);
    if (!relation || (relation === 'OTHER' && !relationText.trim())) return;
    try {
      setBusy('accept');
      const member = await circleAPI.acceptInvitation(await withToken(), shown.id, {
        relation,
        relationLabel: relation === 'OTHER' ? relationText.trim() : undefined,
        granted,
      });
      onAccepted(member, shown);
    } catch (error) {
      Alert.alert('No se pudo aceptar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  const decline = () => {
    Alert.alert(
      'Rechazar invitación',
      `${inviterFirst} sabrá que rechazaste la invitación. No se compartirá ninguna información.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setBusy('decline');
                await circleAPI.declineInvitation(await withToken(), shown.id);
                onDeclined(shown);
              } catch (error) {
                Alert.alert('No se pudo rechazar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
              } finally {
                setBusy(null);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <FormSheet
      theme={theme}
      visible={Boolean(invitation)}
      title="Invitación al Círculo"
      onClose={onClose}
      dismissDisabled={busy !== null}
      footer={
        pending ? (
          <>
            <AppButton theme={theme} label="Rechazar" variant="secondary" onPress={decline} disabled={busy !== null} loading={busy === 'decline'} style={styles.flex} />
            <AppButton theme={theme} label="Aceptar" icon="checkmark" onPress={() => void accept()} disabled={busy !== null} loading={busy === 'accept'} style={styles.flexWide} />
          </>
        ) : (
          <AppButton theme={theme} label="Cerrar" variant="secondary" onPress={onClose} style={styles.flex} />
        )
      }
    >
      <View style={[styles.inviter, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
        <Avatar name={inviterName} seed={shown.inviter.id} size={56} />
        <View style={styles.flex}>
          <Text style={[styles.inviterName, { color: theme.colors.textPrimary }]}>{inviterName}</Text>
          <Text style={[styles.inviterEmail, { color: theme.colors.textMuted }]} numberOfLines={1}>{shown.inviter.email}</Text>
          <View style={styles.badges}>
            <Badge label={`Dice ser ${relationToMe(shown.inviterRelation).toLowerCase()}`} color={theme.colors.accentSecondary} icon="account-heart-outline" />
            {careLine ? <Badge label={careLine} color={theme.colors.accentPrimary} icon="hand-heart-outline" /> : null}
          </View>
        </View>
      </View>

      {shown.state !== 'PENDING' ? (
        <InfoNote theme={theme} icon={STATE_MESSAGES[shown.state].icon} color={theme.colors.accentTertiary}>
          {STATE_MESSAGES[shown.state].text}
        </InfoNote>
      ) : (
        <>
          <Text style={[styles.lead, { color: theme.colors.textSecondary }]}>
            {inviterFirst} te invita a su Círculo para acompañarse con medicamentos y citas. Revisa qué compartirá cada uno antes de aceptar.
          </Text>

          <SectionTitle theme={theme} title={`¿Qué eres para ${inviterFirst}?`} />
          <RelationPicker
            theme={theme}
            value={relation}
            customLabel={relationText}
            onChange={setRelation}
            onCustomLabelChange={setRelationText}
            suggested={reciprocalSuggestions(shown.inviterRelation.code)}
            error={relationError}
          />

          <SectionTitle theme={theme} title="Tú podrás" hint={`Lo decidió ${inviterFirst}.`} />
          <PermissionList theme={theme} value={shown.granted} perspective="iCan" emptyText={`No verás la información de ${inviterFirst}`} />

          <SectionTitle
            theme={theme}
            title={`${inviterFirst} podrá hacer con tu información`}
            hint={hasAnyPermission(shown.requested) ? `Es lo que pidió. Ajústalo si quieres: tú decides.` : 'No pidió acceso. Puedes darle alguno si quieres.'}
          />
          <PermissionEditor theme={theme} value={granted} onChange={setGranted} />

          <InfoNote theme={theme} icon="shield-check-outline">
            Podrás cambiar estos permisos o salir del Círculo en cualquier momento desde el detalle de {inviterFirst}.
          </InfoNote>
        </>
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  inviter: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 20, padding: 14 },
  inviterName: { fontSize: 18, fontWeight: '900' },
  inviterEmail: { fontSize: 13, marginTop: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  lead: { fontSize: 14.5, lineHeight: 21 },
});
