// ปุ่มหลัก .btn1 — สูง 60 มน 30 พื้น accent · ปิด = .btn1.off
import { Pressable, StyleSheet } from "react-native";
import { Text } from "@/src/components/ui/text";
import { shadow, useTheme } from "@/src/theme/index";
import { radii, size } from "@/src/theme/tokens";

export function PrimaryButton({ label, testID, onPress, disabled = false }: { label: string; testID: string; onPress?: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.btn, disabled ? { backgroundColor: c.btnOff.bg } : [{ backgroundColor: c.accent }, shadow(c.accentShadow)]]}
    >
      <Text style={[styles.t, { color: disabled ? c.btnOff.fg : c.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { height: size.btnH, borderRadius: radii.btn, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  t: { fontSize: 17, fontWeight: "600" },
});
