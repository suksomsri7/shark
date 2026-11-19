// แถวรายการของปฏิทิน (CAL2.2 · แบบ cal-1.png จอ 3/4 · cal-3.png จอ 10 · .cal-ev ใน gen.py)
//   แถบสีซ้าย 4 = สีระบบ (theme c.cal[colorKey] · สีเดียวกับตาราง "เปิดระบบ") · คอลัมน์เวลา 44 (HH:MM + "1 ชม."/"เตือน"/"ครบกำหนด" หรือ "ทั้งวัน")
//   ชื่อเรื่อง 14 หนา · บรรทัดรอง 12 จาง · ป้ายระบบ (พื้นสีระบบจาง + ตัวสีระบบ) · วงกลมขวา = ติ๊กเสร็จ (เฉพาะ checkable) · done = จาง .45
//   แตะแถว = onOpen (deepLink) · แตะวงกลม = onToggle · testID: <testID> · <testID>-check
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import type { AgendaItem } from "@/src/api/calendar";
import { durationText, hhmm } from "@/src/lib/cal-date";
import { useLang, useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { calCard } from "./style";

export function AgendaRow({
  item,
  testID,
  onOpen,
  onToggle,
  busy = false,
  compact = false,
}: {
  item: AgendaItem;
  testID: string;
  onOpen?: (it: AgendaItem) => void;
  onToggle?: (it: AgendaItem) => void;
  busy?: boolean;
  /** มุมมองเดือน (จอ 4): คอลัมน์เวลาไม่มีบรรทัดรอง */
  compact?: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const col = c.cal[item.colorKey] ?? c.textMuted;
  const time = item.allDay ? t("cal.allDay") : hhmm(item.startAt);
  const hint = item.allDay || compact
    ? ""
    : item.timeHint === "REMIND"
      ? t("cal.hint.REMIND")
      : item.timeHint === "DUE"
        ? t("cal.hint.DUE")
        : item.timeHint === "DURATION"
          ? durationText(item.startAt, item.endAt, lang)
          : "";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${time} ${item.title}`}
      onPress={onOpen ? () => onOpen(item) : undefined}
      style={[calCard(c, 16), styles.card, item.done && styles.done]}
    >
      <View style={[styles.bar, { backgroundColor: col }]} />
      <View style={styles.tm}>
        <Text style={[styles.tmT, { color: c.text }]}>{time}</Text>
        {hint ? <Text style={[styles.tmS, { color: c.textFaint }]}>{hint}</Text> : null}
      </View>
      <View style={styles.x}>
        <Text style={[styles.title, { color: c.text }, item.done && styles.strike]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.sub ? (
          <Text style={[styles.sub, { color: c.textMuted }]} numberOfLines={2}>
            {item.sub}
          </Text>
        ) : null}
        <View style={[styles.tag, { backgroundColor: `${col}${c.calTagAlpha}` }]}>
          <Text style={[styles.tagT, { color: col }]}>{item.label}</Text>
        </View>
      </View>
      {item.checkable ? (
        <Pressable
          testID={`${testID}-check`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.done, busy }}
          accessibilityLabel={item.done ? t("cal.checked") : t("cal.check")}
          hitSlop={10}
          disabled={busy}
          onPress={onToggle ? () => onToggle(item) : undefined}
          style={[styles.ck, { borderColor: item.done ? col : c.btnOff.bg }, item.done && { backgroundColor: col }]}
        >
          {item.done ? <Icon name="check" size={13} color={c.onSys} /> : null}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "stretch", gap: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  done: { opacity: 0.45 },
  bar: { width: 4, borderRadius: 2 },
  tm: { width: 44, paddingTop: 1 },
  tmT: { fontSize: 12.5, fontWeight: "700" },
  tmS: { fontSize: 11, marginTop: 1, lineHeight: 15 },
  x: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
  strike: { textDecorationLine: "line-through" },
  sub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  tag: { alignSelf: "flex-start", borderRadius: 7, paddingVertical: 2, paddingHorizontal: 7, marginTop: 5 },
  tagT: { fontSize: 10.5, fontWeight: "700" },
  ck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignSelf: "center", alignItems: "center", justifyContent: "center" },
});
