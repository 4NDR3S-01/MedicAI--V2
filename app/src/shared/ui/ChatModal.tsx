import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { AppTheme } from '../theme/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  theme: AppTheme;
};

export function ChatModal({ visible, onClose, theme }: Readonly<Props>) {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    // Placeholder: aquí se integrará la lógica de IA.
    setMessage('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={[styles.backdrop]} />
        <View style={[styles.container, { backgroundColor: theme.mode === 'dark' ? '#071223' : '#FFFFFF' }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Chat con IA</Text>
            <Pressable onPress={onClose} accessibilityLabel="Cerrar chat">
              <MaterialCommunityIcons name="close" size={24} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <Text style={{ color: theme.colors.textMuted }}>Aquí aparecerá la conversación (placeholder).</Text>
          </View>

          <View style={styles.composerRow}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Escribe un mensaje..."
              placeholderTextColor={theme.colors.inputPlaceholder}
              style={[styles.input, { backgroundColor: theme.colors.inputBackground, color: theme.colors.textPrimary }]}
            />
            <Pressable onPress={handleSend} style={styles.sendButton} accessibilityLabel="Enviar mensaje">
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
    backgroundColor: 'rgba(0,0,0,0.35)'
  },
  container: {
    marginTop: 'auto',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
    maxHeight: '80%'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  content: { flex: 1, paddingVertical: 12 },
  composerRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  sendButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
});
