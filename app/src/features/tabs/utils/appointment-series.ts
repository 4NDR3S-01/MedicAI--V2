import { Alert } from 'react-native';

import type { AppointmentData, RepeatRule, SeriesScope } from '../services/appointments.service';
import { WEEK_DAYS, weekDaysLabel } from './medication-form';

/** "Cada semana: lun, mié, vie", "Cada 2 semanas", "Cada mes"… */
export function repeatLabel(rule: RepeatRule | null | undefined): string | null {
  if (!rule) return null;
  const every = rule.interval > 1 ? `Cada ${rule.interval}` : 'Cada';
  if (rule.frequency === 'DAILY') return rule.interval > 1 ? `${every} días` : 'Todos los días';
  if (rule.frequency === 'MONTHLY') return rule.interval > 1 ? `${every} meses` : 'Cada mes';
  const unit = rule.interval > 1 ? `${every} semanas` : 'Cada semana';
  const days = rule.weekDays?.length ? weekDaysLabel(rule.weekDays) : null;
  return days ? `${unit}: ${days.toLowerCase()}` : unit;
}

/** Nombre del día de la semana de una fecha ("lunes"). */
export const weekdayName = (date: Date) => WEEK_DAYS.find((day) => day.value === date.getDay())?.name ?? '';

/**
 * En una cita de una serie, pregunta si el cambio es solo para esta o para
 * esta y las siguientes. Fuera de una serie, 'ONE' sin preguntar; null si se cancela.
 */
export function askSeriesScope(
  appointment: Pick<AppointmentData, 'seriesId'>,
  options: { title: string; message: string; destructive?: boolean },
): Promise<SeriesScope | null> {
  if (!appointment.seriesId) return Promise.resolve('ONE');
  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: 'Solo esta', onPress: () => resolve('ONE') },
        { text: 'Esta y las siguientes', style: options.destructive ? 'destructive' : 'default', onPress: () => resolve('FOLLOWING') },
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
