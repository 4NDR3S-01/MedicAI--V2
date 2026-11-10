import { useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import type { AppTheme } from '../../../shared/theme';
import { BottomSheet, SheetInfo, SheetInfoLine, SheetOptionRow } from '../../../shared/ui';
import { dosageOnDay } from '../../../shared/services/dose-schedule';
import type { MedicationData } from '../services/medications.service';
import { changedByNote } from '../utils/audit';
import { openAssistant } from '../../assistant/services/assistant-launcher';
import { formatQuantity, isLowStock, scheduleLabel, stockDaysLeft, stockUnitLabel } from '../utils/medication-form';

type MedicationOptionsSheetProps = {
  theme: AppTheme;
  medication: MedicationData | null;
  isToggling: boolean;
  canToggle: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onToggleActive: (medication: MedicationData) => void;
  onEdit: (medication: MedicationData) => void;
  onDelete: (medication: MedicationData) => void;
  /** Muestra "Preguntar al asistente" (solo con medicamentos propios). */
  canAsk?: boolean;
};

/**
 * Detalle y acciones de un medicamento. Lo secundario (notas, existencias,
 * quién lo cambió, pausar, eliminar) vive aquí para que la tarjeta muestre
 * solo lo que importa hoy.
 */
export function MedicationOptionsSheet({
  theme,
  medication,
  isToggling,
  canToggle,
  canEdit,
  canDelete,
  onClose,
  onToggleActive,
  onEdit,
  onDelete,
  canAsk = false,
}: Readonly<MedicationOptionsSheetProps>) {
  // Conserva el contenido mientras el panel se cierra.
  const last = useRef(medication);
  if (medication) last.current = medication;
  const med = medication ?? last.current;
  // El interruptor cambia en el mismo toque, sin esperar a que se guarde
  // (si no, el control vuelve atrás un instante y luego salta).
  const [shown, setShown] = useState<{ id: string; active: boolean } | null>(null);
  const active = shown && med && shown.id === med.id && isToggling ? shown.active : med?.active ?? false;
  const toggle = () => {
    if (!med || isToggling) return;
    setShown({ id: med.id, active: !med.active });
    onToggleActive(med);
  };

  if (!med) return null;

  const dosageToday = med.dosageSteps?.length ? dosageOnDay(med, new Date()) : med.dosage;
  const lowStock = isLowStock(med);
  const daysLeft = med.stockQuantity != null ? stockDaysLeft(med) : null;
  const audit = changedByNote(med, { masculine: true });

  // Abrir otra hoja encima de esta da problemas en Android: primero se cierra.
  const thenClose = (action: (m: MedicationData) => void) => () => {
    onClose();
    setTimeout(() => action(med), 220);
  };

  let stockText: string | null = null;
  if (med.stockQuantity != null) {
    const left = med.stockQuantity;
    stockText = left <= 0
      ? 'Se acabó: actualiza las existencias'
      : `Quedan ${formatQuantity(left)} ${stockUnitLabel(med.dosage, left)}${daysLeft !== null ? ` · unos ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}` : ''}`;
  }

  return (
    <BottomSheet
      theme={theme}
      visible={Boolean(medication)}
      onClose={onClose}
      title={med.name}
      subtitle={
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
          {dosageToday} · {scheduleLabel(med)}
        </Text>
      }
    >
      <View>
        {stockText || med.notes || audit ? (
          <SheetInfo theme={theme}>
            {stockText ? (
              <SheetInfoLine
                theme={theme}
                icon={lowStock ? 'alert-outline' : 'package-variant-closed'}
                text={stockText}
                color={lowStock ? theme.colors.warningText : undefined}
              />
            ) : null}
            {med.notes ? <SheetInfoLine theme={theme} icon="note-text-outline" text={med.notes} /> : null}
            {audit ? <SheetInfoLine theme={theme} icon="account-edit-outline" text={audit} /> : null}
          </SheetInfo>
        ) : null}

        {canAsk ? (
          <SheetOptionRow
            theme={theme}
            icon="robot-outline"
            label="Preguntar al asistente"
            hint="Para qué sirve, cómo tomarlo, qué evitar"
            onPress={thenClose((m) =>
              openAssistant({ text: `¿Para qué sirve ${m.name} (${dosageToday}) y qué debo tener en cuenta al tomarlo?` }),
            )}
          />
        ) : null}

        {canEdit ? (
          <SheetOptionRow theme={theme} icon="pencil-outline" label="Editar medicamento" hint="Horario, dosis y existencias" onPress={thenClose(onEdit)} />
        ) : null}

        {canToggle ? (
          <SheetOptionRow
            theme={theme}
            icon={active ? 'bell-ring-outline' : 'bell-sleep-outline'}
            label="Recordatorios"
            hint={active ? 'Activo: suenan las alarmas' : 'Pausado: no sonará ninguna alarma'}
            onPress={toggle}
            right={
              <Switch
                value={active}
                onValueChange={toggle}
                trackColor={{ false: theme.colors.surfaceBorder, true: `${theme.colors.accentPrimary}60` }}
                thumbColor={active ? theme.colors.accentPrimary : theme.colors.textMuted}
                ios_backgroundColor={theme.colors.surfaceBorder}
                importantForAccessibility="no-hide-descendants"
              />
            }
          />
        ) : null}

        {canDelete ? (
          <SheetOptionRow theme={theme} icon="trash-can-outline" label="Eliminar medicamento" destructive onPress={thenClose(onDelete)} />
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 14, marginTop: 4 },
});
