import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, ERROR_COLOR, FormSheet, TextField } from '../../../shared/ui';
import { getStoredSession } from '../../auth';
import { deleteAccount, fetchDeleteAccountPreview } from '../services/account.service';

/**
 * Eliminar la cuenta (exigido por Google Play y App Store). Explica qué se
 * borra, avisa de los perfiles a cargo que se perderían y pide la contraseña.
 */
export function DeleteAccountSheet({
  theme,
  visible,
  onClose,
  onDeleted,
}: Readonly<{ theme: AppTheme; visible: boolean; onClose: () => void; onDeleted: () => void }>) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dependents, setDependents] = useState<{ id: string; fullName: string | null }[]>([]);

  useEffect(() => {
    if (!visible) return;
    setPassword('');
    setError(null);
    setDependents([]);
    void getStoredSession()
      .then((session) => (session?.accessToken ? fetchDeleteAccountPreview(session.accessToken) : null))
      .then((preview) => setDependents(preview?.dependents ?? []))
      .catch(() => undefined);
  }, [visible]);

  const confirm = () => {
    if (!password) {
      setError('Escribe tu contraseña para confirmar.');
      return;
    }
    Alert.alert('¿Eliminar tu cuenta definitivamente?', 'No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setBusy(true);
              setError(null);
              const session = await getStoredSession();
              if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
              await deleteAccount(session.accessToken, password);
              onDeleted();
            } catch (deleteError) {
              setError(deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la cuenta.');
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const items = [
    'Tus medicamentos, tomas registradas, alarmas y citas.',
    'Tu información de salud y tu perfil.',
    'Tus vínculos del Círculo: las personas dejarán de ver tu información y tú la suya.',
  ];

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title="Eliminar mi cuenta"
      subtitle="Esta acción es permanente."
      onClose={onClose}
      dismissDisabled={busy}
      footer={
        <>
          <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.flex} />
          <AppButton theme={theme} label="Eliminar cuenta" icon="trash-outline" onPress={confirm} loading={busy} style={[styles.flexWide, { backgroundColor: ERROR_COLOR, borderColor: ERROR_COLOR }]} />
        </>
      }
    >
      <Text style={[styles.lead, { color: theme.colors.textSecondary }]}>Se borrará para siempre:</Text>
      <View style={styles.list}>
        {items.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="close-circle" size={18} color={ERROR_COLOR} />
            <Text style={[styles.rowText, { color: theme.colors.textPrimary }]}>{item}</Text>
          </View>
        ))}
        {dependents.length ? (
          <View style={styles.row}>
            <Ionicons name="warning" size={18} color={ERROR_COLOR} />
            <Text style={[styles.rowText, { color: theme.colors.textPrimary }]}>
              Los perfiles a tu cargo que solo administras tú:{' '}
              <Text style={styles.bold}>{dependents.map((item) => item.fullName ?? 'Sin nombre').join(', ')}</Text>. Si quieres
              conservarlos, agrega antes a otro cuidador desde su ficha en Círculo.
            </Text>
          </View>
        ) : null}
      </View>
      <TextField
        theme={theme}
        label="Tu contraseña"
        value={password}
        error={error}
        onChangeText={(value) => {
          setPassword(value);
          setError(null);
        }}
        secureToggle
        autoCapitalize="none"
        autoComplete="current-password"
      />
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  lead: { fontSize: 14.5, fontWeight: '700' },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowText: { flex: 1, fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '800' },
});
