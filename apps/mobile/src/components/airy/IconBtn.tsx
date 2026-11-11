// ปุ่มไอคอนกลม 48 (.ib) — ปกติ = กระจก · `on` = พื้นทึบตามโซน (.ib.on / .zc / .zt · มติ 16)
import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { glassStyle, shadow, useTheme, zoneColor, type ZoneKey } from "@/src/theme/index";
import { size } from "@/src/theme/tokens";
import { Icon, type IconName } from "./Icon";

export function IconBtn({
  icon,
  testID,
  onPress,
  on = false,
  zone = "secretary",
  label,
}: {
  icon: IconName;
  testID: string;
  onPress?: () => void;
  on?: boolean;
  zone?: ZoneKey;
  label?: string;
}) {
  const { c } = useTheme();
  const bg = zoneColor(c, zone);
  const fg = zone === "secretary" ? c.onAccent : c.zone.onZone;
  // active: พื้นทึบสีโซน ขอบสีเดียวกัน เงาเดิมของกระจก
  const solid: ViewStyle = { borderRadius: size.iconBtn / 2, borderWidth: 1.5, borderColor: bg, backgroundColor: bg, ...shadow(c.glass.shadow) };
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      hitSlop={4}
      style={[on ? solid : glassStyle(c, size.iconBtn / 2), styles.box]}
    >
      <Icon name={icon} color={on ? fg : c.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { width: size.iconBtn, height: size.iconBtn, alignItems: "center", justifyContent: "center" },
});
