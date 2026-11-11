// การ์ดห้องงานของรายการ A1 (sec-a.jpg หน้า 1) — กระจก · จุดสถานะ + ชื่องาน (≤ 2 บรรทัด) · เวลา + badge รออนุมัติทางขวา
// บรรทัดรอง = สถานะ (+ "สั่งโดย <ชื่อ>" เมื่อไม่ใช่เรา · testID sec-home-by) · แถวล่าง = ป้ายระบบ ≤ 3 + "ร่วมกับ …"
// testID: กรอบ = `testID` (ทุกการ์ด) · ปุ่ม = `<testID>-<roomId>` · เวลาเป็นเวลาไทย (Asia/Bangkok · UTC+7 ไม่มี DST)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Dot, SysTag, type DotStatus } from "@/src/components/airy";
import type { RoomCard as Room, RoomStatus } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";
import { sysColor, sysLabelKey } from "./sys";

const DOT: Record<RoomStatus, DotStatus> = { OPEN: "done", RUNNING: "run", WAITING: "wait", DONE: "done" };
const BKK_MS = 7 * 3600_000;
type TFn = ReturnType<typeof useT>;

/** วันไทยของเวลา ms (ตัวเลขวัน ต่อเนื่อง) + ชั่วโมง/นาที/วัน/เดือน — ใช้ getUTC* หลังเลื่อน +7 ชม. (ไม่พึ่งเขตเวลาของเครื่อง) */
function bkk(ms: number) {
  const d = new Date(ms + BKK_MS);
  return { day: Math.floor((ms + BKK_MS) / 86_400_000), h: d.getUTCHours(), m: d.getUTCMinutes(), date: d.getUTCDate(), month: d.getUTCMonth() + 1 };
}

/** เวลาของการ์ด: กำลังทำ = "ตอนนี้" · < 1 ชม. = นาที · วันนี้ = HH:MM · เมื่อวาน · ก่อนนั้น = วัน/เดือน */
export function roomTime(t: TFn, status: RoomStatus, iso: string, nowMs: number): string {
  if (status === "RUNNING") return t("sec.home.time.now");
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const diffMin = Math.floor((nowMs - ms) / 60_000);
  if (diffMin < 1) return t("sec.home.time.now");
  const a = bkk(ms);
  const b = bkk(nowMs);
  if (diffMin < 60 && a.day === b.day) return t("sec.home.time.min", { n: diffMin });
  if (a.day === b.day) return `${a.h}:${String(a.m).padStart(2, "0")}`;
  if (a.day === b.day - 1) return t("sec.home.time.yesterday");
  return t("sec.home.time.date", { d: a.date, m: a.month });
}

/** เสร็จวันนี้ (วันไทยเดียวกับ now) */
export function isTodayBkk(iso: string, nowMs: number): boolean {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && bkk(ms).day === bkk(nowMs).day;
}

export function sysName(t: TFn, module: string): string {
  const k = sysLabelKey(module);
  return k ? t(k) : module;
}

export function RoomCard({ room, testID, nowMs, onPress }: { room: Room; testID: string; nowMs: number; onPress: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const line =
    room.status === "WAITING" && room.pending > 0 ? t("sec.home.line.waitingN", { n: room.pending }) : t(`sec.home.line.${room.status}` as I18nKey);
  const by = room.startedByMe ? null : room.starterName ? t("sec.home.by", { name: room.starterName }) : t("sec.home.byUnknown");
  const named = room.others.filter((o) => o.name);
  const withText =
    room.others.length === 0 ? null : room.others.length === 1 && named.length === 1 ? t("sec.home.withOne", { name: named[0]!.name! }) : t("sec.home.withMany", { n: room.others.length });
  const time = roomTime(t, room.status, room.updatedAt, nowMs);
  const systems = room.systems.slice(0, 3);

  return (
    <View testID={testID} style={styles.wrap}>
      <Pressable
        testID={`${testID}-${room.id}`}
        accessibilityRole="button"
        accessibilityLabel={[room.title, line, room.pending > 0 ? t("sec.home.pending", { n: room.pending }) : ""].filter(Boolean).join(" · ")}
        onPress={onPress}
        style={[glassStyle(c, radii.sugg), styles.card]}
      >
        <View style={styles.top}>
          <View style={styles.dot}>
            <Dot status={DOT[room.status]} />
          </View>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
            {room.title}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.time, { color: c.textMuted }]}>{time}</Text>
          {room.pending > 0 ? (
            <View style={[styles.badge, { backgroundColor: c.status.wait }]}>
              <Text style={[styles.badgeT, { color: c.onAccent }]}>{room.pending > 99 ? "99+" : room.pending}</Text>
            </View>
          ) : room.unread ? (
            <View accessibilityLabel={t("sec.home.unread")} style={[styles.unread, { backgroundColor: c.status.run }]} />
          ) : null}
        </View>
        <Text style={[styles.line, { color: c.textDim }]} numberOfLines={1}>
          {line}
          {/* R-S2.14k: "สั่งโดย <ชื่อ>" ของห้องที่คนอื่นเริ่ม (ขอบเขต "ทุกคนในกิจการ" ของ OWNER / ห้องที่แชร์มา) */}
          {by ? <Text testID="sec-home-by">{` · ${by}`}</Text> : null}
        </Text>
        {systems.length > 0 || withText ? (
          <View style={styles.tags}>
            {systems.map((s) => (
              <SysTag key={s} sys={sysColor(s)} label={sysName(t, s)} />
            ))}
            {withText ? (
              <Text style={[styles.with, { color: c.textDim }]} numberOfLines={1}>
                {withText}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: F.v(13) },
  card: { paddingTop: F.v(18), paddingBottom: F.v(18), paddingHorizontal: F.v(20) },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingRight: 52 },
  dot: { height: 21, justifyContent: "center", paddingHorizontal: 2 },
  title: { flex: 1, minWidth: 0, fontSize: T.body - 1, fontWeight: "700", lineHeight: 21 },
  // เวลา + badge ลอยมุมขวาบน (ไม่ดันบรรทัดรองลง · แบบ A1)
  right: { position: "absolute", top: F.v(18), right: F.v(20), alignItems: "flex-end", gap: spacing.xs },
  time: { fontSize: T.cap, lineHeight: 17 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 10.5, fontWeight: "700", lineHeight: 13 },
  unread: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  line: { fontSize: T.cap, lineHeight: 18, marginTop: F.v(6), paddingRight: 30 },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: F.v(12) },
  with: { fontSize: T.cap, marginLeft: spacing.xs, flexShrink: 1 },
});
