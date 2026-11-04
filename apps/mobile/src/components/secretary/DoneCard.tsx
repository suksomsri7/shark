// การ์ด "ทำแล้ว" ของห้องงาน (ใบ S2.4 · แบบ A5 sec-a.jpg หน้า 5 · .lnk .acts) — จาก GET log?roomId
//   แถวละการกระทำ: กล่องสีระบบ + สรุป + "เปิดดู ›" (ลิงก์ของจริงในแอป 1.0/WebView ตาม entity) · ย้อนแล้ว = ป้าย "ย้อนแล้ว"
//   ย้อน (S2.10 · R-S2.4a): ปุ่ม "ย้อน" อยู่ต่อแถวที่เซิร์ฟเวอร์บอก `canUndo` (สิทธิ์ + เวลา ฝั่งเซิร์ฟเวอร์ · ไม่คำนวณจากนาฬิกาเครื่อง) ·
//            กดแล้วจอเปิดชีตยืนยันที่บอกชื่อรายการ (onAskUndo) — การยิง POST log/[id]/undo + note ผลอยู่ที่จอ · เวลาที่เหลือ = แสดงอย่างเดียว
//   แถวปุ่ม: สอน (เติมช่องพิมพ์ "ครั้งหน้า…") · ทำซ้ำ (ไป /secretary/new พร้อมคำสั่งเดิม)
//   ผลย้อน = note ไทยของเซิร์ฟเวอร์ (ok:false เช่น ถูกย้ายไปแล้ว/เลยเวลา/สิทธิ์ไม่พอ) แสดงใต้การ์ด
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { Icon, SysBadge } from "@/src/components/airy";
import type { LogItem } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, type as T } from "@/src/theme/tokens";
import { sysColor, sysShortKey } from "./sys";

export type DoneIds = { card: string; link: string; undo: string; teach: string; repeat: string };

/** เวลาที่เหลือของแถว (แสดงอย่างเดียว · สิทธิ์ย้อนจริง = canUndo ของเซิร์ฟเวอร์) */
export function leftText(t: ReturnType<typeof useT>, l: LogItem, nowMs: number): string | null {
  const ms = l.undoableUntil ? Date.parse(l.undoableUntil) - nowMs : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms >= 3_600_000 ? t("sec.room.done.leftH", { n: Math.floor(ms / 3_600_000) }) : t("sec.room.done.leftM", { n: Math.max(1, Math.ceil(ms / 60_000)) });
}

export function DoneCard({
  logs,
  nowMs,
  name,
  ids,
  canOpen,
  onOpen,
  onAskUndo,
  undoBusyId,
  undoNote,
  onTeach,
  onRepeat,
}: {
  logs: LogItem[];
  nowMs: number;
  name: string;
  ids: DoneIds;
  canOpen: (l: LogItem) => boolean;
  onOpen: (l: LogItem) => void;
  /** เปิดชีตยืนยันย้อนของแถวนี้ (จอเป็นผู้ยิง) */
  onAskUndo: (l: LogItem) => void;
  undoBusyId: string | null;
  undoNote: string | null;
  onTeach: () => void;
  onRepeat: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const note = undoNote;

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
        const undoable = l.canUndo && !l.undoneAt;
        const busy = undoBusyId === l.id;
        const left = undoable ? leftText(t, l, nowMs) : null;
        return (
          <View key={l.id} style={[glassStyle(c, 16), styles.lrow]}>
            {open ? (
              <Pressable testID={ids.link} accessibilityRole="link" onPress={() => onOpen(l)} style={styles.lnk}>
                {body}
              </Pressable>
            ) : (
              <View style={styles.lnk}>{body}</View>
            )}
            {undoable ? (
              <Pressable
                testID={ids.undo}
                accessibilityRole="button"
                accessibilityLabel={t("sec.room.done.undoRow", { what: l.summary })}
                accessibilityState={{ disabled: undoBusyId !== null, busy }}
                disabled={undoBusyId !== null}
                onPress={() => onAskUndo(l)}
                style={[styles.undo, { borderLeftColor: c.divider }, undoBusyId !== null && !busy && styles.dim]}
              >
                <Text style={[styles.undoT, { color: c.text }]} numberOfLines={1}>
                  {t("sec.room.done.undo")}
                </Text>
                {left ? (
                  <Text style={[styles.btnS, { color: c.textMuted }]} numberOfLines={1}>
                    {left}
                  </Text>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        );
      })}
      <View style={styles.acts}>
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
  lrow: { flexDirection: "row", alignItems: "stretch", marginTop: 6 },
  lnk: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
  undo: { alignItems: "center", justifyContent: "center", paddingHorizontal: 12, borderLeftWidth: StyleSheet.hairlineWidth, minWidth: 64 },
  undoT: { fontSize: 13, fontWeight: "600" },
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
