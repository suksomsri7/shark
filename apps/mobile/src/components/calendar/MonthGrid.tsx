// ตารางเดือน 7 คอลัมน์ เริ่มอาทิตย์ (CAL2.3 · แบบ cal-1.png จอ 4 · .mon ใน gen.py)
//   วันเลือก = พื้นทึบ accent · จุดสีต่อระบบ ≤ 3 (ColorKey[] จาก GET calendar/month · เรียง priority) · วันนี้ (ไม่ได้เลือก) = ตัวหนา
//   testID: <testID>-<YYYY-MM-DD>
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import type { ColorKey } from "@/src/api/calendar";
import { dateNum, monthCells, wdShortOf } from "@/src/lib/cal-date";
import { useLang } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";

export function MonthGrid({
  ym,
  selected,
  today,
  dots,
  onPick,
  testID,
}: {
  ym: string;
  selected: string;
  today: string;
  dots: Record<string, ColorKey[]>;
  onPick: (d: string) => void;
  testID: string;
}) {
  const { c } = useTheme();
  const lang = useLang();
  const cells = monthCells(ym);
  return (
    <View testID={testID} style={styles.grid}>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={`h${i}`} style={styles.h}>
          <Text style={[styles.hT, { color: c.textFaint }]}>{wdShortOf(i, lang)}</Text>
        </View>
      ))}
      {cells.map((d, i) => {
        if (!d) return <View key={`e${i}`} style={styles.cellWrap} />;
        const on = d === selected;
        const keys = (dots[d] ?? []).slice(0, 3);
        return (
          <View key={d} style={styles.cellWrap}>
            <Pressable
              testID={`${testID}-${d}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onPick(d)}
              style={[styles.cell, on && { backgroundColor: c.accent }]}
            >
              <Text style={[styles.num, { color: on ? c.onAccent : c.text }, (on || d === today) && styles.bold]}>{dateNum(d)}</Text>
              <View style={styles.dots}>
                {keys.map((k, j) => (
                  <View key={`${k}${j}`} style={[styles.dot, { backgroundColor: c.cal[k] ?? c.textFaint }]} />
                ))}
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, marginHorizontal: -6 },
  h: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4 },
  hT: { fontSize: 11 },
  cellWrap: { width: `${100 / 7}%`, padding: 1 },
  cell: { height: 44, alignItems: "center", paddingTop: 6, borderRadius: 12 },
  num: { fontSize: 14 },
  bold: { fontWeight: "700" },
  dots: { flexDirection: "row", gap: 2, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
