import { useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton, BottomSheet } from '../../../shared/ui';
import type { MedicationData } from '../services/medications.service';
import { loggedByNote } from '../utils/audit';
import { DOSE_EARLY_WINDOW_MS, type DoseSlot } from '../utils/dose-status';
import { DOSE_STATE_META, doseStateColor } from './MedicationCard';

type DoseActionSheetProps = {
  theme: AppTheme;
  target: { medication: MedicationData; slot: DoseSlot } | null;
  busy: boolean;
  onClose: () => void;
  onRegister: (action: 'TAKEN' | 'SKIPPED') => void;
  onUndo: () => void;
  /** Sin permiso para registrar tomas: solo se informa del estado. */
  readOnly?: boolean;
};

const formatTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export function DoseActionSheet({ theme, target, busy, onClose, onRegister, onUndo, readOnly = false }: Readonly<DoseActionSheetProps>) {
  // Mantiene el contenido mientras el panel se cierra (target ya es null).
  const lastTarget = useRef(target);
  if (target) lastTarget.current = target;
  const shown = target ?? lastTarget.current;
  const slot = shown?.slot;
  const medication = shown?.medication;
  const state = slot?.state ?? 'upcoming';
  const color = doseStateColor(theme, state);
  const meta = DOSE_STATE_META[state];

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  const byWhom = slot?.log && medication ? loggedByNote(slot.log.loggedBy, medication.userId) : null;
  if (slot?.log) {
    const loggedAt = new Date(slot.log.takenAt);
    body = (
      <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
        {state === 'taken' ? 'Registrada como tomada' : 'Registrada como omitida'} a las {formatTime(loggedAt)}
        {byWhom ? ` ${byWhom}` : ''}.
        {slot.log.pending ? ' Estás sin conexión: se enviará sola cuando vuelva internet.' : ''} Si fue un error, puedes deshacerlo.
      </Text>
    );
    footer = (
      <AppButton theme={theme} label="Deshacer registro" variant="secondary" icon="arrow-undo" iconPosition="left" onPress={onUndo} loading={busy} style={styles.flex} />
    );
  } else if (state === 'upcoming' && slot) {
    const opensAt = new Date(slot.at.getTime() - DOSE_EARLY_WINDOW_MS);
    body = (
      <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
        Te avisaremos a las {slot.time}. Podrás registrarla desde las {formatTime(opensAt)}.
      </Text>
    );
    footer = <AppButton theme={theme} label="Entendido" onPress={onClose} style={styles.flex} />;
  } else if (slot) {
    body = (
      <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
        {state === 'missed'
          ? 'La hora de esta toma ya pasó. Si la tomaste, regístrala para mantener tu historial al día.'
          : '¿Ya tomaste esta dosis?'}
      </Text>
    );
    footer = (
      <>
        <AppButton theme={theme} label="La omití" variant="secondary" onPress={() => onRegister('SKIPPED')} disabled={busy} style={styles.flex} />
        <AppButton theme={theme} label="La tomé" icon="checkmark" onPress={() => onRegister('TAKEN')} loading={busy} style={styles.flexWide} />
      </>
    );
  }

  if (readOnly && slot) {
    footer = <AppButton theme={theme} label="Entendido" onPress={onClose} style={styles.flex} />;
    if (!slot.log && state !== 'upcoming') {
      body = (
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          {state === 'missed' ? 'Esta toma aún no se ha registrado.' : 'Es la hora de esta toma.'} No tienes permiso para registrarla.
        </Text>
      );
    } else if (slot.log) {
      body = (
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          {state === 'taken' ? 'Registrada como tomada' : 'Registrada como omitida'} a las {formatTime(new Date(slot.log.takenAt))}
          {byWhom ? ` ${byWhom}` : ''}.
        </Text>
      );
    }
  }

  return (
    <BottomSheet
      theme={theme}
      visible={Boolean(target)}
      onClose={onClose}
      title={medication?.name ?? ''}
      subtitle={
        slot ? (
          <View style={styles.subtitleRow}>
            <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
              Toma de las {slot.time}{slot.viewerTime ? ` (${slot.viewerTime} para ti)` : ''} · {medication?.dosage}
            </Text>
            <View style={[styles.badge, { backgroundColor: `${color}1F` }]}>
              <MaterialCommunityIcons name={meta.icon} size={14} color={color} />
              <Text style={[styles.badgeText, { color }]}>{meta.label}</Text>
            </View>
          </View>
        ) : undefined
      }
      footer={footer}
    >
      {body}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  subtitle: { fontSize: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 12.5, fontWeight: '800' },
  text: { fontSize: 15, lineHeight: 22 },
});
