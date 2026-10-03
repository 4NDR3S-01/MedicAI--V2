import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, FormSheet, TextField } from '../../../shared/ui';
import { getStoredSession } from '../../auth';
import * as circleAPI from '../services/circle.service';
import type { CircleInvitation } from '../services/circle.service';
import { InfoNote } from './CircleParts';

const CODE_LENGTH = 8;

/** "k7p2qm4x" → "K7P2-QM4X" mientras se escribe. */
const formatCode = (raw: string) => {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
};

export function JoinCodeSheet({
  theme,
  visible,
  onClose,
  onOpened,
}: Readonly<{
  theme: AppTheme;
  visible: boolean;
  onClose: () => void;
  onOpened: (invitation: CircleInvitation) => void;
}>) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCode('');
    setError(null);
  }, [visible]);

  const complete = code.replace('-', '').length === CODE_LENGTH;

  const submit = async () => {
    if (!complete) {
      setError(`El código tiene ${CODE_LENGTH} caracteres.`);
      return;
    }
    try {
      setBusy(true);
      setError(null);
      const session = await getStoredSession();
      if (!session?.accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      const invitation = await circleAPI.openInvitationByCode(session.accessToken, code);
      onOpened(invitation);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'No se pudo abrir la invitación.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      theme={theme}
      visible={visible}
      title="Tengo un código"
      subtitle="Escribe el código que te compartieron para ver la invitación."
      onClose={onClose}
      dismissDisabled={busy}
      footer={
        <>
          <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.flex} />
          <AppButton theme={theme} label="Ver invitación" icon="arrow-forward" onPress={() => void submit()} loading={busy} disabled={!complete} style={styles.flexWide} />
        </>
      }
    >
      <TextField
        theme={theme}
        label="Código de invitación"
        value={code}
        error={error}
        onChangeText={(value) => {
          setCode(formatCode(value));
          setError(null);
        }}
        placeholder="XXXX-XXXX"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={CODE_LENGTH + 1}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <InfoNote theme={theme} icon="shield-check-outline">
        Antes de aceptar verás quién te invita y qué podrá hacer cada uno. Nada se comparte sin tu confirmación.
      </InfoNote>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
});
