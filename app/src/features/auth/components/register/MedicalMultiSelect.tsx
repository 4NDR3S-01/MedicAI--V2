import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LayoutAnimation, StyleSheet, Text, View } from "react-native";

import { BufferedTextInput } from "../../../../shared/ui/BufferedTextInput";

import type { AppTheme } from "../../../../shared/theme";
import { PressableScale, useReducedMotion } from "../../../../shared/ui";
import {
  MEDICAL_CUSTOM_ITEM_MAX_LENGTH,
  MEDICAL_CUSTOM_ITEMS_MAX,
  MEDICAL_SYNONYMS,
} from "../../config/register.constants";
import type { MedicalSelection } from "../../models/register.types";
import { formatCustomMedicalItem, normalizeMedicalText, suggestMedicalOptions } from "../../utils/medical-search";
import { ERROR_COLOR, useFieldColors } from "../../../../shared/ui/FormField";
import { SelectableChip } from "../../../../shared/ui/SelectableChip";

type OptionGroup = { title?: string; items: readonly string[] };

type MedicalMultiSelectProps = {
  theme: AppTheme;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  noneLabel: string;
  /** Todas las opciones conocidas (se buscan al escribir). */
  groups: readonly OptionGroup[];
  /** Las más comunes: las únicas a la vista junto a «Ninguna» y lo elegido. */
  featured: readonly string[];
  /** Falta responder la sección (ni opciones ni «Ninguna»). */
  error?: string;
  onCustomInputFocus?: () => void;
  value: MedicalSelection;
  onChange: (value: MedicalSelection) => void;
};

/**
 * Pocas opciones a la vista (las comunes) y un buscador: al escribir se ofrece
 * primero lo que ya existe, aunque esté mal escrito («iabetes») o dicho con
 * otras palabras («presión alta»); si no existe, se agrega bien escrito.
 */
