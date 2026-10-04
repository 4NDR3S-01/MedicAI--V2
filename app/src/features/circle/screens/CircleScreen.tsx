import { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, Animated, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { BottomSheet, FloatingActionButton, SelectField, useEnterAnimation } from '../../../shared/ui';
import { syncOwnReminders } from '../../tabs/services/reminders-sync';
import { EmptyState, SkeletonList } from '../../tabs/components/ScreenStates';
import { CareTodayPanel, useCareData } from '../components/CareTodayPanel';
import { GroupsSheet } from '../components/CircleGroups';
import { PermissionHistorySheet } from '../components/PermissionHistorySheet';
import { CircleSections } from '../components/CircleSections';
import { DependentSheet } from '../components/DependentSheets';
import { ReceivedInvitationCard } from '../components/CircleCards';
import { InfoNote, SearchBar, SectionTitle } from '../components/CircleParts';
import { InvitationReviewSheet } from '../components/InvitationReviewSheet';
import { InviteSheet } from '../components/InviteSheet';
import { JoinCodeSheet } from '../components/JoinCodeSheet';
import { ManagedCircleSheet } from '../components/ManagedCircleSheet';
import { MemberCareSheet } from '../components/MemberCareSheet';
import { MemberDetailSheet, type CareTab } from '../components/MemberDetailSheet';
import { shareInvitation, useCircle, withToken } from '../hooks/useCircle';
import * as circleAPI from '../services/circle.service';
import type { CircleGroup, CircleInvitation, CircleMember, CircleOverview } from '../services/circle.service';
import { onCircleInvite, takePendingCircleInvite } from '../services/invite-link';
import { displayName, firstName, relationLabel } from '../utils/relations';

/** A partir de cuántas personas aparece el buscador. */
const SEARCH_THRESHOLD = 4;

/** Sin tildes ni mayúsculas: "jose" encuentra a "José". */
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function filterOverview(overview: CircleOverview, query: string): CircleOverview {
  const needle = normalize(query);
  if (!needle) return overview;
  const matches = (...values: (string | null | undefined)[]) => values.some((value) => value && normalize(value).includes(needle));
  return {
    ...overview,
    members: overview.members.filter((member) =>
      matches(displayName(member.person), member.person.email, relationLabel(member.relation)),
    ),
    invitations: {
      ...overview.invitations,
      sent: overview.invitations.sent.filter((invitation) => matches(invitation.inviteeName, invitation.inviteeEmail, invitation.code)),
    },
    previous: overview.previous.filter((item) => matches(displayName(item.person), item.person.email)),
  };
}

/** 'all', 'none' (sin grupo) o el id de un grupo. */
type GroupFilter = string;

function filterByGroup(overview: CircleOverview, filter: GroupFilter): CircleOverview {
  if (filter === 'all') return overview;
  const groups = overview.groups ?? [];
  const inGroup = (linkId: string) =>
    filter === 'none'
      ? !groups.some((group) => group.linkIds.includes(linkId))
      : Boolean(groups.find((group) => group.id === filter)?.linkIds.includes(linkId));
  // Al filtrar por grupo solo se muestran personas (no invitaciones ni historial).
  return {
    ...overview,
    members: overview.members.filter((member) => inGroup(member.linkId)),
    invitations: { ...overview.invitations, sent: [] },
    previous: [],
  };
}

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
  const [query, setQuery] = useState('');
  const [addChoice, setAddChoice] = useState(false);
  const [dependentVisible, setDependentVisible] = useState(false);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [groupsVisible, setGroupsVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);

  const groups = overview?.groups ?? [];
  const setGroups = (next: CircleGroup[]) => circle.update((current) => ({ ...current, groups: next }));
  // Si se borra el grupo filtrado, se vuelve a "Todos".
  useEffect(() => {
    if (groupFilter !== 'all' && groupFilter !== 'none' && !groups.some((group) => group.id === groupFilter)) setGroupFilter('all');
  }, [groups, groupFilter]);

  // Seguimiento: solo si alguien comparte medicamentos o citas conmigo.
  const caresForSomeone = Boolean(overview?.members.some((member) => member.iCan.viewMedications || member.iCan.viewAppointments));
  const careData = useCareData(caresForSomeone);

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

  const handleAccepted = (member: CircleMember, invitation: CircleInvitation, groupIds: string[]) => {
    setReviewing(null);
    circle.update((current) => ({
      ...current,
      members: [...current.members.filter((item) => item.linkId !== member.linkId), member],
      invitations: { ...current.invitations, received: current.invitations.received.filter((item) => item.id !== invitation.id) },
      // Los grupos elegidos al aceptar se ven ya (antes había que recargar).
      groups: (current.groups ?? []).map((group) =>
        groupIds.includes(group.id) ? { ...group, linkIds: [...new Set([...group.linkIds, member.linkId])] } : group,
      ),
    }));
    void circle.load();
    void syncOwnReminders({ force: true }).catch(() => undefined);
    Alert.alert('¡Ya están conectados!', `Ahora formas parte del Círculo de ${firstName(member.person)}. Puedes cambiar lo que compartes desde su ficha cuando quieras.`);
  };

  const handleDeclined = (invitation: CircleInvitation) => {
    setReviewing(null);
    circle.update((current) => ({
      ...current,
      invitations: { ...current.invitations, received: current.invitations.received.filter((item) => item.id !== invitation.id) },
    }));
  };

  const peopleCount = overview ? overview.members.length + overview.invitations.sent.length : 0;
  const showSearch = peopleCount >= SEARCH_THRESHOLD;
  const visibleOverview = useMemo(() => {
    if (!overview) return overview;
    const grouped = filterByGroup(overview, groupFilter);
    return showSearch ? filterOverview(grouped, query) : grouped;
  }, [overview, query, showSearch, groupFilter]);
  const groupOptions = useMemo(
    () => [
      { value: 'all', label: `Todos (${overview?.members.length ?? 0})` },
      ...groups.map((group) => ({ value: group.id, label: `${group.name} (${group.linkIds.length})` })),
      ...(groups.length ? [{ value: 'none', label: 'Sin grupo' }] : []),
    ],
    [groups, overview?.members.length],
  );
  const noResults = Boolean(
    (query.trim() || groupFilter !== 'all') && visibleOverview
      && !visibleOverview.members.length && !visibleOverview.invitations.sent.length && !visibleOverview.previous.length,
  );

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
          compact
          icon="account-group-outline"
          title="Tu Círculo está vacío"
          text="Invita a familiares, cuidadores o a tu médico. Tú decides qué ve cada uno."
          actionIcon="account-plus"
          actionLabel="Agregar a alguien"
          onAction={() => setAddChoice(true)}
        />
        <View style={[styles.howItWorks, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
          <HowItWorks theme={theme} icon="account-plus-outline" text="Invita por correo, código o enlace." />
          <HowItWorks theme={theme} icon="human-child" text="Agrega a quien no usa la app, como tu hijo." />
          <HowItWorks theme={theme} icon="account-heart-outline" text="Indiquen su relación y quién cuida a quién." />
          <HowItWorks theme={theme} icon="shield-check-outline" text="Nadie ve nada sin tu permiso." />
        </View>
      </View>
    );
  } else if (noResults) {
    body = (
      <InfoNote theme={theme} icon="account-search-outline">
        {query.trim()
          ? `Nadie coincide con «${query.trim()}». Prueba con su nombre, correo o relación.`
          : 'No hay nadie en este grupo. Añade personas desde su ficha, en «Grupos».'}
      </InfoNote>
    );
  } else if (visibleOverview) {
    body = (
      <CircleSections
        theme={theme}
        overview={visibleOverview}
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void Promise.all([circle.load(), caresForSomeone ? careData.load() : Promise.resolve()]).finally(() => setIsRefreshing(false));
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

          {caresForSomeone && careData.data && visibleOverview ? (
            <CareTodayPanel theme={theme} members={visibleOverview.members} data={careData.data} onOpen={(member) => openCare(member)} />
          ) : null}

          {overview?.members.length ? (
            <View style={styles.toolbar}>
              {groups.length ? (
                <SelectField
                  theme={theme}
                  value={groupFilter}
                  options={groupOptions}
                  onChange={setGroupFilter}
                  accessibilityLabel="Mostrar grupo"
                  style={styles.groupSelect}
                />
              ) : (
                <Text style={[styles.toolbarHint, { color: theme.colors.textMuted }]}>Organiza a las personas en grupos</Text>
              )}
              <Pressable
                onPress={() => setGroupsVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Administrar grupos"
                style={({ pressed }) => [
                  styles.groupsButton,
                  { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder },
                  pressed && styles.pressed,
                ]}
              >
                <MaterialCommunityIcons name="folder-account-outline" size={20} color={theme.colors.accentSecondary} />
                <Text style={[styles.groupsButtonText, { color: theme.colors.accentSecondary }]}>Grupos</Text>
              </Pressable>
            </View>
          ) : null}

          {showSearch ? (
            <SearchBar theme={theme} value={query} onChange={setQuery} placeholder="Buscar por nombre, correo o relación" />
          ) : null}

          {body}

          {overview ? (
            <Pressable
              onPress={() => setHistoryVisible(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.historyLink, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="history" size={18} color={theme.colors.textSecondary} />
              <Text style={[styles.historyLinkText, { color: theme.colors.textSecondary }]}>Historial de accesos a tu información</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </ScrollView>
      </Animated.View>

      {hasContent || received.length ? (
        <FloatingActionButton
          theme={theme}
          icon="account-plus"
          onPress={() => setAddChoice(true)}
          accessibilityLabel="Agregar a tu Círculo"
          backgroundColor={theme.colors.accentPrimary}
        />
      ) : null}

      <GroupsSheet theme={theme} visible={groupsVisible} groups={groups} onClose={() => setGroupsVisible(false)} onChange={setGroups} />
      <PermissionHistorySheet theme={theme} visible={historyVisible} onClose={() => setHistoryVisible(false)} />

      <InviteSheet
        theme={theme}
        visible={inviteVisible}
        groups={groups}
        onGroupCreated={(group) => setGroups([...groups, group])}
        initialEmail={inviteEmail}
        onClose={() => setInviteVisible(false)}
        onCreated={(invitation) =>
          circle.update((current) => ({
            ...current,
            invitations: { ...current.invitations, sent: [invitation, ...current.invitations.sent] },
          }))
        }
      />

      <AddChoiceSheet
        theme={theme}
        visible={addChoice}
        onClose={() => setAddChoice(false)}
        onInvite={() => {
          setAddChoice(false);
          setInviteEmail(undefined);
          setInviteVisible(true);
        }}
        onDependent={() => {
          setAddChoice(false);
          setDependentVisible(true);
        }}
      />

      <DependentSheet
        theme={theme}
        visible={dependentVisible}
        groups={groups}
        onGroupCreated={(group) => setGroups([...groups, group])}
        onClose={() => setDependentVisible(false)}
        onSaved={(member) => {
          // Recarga para reflejar también sus grupos.
          circle.update((current) => ({ ...current, members: [...current.members, member] }));
          void circle.load();
          // Sus alarmas empiezan a sonar en este teléfono.
          void syncOwnReminders({ force: true }).catch(() => undefined);
        }}
      />

      <JoinCodeSheet theme={theme} visible={codeVisible} onClose={() => setCodeVisible(false)} onOpened={(invitation) => {
        setCodeVisible(false);
        setReviewing(invitation);
      }} />

      <InvitationReviewSheet
        theme={theme}
        invitation={reviewing}
        groups={groups}
        onGroupCreated={(group) => setGroups([...groups, group])}
        onClose={() => setReviewing(null)}
        onAccepted={handleAccepted}
        onDeclined={handleDeclined}
      />

      <MemberDetailSheet
        theme={theme}
        member={selected}
        groups={groups}
        onGroupsChange={setGroups}
        onClose={() => setSelected(null)}
        onChanged={(member) => {
          circle.replaceMember(member);
          setSelected(member);
        }}
        onRemoved={(member) => {
          setSelected(null);
          circle.update((current) => ({ ...current, members: current.members.filter((item) => item.linkId !== member.linkId) }));
          void circle.load();
          // Sus alarmas dejan de sonar en este teléfono.
          void syncOwnReminders({ force: true }).catch(() => undefined);
        }}
        onOpenCare={(member, tab) => openCare(member, tab)}
        onManageCircle={setManaged}
      />

      <MemberCareSheet
        theme={theme}
        member={care?.member ?? null}
        initialTab={care?.tab ?? 'medications'}
        onClose={() => {
          setCare(null);
          // Pudo registrar tomas o cambiar citas: el seguimiento se actualiza.
          if (caresForSomeone) void careData.load();
        }}
      />

      <ManagedCircleSheet theme={theme} member={managed} onClose={() => setManaged(null)} />
    </View>
  );
}

function AddChoiceSheet({
  theme,
  visible,
  onClose,
  onInvite,
  onDependent,
}: Readonly<{ theme: AppTheme; visible: boolean; onClose: () => void; onInvite: () => void; onDependent: () => void }>) {
  const options = [
    {
      icon: 'email-plus-outline' as const,
      title: 'Invitar a alguien',
      hint: 'Tu pareja, un familiar, tu cuidador o tu médico. Usará su propia cuenta.',
      onPress: onInvite,
    },
    {
      icon: 'human-child' as const,
      title: 'Agregar a alguien a tu cargo',
      hint: 'Para quien no usa la app, como un hijo pequeño. Tú gestionas todo y recibes sus alarmas.',
      onPress: onDependent,
    },
  ];
  return (
    <BottomSheet theme={theme} visible={visible} onClose={onClose} title="¿A quién quieres agregar?">
      <View style={styles.choices}>
        {options.map((option) => (
          <Pressable
            key={option.title}
            onPress={option.onPress}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.choice,
              { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.choiceIcon, { backgroundColor: `${theme.colors.accentPrimary}14` }]}>
              <MaterialCommunityIcons name={option.icon} size={24} color={theme.colors.accentPrimary} />
            </View>
            <View style={styles.choiceText}>
              <Text style={[styles.choiceTitle, { color: theme.colors.textPrimary }]}>{option.title}</Text>
              <Text style={[styles.choiceHint, { color: theme.colors.textMuted }]}>{option.hint}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

function HowItWorks({ theme, icon, text }: Readonly<{ theme: AppTheme; icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }>) {
  return (
    <View style={styles.howRow}>
      <View style={[styles.howIcon, { backgroundColor: `${theme.colors.accentPrimary}12` }]}>
        <MaterialCommunityIcons name={icon} size={18} color={theme.colors.accentPrimary} />
      </View>
      <Text style={[styles.howText, { color: theme.colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  historyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, marginTop: 8 },
  historyLinkText: { fontSize: 13.5, fontWeight: '700' },
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
  empty: { gap: 14 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolbarHint: { flex: 1, fontSize: 13, fontWeight: '600' },
  groupSelect: { flex: 1, minHeight: 46 },
  groupsButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  groupsButtonText: { fontSize: 14, fontWeight: '800' },
  choices: { gap: 10 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 16, padding: 14 },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { fontSize: 15.5, fontWeight: '800' },
  choiceHint: { fontSize: 12.5, lineHeight: 17 },
  howItWorks: { gap: 10, borderWidth: 1, borderRadius: 18, padding: 14 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  howIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  howText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
