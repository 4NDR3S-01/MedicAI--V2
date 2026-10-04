import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { AppButton } from '../../../shared/ui';
import type { Proposal } from '../services/assistant.service';

const formatDay = (key: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return key;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
};

const every = (hours: number) => (hours >= 24 ? 'una vez al día' : `cada ${hours} horas`);

/** Lo que preparó el asistente; el usuario lo revisa (o confirma la toma) antes de guardar. */
export function ProposalCard({
  theme,
  proposal,
  status,
  busy = false,
  onReview,
  onConfirmDose,
  onDismiss,
}: Readonly<{
  theme: AppTheme;
  proposal: Proposal;
  /** pending: por decidir; saved: guardado/registrado; dismissed: el usuario dijo que no. */
  status: 'pending' | 'saved' | 'dismissed';
  busy?: boolean;
  onReview: () => void;
  onConfirmDose: () => void;
  onDismiss: () => void;
}>) {
  let color = theme.colors.accentSecondary;
  let icon: keyof typeof MaterialCommunityIcons.glyphMap = 'calendar-plus';
  let kind = 'Cita preparada';
  let title = '';
  let details: string[] = [];
  let savedText = 'Cita guardada';

  if (proposal.kind === 'medication') {
    color = theme.colors.accentPrimary;
    icon = 'pill';
    kind = 'Medicamento preparado';
    title = proposal.name;
    savedText = 'Guardado con sus recordatorios';
    details = [
      `${String(proposal.dosageAmount).replace('.', ',')} ${proposal.dosageUnit}, ${every(proposal.intervalHours)}`,
      `Primera toma a las ${proposal.firstDoseTime}`,
      proposal.durationDays ? `Durante ${proposal.durationDays} días` : 'Sin fecha de fin',
    ];
  } else if (proposal.kind === 'appointment') {
    title = proposal.title;
    details = [`${formatDay(proposal.date)} a las ${proposal.time}`, proposal.doctorName, ...(proposal.location ? [proposal.location] : [])];
  } else {
    color = theme.colors.success;
    icon = 'check-circle-outline';
    kind = 'Registrar toma';
    title = proposal.medicationName;
    savedText = 'Toma registrada';
    details = [proposal.time ? `${proposal.dosage} · toma de las ${proposal.time}` : `${proposal.dosage} · ahora`];
  }

  let footer: React.ReactNode;
  if (status === 'saved') {
    footer = (
      <View style={styles.saved}>
        <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.success} />
        <Text style={[styles.savedText, { color: theme.colors.success }]}>{savedText}</Text>
      </View>
    );
  } else if (status === 'dismissed') {
    footer = <Text style={[styles.detail, { color: theme.colors.textMuted }]}>No se registró.</Text>;
  } else if (proposal.kind === 'dose') {
    footer = (
      <View style={styles.actions}>
        <AppButton theme={theme} label="No" variant="secondary" onPress={onDismiss} disabled={busy} style={styles.flex} />
        <AppButton theme={theme} label="La tomé" icon="checkmark" onPress={onConfirmDose} loading={busy} style={styles.flexWide} />
      </View>
    );
  } else {
    footer = <AppButton theme={theme} label="Revisar y guardar" icon="create-outline" iconPosition="left" variant="secondary" onPress={onReview} />;
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: `${color}40` }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: `${color}18` }]}>
          <MaterialCommunityIcons name={icon} size={18} color={color} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.kind, { color }]}>{kind}</Text>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
        </View>
      </View>
      {details.map((line) => (
        <Text key={line} style={[styles.detail, { color: theme.colors.textSecondary }]}>{line}</Text>
      ))}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexWide: { flex: 1.4 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  card: { borderRadius: 18, borderWidth: 1.5, padding: 14, gap: 6, marginTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kind: { fontSize: 11.5, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { fontSize: 16, fontWeight: '900' },
  detail: { fontSize: 13.5, fontWeight: '600' },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  savedText: { fontSize: 13.5, fontWeight: '800' },
});
