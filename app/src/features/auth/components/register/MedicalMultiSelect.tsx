import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LayoutAnimation, StyleSheet, Text, TextInput, View } from "react-native";

import type { AppTheme } from "../../../../shared/theme";
import { PressableScale, useReducedMotion } from "../../../../shared/ui";
import {
  MEDICAL_CUSTOM_ITEM_MAX_LENGTH,
  MEDICAL_CUSTOM_ITEMS_MAX,
} from "../../config/register.constants";
import type { MedicalSelection } from "../../models/register.types";
import { normalizeMedicalToken } from "../../utils/register.utils";
import { ERROR_COLOR, useFieldColors } from "../../../../shared/ui/FormField";
import { SelectableChip } from "../../../../shared/ui/SelectableChip";

type OptionGroup = { title?: string; items: readonly string[] };

type MedicalMultiSelectProps = {
  theme: AppTheme;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  noneLabel: string;
  groups: readonly OptionGroup[];
  customPlaceholder: string;
  /** Falta responder la sección (ni opciones ni «Ninguna»). */
  error?: string;
  onCustomInputFocus?: () => void;
  value: MedicalSelection;
  onChange: (value: MedicalSelection) => void;
};

export function MedicalMultiSelect({
  theme,
  title,
  description,
  icon,
  noneLabel,
  groups,
  customPlaceholder,
  error,
  onCustomInputFocus,
  value,
  onChange,
}: Readonly<MedicalMultiSelectProps>) {
  const reducedMotion = useReducedMotion();
  const [customDraft, setCustomDraft] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputColors = useFieldColors(theme, focused, Boolean(customError));

  const predefined = groups.flatMap((group) => group.items);
  const customItems = value.items.filter((item) => !predefined.includes(item));

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

  const addCustom = () => {
    const text = customDraft.trim().replace(/\s+/g, " ");
    if (!text) {
      setCustomError("Escribe un nombre para agregar.");
      return;
    }
    if (text.length > MEDICAL_CUSTOM_ITEM_MAX_LENGTH) {
      setCustomError(`Máximo ${MEDICAL_CUSTOM_ITEM_MAX_LENGTH} caracteres.`);
      return;
    }
    const token = normalizeMedicalToken(text);
    const existing = value.items.find((item) => normalizeMedicalToken(item) === token);
    if (existing) {
      setCustomError(`"${existing}" ya está en tu lista.`);
      return;
    }
    const predefinedMatch = predefined.find((item) => normalizeMedicalToken(item) === token);
    if (predefinedMatch) {
      // Si coincide con una opción de la lista, se marca esa opción.
      toggleItem(predefinedMatch);
      setCustomDraft("");
      setCustomError(null);
      return;
    }
    if (customItems.length >= MEDICAL_CUSTOM_ITEMS_MAX) {
      setCustomError(`Puedes agregar hasta ${MEDICAL_CUSTOM_ITEMS_MAX} adicionales.`);
      return;
    }
    animateLayout();
    onChange({ none: false, items: [...value.items, text] });
    setCustomDraft("");
    setCustomError(null);
  };

  const selectedCount = value.items.length;

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
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={15} color={ERROR_COLOR} />
          <Text style={[styles.sectionError, { color: ERROR_COLOR }]}>{error}</Text>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.title ?? "default"} style={styles.group}>
          {group.title ? (
            <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>{group.title}</Text>
          ) : null}
          <View style={styles.chips}>
            {group.items.map((item) => (
              <SelectableChip
                key={item}
                theme={theme}
                label={item}
                selected={value.items.includes(item)}
                onPress={() => toggleItem(item)}
              />
            ))}
          </View>
        </View>
      ))}

      {customItems.length ? (
        <View style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>Agregadas por ti</Text>
          <View style={styles.chips}>
            {customItems.map((item) => (
              <SelectableChip
                key={item}
                theme={theme}
                label={item}
                selected
                removable
                onPress={() => toggleItem(item)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.addRow, inputColors]}>
        <TextInput
          value={customDraft}
          onChangeText={(text) => {
            setCustomDraft(text);
            if (customError) setCustomError(null);
          }}
          onFocus={() => {
            setFocused(true);
            onCustomInputFocus?.();
          }}
          onBlur={() => setFocused(false)}
          onSubmitEditing={addCustom}
          placeholder={customPlaceholder}
          placeholderTextColor={theme.colors.inputPlaceholder}
          maxLength={MEDICAL_CUSTOM_ITEM_MAX_LENGTH}
          returnKeyType="done"
          submitBehavior="submit"
          accessibilityLabel={customPlaceholder}
          style={[styles.addInput, { color: theme.colors.textPrimary }]}
        />
        <PressableScale
          onPress={addCustom}
          accessibilityRole="button"
          accessibilityLabel="Agregar"
          style={[styles.addButton, { backgroundColor: theme.colors.accentSecondary }]}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </PressableScale>
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
  group: { gap: 8 },
  groupTitle: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  addRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingRight: 5, minHeight: 50 },
  addInput: { flex: 1, fontSize: 15, paddingHorizontal: 14, paddingVertical: 10 },
  addButton: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  error: { fontSize: 12.5, marginTop: -4 },
});
