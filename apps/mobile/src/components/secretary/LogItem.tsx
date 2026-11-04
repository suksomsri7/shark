// แถวบันทึกการกระทำของเลขา (แบบ B5 sec-b.jpg หน้า 5) — เวลาไทย · จุดสีระบบ + เส้นเวลา · สรุป · ผู้สั่ง/ผู้อนุมัติ · ปุ่มย้อน
//   ปุ่มย้อนแสดงเมื่อ logCanUndo (ยังไม่เลย undoableUntil) · ย้อนแล้ว = สรุปขีดฆ่า + "ย้อนแล้ว" · สิทธิ์จริงตรวจที่เซิร์ฟเวอร์ตอนกด
//   testID: กรอบ = `testID` (ทุกแถว) · แถว = `<testID>-<id>` · ปุ่มย้อน = `<undoTestID>-<id>`
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { logCanUndo, type LogRow } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { radii, size, type as T } from "@/src/theme/tokens";
import { hhmmBkk } from "./bkk";
import { sysName } from "./RoomCard";
import { sysColor } from "./sys";

export function LogItem({
  row,
  testID,
  undoTestID,
  nowMs,
  nameOf,
  busy = false,
  last = false,
  onUndo,
}: {
  row: LogRow;
  testID: string;
  undoTestID: string;
  nowMs: number;
  nameOf: (userId: string | null | undefined) => string | null;
  busy?: boolean;
  last?: boolean;
  onUndo?: (row: LogRow) => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const undone = !!row.undoneAt;
  const canUndo = !undone && logCanUndo(row, nowMs);
  const by = nameOf(row.userId);
  const ok = nameOf(row.approverId);
  const parts = [sysName(t, row.module)];
  if (by) parts.push(t("sec.log.by", { name: by }));
  if (ok) parts.push(t("sec.log.approvedBy", { name: ok }));
  if (undone) parts.push(t("sec.log.undone"));
  else if (canUndo) parts.push(t("sec.log.undoUntil", { time: hhmmBkk(row.undoableUntil) }));
  return (
    <View testID={testID} style={styles.wrap}>
      <View testID={`${testID}-${row.id}`} style={styles.row}>
        <Text style={[styles.time, { color: c.textMuted }]}>{hhmmBkk(row.createdAt)}</Text>
        <View style={styles.rail}>
          <View style={[styles.dot, { backgroundColor: undone ? c.status.done : c.sys[sysColor(row.module)] }]} />
          {last ? null : <View style={[styles.line, { backgroundColor: c.divider }]} />}
        </View>
        <View style={styles.body}>
          <Text style={[styles.sum, { color: undone ? c.textMuted : c.text }, undone && styles.strike]} numberOfLines={2}>
            {row.summary}
          </Text>
          <Text style={[styles.sub, { color: c.textMuted }]} numberOfLines={2}>
            {parts.join(" · ")}
          </Text>
          {canUndo && onUndo ? (
            <Pressable
              testID={`${undoTestID}-${row.id}`}
              disabled={busy}
              onPress={() => onUndo(row)}
              accessibilityRole="button"
              hitSlop={4}
              style={[styles.undo, { backgroundColor: c.chip.bg }, busy && styles.dim]}
            >
              <Text style={[styles.undoT, { color: c.text }]}>{t("sec.log.undo")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  row: { flexDirection: "row", gap: 10 },
  time: { width: 40, fontSize: 12.5, paddingTop: 1 },
  rail: { width: size.dot, alignItems: "center" },
  dot: { width: size.dot, height: size.dot, borderRadius: size.dot / 2, marginTop: 4 },
  line: { width: 1.5, flex: 1, marginTop: 4, minHeight: 28 },
  body: { flex: 1, paddingBottom: 16 },
  sum: { fontSize: 14.5, fontWeight: "600", lineHeight: 20 },
  strike: { textDecorationLine: "line-through" },
  sub: { fontSize: T.cap - 0.5, lineHeight: 17, marginTop: 3 },
  undo: { alignSelf: "flex-start", marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.pill },
  undoT: { fontSize: 12.5, fontWeight: "600" },
  dim: { opacity: 0.5 },
});
