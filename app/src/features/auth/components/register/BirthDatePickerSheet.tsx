import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import type { AppTheme } from "../../../../shared/theme";
import { AppButton, BottomSheet, PressableScale } from "../../../../shared/ui";
import { MIN_REGISTER_AGE, MONTH_NAMES } from "../../config/register.constants";
import {
  calculateAge,
  clampCalendarDate,
  compareCalendarDates,
  formatBirthDate,
  formatBirthDateLong,
  getBirthDateBounds,
  getDaysInMonth,
  parseBirthDate,
  type CalendarDate,
} from "../../utils/register.utils";

const ROW_HEIGHT = 48;
const VISIBLE_ROWS = 5;
/** Filas por encima de la seleccionada al abrir, para que quede centrada. */
const ROWS_ABOVE_SELECTION = Math.floor(VISIBLE_ROWS / 2);
const DEFAULT_AGE = 25;

type Option = { value: number; label: string; disabled: boolean };

type BirthDatePickerSheetProps = {
  theme: AppTheme;
  visible: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

export function BirthDatePickerSheet({
  theme,
  visible,
  value,
  onClose,
  onConfirm,
}: Readonly<BirthDatePickerSheetProps>) {
  const bounds = useMemo(() => getBirthDateBounds(), [visible]);
  const [draft, setDraft] = useState<CalendarDate>(() => initialDraft(value, bounds));

  // Cada vez que se abre, parte de la fecha guardada (o de una por defecto).
  useEffect(() => {
    if (visible) setDraft(initialDraft(value, bounds));
  }, [visible, value, bounds]);

  const isAfterMax = (date: CalendarDate) => compareCalendarDates(date, bounds.max) > 0;
  const isBeforeMin = (date: CalendarDate) => compareCalendarDates(date, bounds.min) < 0;

  const dayOptions: Option[] = Array.from(
    { length: getDaysInMonth(draft.year, draft.month) },
    (_, index) => {
      const day = index + 1;
      const date = { ...draft, day };
      return { value: day, label: String(day), disabled: isAfterMax(date) || isBeforeMin(date) };
    },
  );
  const monthOptions: Option[] = MONTH_NAMES.map((name, index) => {
    const month = index + 1;
    const firstDay = { year: draft.year, month, day: 1 };
    const lastDay = { year: draft.year, month, day: getDaysInMonth(draft.year, month) };
    return {
      value: month,
      label: name.charAt(0).toUpperCase() + name.slice(1, 3),
      disabled: isAfterMax(firstDay) || isBeforeMin(lastDay),
    };
  });
  const yearOptions: Option[] = useMemo(
    () =>
      Array.from({ length: bounds.max.year - bounds.min.year + 1 }, (_, index) => {
        const year = bounds.max.year - index;
        return { value: year, label: String(year), disabled: false };
      }),
    [bounds],
  );

  const update = (patch: Partial<CalendarDate>) =>
    setDraft((current) => clampCalendarDate({ ...current, ...patch }, bounds));

  const age = calculateAge(draft);

  return (
    <BottomSheet
      theme={theme}
      visible={visible}
      onClose={onClose}
      title="Fecha de nacimiento"
      subtitle={
        <View style={styles.preview} accessibilityLiveRegion="polite">
          <Text style={[styles.previewDate, { color: theme.colors.textPrimary }]}>
            {formatBirthDateLong(formatBirthDate(draft))}
          </Text>
          <View style={[styles.ageBadge, { backgroundColor: `${theme.colors.accentPrimary}22` }]}>
            <Text style={[styles.ageBadgeText, { color: theme.colors.accentPrimary }]}>
              {age} años
            </Text>
          </View>
        </View>
      }
      footer={
        <>
          <AppButton theme={theme} label="Cancelar" variant="secondary" onPress={onClose} style={styles.flex} />
          <AppButton
            theme={theme}
            label="Confirmar"
            onPress={() => onConfirm(formatBirthDate(draft))}
            style={styles.flex}
          />
        </>
      }
    >
      <View style={styles.columns}>
        <PickerColumn
          theme={theme}
          title="Día"
          options={dayOptions}
          selected={draft.day}
          onSelect={(day) => update({ day })}
        />
        <PickerColumn
          theme={theme}
          title="Mes"
          options={monthOptions}
          selected={draft.month}
          onSelect={(month) => update({ month })}
          wide
        />
        <PickerColumn
          theme={theme}
          title="Año"
          options={yearOptions}
          selected={draft.year}
          onSelect={(year) => update({ year })}
          wide
        />
      </View>
      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        Debes tener al menos {MIN_REGISTER_AGE} años para usar MedicAI.
      </Text>
    </BottomSheet>
  );
}

function initialDraft(value: string, bounds: { min: CalendarDate; max: CalendarDate }): CalendarDate {
  const parsed = parseBirthDate(value);
  if (parsed) return clampCalendarDate(parsed, bounds);
  const today = new Date();
  return clampCalendarDate(
    { year: today.getFullYear() - DEFAULT_AGE, month: today.getMonth() + 1, day: today.getDate() },
    bounds,
  );
}

type PickerColumnProps = {
  theme: AppTheme;
  title: string;
  options: Option[];
  selected: number;
  onSelect: (value: number) => void;
  wide?: boolean;
};

function PickerColumn({ theme, title, options, selected, onSelect, wide }: Readonly<PickerColumnProps>) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected));

  return (
    <View style={[styles.column, wide ? styles.columnWide : null]}>
      <Text style={[styles.columnTitle, { color: theme.colors.textMuted }]}>{title}</Text>
      <View style={[styles.list, { borderColor: theme.colors.inputBorder }]}>
        <FlatList
          data={options}
          keyExtractor={(option) => String(option.value)}
          // Se monta al abrir el panel: arranca con la opción elegida centrada.
          initialScrollIndex={Math.max(0, selectedIndex - ROWS_ABOVE_SELECTION)}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = item.value === selected;
            return (
              <PressableScale
                onPress={() => onSelect(item.value)}
                disabled={item.disabled}
                accessibilityRole="radio"
                accessibilityLabel={`${title} ${item.label}`}
                accessibilityState={{ selected: isSelected, disabled: item.disabled }}
                style={[
                  styles.option,
                  isSelected && { backgroundColor: theme.colors.accentPrimary },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    {
                      color: isSelected ? theme.colors.buttonText : theme.colors.textPrimary,
                      opacity: item.disabled ? 0.3 : 1,
                      fontWeight: isSelected ? "800" : "600",
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </PressableScale>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  preview: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" },
  previewDate: { fontSize: 17, fontWeight: "700" },
  ageBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  ageBadgeText: { fontSize: 13, fontWeight: "800" },
  columns: { flexDirection: "row", gap: 10 },
  column: { flex: 0.8, gap: 6 },
  columnWide: { flex: 1 },
  columnTitle: { fontSize: 12, fontWeight: "700", textAlign: "center", textTransform: "uppercase", letterSpacing: 0.6 },
  list: { height: ROW_HEIGHT * VISIBLE_ROWS, borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  listContent: { paddingHorizontal: 4 },
  option: {
    height: ROW_HEIGHT - 6,
    marginVertical: 3,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: { fontSize: 16 },
  note: { fontSize: 12.5, marginTop: 12, textAlign: "center" },
});
