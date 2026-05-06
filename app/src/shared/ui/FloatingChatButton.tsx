import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { AppTheme } from '../theme/types';

type Props = {
  theme: AppTheme;
  onPress?: () => void;
};

export function FloatingChatButton({ theme, onPress }: Readonly<Props>) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: theme.colors.accentPrimary,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Chat con IA"
      >
        <MaterialCommunityIcons name="robot" size={24} color={theme.colors.buttonText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 18,
    bottom: 76,
    zIndex: 999,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});
