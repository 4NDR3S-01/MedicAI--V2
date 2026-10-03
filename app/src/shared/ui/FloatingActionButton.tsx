import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FLOATING_ACTION_BUTTON_BOTTOM } from '../../app/AppBottomBar';
import type { AppTheme } from '../theme/types';
import { PressableScale } from './PressableScale';

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
      <PressableScale
        onPress={onPress}
        pressedScale={0.9}
        style={[styles.button, { backgroundColor }]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <MaterialCommunityIcons name={icon} size={24} color={iconColor} />
      </PressableScale>
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
