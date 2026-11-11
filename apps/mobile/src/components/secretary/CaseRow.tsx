// แถวเรื่องที่แจ้งไว้ (ใบ S2.15 · แบบ H1 sec-h.jpg หน้า 1) — จุดสถานะ · หัวเรื่อง · เวลา · บรรทัดสถานะ · ตัวนับยังไม่อ่าน · เลขเรื่อง SHARK-xxxxx
//   จุด: ส้ม = รอทีม (OPEN) · เขียว = ทีมตอบแล้วรอคุณ (PENDING หรือมีข้อความทีมยังไม่อ่าน) · เทา = ปิด (RESOLVED) — helpDot ใน src/api/secretary.ts
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Dot } from "@/src/components/airy";
import { roomTime } from "@/src/components/secretary/RoomCard";
import { dateBkk } from "@/src/components/secretary/bkk";
import { caseNoText, helpDot, type HelpCaseRow } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";

/** บรรทัดสถานะของเรื่อง (ใช้ร่วม H1 แถว · H2 หัวห้อง) */
export function caseStatusLine(t: (k: I18nKey, v?: Record<string, string | number>) => string, status: HelpCaseRow["status"], unread: number, updatedAt: string): string {
  if (status === "RESOLVED") {
    const d = dateBkk(updatedAt);
    return d ? t("help.status.closedOn", { d: d.date, m: t(`sec.month.${d.month}` as I18nKey) }) : t("help.status.closed");
  }
  if (status === "PENDING") return t("help.status.pending");
  if (unread > 0) return t("help.status.replied");
  return t("help.status.open");
}

export function CaseRow({ item, nowMs, testID, onPress }: { item: HelpCaseRow; nowMs: number; testID: string; onPress: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const line = caseStatusLine(t, item.status, item.unread, item.updatedAt);
  const time = roomTime(t, "OPEN", item.updatedAt, nowMs);
  const dot = helpDot(item.status, item.unread);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[item.subject, line, item.unread > 0 ? t("help.unread", { n: item.unread }) : ""].filter(Boolean).join(" · ")}
      onPress={onPress}
      style={[glassStyle(c, radii.sugg), styles.card]}
    >
      <View style={styles.top}>
        <Dot status={dot} testID={`help-dot-${dot}`} />
        <Text style={[styles.subject, { color: c.text }]} numberOfLines={1}>
          {item.subject}
        </Text>
        <Text style={[styles.time, { color: c.textMuted }]}>{time}</Text>
      </View>
      <View style={styles.mid}>
        <Text style={[styles.line, { color: c.textDim }]} numberOfLines={1}>
          {line}
        </Text>
        {item.unread > 0 ? (
          <View testID={`${testID}-unread`} style={[styles.badge, { backgroundColor: c.status.wait }]}>
            <Text style={[styles.badgeT, { color: c.zone.onZone }]}>{item.unread > 99 ? "99+" : String(item.unread)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.no, { color: c.textDim, backgroundColor: c.chip.bg }]}>{caseNoText(item.caseNo)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14, paddingHorizontal: 14 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  subject: { flex: 1, minWidth: 0, fontSize: T.body - 0.5, fontWeight: "700", lineHeight: 22 },
  time: { fontSize: T.cap - 0.5 },
  mid: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  line: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
  no: { alignSelf: "flex-start", marginTop: 8, fontSize: T.cap, fontWeight: "600", paddingVertical: 3, paddingHorizontal: 9, borderRadius: radii.k - 2, overflow: "hidden" },
});
