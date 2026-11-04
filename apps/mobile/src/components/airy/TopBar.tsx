// แถบบน .bar — ซ้าย = กลุ่มไอคอน · กลาง = ชื่อ + บรรทัดรอง · ขวา = ช่องปุ่ม (ระยะห่าง 10 = 14 ของแบบย่อเป็น 390)
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { useTheme } from "@/src/theme/index";
import { size, type as T } from "@/src/theme/tokens";

export function TopBar({ left, title, subtitle, right, testID }: { left?: ReactNode; title?: string; subtitle?: string; right?: ReactNode; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={styles.bar}>
      <View style={styles.side}>{left}</View>
      <View style={styles.center}>
        {title ? (
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={[styles.sub, { color: c.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  side: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: size.iconBtn },
  right: { justifyContent: "flex-end" },
  center: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  title: { fontSize: 16, fontWeight: "600" },
  sub: { fontSize: T.cap, marginTop: 2 },
});
