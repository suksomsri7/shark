// ป้ายระบบ .sysp (จุดสี + ชื่อระบบ) และป้ายย่อ .k (กล่องสีกับตัวย่อ เช่น POS/CRM/คิว)
import { StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { useTheme, type SysKey } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

export function SysTag({ sys, label, testID }: { sys: SysKey; label: string; testID?: string }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[styles.tag, { backgroundColor: c.sysTag.bg }]}>
      <View style={[styles.dot, { backgroundColor: c.sys[sys] }]} />
      <Text style={[styles.t, { color: c.sysTag.fg }]}>{label}</Text>
    </View>
  );
}

/** ป้ายย่อของระบบ (แบบ C3 ใน .sugg: กล่องเล็กสีระบบ ตัวอักษรสีเนื้อความ 11) · `solid` = แบบ .step/.lnk .k (กล่อง 30 มน 10 ตัวขาวหนา) */
export function SysBadge({ sys, label, testID, solid = false }: { sys: SysKey; label: string; testID?: string; solid?: boolean }) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={[solid ? styles.k : styles.badge, { backgroundColor: c.sys[sys] }]}>
      <Text style={solid ? [styles.kt, { color: c.onSys, fontSize: label.length >= 4 ? 9.5 : 11 }] : [styles.bt, { color: c.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 3, paddingHorizontal: 9, borderRadius: radii.tag, alignSelf: "flex-start" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  t: { fontSize: 11.5, fontWeight: "600" },
  badge: { height: 15, paddingHorizontal: 1, alignItems: "center", justifyContent: "center" },
  bt: { fontSize: 11, lineHeight: 15 },
  k: { width: 30, height: 30, borderRadius: radii.k, alignItems: "center", justifyContent: "center" },
  kt: { fontWeight: "700" },
});
