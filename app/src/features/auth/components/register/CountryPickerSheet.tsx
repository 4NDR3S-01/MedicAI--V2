import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { AppTheme } from "../../../../shared/theme";
import { BottomSheet, PressableScale } from "../../../../shared/ui";
import { PHONE_COUNTRIES } from "../../config/register.constants";
import { countryFlag } from "../../utils/register.utils";

type CountryPickerSheetProps = {
  theme: AppTheme;
  visible: boolean;
  selectedIso: string;
  onClose: () => void;
  onSelect: (iso: string) => void;
};

export function CountryPickerSheet({
  theme,
  visible,
  selectedIso,
  onClose,
  onSelect,
}: Readonly<CountryPickerSheetProps>) {
  return (
    <BottomSheet theme={theme} visible={visible} onClose={onClose} title="Código de país">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {PHONE_COUNTRIES.map((country) => {
          const isSelected = country.iso === selectedIso;
          return (
            <PressableScale
              key={country.iso}
              pressedScale={0.98}
              onPress={() => onSelect(country.iso)}
              accessibilityRole="radio"
              accessibilityLabel={`${country.name}, ${country.code}`}
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.row,
                {
                  borderColor: isSelected ? theme.colors.accentPrimary : theme.colors.inputBorder,
                  backgroundColor: isSelected ? `${theme.colors.accentPrimary}1F` : theme.colors.inputBackground,
                },
              ]}
            >
              <Text style={styles.flag}>{countryFlag(country.iso)}</Text>
              <Text style={[styles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
                {country.name}
              </Text>
              <Text style={[styles.code, { color: theme.colors.textSecondary }]}>{country.code}</Text>
              <View style={styles.check}>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={22} color={theme.colors.accentPrimary} />
                ) : null}
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  flag: { fontSize: 24 },
  name: { flex: 1, fontSize: 16, fontWeight: "600" },
  code: { fontSize: 15, fontWeight: "700" },
  check: { width: 22, alignItems: "center" },
});
