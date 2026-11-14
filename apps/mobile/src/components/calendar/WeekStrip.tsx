// แถบสัปดาห์ อา–ส (CAL2.2 · แบบ cal-1.png จอ 3 · .wk ใน gen.py) — วันเลือก = พื้นทึบ accent · จุดใต้วัน = มีรายการ (GET calendar/month)
//   testID: <testID>-<YYYY-MM-DD>
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { dateNum, wdShort, weekDays } from "@/src/lib/cal-date";
import { useLang } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";

export function WeekStrip({ day, hasDots, onPick, testID }: { day: string; hasDots: (d: string) => boolean; onPick: (d: string) => void; testID: string }) {
  const { c } = useTheme();
  const lang = useLang();
  return (
    <View testID={testID} style={styles.row}>
      {weekDays(day).map((d) => {
        const on = d === day;
        const dot = hasDots(d);
        return (
          <Pressable
            key={d}
            testID={`${testID}-${d}`}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(d)}
            style={[styles.cell, on && { backgroundColor: c.accent }]}
          >
            <Text style={[styles.wd, { color: on ? c.textFaint : c.textFaint }]}>{wdShort(d, lang)}</Text>
            <Text style={[styles.num, { color: on ? c.onAccent : c.text }]}>{dateNum(d)}</Text>
            <View style={[styles.dot, { backgroundColor: on ? c.onAccent : c.textFaint }, !dot && styles.hidden]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  cell: { width: 44, alignItems: "center", paddingTop: 7, paddingBottom: 8, borderRadius: 14 },
  wd: { fontSize: 11 },
  num: { fontSize: 17, fontWeight: "600", marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  hidden: { opacity: 0 },
});
