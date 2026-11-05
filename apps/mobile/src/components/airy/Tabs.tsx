// แท็บเม็ดยา .tabs — แต่ละอันเป็นกระจก · อันที่เลือก = พื้น accent · ตัวเลขนับต่อท้ายได้
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { Text } from "@/src/components/ui/text";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

// testID ต่อแท็บ (ไม่บังคับ · S2.5) — ปริยาย `${testID}-${key}`
// S2.14 F2: `dense` = ระยะ/ตัวอักษรย่อ (แถว 4 แท็บพอดีจอ 390) · `bleed` = แถวเลื่อนชิดขอบจอ (ชดเชย padding ของหน้า) — แท็บท้ายที่ล้นถูกตัดที่ขอบจอ ไม่ใช่กลางหน้า
export type TabItem = { key: string; label: string; count?: number; tone?: "run" | "wait"; testID?: string };

export function Tabs({ items, active, onChange, testID, dense = false, bleed = 0 }: { items: TabItem[]; active: string; onChange?: (key: string) => void; testID: string; dense?: boolean; bleed?: number }) {
  const { c } = useTheme();
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={bleed ? { marginHorizontal: -bleed } : undefined}
      contentContainerStyle={[styles.row, dense && styles.rowDense, bleed ? { paddingHorizontal: bleed } : null]}
    >
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Pressable
            testID={it.testID ?? `${testID}-${it.key}`}
            key={it.key}
            onPress={() => onChange?.(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[on ? [{ backgroundColor: c.accent, borderRadius: radii.tab }, shadow(c.tabShadow)] : glassStyle(c, radii.tab), styles.tab, dense && styles.tabDense]}
          >
            <Text style={[styles.t, dense && styles.tDense, { color: on ? c.onAccent : c.tab.fg }]}>
              {it.label}
              {it.count != null ? <Text style={[styles.n, { color: it.tone === "run" ? c.status.run : c.warn.fg }]}>{` ${it.count}`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 4 },
  rowDense: { gap: 7, paddingVertical: 8 },
  tab: { paddingVertical: 10, paddingHorizontal: 17 },
  tabDense: { paddingHorizontal: 11 },
  t: { fontSize: 15, fontWeight: "500" },
  tDense: { fontSize: 14 },
  n: { fontWeight: "600" },
});
