import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text } from "react-native";

import type { AppTheme } from "../../../../shared/theme";
import { PressableScale } from "../../../../shared/ui";

type SelectableChipProps = {
  theme: AppTheme;
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Muestra una "x" para quitar el elemento (valores personalizados). */
  removable?: boolean;
};

export function SelectableChip({
  theme,
  label,
  selected,
  onPress,
  removable,
}: Readonly<SelectableChipProps>) {
  let icon: "checkmark" | "close" | null = null;
  if (removable) icon = "close";
  else if (selected) icon = "checkmark";

  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.94}
      hitSlop={4}
      accessibilityRole={removable ? "button" : "checkbox"}
      accessibilityLabel={removable ? `Quitar ${label}` : label}
      accessibilityState={removable ? undefined : { checked: selected }}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: theme.colors.accentPrimary, borderColor: theme.colors.accentPrimary }
          : { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={15}
          color={selected ? theme.colors.buttonText : theme.colors.textSecondary}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          { color: selected ? theme.colors.buttonText : theme.colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  label: { fontSize: 14, fontWeight: "700" },
});
