// การ์ด "ทำแล้ว" ของห้องงาน (ใบ S2.4 · แบบ A5 sec-a.jpg หน้า 5 · .lnk .acts) — จาก GET log?roomId
//   แถวละการกระทำ: กล่องสีระบบ + สรุป + "เปิดดู ›" (ลิงก์ของจริงในแอป 1.0/WebView ตาม entity) · ย้อนแล้ว = ป้าย "ย้อนแล้ว"
//   แถวปุ่ม: ย้อนกลับ (เฉพาะเมื่อมีแถวที่ย้อนได้ · undoableUntil > ตอนนี้ · R-S1.8a 24 ชม.) — ย้อน "ทีละแถว จากล่าสุดก่อน" (LIFO) แสดงเวลาที่เหลือของแถวนั้น ·
//            สอน (เติมช่องพิมพ์ "ครั้งหน้า…") · ทำซ้ำ (ไป /secretary/new พร้อมคำสั่งเดิม)
//   ผลย้อน = note ไทยของเซิร์ฟเวอร์ (ok:false เช่น ถูกย้ายไปแล้ว/เลยเวลา/สิทธิ์ไม่พอ) แสดงใต้การ์ด · สิทธิ์จริงตรวจที่เซิร์ฟเวอร์ตอนกด
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon, SysBadge } from "@/src/components/airy";
import { ApiError } from "@/src/api/client";
import type { LogItem } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, type as T } from "@/src/theme/tokens";
import { sysColor, sysShortKey } from "./sys";

export type DoneIds = { card: string; link: string; undo: string; teach: string; repeat: string };

/** แถวที่จะย้อนเมื่อกด "ย้อนกลับ" = แถวล่าสุดที่ยังย้อนได้ */
export function undoTarget(logs: LogItem[]): LogItem | null {
  for (let i = logs.length - 1; i >= 0; i--) if (logs[i]!.canUndo) return logs[i]!;
  return null;
}

export function DoneCard({
  logs,
  nowMs,
  name,
  ids,
  canOpen,
  onOpen,
  onUndo,
  onTeach,
  onRepeat,
}: {
  logs: LogItem[];
  nowMs: number;
  name: string;
  ids: DoneIds;
  canOpen: (l: LogItem) => boolean;
  onOpen: (l: LogItem) => void;
  onUndo: (l: LogItem) => Promise<{ ok: boolean; note?: string }>;
  onTeach: () => void;
  onRepeat: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const target = undoTarget(logs);
  const leftMs = target?.undoableUntil ? Date.parse(target.undoableUntil) - nowMs : 0;
  const left = leftMs >= 3_600_000 ? t("sec.room.done.leftH", { n: Math.floor(leftMs / 3_600_000) }) : t("sec.room.done.leftM", { n: Math.max(1, Math.ceil(leftMs / 60_000)) });

  const undo = async () => {
    if (!target || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await onUndo(target);
      setNote(r.note || (r.ok ? t("sec.room.done.undoOk") : t("sec.room.ap.err")));
    } catch (e) {
      setNote(e instanceof ApiError && e.detail ? e.detail : t("sec.room.ap.err"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID={ids.card}>
      <Text style={[styles.sec, { color: c.textFaint }]}>{t("sec.room.done.title")}</Text>
      {logs.map((l) => {
        const open = !l.undoneAt && canOpen(l);
        const body = (
          <>
            <SysBadge sys={sysColor(l.module)} label={t(sysShortKey(l.module))} solid />
            <Text style={[styles.lt, { color: c.text }, !!l.undoneAt && styles.struck]} numberOfLines={2}>
              {l.summary}
            </Text>
            {l.undoneAt ? (
              <Text style={[styles.side, { color: c.textMuted }]}>{t("sec.room.done.undone")}</Text>
            ) : open ? (
              <View style={styles.sideRow}>
                <Text style={[styles.side, { color: c.textMuted }]}>{t("sec.room.done.open")}</Text>
                <Icon name="chevron-right" size={14} color={c.textMuted} />
              </View>
            ) : null}
          </>
        );
        return open ? (
          <Pressable testID={ids.link} key={l.id} accessibilityRole="link" onPress={() => onOpen(l)} style={[glassStyle(c, 16), styles.lnk]}>
            {body}
          </Pressable>
        ) : (
          <View key={l.id} style={[glassStyle(c, 16), styles.lnk]}>
            {body}
          </View>
        );
      })}
      <View style={styles.acts}>
        {target ? (
          <Pressable
            testID={ids.undo}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => void undo()}
            style={[glassStyle(c, size.iconBtn / 2), styles.btn, busy && styles.dim]}
          >
            <Text style={[styles.btnT, { color: c.text }]} numberOfLines={1}>
              {t("sec.room.done.undo")}
            </Text>
            <Text style={[styles.btnS, { color: c.textMuted }]} numberOfLines={1}>
              {left}
            </Text>
          </Pressable>
        ) : null}
        <Pressable testID={ids.teach} accessibilityRole="button" onPress={onTeach} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
          <Text style={[styles.btnT, { color: c.text }]} numberOfLines={1}>
            {t("sec.room.done.teach", { name })}
          </Text>
        </Pressable>
        <Pressable testID={ids.repeat} accessibilityRole="button" onPress={onRepeat} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
          <Text style={[styles.btnT, { color: c.text }]} numberOfLines={1}>
            {t("sec.room.done.repeat")}
          </Text>
        </Pressable>
      </View>
      {note ? (
        <Text testID={`${ids.undo}-note`} style={[styles.note, { color: c.text, backgroundColor: c.chip.bg }]}>
          {note}
        </Text>
      ) : null}
      <Text style={[styles.foot, { color: c.textDim }]}>{t("sec.room.done.count", { n: logs.length })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sec: { fontSize: 12, fontWeight: "600", letterSpacing: 1, marginTop: 14, marginLeft: 8 },
  lnk: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12, marginTop: 6 },
  lt: { flex: 1, minWidth: 0, fontSize: T.sub, lineHeight: 20 },
  struck: { textDecorationLine: "line-through" },
  sideRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  side: { fontSize: 13 },
  acts: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  dim: { opacity: 0.6 },
  btnT: { fontSize: T.sub, fontWeight: "600" },
  btnS: { fontSize: 10.5, marginTop: 1 },
  note: { fontSize: 13, lineHeight: 19.5, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, overflow: "hidden" },
  foot: { fontSize: 13, lineHeight: 20, marginTop: 12 },
});