export function MedicalMultiSelect({
  theme,
  title,
  description,
  icon,
  noneLabel,
  groups,
  featured,
  error,
  onCustomInputFocus,
  value,
  onChange,
}: Readonly<MedicalMultiSelectProps>) {
  const reducedMotion = useReducedMotion();
  const [draft, setDraft] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputColors = useFieldColors(theme, focused, Boolean(customError));

  const predefined = groups.flatMap((group) => group.items);
  // A la vista: las comunes y todo lo ya elegido (de la lista o agregado).
  const visible = [...featured, ...value.items.filter((item) => !featured.includes(item))];

  const query = draft.trim();
  const suggestions = suggestMedicalOptions(query, predefined, MEDICAL_SYNONYMS).filter(
    (suggestion) => !value.items.includes(suggestion.item),
  );
  const normalizedQuery = normalizeMedicalText(query);
  const alreadyChosen = value.items.find((item) => normalizeMedicalText(item) === normalizedQuery);
  const exactOption = predefined.find((item) => normalizeMedicalText(item) === normalizedQuery);
  const canAddTyped = normalizedQuery.length >= 2 && !alreadyChosen && !exactOption;

  const animateLayout = () => {
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const toggleNone = () => {
    animateLayout();
    onChange(value.none ? { none: false, items: [] } : { none: true, items: [] });
  };

  const toggleItem = (item: string) => {
    animateLayout();
    const items = value.items.includes(item)
      ? value.items.filter((current) => current !== item)
      : [...value.items, item];
    onChange({ none: false, items });
  };

  const clearDraft = () => {
    setDraft("");
    setCustomError(null);
  };

  const choose = (item: string) => {
    if (!value.items.includes(item)) toggleItem(item);
    clearDraft();
  };

  /** Botón «+» o «Listo» del teclado. */
  const submit = () => {
    if (!query) {
      setCustomError("Escribe un nombre para buscar o agregar.");
      return;
    }
    if (alreadyChosen) {
      setCustomError(`"${alreadyChosen}" ya está en tu lista.`);
      return;
    }
    if (exactOption) {
      choose(exactOption);
      return;
    }
    addTyped();
  };

  const addTyped = () => {
    const text = formatCustomMedicalItem(query);
    if (text.length > MEDICAL_CUSTOM_ITEM_MAX_LENGTH) {
      setCustomError(`Máximo ${MEDICAL_CUSTOM_ITEM_MAX_LENGTH} caracteres.`);
      return;
    }
    const customCount = value.items.filter((item) => !predefined.includes(item)).length;
    if (customCount >= MEDICAL_CUSTOM_ITEMS_MAX) {
      setCustomError(`Puedes agregar hasta ${MEDICAL_CUSTOM_ITEMS_MAX} adicionales.`);
      return;
    }
    animateLayout();
    onChange({ none: false, items: [...value.items, text] });
    clearDraft();
  };

  const selectedCount = value.items.length;
  const showList = suggestions.length > 0 || canAddTyped;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: error ? ERROR_COLOR : theme.colors.surfaceBorder },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: `${theme.colors.accentSecondary}1F` }]}>
          <Ionicons name={icon} size={20} color={theme.colors.accentSecondary} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[styles.description, { color: theme.colors.textMuted }]}>{description}</Text>
        </View>
        {selectedCount > 0 ? (
          <View style={[styles.countBadge, { backgroundColor: theme.colors.accentPrimary }]}>
            <Text style={[styles.countText, { color: theme.colors.buttonText }]}>{selectedCount}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.chips}>
        <SelectableChip theme={theme} label={noneLabel} selected={value.none} onPress={toggleNone} />
        {visible.map((item) => {
          const custom = !predefined.includes(item);
          return (
            <SelectableChip
              key={item}
              theme={theme}
              label={item}
              selected={value.items.includes(item)}
              removable={custom}
              onPress={() => toggleItem(item)}
            />
          );
        })}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={15} color={ERROR_COLOR} />
          <Text style={[styles.sectionError, { color: ERROR_COLOR }]}>{error}</Text>
        </View>
      ) : null}

      <View>
        <View style={[styles.addRow, inputColors]}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} style={styles.searchIcon} />
          <BufferedTextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              if (customError) setCustomError(null);
            }}
            onFocus={() => {
              setFocused(true);
              onCustomInputFocus?.();
            }}
            onBlur={() => setFocused(false)}
            onSubmitEditing={submit}
            placeholder="Buscar o escribir otra…"
            placeholderTextColor={theme.colors.inputPlaceholder}
            maxLength={MEDICAL_CUSTOM_ITEM_MAX_LENGTH}
            returnKeyType="done"
            submitBehavior="submit"
            accessibilityLabel={`Buscar o agregar en ${title}`}
            style={[styles.addInput, { color: theme.colors.textPrimary }]}
          />
          {query ? (
            <PressableScale onPress={clearDraft} hitSlop={8} accessibilityRole="button" accessibilityLabel="Borrar búsqueda" style={styles.clear}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
            </PressableScale>
          ) : null}
        </View>

        {showList ? (
          <View
            style={[styles.list, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.surfaceBorder }]}
            accessibilityLiveRegion="polite"
            // Las sugerencias aparecen bajo el campo: se desplaza para que no
            // queden tapadas por el teclado (después de medir el nuevo alto).
            onLayout={() => setTimeout(() => onCustomInputFocus?.(), 50)}
          >
            {suggestions.map((suggestion, index) => (
              <PressableScale
                key={suggestion.item}
                onPress={() => choose(suggestion.item)}
                pressedScale={0.99}
                accessibilityRole="button"
                accessibilityLabel={`Elegir ${suggestion.item}`}
                style={[styles.row, index > 0 && [styles.rowDivider, { borderTopColor: theme.colors.surfaceBorder }]]}
              >
                <Text style={[styles.rowText, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                  {suggestion.reason === "typo" ? "¿Quisiste decir " : ""}
                  <Text style={[styles.rowStrong, { color: theme.colors.accentPrimaryText }]}>{suggestion.item}</Text>
                  {suggestion.reason === "typo" ? "?" : ""}
                </Text>
                {suggestion.via ? (
                  <Text style={[styles.rowVia, { color: theme.colors.textMuted }]} numberOfLines={1}>
                    {suggestion.via}
                  </Text>
                ) : null}
              </PressableScale>
            ))}
            {canAddTyped ? (
              <PressableScale
                onPress={addTyped}
                pressedScale={0.99}
                accessibilityRole="button"
                accessibilityLabel={`Agregar ${formatCustomMedicalItem(query)}`}
                style={[styles.row, suggestions.length > 0 && [styles.rowDivider, { borderTopColor: theme.colors.surfaceBorder }]]}
              >
                <Ionicons name="add" size={18} color={theme.colors.textMuted} />
                <Text style={[styles.rowText, { color: theme.colors.textMuted }]} numberOfLines={2}>
                  Agregar «{formatCustomMedicalItem(query)}»
                </Text>
              </PressableScale>
            ) : null}
          </View>
        ) : null}
      </View>
      {customError ? (
        <Text style={[styles.error, { color: ERROR_COLOR }]} accessibilityLiveRegion="polite">
          {customError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: 20, padding: 16, gap: 12 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: -4 },
  sectionError: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  iconBadge: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: "800" },
  description: { fontSize: 13, lineHeight: 18 },
  countBadge: { minWidth: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
  countText: { fontSize: 13, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  addRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 6, minHeight: 50 },
  searchIcon: { marginLeft: 6 },
  addInput: { flex: 1, fontSize: 15, paddingHorizontal: 8, paddingVertical: 10 },
  clear: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  list: { marginTop: 6, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, minHeight: 48, paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, fontSize: 15, fontWeight: "500" },
  rowStrong: { fontWeight: "800" },
  rowVia: { fontSize: 12.5, fontWeight: "500", maxWidth: "40%" },
  error: { fontSize: 13, marginTop: -4 },
});
