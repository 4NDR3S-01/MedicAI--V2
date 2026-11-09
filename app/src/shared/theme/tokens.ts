import type { TextStyle } from 'react-native';

import type { AppTheme } from './types';

/**
 * Escala tipográfica. Pocos niveles y pocos pesos: la jerarquía sale del
 * tamaño, no de poner todo en negrita. Úsala con spread en StyleSheet:
 *   title: { ...typography.title, letterSpacing: -0.3 }
 */
export const typography = {
  /** Número o título principal de pantalla. */
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  /** Título de tarjeta destacada / sección grande. */
  title: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  /** Encabezado de tarjeta o de hoja. */
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  /** Texto de lectura. */
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  /** Texto secundario, metadatos. */
  subhead: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  /** Etiquetas de botones y chips. */
  label: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  /** Notas y ayudas. */
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  /** Lo más pequeño legible (pestañas, sobretítulos). */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

/** Radios: 4 tamaños + píldora. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 999,
} as const;

/**
 * Devuelve la variante legible como TEXTO de un color de acento. Útil cuando
 * el color llega en una variable (tono de estado) y también tiñe íconos/fondos.
 */
export function readableText(theme: AppTheme, color: string): string {
  const { colors } = theme;
  switch (color) {
    case colors.accentPrimary:
      return colors.accentPrimaryText;
    case colors.accentSecondary:
      return colors.accentSecondaryText;
    case colors.accentTertiary:
      return colors.warningText;
    case colors.success:
      return colors.successText;
    default:
      return color;
  }
}
