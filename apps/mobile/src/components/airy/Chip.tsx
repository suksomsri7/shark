// ชิป .chips span — พื้นจาง · active = พื้น accent
import { Pressable, StyleSheet } from "react-native";
import { Text } from "@/src/components/ui/text";
import { useTheme } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

export function Chip({ label, testID, active = false, onPress }: { label: string; testID: string; active?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, { backgroundColor: active ? c.accent : c.chip.bg }]}
    >
      <Text style={[styles.t, { color: active ? c.onAccent : c.chip.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.pill },
  t: { fontSize: 13.5 },
});
