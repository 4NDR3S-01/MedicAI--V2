import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../../shared/theme';
import { AppButton, FormSheet } from '../../../../shared/ui';
import { PRIVACY_POLICY_URL } from '../../../../shared/config/links';
import { getStoredSession } from '../../../auth';
import { updateProfileOnBackend, type ProfileUser } from '../../../auth/services/auth.service';
import { requestDataExport } from '../../services/account.service';
import { ProfileNote, SettingsItem } from './ProfileParts';

const POINTS: { title: string; body: string }[] = [
  { title: 'Lo que guardamos', body: 'Tu cuenta, tu información de salud, tus medicamentos, tomas y citas, y tu Círculo. Solo para que la app funcione.' },
  { title: 'Quién lo ve', body: 'Tú y las personas de tu Círculo a las que das permiso. No vendemos tus datos ni los usamos para publicidad.' },
  { title: 'Tus derechos', body: 'Puedes consultar, corregir, descargar o eliminar tus datos cuando quieras (Ley 1581 de 2012).' },
];

/** Privacidad: uso de datos en el asistente, copia de los datos, historial y política. */
export function PrivacySheet({
  theme,
  visible,
  email,
  aiConsent,
  onClose,
  onConsentChanged,
  onOpenHistory,
}: Readonly<{
  theme: AppTheme;
  visible: boolean;
  email: string | null;
  aiConsent: boolean;
  onClose: () => void;
  onConsentChanged: (value: boolean, user?: ProfileUser) => void;
  onOpenHistory: () => void;
}>) {
  const [savingConsent, setSavingConsent] = useState(false);
  const [exporting, setExporting] = useState(false);

  const changeConsent = async (value: boolean) => {
    setSavingConsent(true);
    try {
      const response = await updateProfileOnBackend({ aiHealthContextConsent: value });
      onConsentChanged(value, response.user ?? undefined);
    } catch (error) {
      Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Inténtalo de nuevo.');
    } finally {
      setSavingConsent(false);
    }
  };

  const exportData = () => {
    Alert.alert(
      'Descargar mis datos',
      `Te enviaremos un archivo con toda tu información a ${email ?? 'tu correo'}. Contiene datos de salud: guárdalo en un lugar seguro.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: () => {
            void (async () => {
              setExporting(true);
              try {
                const session = await getStoredSession();
                if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
                const { message } = await requestDataExport(session.accessToken);
                Alert.alert('Copia enviada', `${message} Puede tardar unos minutos; revisa también la carpeta de spam.`);
              } catch (error) {
                Alert.alert('No se pudo enviar', error instanceof Error ? error.message : 'Inténtalo más tarde.');
              } finally {
                setExporting(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title="Privacidad"
      subtitle="Tú decides qué se comparte y con quién."
      onClose={onClose}
      footer={<AppButton theme={theme} label="Listo" onPress={onClose} style={styles.flex} />}
    >
      <View style={styles.points}>
        {POINTS.map((point) => (
          <View key={point.title} style={styles.point}>
            <Text style={[styles.pointTitle, { color: theme.colors.textPrimary }]}>{point.title}</Text>
            <Text style={[styles.pointBody, { color: theme.colors.textSecondary }]}>{point.body}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
        <SettingsItem
          theme={theme}
          icon="robot-outline"
          title="Personalizar el asistente"
          subtitle="Comparte tu edad, condiciones y alergias con el asistente de IA (nunca tu nombre, correo ni teléfono)."
          toggle={{ value: aiConsent, onChange: (value) => void changeConsent(value), disabled: savingConsent }}
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.surfaceBorder }]}>
        <SettingsItem
          theme={theme}
          icon="history"
          title="Historial de accesos"
          subtitle="Quién recibió, cambió o perdió acceso a tu información"
          color={theme.colors.accentSecondary}
          onPress={onOpenHistory}
        />
        <View style={[styles.divider, { backgroundColor: theme.colors.surfaceBorder }]} />
        <SettingsItem
          theme={theme}
          icon={exporting ? 'progress-clock' : 'download-outline'}
          title="Descargar mis datos"
          subtitle="Te enviamos una copia completa a tu correo"
          color={theme.colors.accentSecondary}
          onPress={exporting ? undefined : exportData}
        />
        <View style={[styles.divider, { backgroundColor: theme.colors.surfaceBorder }]} />
        <SettingsItem
          theme={theme}
          icon="file-document-outline"
          title="Política de privacidad"
          subtitle="medicai.lat/privacidad"
          color={theme.colors.accentSecondary}
          trailing="external"
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
      </View>

      <ProfileNote theme={theme} icon="lock-outline">
        Tus datos viajan cifrados y tu sesión se guarda en el almacén seguro del teléfono.
      </ProfileNote>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  points: { gap: 12 },
  point: { gap: 2 },
  pointTitle: { fontSize: 14.5, fontWeight: '900' },
  pointBody: { fontSize: 13.5, lineHeight: 19, fontWeight: '500' },
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 66 },
});
