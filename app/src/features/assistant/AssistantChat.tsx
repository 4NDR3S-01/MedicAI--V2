import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Image,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import type { AppTheme } from '../../shared/theme';
import { Portal, PressableScale, Reveal, useKeyboardInset, useReducedMotion } from '../../shared/ui';
import { BufferedTextInput } from '../../shared/ui/BufferedTextInput';
import { appStorage } from '../../shared/storage';
import { reportError } from '../../shared/services/error-reporting';
import { emitDoseAction } from '../../shared/services/dose-refresh-bus';
import { cancelDoseAlarm } from '../../shared/services/notifications.service';
import { logDose } from '../tabs/services/dose-queue';
import { getStoredSession } from '../auth';
import { updateProfileOnBackend } from '../auth/services/auth.service';
import { AppointmentFormSheet } from '../tabs/components/AppointmentFormSheet';
import { MedicationFormSheet } from '../tabs/components/MedicationFormSheet';
import { fetchMedications, type MedicationData } from '../tabs/services/medications.service';
import { syncOwnReminders } from '../tabs/services/reminders-sync';
import { MessageText } from './components/MessageText';
import { ProposalCard } from './components/ProposalCard';
import { TypingDots } from './components/TypingDots';
import { VoicePanel, type VoicePhase } from './components/VoicePanel';
import { isExitPhrase, isNo, isYes, speak, stopSpeaking, useVoiceRecorder, warmUpSpeech } from './hooks/useVoice';
import { askAssistant, transcribeAudio, type AssistantReply, type Proposal } from './services/assistant.service';
import { EMERGENCY_NUMBER, looksLikeEmergency } from './utils/emergency';
import { pickPhoto, type ChatPhoto } from './utils/photo';

const STORAGE_KEY = 'medicai_assistant_chat_v1';
const MAX_STORED = 60;
const MESSAGE_MAX = 2000;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposals?: Proposal[];
  /** Índices de las propuestas ya guardadas / descartadas. */
  saved?: number[];
  dismissed?: number[];
  /** Mensaje del usuario que no llegó (sin conexión, error). */
  failed?: boolean;
  /** Foto adjunta (archivo local, solo para mostrarla). */
  image?: string;
};

const SUGGESTIONS: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }[] = [
  { icon: 'pill', text: '¿Puedo tomar ibuprofeno con mis medicamentos?' },
  { icon: 'clock-alert-outline', text: '¿Qué hago si olvidé una dosis?' },
  { icon: 'calendar-check-outline', text: 'Ayúdame a preparar mi próxima cita' },
  { icon: 'plus-circle-outline', text: 'Quiero agregar un medicamento que me recetaron' },
];

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const KEEP_AWAKE_TAG = 'medicai-assistant-voice';
/** El saludo aparece cuando el panel ya casi terminó de subir. */
const WELCOME_DELAY_MS = 180;

/** Propuesta de toma pendiente en la ÚLTIMA respuesta (a la que se responde "sí" / "no"). */
function pendingDoseOf(messages: ChatMessage[]) {
  const last = [...messages].reverse().find((message) => message.role === 'assistant');
  if (!last?.proposals) return null;
  const index = last.proposals.findIndex(
    (proposal, i) => proposal.kind === 'dose' && !last.saved?.includes(i) && !last.dismissed?.includes(i),
  );
  return index < 0 ? null : { messageId: last.id, index, proposal: last.proposals[index] as Extract<Proposal, { kind: 'dose' }> };
}

/**
 * Asistente de MedicAI a pantalla completa. La conversación se guarda solo en
 * este teléfono (se borra al cerrar sesión). Puede preparar medicamentos y
 * citas, que el usuario revisa en el formulario antes de guardar.
 */
