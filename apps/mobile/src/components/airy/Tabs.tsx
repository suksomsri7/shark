// แท็บเม็ดยา .tabs — แต่ละอันเป็นกระจก · อันที่เลือก = พื้น accent · ตัวเลขนับต่อท้ายได้
import { Pressable, ScrollView, StyleSheet } from "react-native";
import { Text } from "@/src/components/ui/text";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii } from "@/src/theme/tokens";

/** testID (S2.17 · ไม่ใส่ = `<testID>-<key>` เหมือนเดิม) */
export type TabItem = { key: string; label: string; count?: number; tone?: "run" | "wait"; testID?: string };

export function Tabs({ items, active, onChange, testID }: { items: TabItem[]; active: string; onChange?: (key: string) => void; testID: string }) {
  const { c } = useTheme();
  return (
    <ScrollView testID={testID} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <Pressable
            testID={it.testID ?? `${testID}-${it.key}`}
            key={it.key}
            onPress={() => onChange?.(it.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[on ? [{ backgroundColor: c.accent, borderRadius: radii.tab }, shadow(c.tabShadow)] : glassStyle(c, radii.tab), styles.tab]}
          >
            <Text style={[styles.t, { color: on ? c.onAccent : c.tab.fg }]}>
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
  tab: { paddingVertical: 10, paddingHorizontal: 17 },
  t: { fontSize: 15, fontWeight: "500" },
  n: { fontWeight: "600" },
});
