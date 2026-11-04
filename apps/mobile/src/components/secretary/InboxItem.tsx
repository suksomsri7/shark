// การ์ดรายการของกล่องรวมรออนุมัติ (ใบ S2.5 · แบบ A6 sec-a.jpg หน้า 6) — กระจก · ป้ายระบบ + ชนิดงาน + เวลา · สรุปของเซิร์ฟเวอร์ · why
// ส่วนบน (หัว + สรุป) แตะได้ = เปิดห้องงานของรายการ (จอสลับกิจการให้ก่อน) · แถวล่าง = ดู / ตีกลับ / อนุมัติ
// canApprove=false ⇒ ปุ่มตีกลับ/อนุมัติปิด (aria-disabled) + บรรทัดเหตุผล · ไม่แต่ง why เอง (มาจากเซิร์ฟเวอร์เท่านั้น)
// testID ทุกตัวมาจากจอ (spec s2.5 ตรวจในไฟล์จอ) · สีจากธีมเท่านั้น
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import { SysBadge } from "@/src/components/airy";
import type { InboxRow } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, size, type as T } from "@/src/theme/tokens";
import { kindLabel } from "./ApprovalCard";
import { sysColor, sysShortKey } from "./sys";

export type InboxItemIds = { item: string; open: string; reject: string; approve: string; why: string; cannot: string; note: string };

/** สรุปของเซิร์ฟเวอร์ "หัว · รายละเอียด" → หัวตัวหนา + บรรทัดรอง (แบบ A6) · ไม่มีตัวคั่น/หัวยาวเกิน = ทั้งก้อนเป็นหัว */
export function splitSummary(s: string): { title: string; desc: string | null } {
  const i = s.indexOf(" · ");
  if (i > 0 && i <= 60) return { title: s.slice(0, i), desc: s.slice(i + 3) };
  return { title: s, desc: null };
}

export function InboxItem({
  row,
  canApprove,
  ids,
  time,
  busy,
  mine,
  note,
  onOpen,
  onReject,
  onApprove,
}: {
  row: InboxRow;
  /** จอตัดสิน (canApprove ของเซิร์ฟเวอร์) — false ⇒ ปุ่มตีกลับ/อนุมัติปิด + บรรทัดเหตุผล */
  canApprove: boolean;
  ids: InboxItemIds;
  time: string;
  /** มีรายการใดกำลังส่งอยู่ (กดซ้ำไม่ได้) */
  busy: boolean;
  /** รายการนี้เองกำลังส่ง */
  mine: boolean;
  /** ผลจากเซิร์ฟเวอร์ (ok:false · สิทธิ์ไม่พอ · หมดอายุ) */
  note: string | null;
  onOpen: () => void;
  onReject: () => void;
  onApprove: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const head = row.type === "plan" ? t("sec.inbox.plan") : kindLabel(t, row.kind, row.module);
  const off = !canApprove || busy;
  const { title, desc } = splitSummary(row.summary);
  const approveLabel = row.cls.customer ? t("sec.inbox.approveSend") : t("sec.inbox.approve");
  return (
    <View style={[glassStyle(c, radii.card), styles.card]}>
      <Pressable testID={ids.item} accessibilityRole="button" onPress={onOpen} style={styles.body}>
        <View style={styles.head}>
          {row.module ? <SysBadge sys={sysColor(row.module)} label={t(sysShortKey(row.module))} /> : null}
          <Text style={[styles.headT, { color: c.textMuted }]} numberOfLines={1}>
            {head}
          </Text>
          <Text style={[styles.time, { color: c.textMuted }]}>{time}</Text>
        </View>
        <Text style={[styles.summary, { color: c.text }]} numberOfLines={desc ? 2 : 3}>
          {title}
        </Text>
        {desc ? (
          <Text style={[styles.desc, { color: c.textDim }]} numberOfLines={3}>
            {desc}
          </Text>
        ) : null}
        {canApprove && row.why ? (
          <Text testID={ids.why} style={[styles.box, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>
            {t("sec.inbox.why", { why: row.why })}
          </Text>
        ) : null}
        {!canApprove ? (
          <Text testID={ids.cannot} style={[styles.box, { color: c.textDim, backgroundColor: c.chip.bg }]}>
            {t("sec.inbox.cannot")}
          </Text>
        ) : null}
        {note ? (
          <Text testID={ids.note} style={[styles.box, { color: c.text, backgroundColor: c.chip.bg }]}>
            {note}
          </Text>
        ) : null}
      </Pressable>
      <View style={styles.acts}>
        <Pressable testID={ids.open} accessibilityRole="button" onPress={onOpen} hitSlop={6} style={styles.link}>
          <Text style={[styles.linkT, { color: c.textDim }]}>{t("sec.inbox.open")}</Text>
        </Pressable>
        <Pressable
          testID={ids.reject}
          accessibilityRole="button"
          accessibilityState={{ disabled: off }}
          disabled={off}
          onPress={onReject}
          hitSlop={6}
          style={styles.link}
        >
          <Text style={[styles.linkT, { color: off ? c.btnOff.fg : c.textDim }]}>{t("sec.inbox.reject")}</Text>
        </Pressable>
        <Pressable
          testID={ids.approve}
          accessibilityRole="button"
          accessibilityState={{ disabled: off, busy: mine }}
          disabled={off}
          onPress={onApprove}
          style={[styles.main, off ? { backgroundColor: c.btnOff.bg } : [{ backgroundColor: c.accent }, shadow(c.accentShadow)]]}
        >
          <Text style={[styles.mainT, { color: off ? c.btnOff.fg : c.onAccent }]} numberOfLines={1}>
            {approveLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14, paddingHorizontal: 16 },
  body: { gap: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  headT: { flex: 1, fontSize: T.cap },
  time: { fontSize: T.cap },
  summary: { fontSize: T.body, fontWeight: "600", lineHeight: 23, marginTop: 8 },
  desc: { fontSize: T.sub, lineHeight: 20, marginTop: 4 },
  box: { fontSize: 13, lineHeight: 19.5, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, overflow: "hidden" },
  acts: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 18, marginTop: 12 },
  link: { paddingVertical: 6 },
  linkT: { fontSize: 15 },
  main: { height: size.iconBtn, borderRadius: size.iconBtn / 2, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", maxWidth: 200 },
  mainT: { fontSize: 15, fontWeight: "700" },
});
