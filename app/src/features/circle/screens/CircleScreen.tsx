import { useCallback, useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Animated, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { FloatingActionButton, useEnterAnimation } from '../../../shared/ui';
import { EmptyState, SkeletonList } from '../../tabs/components/ScreenStates';
import { CircleSections } from '../components/CircleSections';
import { ReceivedInvitationCard } from '../components/CircleCards';
import { InfoNote, SectionTitle } from '../components/CircleParts';
import { InvitationReviewSheet } from '../components/InvitationReviewSheet';
import { InviteSheet } from '../components/InviteSheet';
import { JoinCodeSheet } from '../components/JoinCodeSheet';
import { ManagedCircleSheet } from '../components/ManagedCircleSheet';
import { MemberCareSheet } from '../components/MemberCareSheet';
import { MemberDetailSheet, type CareTab } from '../components/MemberDetailSheet';
import { shareInvitation, useCircle, withToken } from '../hooks/useCircle';
import * as circleAPI from '../services/circle.service';
import type { CircleInvitation, CircleMember } from '../services/circle.service';
import { onCircleInvite, takePendingCircleInvite } from '../services/invite-link';
import { firstName } from '../utils/relations';

export type CircleScreenProps = {
  theme: AppTheme;
  contentBottomInset: number;
};

export function CircleScreen({ theme, contentBottomInset }: Readonly<CircleScreenProps>) {
  const circle = useCircle();
  const { overview, status } = circle;
  const enter = useEnterAnimation(status !== 'loading');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | undefined>();
  const [codeVisible, setCodeVisible] = useState(false);
  const [reviewing, setReviewing] = useState<CircleInvitation | null>(null);
  const [selected, setSelected] = useState<CircleMember | null>(null);
  const [care, setCare] = useState<{ member: CircleMember; tab: CareTab } | null>(null);
  const [managed, setManaged] = useState<CircleMember | null>(null);

  // Recarga al volver a la app: alguien pudo aceptar, cambiar permisos o salir.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void circle.load();
    });
    return () => subscription.remove();
  }, [circle.load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Invitación abierta desde un enlace (medicai://circle/invite?code=…).
  const openCode = useCallback(async (code: string) => {
    try {
      const invitation = await circleAPI.openInvitationByCode(await withToken(), code);
      setCodeVisible(false);
      setReviewing(invitation);
    } catch (error) {
      Alert.alert('No se pudo abrir la invitación', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    }
  }, []);

  useEffect(() => {
    void takePendingCircleInvite().then((code) => {
      if (code) void openCode(code);
    });
    return onCircleInvite((code) => {
      void takePendingCircleInvite().then(() => openCode(code));
    });
  }, [openCode]);

  const openCare = (member: CircleMember, tab?: CareTab) => {
    const firstTab: CareTab = tab ?? (member.iCan.viewMedications ? 'medications' : member.iCan.viewAppointments ? 'appointments' : 'health');
    setCare({ member, tab: firstTab });
  };

  const handleAccepted = (member: CircleMember, invitation: CircleInvitation) => {
    setReviewing(null);
    circle.update((current) => ({
      ...current,
      members: [...current.members.filter((item) => item.linkId !== member.linkId), member],
      invitations: { ...current.invitations, received: current.invitations.received.filter((item) => item.id !== invitation.id) },
    }));
    Alert.alert('¡Ya están conectados!', `Ahora formas parte del Círculo de ${firstName(member.person)}. Puedes cambiar lo que compartes desde su ficha cuando quieras.`);
  };

  const handleDeclined = (invitation: CircleInvitation) => {
    setReviewing(null);
    circle.update((current) => ({
      ...current,
      invitations: { ...current.invitations, received: current.invitations.received.filter((item) => item.id !== invitation.id) },
    }));
  };

  if (status === 'loading') {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        <SkeletonList theme={theme} count={3} bottomInset={contentBottomInset + 100} />
      </View>
    );
  }

  const received = overview?.invitations.received ?? [];
  const hasContent = Boolean(overview && (overview.members.length || overview.invitations.sent.length || overview.previous.length));

  let body: React.ReactNode;
  if (status === 'error' && !overview) {
    body = (
      <EmptyState
        theme={theme}
        icon="connection"
        iconColor={theme.colors.accentTertiary}
        title={circle.errorMessage ?? 'No pudimos cargar tu Círculo'}
        text="Verifica tu conexión e inténtalo de nuevo."
        actionIcon="refresh"
        actionLabel="Reintentar"
        onAction={() => void circle.load()}
      />
    );
  } else if (!hasContent && !received.length) {
    body = (
      <View style={styles.empty}>
        <EmptyState
          theme={theme}
          icon="account-group-outline"
          title="Tu Círculo está vacío"
          text="Invita a familiares, cuidadores o a tu médico. Tú decides qué puede ver o hacer cada uno con tu información."
          actionIcon="account-plus"
          actionLabel="Invitar a alguien"
          onAction={() => setInviteVisible(true)}
        />
        <View style={styles.howItWorks}>
          <HowItWorks theme={theme} icon="account-plus-outline" text="Invitas por correo, código o enlace, aunque aún no tenga cuenta." />
          <HowItWorks theme={theme} icon="account-heart-outline" text="Cada uno indica qué es para el otro y quién cuida a quién." />
          <HowItWorks theme={theme} icon="shield-check-outline" text="Nadie ve nada hasta que tú lo permitas, y puedes quitarlo cuando quieras." />
        </View>
      </View>
    );
  } else if (overview) {
    body = (
      <CircleSections
        theme={theme}
        overview={overview}
        busyInvitationIds={circle.busyInvitationIds}
        onOpenMember={setSelected}
        onOpenCare={(member) => openCare(member)}
        onShareInvitation={shareInvitation}
        onResendInvitation={(invitation) => void circle.resend(invitation)}
        onCancelInvitation={circle.cancel}
        onReinvite={(previous) => {
          setInviteEmail(previous.person.email);
          setInviteVisible(true);
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Animated.View
        style={[styles.screen, enter.style]}
        renderToHardwareTextureAndroid={enter.animating}
        needsOffscreenAlphaCompositing={enter.animating}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void circle.load().finally(() => setIsRefreshing(false));
              }}
              tintColor={theme.colors.accentPrimary}
              colors={[theme.colors.accentPrimary]}
            />
          }
        >
          <View style={styles.titleBlock}>
            <View style={styles.titleTopRow}>
              <Text style={[styles.eyebrow, { color: theme.colors.accentPrimary }]}>Tu red de cuidado</Text>
              <Pressable
                onPress={() => setCodeVisible(true)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.codeButton,
                  { backgroundColor: `${theme.colors.accentPrimary}12`, borderColor: `${theme.colors.accentPrimary}30` },
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons name="ticket-confirmation-outline" size={18} color={theme.colors.accentPrimary} />
                <Text style={[styles.codeButtonText, { color: theme.colors.accentPrimary }]}>Tengo un código</Text>
              </Pressable>
            </View>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]} accessibilityRole="header">Círculo</Text>
            <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              Las personas que te acompañan con tus medicamentos y citas, y a quienes acompañas tú.
            </Text>
          </View>

          {circle.errorMessage && overview ? (
            <InfoNote theme={theme} icon="cloud-off-outline" color={theme.colors.accentTertiary}>
              Mostrando la última información guardada. {circle.errorMessage}
            </InfoNote>
          ) : null}

          {received.length ? (
            <View style={styles.section}>
              <SectionTitle theme={theme} title={`Invitaciones para ti · ${received.length}`} hint="Revisa qué compartirá cada uno antes de aceptar." />
              {received.map((invitation) => (
                <ReceivedInvitationCard key={invitation.id} theme={theme} invitation={invitation} onOpen={setReviewing} />
              ))}
            </View>
          ) : null}

          {body}
        </ScrollView>
      </Animated.View>

      {hasContent || received.length ? (
        <FloatingActionButton
          theme={theme}
          icon="account-plus"
          onPress={() => {
            setInviteEmail(undefined);
            setInviteVisible(true);
          }}
          accessibilityLabel="Invitar a tu Círculo"
          backgroundColor={theme.colors.accentPrimary}
        />
      ) : null}

      <InviteSheet
        theme={theme}
        visible={inviteVisible}
        initialEmail={inviteEmail}
        onClose={() => setInviteVisible(false)}
        onCreated={(invitation) =>
          circle.update((current) => ({
            ...current,
            invitations: { ...current.invitations, sent: [invitation, ...current.invitations.sent] },
          }))
        }
      />

      <JoinCodeSheet theme={theme} visible={codeVisible} onClose={() => setCodeVisible(false)} onOpened={(invitation) => {
        setCodeVisible(false);
        setReviewing(invitation);
      }} />

      <InvitationReviewSheet
        theme={theme}
        invitation={reviewing}
        onClose={() => setReviewing(null)}
        onAccepted={handleAccepted}
        onDeclined={handleDeclined}
      />

      <MemberDetailSheet
        theme={theme}
        member={selected}
        onClose={() => setSelected(null)}
        onChanged={(member) => {
          circle.replaceMember(member);
          setSelected(member);
        }}
        onRemoved={(member) => {
          setSelected(null);
          circle.update((current) => ({ ...current, members: current.members.filter((item) => item.linkId !== member.linkId) }));
          void circle.load();
        }}
        onOpenCare={(member, tab) => openCare(member, tab)}
        onManageCircle={setManaged}
      />

      <MemberCareSheet theme={theme} member={care?.member ?? null} initialTab={care?.tab ?? 'medications'} onClose={() => setCare(null)} />

      <ManagedCircleSheet theme={theme} member={managed} onClose={() => setManaged(null)} />
    </View>
  );
}

function HowItWorks({ theme, icon, text }: Readonly<{ theme: AppTheme; icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }>) {
  return (
    <View style={styles.howRow}>
      <View style={[styles.howIcon, { backgroundColor: `${theme.colors.accentPrimary}12` }]}>
        <MaterialCommunityIcons name={icon} size={20} color={theme.colors.accentPrimary} />
      </View>
      <Text style={[styles.howText, { color: theme.colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 14, gap: 18 },
  pressed: { opacity: 0.7 },
  section: { gap: 10 },
  titleBlock: { gap: 3 },
  titleTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  codeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, borderWidth: 1 },
  codeButtonText: { fontSize: 12.5, fontWeight: '900' },
  title: { fontSize: 32, fontWeight: '900', letterSpacing: -1, lineHeight: 36 },
  subtitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  empty: { gap: 8 },
  howItWorks: { gap: 12, paddingHorizontal: 8 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  howIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  howText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
});
