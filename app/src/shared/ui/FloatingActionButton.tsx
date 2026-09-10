import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FLOATING_ACTION_BUTTON_BOTTOM } from '../../app/AppBottomBar';
import type { AppTheme } from '../theme/types';

type FloatingActionButtonProps = {
  theme: AppTheme;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  backgroundColor?: string;
  iconColor?: string;
};

export function FloatingActionButton({
  theme,
  icon,
  onPress,
  accessibilityLabel,
  backgroundColor = theme.colors.accentPrimary,
  iconColor = '#fff',
}: Readonly<FloatingActionButtonProps>) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor,
            transform: [{ scale: pressed ? 0.92 : 1 }],
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <MaterialCommunityIcons name={icon} size={24} color={iconColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 18,
    bottom: FLOATING_ACTION_BUTTON_BOTTOM,
    zIndex: 999,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
