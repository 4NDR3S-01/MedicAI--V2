import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { AppTheme } from '../theme/types';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  theme: AppTheme;
};

const DEFAULT_GREETING: ChatMessage = {
  id: 'assistant-welcome',
  role: 'assistant',
  content: 'Hola, soy tu asistente de IA. Cuéntame tu duda y te respondo con orientación general.',
};

export function ChatModal({ visible, onClose, theme }: Readonly<Props>) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_GREETING]);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const assistantBubbleBackground = theme.mode === 'dark' ? '#10253D' : '#F2F7FC';

  const apiBaseUrl = useMemo(() => {
    return (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
  }, []);

  const handleClose = () => {
    setErrorMessage(null);
    onClose();
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) {
      return;
    }

    if (!apiBaseUrl) {
      setErrorMessage('Falta configurar EXPO_PUBLIC_API_BASE_URL.');
      return;
    }

    const nextUserMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setInput('');
    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await fetch(`${apiBaseUrl}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          history: nextMessages
            .filter((message) => message.role !== 'assistant' || message.id !== DEFAULT_GREETING.id)
            .map((message) => ({ role: message.role, content: message.content })),
        }),
      });

      const data = (await response.json()) as { reply?: string; message?: string };

      if (!response.ok) {
        throw new Error(data.message || 'No se pudo obtener respuesta de IA.');
      }

      const assistantReply = (data.reply || '').trim();
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantReply || 'No recibí contenido en la respuesta de IA.',
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar con el chat de IA.';
      setErrorMessage(message);
      setMessages((current) => current.filter((item) => item.id !== nextUserMessage.id));
      setInput(text);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.container, { backgroundColor: theme.mode === 'dark' ? '#071223' : '#FFFFFF' }]}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Chat con IA</Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Asistente de dudas y orientación</Text>
            </View>
            <Pressable onPress={handleClose} accessibilityLabel="Cerrar chat" style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          {errorMessage ? (
            <View style={[styles.errorBox, { borderColor: theme.colors.surfaceBorder, backgroundColor: `${theme.colors.accentTertiary}18` }]}>
              <Text style={[styles.errorText, { color: theme.colors.textPrimary }]}>{errorMessage}</Text>
            </View>
          ) : null}

          <ScrollView
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.bubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                  {
                    backgroundColor:
                      message.role === 'user'
                        ? theme.colors.accentPrimary
                        : assistantBubbleBackground,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    { color: message.role === 'user' ? theme.colors.buttonText : theme.colors.textPrimary },
                  ]}
                >
                  {message.content}
                </Text>
              </View>
            ))}
            {isSending ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.accentPrimary} />
                <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Pensando...</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.composer, { borderTopColor: theme.colors.surfaceBorder }]}> 
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Escribe tu duda..."
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.inputBackground,
                  color: theme.colors.textPrimary,
                  borderColor: theme.colors.inputBorder,
                },
              ]}
              multiline
            />
            <Pressable
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendButton,
                {
                  backgroundColor: theme.colors.accentPrimary,
                  opacity: pressed || isSending ? 0.85 : 1,
                },
              ]}
              accessibilityLabel="Enviar mensaje"
              disabled={isSending}
            >
              <MaterialCommunityIcons name="send" size={20} color={theme.colors.buttonText} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    marginTop: 'auto',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
    maxHeight: '82%',
    minHeight: '56%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 8,
    gap: 10,
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 6,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
