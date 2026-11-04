// ตัวกรองรายการห้อง A1 (sec-a.jpg หน้า 1) — ชิปเม็ดยา 4 ตัว: ทั้งหมด · กำลังทำ <n สีเขียว> · รออนุมัติ <n สีส้ม> · เสร็จ
// ตัวที่เลือก = พื้น accent ทึบ · ที่เหลือ = กระจก · testID ของแต่ละชิปมาจากจอ (ข้อสอบตรวจในไฟล์จอ)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { F, glassStyle, shadow, useTheme } from "@/src/theme/index";
import { type as T } from "@/src/theme/tokens";

export type RoomFilterKey = "all" | "working" | "approval" | "done";
export type RoomFilterOption = { key: RoomFilterKey; testID: string; label: string; count?: number; tone?: "run" | "wait" };

const H = 36;

export function RoomFilters({ options, value, onChange }: { options: RoomFilterOption[]; value: RoomFilterKey; onChange: (k: RoomFilterKey) => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            testID={o.testID}
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[on ? [{ backgroundColor: c.accent, borderRadius: H / 2 }, shadow(c.tabShadow)] : glassStyle(c, H / 2), styles.chip]}
          >
            <Text style={[styles.t, { color: on ? c.onAccent : c.tab.fg }, on && styles.on]}>
              {o.label}
              {o.count ? <Text style={[styles.n, { color: on ? c.onAccent : o.tone === "wait" ? c.status.wait : c.status.run }]}>{` ${o.count}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: F.v(12), marginTop: F.v(26) },
  chip: { height: H, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  t: { fontSize: T.sub, lineHeight: 19 },
  on: { fontWeight: "700" },
  n: { fontWeight: "700" },
});
