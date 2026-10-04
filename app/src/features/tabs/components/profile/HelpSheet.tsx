import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Alert, LayoutAnimation, Linking, Platform, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { AppButton, FormSheet, PressableScale } from '../../../../shared/ui';
import { ProfileNote } from './ProfileParts';

export const SUPPORT_EMAIL = 'soporte@medicai.lat';

const FAQ: { question: string; answer: string }[] = [
  {
    question: 'Las alarmas no suenan o llegan tarde',
    answer:
      'Revisa la tarjeta "Estado de las alarmas" en tu perfil y toca "Resolver ahora". En algunos teléfonos (Xiaomi, Huawei, Oppo, Samsung) también hay que quitar el ahorro de batería para MedicAI y permitir el inicio automático.',
  },
  {
    question: '¿Qué pasa si registro una toma sin internet?',
    answer: 'Queda guardada en el teléfono y se envía sola cuando vuelve la conexión. La verás marcada como registrada desde el primer momento.',
  },
  {
    question: '¿Cómo cuido a un familiar?',
    answer:
      'En Círculo, invita a la persona o crea un perfil a cargo si no usa la app (por ejemplo, un niño). Tú decides qué puede ver o hacer cada uno, y puedes recibir sus recordatorios en tu teléfono.',
  },
  {
    question: '¿Quién puede ver mi información?',
    answer:
      'Solo las personas de tu Círculo a las que les diste permiso, y solo lo que les diste. Puedes cambiarlo o quitarlo cuando quieras, y en Privacidad ves el historial de accesos.',
  },
  {
    question: 'Olvidé mi contraseña',
    answer: 'En la pantalla de inicio de sesión toca "¿Olvidaste tu contraseña?". Te enviaremos un enlace a tu correo.',
  },
  {
    question: '¿MedicAI reemplaza a mi médico?',
    answer:
      'No. MedicAI te ayuda a recordar y organizar tu tratamiento, pero no da diagnósticos. Ante cualquier duda sobre tu salud o tus medicamentos, consulta a un profesional. En una emergencia, llama al 123.',
  },
];

/** Datos técnicos para soporte: nunca información de salud ni de la cuenta. */
const supportFooter = () =>
  [
    '',
    '— No borres esto, nos ayuda a revisar el problema —',
    `App: MedicAI ${Constants.expoConfig?.version ?? ''}`,
    `Teléfono: ${[Device.manufacturer, Device.modelName].filter(Boolean).join(' ')}`,
    `Sistema: ${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Device.osVersion ?? ''}`,
  ].join('\n');

export function HelpSheet({ theme, visible, onClose }: Readonly<{ theme: AppTheme; visible: boolean; onClose: () => void }>) {
  const [open, setOpen] = useState<number | null>(0);

  const toggle = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((current) => (current === index ? null : index));
  };

  const writeSupport = async () => {
    const subject = encodeURIComponent('Ayuda con MedicAI');
    const body = encodeURIComponent(`Cuéntanos qué pasó:\n\n${supportFooter()}`);
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Escríbenos', `No encontramos una app de correo. Escríbenos a ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title="Ayuda"
      subtitle="Respuestas rápidas y contacto con soporte."
      onClose={onClose}
      footer={<AppButton theme={theme} label="Escribir a soporte" icon="mail-outline" iconPosition="left" onPress={() => void writeSupport()} style={styles.flex} />}
    >
      <View style={[styles.list, { borderColor: theme.colors.surfaceBorder, backgroundColor: theme.colors.surface }]}>
        {FAQ.map((item, index) => {
          const expanded = open === index;
          return (
            <View key={item.question} style={index > 0 ? [styles.itemBorder, { borderTopColor: theme.colors.surfaceBorder }] : undefined}>
              <PressableScale
                onPress={() => toggle(index)}
                pressedScale={0.99}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={item.question}
                style={styles.question}
              >
                <Text style={[styles.questionText, { color: theme.colors.textPrimary }]}>{item.question}</Text>
                <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.colors.textMuted} />
              </PressableScale>
              {expanded ? <Text style={[styles.answer, { color: theme.colors.textSecondary }]}>{item.answer}</Text> : null}
            </View>
          );
        })}
      </View>

      <AppButton
        theme={theme}
        label="Abrir ajustes del teléfono"
        variant="secondary"
        icon="settings-outline"
        iconPosition="left"
        onPress={() => void Linking.openSettings()}
      />
      <ProfileNote theme={theme} icon="information-outline">
        Respondemos en {SUPPORT_EMAIL}, normalmente en uno o dos días hábiles. No incluyas datos de salud en el correo.
      </ProfileNote>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  question: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 14, minHeight: 52 },
  questionText: { flex: 1, fontSize: 14.5, fontWeight: '800' },
  answer: { fontSize: 13.5, lineHeight: 20, fontWeight: '500', paddingHorizontal: 14, paddingBottom: 14 },
});
