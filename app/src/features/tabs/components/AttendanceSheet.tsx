import { useRef } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { BottomSheet } from '../../../shared/ui';
import type { AppointmentAttendanceStatus, AppointmentData } from '../services/appointments.service';
import { appointmentDate, formatClock, relativeDayLabel } from '../utils/appointment-status';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

type AttendanceSheetProps = {
  theme: AppTheme;
  appointment: AppointmentData | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (status: AppointmentAttendanceStatus) => void;
};

export function AttendanceSheet({ theme, appointment, busy, onClose, onSelect }: Readonly<AttendanceSheetProps>) {
  // Mantiene el contenido mientras el panel se cierra.
  const last = useRef(appointment);
  if (appointment) last.current = appointment;
  const shown = appointment ?? last.current;
  const date = shown ? appointmentDate(shown) : null;
  const current = shown?.attendanceStatus ?? 'PENDING';

  const options: { status: AppointmentAttendanceStatus; label: string; hint: string; icon: IconName; color: string }[] = [
    { status: 'ATTENDED', label: 'Asistí', hint: 'Fui a la consulta', icon: 'check-circle', color: theme.colors.success },
    { status: 'MISSED', label: 'No asistí', hint: 'No pude ir a la consulta', icon: 'close-circle-outline', color: theme.colors.textMuted },
    { status: 'PENDING', label: 'Sin marcar', hint: 'Volverá a "por confirmar"', icon: 'help-circle-outline', color: theme.colors.accentTertiary },
  ];

  return (
    <BottomSheet
      theme={theme}
      visible={Boolean(appointment)}
      onClose={onClose}
      title={shown?.title ?? ''}
      subtitle={date ? `${relativeDayLabel(date, new Date())} · ${formatClock(date)} · ${shown?.doctorName ?? ''}` : undefined}
    >
      <View style={styles.list} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.status === current;
          return (
            <Pressable
              key={option.status}
              onPress={() => (selected ? onClose() : onSelect(option.status))}
              disabled={busy}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: busy }}
              accessibilityLabel={`${option.label}. ${option.hint}`}
              style={({ pressed }) => [
                styles.option,
                {
                  borderColor: selected ? option.color : theme.colors.inputBorder,
                  backgroundColor: selected ? `${option.color}14` : theme.colors.inputBackground,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <MaterialCommunityIcons name={option.icon} size={22} color={option.color} />
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, { color: theme.colors.textPrimary }]}>{option.label}</Text>
                <Text style={[styles.optionHint, { color: theme.colors.textMuted }]}>{option.hint}</Text>
              </View>
              {selected ? <MaterialCommunityIcons name="check" size={20} color={option.color} /> : null}
            </Pressable>
          );
        })}
        {busy ? <ActivityIndicator color={theme.colors.accentSecondary} /> : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5 },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 16, fontWeight: '800' },
  optionHint: { fontSize: 13 },
});