export function AssistantChat({ theme, visible, onClose }: Readonly<{ theme: AppTheme; visible: boolean; onClose: () => void }>) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  /** Pantallas estrechas: cabecera sin avatar y botón de voz sin texto. */
  const compact = width < 360;
  const { keyboardVisible, screenInset } = useKeyboardInset();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [mounted, setMounted] = useState(visible);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [personal, setPersonal] = useState<boolean | null>(null);
  const [emergency, setEmergency] = useState(false);
  const [review, setReview] = useState<{ messageId: string; index: number; proposal: Proposal } | null>(null);
  const [existingMedications, setExistingMedications] = useState<MedicationData[]>([]);
  const [busyDose, setBusyDose] = useState<string | null>(null);
  const [photo, setPhoto] = useState<ChatPhoto | null>(null);
  /** Respuesta que se está leyendo en voz alta con "Escuchar". */
  const [readingId, setReadingId] = useState<string | null>(null);

  // Voz
  const voice = useVoiceRecorder();
  const [voiceMode, setVoiceMode] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>('listening');
  const [caption, setCaption] = useState<string | null>(null);
  const [dictation, setDictation] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const voiceActive = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ── Apertura y cierre animados ───────────────────────────────────────────
  useEffect(() => {
    if (visible) setMounted(true);
    // Abre con un resorte suave (sin rebote) y cierra deslizando hacia abajo.
    let animation: Animated.CompositeAnimation;
    if (reducedMotion) {
      animation = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: true });
    } else if (visible) {
      animation = Animated.spring(progress, { toValue: 1, damping: 24, stiffness: 190, mass: 1, overshootClamping: true, useNativeDriver: true });
    } else {
      animation = Animated.timing(progress, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true });
    }
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress, reducedMotion]);

  // Atrás de Android: cierra el chat (los formularios abiertos encima se cierran antes).
  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  // ── Conversación guardada en el teléfono ─────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    void getStoredSession().then((session) => setPersonal(session?.user.aiHealthContextConsent ?? false));
    if (loaded) return;
    void appStorage
      .getItem(STORAGE_KEY)
      .then((raw) => {
        const stored = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
        if (Array.isArray(stored)) setMessages(stored);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [visible, loaded]);

  useEffect(() => {
    if (!loaded) return;
    void appStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED))).catch(() => undefined);
  }, [messages, loaded]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: !reducedMotion }));
  }, [reducedMotion]);

  // ── Enviar ───────────────────────────────────────────────────────────────
  /** Envía un mensaje; devuelve la respuesta (o null si falló). */
  const send = async (
    raw: string,
    {
      retryOf,
      mode = 'text',
      quiet = false,
      image,
    }: { retryOf?: string; mode?: 'text' | 'voice'; quiet?: boolean; image?: ChatPhoto | null } = {},
  ): Promise<AssistantReply | null> => {
    const text = raw.trim() || (image ? '¿Qué me puedes decir de esta foto?' : '');
    if (!text || sending) return null;
    if (looksLikeEmergency(text)) setEmergency(true);

    const history = messagesRef.current
      .filter((message) => !message.failed && message.id !== retryOf)
      .map(({ role, content }) => ({ role, content }));
    const userMessage: ChatMessage = { id: retryOf ?? newId('user'), role: 'user', content: text, image: image?.uri };
    setMessages((current) => (retryOf ? current.map((item) => (item.id === retryOf ? userMessage : item)) : [...current, userMessage]));
    if (!retryOf && mode === 'text') {
      setInput('');
      setPhoto(null);
    }
    setSending(true);
    scrollToEnd();

    try {
      const session = await getStoredSession();
      if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      const answer = await askAssistant(session.accessToken, text, history, mode, image ? [image.dataUrl] : []);
      setPersonal(answer.usedPersonalContext);
      setMessages((current) => [
        ...current,
        { id: newId('assistant'), role: 'assistant', content: answer.reply, proposals: answer.proposals.length ? answer.proposals : undefined },
      ]);
      return answer;
    } catch (error) {
      setMessages((current) => current.map((item) => (item.id === userMessage.id ? { ...item, failed: true } : item)));
      if (!quiet) Alert.alert('No se envió', error instanceof Error ? error.message : 'Revisa tu conexión e inténtalo de nuevo.');
      return null;
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const markProposal = (messageId: string, index: number, field: 'saved' | 'dismissed') =>
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? { ...item, [field]: [...(item[field] ?? []), index] } : item)));

  /** "La tomé": registra la toma (también sin conexión, se envía después). */
  const confirmDose = async (messageId: string, index: number, proposal: Extract<Proposal, { kind: 'dose' }>) => {
    const key = `${messageId}:${index}`;
    setBusyDose(key);
    try {
      await logDose(proposal.medicationId, 'TAKEN', proposal.scheduledFor ?? undefined);
      markProposal(messageId, index, 'saved');
      if (proposal.scheduledFor && new Date(proposal.scheduledFor).getTime() > Date.now()) {
        void cancelDoseAlarm(proposal.medicationId, new Date(proposal.scheduledFor)).catch(() => undefined);
      }
      emitDoseAction();
      return true;
    } catch (error) {
      if (!voiceActive.current) Alert.alert('No se pudo registrar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
      return false;
    } finally {
      setBusyDose(null);
    }
  };

  // ── Voz: dictar un mensaje ───────────────────────────────────────────────
  const withMicrophone = async () => {
    if ((await voice.ensurePermission()) === 'granted') return true;
    Alert.alert('Micrófono desactivado', 'Para hablarle al asistente, permite el uso del micrófono en los ajustes del teléfono.', [
      { text: 'Ahora no', style: 'cancel' },
      { text: 'Abrir ajustes', onPress: () => void Linking.openSettings() },
    ]);
    return false;
  };

  const transcribe = async (uri: string) => {
    const session = await getStoredSession();
    if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
    return transcribeAudio(session.accessToken, uri);
  };

  const dictate = async () => {
    if (dictation !== 'idle' || !(await withMicrophone())) return;
    setDictation('recording');
    try {
      const uri = await voice.listen({ noSpeechTimeoutMs: 10_000 });
      if (!uri) return;
      setDictation('transcribing');
      const text = await transcribe(uri);
      if (text) setInput((current) => (current.trim() ? `${current.trim()} ${text}` : text).slice(0, MESSAGE_MAX));
      else Alert.alert('No te escuché bien', 'Intenta hablar un poco más cerca del teléfono.');
    } catch (error) {
      reportError(error, 'assistant-dictation');
      Alert.alert('No pude entenderte', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setDictation('idle');
    }
  };

  // ── Voz: conversación manos libres ───────────────────────────────────────
  const say = async (text: string) => {
    if (!voiceActive.current) return;
    setPhase('speaking');
    await speak(text);
  };

  const endConversation = useCallback(() => {
    voiceActive.current = false;
    voice.cancel();
    void stopSpeaking();
    setVoiceMode(false);
    setCaption(null);
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, [voice]);

  /** Escuchar → entender → responder (en voz alta) → volver a escuchar. */
  const runConversation = async () => {
    let silentTurns = 0;
    while (voiceActive.current) {
      setPhase('listening');
      setCaption(null);
      const uri = await voice.listen({ noSpeechTimeoutMs: 9000 });
      if (!voiceActive.current) break;
      if (!uri) {
        silentTurns += 1;
        if (silentTurns >= 2) {
          await say('Como no te escucho, dejo la conversación aquí. Toca el micrófono cuando quieras seguir.');
          endConversation();
          break;
        }
        continue;
      }
      silentTurns = 0;

      setPhase('transcribing');
      let text = '';
      try {
        text = await transcribe(uri);
      } catch (error) {
        reportError(error, 'assistant-transcribe');
        setCaption(error instanceof Error ? error.message : null);
        await say('No pude entenderte. Revisa tu conexión a internet.');
        continue;
      }
      if (!voiceActive.current) break;
      if (!text) {
        await say('No te entendí. ¿Puedes repetirlo?');
        continue;
      }
      setCaption(text);

      if (isExitPhrase(text)) {
        await say('Listo. Aquí estaré cuando me necesites.');
        endConversation();
        break;
      }

      // Respuesta a "¿la registro como tomada?".
      const pending = pendingDoseOf(messagesRef.current);
      if (pending && (isYes(text) || isNo(text))) {
        const confirmed = isYes(text);
        let reply = 'De acuerdo, no la registré.';
        if (confirmed) {
          const ok = await confirmDose(pending.messageId, pending.index, pending.proposal);
          reply = ok
            ? `Listo, registré ${pending.proposal.medicationName}${pending.proposal.time ? ` de las ${pending.proposal.time}` : ''}.`
            : 'No pude registrarla. Inténtalo desde la tarjeta en pantalla.';
        } else {
          markProposal(pending.messageId, pending.index, 'dismissed');
        }
        setMessages((current) => [
          ...current,
          { id: newId('user'), role: 'user', content: text },
          { id: newId('assistant'), role: 'assistant', content: reply },
        ]);
        await say(reply);
        continue;
      }

      setPhase('thinking');
      const answer = await send(text, { mode: 'voice', quiet: true });
      if (!voiceActive.current) break;
      if (!answer) {
        await say('No pude responder ahora. Inténtalo de nuevo en un momento.');
        continue;
      }
      // Medicamentos y citas se revisan en pantalla: la voz se pausa.
      const needsScreen = answer.proposals.some((proposal) => proposal.kind !== 'dose');
      await say(needsScreen ? `${answer.reply} Te lo dejé en pantalla para que lo revises y lo guardes.` : answer.reply);
      if (needsScreen && voiceActive.current) {
        voiceActive.current = false;
        setPhase('paused');
        break;
      }
    }
  };

  /** Si algo falla (micrófono ocupado, error al grabar), se termina y se dice por qué. */
  const runConversationSafely = () => {
    runConversation().catch((error: unknown) => {
      endConversation();
      reportError(error, 'assistant-voice');
      Alert.alert(
        'No pude usar el micrófono',
        `${error instanceof Error ? error.message : 'Error desconocido'}\n\nCierra otras apps que usen el micrófono e inténtalo de nuevo.`,
      );
    });
  };

  const startConversation = async () => {
    // La voz se prepara mientras se pide el micrófono: la primera respuesta suena antes.
    void warmUpSpeech().catch(() => undefined);
    if (readingId) {
      void stopSpeaking();
      setReadingId(null);
    }
    if (voiceActive.current || dictation !== 'idle' || !(await withMicrophone())) return;
    voiceActive.current = true;
    setVoiceMode(true);
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    runConversationSafely();
  };

  const resumeConversation = () => {
    if (voiceActive.current) return;
    voiceActive.current = true;
    runConversationSafely();
  };

  // El micrófono no puede seguir con la app en segundo plano.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && voiceActive.current) endConversation();
    });
    return () => subscription.remove();
  }, [endConversation]);

  useEffect(() => {
    if (!visible && readingId) {
      void stopSpeaking();
      setReadingId(null);
    }
    if (!visible && (voiceActive.current || voiceMode)) endConversation();
    if (!visible) voice.cancel();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const attachPhoto = () => {
    const choose = (source: 'camera' | 'library') => {
      void pickPhoto(source)
        .then((picked) => picked && setPhoto(picked))
        .catch(() => Alert.alert('No se pudo usar la foto', 'Inténtalo de nuevo.'));
    };
    Alert.alert('Mostrarle una foto', 'Por ejemplo, la caja de un medicamento o una receta. La foto no se guarda en el servidor.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Elegir de la galería', onPress: () => choose('library') },
      { text: 'Tomar foto', onPress: () => choose('camera') },
    ]);
  };

  const toggleRead = (message: ChatMessage) => {
    if (readingId === message.id) {
      void stopSpeaking();
      setReadingId(null);
      return;
    }
    void stopSpeaking().then(async () => {
      setReadingId(message.id);
      await speak(message.content);
      setReadingId((current) => (current === message.id ? null : current));
    });
  };

  const clearChat = () => {
    Alert.alert('Borrar conversación', 'Se borrará esta conversación del teléfono. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { setMessages([]); setEmergency(false); } },
    ]);
  };

  const enablePersonal = () => {
    Alert.alert(
      'Personalizar el asistente',
      'El asistente podrá usar tu edad, condiciones, alergias, medicamentos y próximas citas para darte respuestas más seguras. Nunca tu nombre, correo ni teléfono. Puedes desactivarlo en Perfil > Privacidad.',
      [
        { text: 'Ahora no', style: 'cancel' },
        {
          text: 'Permitir',
          onPress: () => {
            void updateProfileOnBackend({ aiHealthContextConsent: true })
              .then(() => setPersonal(true))
              .catch((error: unknown) => Alert.alert('No se pudo activar', error instanceof Error ? error.message : 'Inténtalo de nuevo.'));
          },
        },
      ],
    );
  };

  const openReview = async (messageId: string, index: number, proposal: Proposal) => {
    if (proposal.kind === 'medication') {
      // Para avisar si ese medicamento ya está registrado.
      const session = await getStoredSession();
      if (session?.accessToken) setExistingMedications(await fetchMedications(session.accessToken).catch(() => []));
    }
    setReview({ messageId, index, proposal });
  };

  const markSaved = () => {
    if (!review) return;
    markProposal(review.messageId, review.index, 'saved');
    // Sus alarmas y recordatorios se programan al momento.
    void syncOwnReminders({ force: true }).catch(() => undefined);
  };

  if (!mounted) return null;

  // Colores con contraste suficiente en los dos modos (texto ≥ 4.5:1 sobre su burbuja).
  const dark = theme.mode === 'dark';
  const bubbles = {
    assistant: { backgroundColor: dark ? '#10253D' : '#FFFFFF', borderColor: dark ? '#21435E' : '#D3E1EE' },
    mine: { backgroundColor: dark ? theme.colors.accentPrimary : '#0B7A6E' },
    mineText: dark ? theme.colors.buttonText : '#FFFFFF',
  };
  const assistantAvatar = (
    <View style={[styles.miniAvatar, { backgroundColor: `${theme.colors.accentPrimary}${dark ? '26' : '1A'}` }]}>
      <MaterialCommunityIcons name="robot-happy-outline" size={16} color={theme.colors.accentPrimary} />
    </View>
  );
  const canSend = (input.trim().length > 0 || Boolean(photo)) && !sending;

  return (
    <>
      <Portal>
        {/* La pantalla de atrás se oscurece mientras el chat sube. */}
        <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }]} />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.root,
            {
              backgroundColor: theme.colors.background,
              paddingTop: insets.top,
              paddingBottom: keyboardVisible ? screenInset : insets.bottom,
              opacity: reducedMotion ? progress : progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
              transform: reducedMotion
                ? []
                : [
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) },
                  { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
            },
          ]}
        >
          {/* Cabecera */}
          <View style={[styles.header, { borderBottomColor: theme.colors.surfaceBorder }]}>
            <PressableScale onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cerrar asistente" style={styles.headerButton}>
              <MaterialCommunityIcons name="chevron-down" size={28} color={theme.colors.textPrimary} />
            </PressableScale>
            {compact ? null : (
              <View style={[styles.botAvatar, { backgroundColor: `${theme.colors.accentPrimary}18` }]}>
                <MaterialCommunityIcons name="robot-happy-outline" size={22} color={theme.colors.accentPrimary} />
              </View>
            )}
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">
                Asistente MedicAI
              </Text>
              {personal === null ? null : personal ? (
                <View style={styles.statusRow} accessible accessibilityLabel="Conoce tu salud, medicamentos y citas">
                  <View style={[styles.statusDot, { backgroundColor: theme.colors.success }]} />
                  <Text style={[styles.status, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    Conoce tu información de salud
                  </Text>
                </View>
              ) : (
                <PressableScale onPress={enablePersonal} accessibilityRole="button" accessibilityLabel="Sin acceso a tu información. Activar" style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: theme.colors.textMuted }]} />
                  <Text style={[styles.status, styles.flexShrink, { color: theme.colors.textMuted }]} numberOfLines={1}>Sin acceso a tus datos</Text>
                  <Text style={[styles.status, styles.statusAction, { color: theme.colors.accentPrimary }]}>Activar</Text>
                </PressableScale>
              )}
            </View>
            {voiceMode ? null : (
              <View style={styles.headerActions}>
                <PressableScale
                  onPress={() => void startConversation()}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Conversar por voz, manos libres"
                  style={[styles.voiceButton, { backgroundColor: `${theme.colors.accentPrimary}16`, borderColor: `${theme.colors.accentPrimary}40` }]}
                >
                  <MaterialCommunityIcons name="headset" size={18} color={theme.colors.accentPrimary} />
                  {compact ? null : <Text style={[styles.voiceLabel, { color: theme.colors.accentPrimary }]}>Voz</Text>}
                </PressableScale>
                {messages.length ? (
                  <PressableScale
                    onPress={clearChat}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Borrar conversación"
                    style={[styles.iconButton, { backgroundColor: `${theme.colors.textMuted}14` }]}
                  >
                    <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.textSecondary} />
                  </PressableScale>
                ) : null}
              </View>
            )}
          </View>

          {/* Conversación */}
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={() => scrollToEnd()}
            showsVerticalScrollIndicator={false}
          >
            {!messages.length && loaded ? (
              <View style={styles.welcome}>
                <Reveal index={0} delay={WELCOME_DELAY_MS} style={styles.center}>
                <View style={[styles.welcomeIcon, { backgroundColor: `${theme.colors.accentPrimary}14` }]}>
                  <MaterialCommunityIcons name="robot-happy-outline" size={38} color={theme.colors.accentPrimary} />
                </View>
                <Text style={[styles.welcomeTitle, { color: theme.colors.textPrimary }]}>¿En qué te ayudo?</Text>
                </Reveal>
                <Reveal index={1} delay={WELCOME_DELAY_MS}>
                <Text style={[styles.welcomeBody, { color: theme.colors.textSecondary }]}>
                  Pregúntame sobre tus medicamentos, efectos, interacciones o cómo prepararte para una cita. Puedes mostrarme la foto de una caja o una receta. También puedo
                  agregar un medicamento o una cita, o registrar una toma: tú confirmas antes de guardar. Toca el ícono de audífonos para conversar por voz.
                </Text>
                </Reveal>
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((suggestion, index) => (
                    <Reveal key={suggestion.text} index={index + 2} delay={WELCOME_DELAY_MS}>
                    <PressableScale
                      onPress={() => void send(suggestion.text)}
                      pressedScale={0.98}
                      accessibilityRole="button"
                      style={[styles.suggestion, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}
                    >
                      <MaterialCommunityIcons name={suggestion.icon} size={20} color={theme.colors.accentPrimary} />
                      <Text style={[styles.suggestionText, { color: theme.colors.textPrimary }]}>{suggestion.text}</Text>
                    </PressableScale>
                    </Reveal>
                  ))}
                </View>
              </View>
            ) : null}

            {messages.map((message) => {
              const mine = message.role === 'user';
              return (
                <View key={message.id} style={mine ? [styles.messageWrap, styles.mineWrap] : styles.theirsRow}>
                  {mine ? null : assistantAvatar}
                  <View style={mine ? styles.mineColumn : styles.theirsColumn}>
                  <PressableScale
                    onLongPress={() => void Share.share({ message: message.content })}
                    pressedScale={0.99}
                    accessibilityHint="Mantén presionado para compartir"
                    style={[
                      styles.bubble,
                      mine
                        ? [styles.mine, bubbles.mine]
                        : [styles.theirs, styles.theirsBubble, bubbles.assistant, !dark && styles.lightShadow],
                      message.failed && { opacity: 0.6 },
                    ]}
                  >
                    {mine && message.image ? (
                      <Image source={{ uri: message.image }} style={styles.photo} accessibilityLabel="Foto enviada" />
                    ) : null}
                    {mine ? (
                      <Text style={[styles.mineText, { color: bubbles.mineText }]}>{message.content}</Text>
                    ) : (
                      <MessageText text={message.content} color={theme.colors.textPrimary} mutedColor={theme.colors.textMuted} />
                    )}
                  </PressableScale>
                  {message.proposals?.map((proposal, index) => {
                    let status: 'pending' | 'saved' | 'dismissed' = 'pending';
                    if (message.saved?.includes(index)) status = 'saved';
                    else if (message.dismissed?.includes(index)) status = 'dismissed';
                    return (
                      <ProposalCard
                        key={index}
                        theme={theme}
                        proposal={proposal}
                        status={status}
                        busy={busyDose === `${message.id}:${index}`}
                        onReview={() => void openReview(message.id, index, proposal)}
                        onConfirmDose={() => proposal.kind === 'dose' && void confirmDose(message.id, index, proposal)}
                        onDismiss={() => markProposal(message.id, index, 'dismissed')}
                      />
                    );
                  })}
                  {!mine && !voiceMode ? (
                    <PressableScale
                      onPress={() => toggleRead(message)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={readingId === message.id ? 'Dejar de leer en voz alta' : 'Escuchar esta respuesta'}
                      style={styles.listen}
                    >
                      <MaterialCommunityIcons
                        name={readingId === message.id ? 'stop-circle-outline' : 'volume-high'}
                        size={15}
                        color={theme.colors.textMuted}
                      />
                      <Text style={[styles.listenText, { color: theme.colors.textMuted }]}>
                        {readingId === message.id ? 'Detener' : 'Escuchar'}
                      </Text>
                    </PressableScale>
                  ) : null}
                  {message.failed ? (
                    <PressableScale onPress={() => void send(message.content, { retryOf: message.id })} accessibilityRole="button" style={styles.retry}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={14} color={theme.colors.accentTertiary} />
                      <Text style={[styles.retryText, { color: theme.colors.accentTertiary }]}>No se envió · Reintentar</Text>
                    </PressableScale>
                  ) : null}
                  </View>
                </View>
              );
            })}

            {sending ? (
              <View style={styles.theirsRow}>
                {assistantAvatar}
                <View style={[styles.bubble, styles.theirs, styles.theirsBubble, bubbles.assistant, !dark && styles.lightShadow]}>
                  <TypingDots color={theme.colors.accentPrimary} />
                </View>
              </View>
            ) : null}
          </ScrollView>

          {emergency ? (
            <View style={[styles.emergency, { backgroundColor: `${theme.colors.accentTertiary}14`, borderColor: `${theme.colors.accentTertiary}50` }]}>
              <MaterialCommunityIcons name="alarm-light-outline" size={22} color={theme.colors.accentTertiary} />
              <Text style={[styles.emergencyText, { color: theme.colors.textPrimary }]}>
                Si es una emergencia, no esperes la respuesta: llama ya.
              </Text>
              <PressableScale
                onPress={() => void Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}
                accessibilityRole="button"
                accessibilityLabel={`Llamar al ${EMERGENCY_NUMBER}`}
                style={[styles.callButton, { backgroundColor: theme.colors.accentTertiary }]}
              >
                <MaterialCommunityIcons name="phone" size={16} color="#fff" />
                <Text style={styles.callText}>{EMERGENCY_NUMBER}</Text>
              </PressableScale>
              <PressableScale onPress={() => setEmergency(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ocultar aviso">
                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textMuted} />
              </PressableScale>
            </View>
          ) : null}

          {voiceMode ? (
            <VoicePanel
              theme={theme}
              phase={phase}
              level={voice.level}
              autoStop={voice.autoStop}
              caption={caption}
              onFinishSpeaking={voice.finish}
              onInterrupt={() => void stopSpeaking()}
              onResume={resumeConversation}
              onEnd={endConversation}
            />
          ) : (
            <View style={[styles.composer, { borderTopColor: theme.colors.surfaceBorder }]}>
              {dictation !== 'idle' ? (
                <View style={[styles.dictation, { backgroundColor: `${theme.colors.accentPrimary}12`, borderColor: `${theme.colors.accentPrimary}40` }]}>
                  <View style={[styles.recDot, { backgroundColor: theme.colors.accentTertiary, transform: [{ scale: 1 + voice.level * 0.8 }] }]} />
                  <Text style={[styles.dictationText, { color: theme.colors.textPrimary }]}>
                    {dictation === 'recording' ? 'Te escucho… al terminar, haz una pausa' : 'Escribiendo lo que dijiste…'}
                  </Text>
                  {dictation === 'recording' ? (
                    <>
                      <PressableScale onPress={voice.cancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Descartar">
                        <MaterialCommunityIcons name="close" size={22} color={theme.colors.textMuted} />
                      </PressableScale>
                      <PressableScale onPress={voice.finish} hitSlop={8} accessibilityRole="button" accessibilityLabel="Terminar de hablar">
                        <MaterialCommunityIcons name="check-circle" size={26} color={theme.colors.accentPrimary} />
                      </PressableScale>
                    </>
                  ) : null}
                </View>
              ) : (
                <>
                {photo ? (
                  <View style={styles.preview}>
                    <Image source={{ uri: photo.uri }} style={styles.previewImage} accessibilityLabel="Foto para enviar" />
                    <Text style={[styles.previewText, { color: theme.colors.textSecondary }]}>Foto lista para enviar. Puedes agregar una pregunta.</Text>
                    <PressableScale onPress={() => setPhoto(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar foto">
                      <MaterialCommunityIcons name="close-circle" size={22} color={theme.colors.textMuted} />
                    </PressableScale>
                  </View>
                ) : null}
                <View style={styles.inputRow}>
                  <PressableScale
                    onPress={attachPhoto}
                    disabled={sending}
                    accessibilityRole="button"
                    accessibilityLabel="Adjuntar foto"
                    style={[styles.attach, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
                  >
                    <MaterialCommunityIcons name="camera-outline" size={22} color={theme.colors.textSecondary} />
                  </PressableScale>
                  <BufferedTextInput
                    value={input}
                    onChangeText={(text) => setInput(text.slice(0, MESSAGE_MAX))}
                    placeholder="Escribe o dicta tu pregunta…"
                    placeholderTextColor={theme.colors.inputPlaceholder}
                    multiline
                    maxLength={MESSAGE_MAX}
                    accessibilityLabel="Mensaje para el asistente"
                    style={[
                      styles.input,
                      { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder, color: theme.colors.textPrimary },
                    ]}
                  />
                  {canSend ? (
                    <PressableScale
                      onPress={() => void send(input, { image: photo })}
                      accessibilityRole="button"
                      accessibilityLabel="Enviar"
                      style={[styles.send, { backgroundColor: theme.colors.accentPrimary }]}
                    >
                      <MaterialCommunityIcons name="send" size={20} color={theme.colors.buttonText} />
                    </PressableScale>
                  ) : (
                    <PressableScale
                      onPress={() => void dictate()}
                      disabled={sending}
                      accessibilityRole="button"
                      accessibilityLabel="Dictar mensaje"
                      style={[styles.send, { backgroundColor: theme.colors.accentPrimary, opacity: sending ? 0.5 : 1 }]}
                    >
                      <MaterialCommunityIcons name="microphone" size={22} color={theme.colors.buttonText} />
                    </PressableScale>
                  )}
                </View>
                </>
              )}
              <Text style={[styles.disclaimer, { color: theme.colors.textMuted }]}>
                Orientación general: no reemplaza a tu médico. Puede equivocarse.
              </Text>
            </View>
          )}
        </Animated.View>
      </Portal>

      <MedicationFormSheet
        theme={theme}
        visible={review?.proposal.kind === 'medication'}
        draft={review?.proposal.kind === 'medication' ? review.proposal : null}
        existingMedications={existingMedications}
        onClose={() => setReview(null)}
        onSaved={markSaved}
      />
      <AppointmentFormSheet
        theme={theme}
        visible={review?.proposal.kind === 'appointment'}
        draft={review?.proposal.kind === 'appointment' ? review.proposal : null}
        onClose={() => setReview(null)}
        onSaved={markSaved}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  center: { alignItems: 'center', gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  botAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0, gap: 2, paddingRight: 4 },
  title: { fontSize: 17, fontWeight: '900' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  statusAction: { fontWeight: '900', flexShrink: 0 },
  flexShrink: { flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  voiceButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, minWidth: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 1, justifyContent: 'center' },
  voiceLabel: { fontSize: 13.5, fontWeight: '900' },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  messages: { padding: 16, gap: 12, flexGrow: 1 },
  welcome: { alignItems: 'center', gap: 10, paddingTop: 16 },
  welcomeIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  welcomeTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  welcomeBody: { fontSize: 14.5, lineHeight: 21, fontWeight: '500', textAlign: 'center', paddingHorizontal: 8 },
  suggestions: { alignSelf: 'stretch', gap: 8, marginTop: 10 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13 },
  suggestionText: { flex: 1, fontSize: 14.5, fontWeight: '700' },
  messageWrap: { maxWidth: '88%', gap: 6 },
  mineWrap: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirsWrap: { alignSelf: 'flex-start', alignItems: 'stretch' },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  theirsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, alignSelf: 'flex-start', maxWidth: '94%' },
  theirsColumn: { flexShrink: 1, gap: 6 },
  mineColumn: { alignItems: 'flex-end', gap: 6 },
  theirsBubble: { borderWidth: 1 },
  miniAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  lightShadow: { shadowColor: '#10243A', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  mine: { borderBottomRightRadius: 6 },
  theirs: { borderBottomLeftRadius: 6 },
  mineText: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  listen: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 2, minHeight: 28 },
  listenText: { fontSize: 12.5, fontWeight: '700' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  retryText: { fontSize: 12.5, fontWeight: '800' },
  emergency: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: 16, borderWidth: 1 },
  emergencyText: { flex: 1, fontSize: 13.5, lineHeight: 18, fontWeight: '700' },
  callButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  callText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  composer: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 130, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 13, fontSize: 15.5, textAlignVertical: 'top' },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  attach: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 200, height: 150, borderRadius: 14, marginBottom: 8 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  previewImage: { width: 52, height: 52, borderRadius: 12 },
  previewText: { flex: 1, fontSize: 13, fontWeight: '600' },
  dictation: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 26, borderWidth: 1, paddingHorizontal: 16 },
  recDot: { width: 12, height: 12, borderRadius: 6 },
  dictationText: { flex: 1, fontSize: 14.5, fontWeight: '700' },
  disclaimer: { fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
});
