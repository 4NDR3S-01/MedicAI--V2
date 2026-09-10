import React from 'react';
import { FloatingActionButton } from './FloatingActionButton';
import type { AppTheme } from '../theme/types';

type Props = {
  theme: AppTheme;
  onPress?: () => void;
};

export function FloatingChatButton({ theme, onPress }: Readonly<Props>) {
  return (
    <FloatingActionButton
      theme={theme}
      icon="robot"
      onPress={() => onPress?.()}
      accessibilityLabel="Chat con IA"
      backgroundColor={theme.colors.accentSecondary}
    />
  );
}
