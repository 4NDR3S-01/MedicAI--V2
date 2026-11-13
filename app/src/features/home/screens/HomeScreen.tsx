import { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert, AppState, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { PressableScale, Reveal } from '../../../shared/ui';
import { cancelDoseAlarm } from '../../../shared/services/notifications.service';
import {
  getAlarmSetupSnapshot,
  onAlarmSetupChanged,
  openAlarmSetup,
} from '../../../shared/services/alarm-setup.service';
import { CareTodayPanel, useCareData } from '../../circle/components/CareTodayPanel';
import { useCircle } from '../../circle/hooks/useCircle';
import { DoseActionSheet } from '../../tabs/components/DoseActionSheet';
import { avatarSource, initialsOf, parseAvatar } from '../../tabs/components/profile/avatar';
import { logDose, undoDoseLog } from '../../tabs/services/dose-queue';
import { applyDoseLog } from '../../tabs/data/own-data-store';
import { formatQuantity, stockUnitLabel } from '../../tabs/utils/medication-form';
import { AttentionList, type AttentionItem } from '../components/AttentionList';
import { DoseTimeline } from '../components/DoseTimeline';
import { HomeSkeleton } from '../components/HomeSkeleton';
import { NextAppointmentCard } from '../components/NextAppointmentCard';
import { TodayCard } from '../components/TodayCard';
import { useHomeData, type TodayDose } from '../hooks/useHomeData';
import { openAssistant } from '../../assistant/services/assistant-launcher';

export type HomeScreenProps = {
  theme: AppTheme;
  userFullName: string | null;
  userEmail: string | null;
  avatarData?: string | null;
  /** Espacio inferior para la barra de pestañas y el FAB central. */
  contentBottomInset: number;
  onOpenMedications?: () => void;
  onOpenAppointments?: () => void;
  onOpenCircle?: () => void;
  onOpenProfile?: () => void;
};

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function greetingFor(date: Date): { text: string; icon: IconName } {
  const hour = date.getHours();
  if (hour < 12) return { text: 'Buenos días', icon: 'weather-sunset-up' };
  if (hour < 19) return { text: 'Buenas tardes', icon: 'white-balance-sunny' };
  return { text: 'Buenas noches', icon: 'weather-night' };
}

function firstNameOf(fullName: string | null, email: string | null): string {
  const first = fullName?.trim().split(/\s+/)[0];
  if (first) return first;
  const local = email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return local ? local.split(' ')[0].replace(/^\w/, (char) => char.toUpperCase()) : '';
}

const noop = () => undefined;

export function HomeScreen({
  theme,
  userFullName,
  userEmail,
  avatarData,
  contentBottomInset,
  onOpenMedications = noop,
  onOpenAppointments = noop,
  onOpenCircle = noop,
  onOpenProfile = noop,
}: Readonly<HomeScreenProps>) {
  const home = useHomeData();
  const { summary, now } = home;
  const [refreshing, setRefreshing] = useState(false);
  const [doseTarget, setDoseTarget] = useState<TodayDose | null>(null);
  const [busy, setBusy] = useState(false);
  /** Lo que falta para la alarma: permisos, o solo probarla en este teléfono. */
  const [alarmIssue, setAlarmIssue] = useState<'permissions' | 'test' | null>(null);

  // Personas que cuido: el mismo resumen que en Círculo.
  const circle = useCircle();
  const caresForSomeone = Boolean(circle.overview?.members.some((member) => member.iCan.viewMedications || member.iCan.viewAppointments));
  const careData = useCareData(caresForSomeone);

  const checkAlarms = useCallback(async () => {
    try {
      const { steps } = await getAlarmSetupSnapshot();
      const missing = steps.filter((step) => !step.done).map((step) => step.id);
      if (!missing.length) setAlarmIssue(null);
      else if (missing.length === 1 && missing[0] === 'test') setAlarmIssue('test');
      else setAlarmIssue('permissions');
    } catch {
      setAlarmIssue(null);
    }
  }, []);

  useEffect(() => {
    void checkAlarms();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkAlarms();
    });
    const unsubscribe = onAlarmSetupChanged(() => void checkAlarms());
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [checkAlarms]);

  const greeting = greetingFor(now);
  const firstName = firstNameOf(userFullName, userEmail);
  const avatar = parseAvatar(avatarData);
  const today = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Tomas ─────────────────────────────────────────────────────────────────
  const register = async (dose: TodayDose, action: 'TAKEN' | 'SKIPPED') => {
    setBusy(true);
    try {
      const log = await logDose(dose.medication.id, action, dose.slot.at.toISOString());
      applyDoseLog(log, 1);
      // Registrada antes de la hora: esa alarma ya no debe sonar.
      if (dose.slot.at.getTime() > Date.now()) void cancelDoseAlarm(dose.medication.id, dose.slot.at);
      setDoseTarget(null);
    } catch (error) {
      Alert.alert('No se pudo registrar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const log = doseTarget?.slot.log;
    if (!doseTarget || !log) return;
    setBusy(true);
    try {
      // Sin conexión, el borrado queda en cola y se envía al volver la red.
      await undoDoseLog(doseTarget.medication.id, log.id);
      applyDoseLog(log, -1);
      setDoseTarget(null);
    } catch (error) {
      Alert.alert('No se pudo deshacer', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  // ── Lo que requiere atención ──────────────────────────────────────────────
  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    if (alarmIssue && summary.hasMedications) {
      items.push({
        key: 'alarms',
        icon: 'alarm-off',
        tone: 'warning',
        title: alarmIssue === 'test' ? 'Prueba tu alarma' : 'Tus alarmas podrían no sonar',
        body:
          alarmIssue === 'test'
            ? 'Comprueba en 10 segundos que se ve con el teléfono bloqueado.'
            : 'Falta un permiso del teléfono para avisarte a tiempo.',
        action: alarmIssue === 'test' ? 'Probar' : 'Resolver',
        onPress: openAlarmSetup,
      });
    }
    for (const appointment of summary.awaiting.slice(0, 2)) {
      items.push({
        key: `attend-${appointment.id}`,
        icon: 'calendar-question',
        tone: 'info',
        title: `¿Asististe a ${appointment.title}?`,
        body: 'Márcalo para mantener tu historial al día.',
        action: 'Marcar',
        onPress: onOpenAppointments,
      });
    }
    for (const medication of summary.lowStock.slice(0, 2)) {
      const left = medication.stockQuantity ?? 0;
      items.push({
        key: `stock-${medication.id}`,
        icon: 'package-variant',
        tone: 'warning',
        title: left <= 0 ? `Se acabó ${medication.name}` : `Queda poco ${medication.name}`,
        body: left <= 0 ? 'Compra más y actualiza las existencias.' : `Quedan ${formatQuantity(left)} ${stockUnitLabel(medication.dosage, left)}.`,
        action: 'Ver',
        onPress: onOpenMedications,
      });
    }
    return items;
  }, [alarmIssue, summary, onOpenAppointments, onOpenMedications]);

  const refresh = () => {
    setRefreshing(true);
    void Promise.all([home.load(), circle.load(), caresForSomeone ? careData.load() : Promise.resolve(), checkAlarms()])
      .finally(() => setRefreshing(false));
  };

  let step = 0;
  const next = () => step++;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.accentPrimary} colors={[theme.colors.accentPrimary]} />
        }
      >
        <Reveal index={next()}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <View style={styles.greetingRow}>
                <MaterialCommunityIcons name={greeting.icon} size={18} color={theme.colors.accentTertiary} />
                <Text style={[styles.greeting, { color: theme.colors.textSecondary }]}>{greeting.text}{firstName ? ',' : ''}</Text>
              </View>
              {firstName ? (
                <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">
                  {firstName}
                </Text>
              ) : null}
              <Text style={[styles.date, { color: theme.colors.textMuted }]}>{today.charAt(0).toUpperCase() + today.slice(1)}</Text>
            </View>
            <PressableScale
              onPress={onOpenProfile}
              accessibilityRole="button"
              accessibilityLabel="Abrir tu perfil"
              style={[styles.avatar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
            >
              {avatar ? (
                <Image source={avatarSource(avatar)} style={styles.avatarImage} accessibilityIgnoresInvertColors />
              ) : (
                <Text style={[styles.avatarText, { color: theme.colors.accentPrimaryText }]}>{initialsOf(userFullName || firstName || '?')}</Text>
              )}
            </PressableScale>
          </View>
        </Reveal>

        <Reveal index={next()}>
          <AskBar theme={theme} />
        </Reveal>

        {home.status === 'loading' ? (
          <HomeSkeleton theme={theme} />
        ) : (
          <>
            {attention.length ? (
              <Reveal index={next()}>
                <AttentionList theme={theme} items={attention} />
              </Reveal>
            ) : null}

            <Reveal index={next()}>
              <TodayCard
                theme={theme}
                now={now}
                hasMedications={summary.hasMedications}
                focus={summary.focus}
                taken={summary.taken}
                handled={summary.handled}
                total={summary.doses.length}
                missedCount={summary.missedCount}
                busy={busy}
                onRegister={(dose, action) => void register(dose, action)}
                onOpenDose={setDoseTarget}
                onAddMedication={onOpenMedications}
                onOpenMedications={onOpenMedications}
              />
            </Reveal>

            {summary.doses.length > 1 ? (
              <Reveal index={next()}>
                <DoseTimeline theme={theme} doses={summary.doses} onOpenDose={setDoseTarget} onSeeAll={onOpenMedications} />
              </Reveal>
            ) : null}

            <Reveal index={next()}>
              <NextAppointmentCard
                theme={theme}
                now={now}
                appointment={summary.nextAppointment}
                upcomingCount={summary.upcomingAppointments}
                onOpen={onOpenAppointments}
              />
            </Reveal>

            {caresForSomeone && careData.data && circle.overview ? (
              <Reveal index={next()} style={styles.section}>
                <CareTodayPanel theme={theme} members={circle.overview.members} data={careData.data} onOpen={onOpenCircle} />
              </Reveal>
            ) : null}

          </>
        )}
      </ScrollView>

      <DoseActionSheet
        theme={theme}
        canAsk
        target={doseTarget}
        busy={busy}
        onClose={() => setDoseTarget(null)}
        onRegister={(action) => doseTarget && void register(doseTarget, action)}
        onUndo={() => void undo()}
      />
    </View>
  );
}

/**
 * Acceso principal al asistente: parece un buscador (se entiende sin explicar).
 * El texto abre el chat para escribir; el micrófono, la conversación por voz.
 */
function AskBar({ theme }: Readonly<{ theme: AppTheme }>) {
  return (
    <View style={[styles.ask, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
      <PressableScale
        onPress={() => openAssistant()}
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityLabel="Pregúntale a MedicAI"
        accessibilityHint="Abre el asistente para escribir tu pregunta"
        style={styles.askMain}
      >
        <View style={[styles.askIcon, { backgroundColor: `${theme.colors.accentSecondary}1A` }]}>
          <MaterialCommunityIcons name="robot-outline" size={20} color={theme.colors.accentSecondaryText} />
        </View>
        <Text style={[styles.askText, { color: theme.colors.textMuted }]} numberOfLines={1}>
          Pregúntale a MedicAI…
        </Text>
      </PressableScale>
      <PressableScale
        onPress={() => openAssistant({ voice: true })}
        accessibilityRole="button"
        accessibilityLabel="Hablar con MedicAI"
        accessibilityHint="Empieza una conversación por voz"
        style={[styles.askMic, { backgroundColor: theme.colors.accentPrimary }]}
      >
        <MaterialCommunityIcons name="microphone" size={22} color={theme.colors.buttonText} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 16, gap: 18 },
  section: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1, gap: 2 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  greeting: { fontSize: 15, fontWeight: '700' },
  name: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  date: { fontSize: 13, fontWeight: '600' },
  avatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: 54, height: 54, borderRadius: 27 },
  avatarText: { fontSize: 20, fontWeight: '800' },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 28, borderWidth: 1, padding: 6, paddingLeft: 8 },
  askMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  askIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  askText: { flex: 1, fontSize: 16, fontWeight: '500' },
  askMic: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
