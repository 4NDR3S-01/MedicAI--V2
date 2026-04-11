import { Image, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../theme';

export const LOGO_SOURCE = require('../../assets/logo_app.png');

type BrandLogoProps = {
  theme: AppTheme;
  size?: number;
  showName?: boolean;
};

export function BrandLogo({ theme, size = 72, showName = true }: Readonly<BrandLogoProps>) {
  return (
    <View style={styles.container}>
      <Image
        source={LOGO_SOURCE}
        defaultSource={LOGO_SOURCE}
        fadeDuration={0}
        style={[styles.logo, { width: size, height: size }]}
        resizeMode="cover"
      />
      {showName ? <Text style={[styles.name, { color: theme.colors.textPrimary }]}>MedicAI</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    borderRadius: 20,
  },
  name: {
    marginTop: 12,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
