// แถวพนักงาน / แถวคำเชิญค้าง ของหน้า "ทุกคนในกิจการ" (ใบ S2.10 · แบบ D1 sec-d.jpg หน้า 1)
//   คน: อวตาร · ชื่อ + บทบาท · บรรทัดรอง = ป้ายแชทลูกค้า (ไม่เห็น/ดูได้/ตอบได้ = NONE/VIEW/REPLY ของ staffViewOf) · หน่วย · สถานะงาน (จากห้อง) · เข้าเวร
//        ขวา = จำนวนห้องรออนุมัติของคนนั้น (จุดส้ม) · แตะ = หน้าสิทธิ์ต่อคน (S2.22) เมื่อ `onPress` ส่งมา (OWNER/MANAGER)
//   คำเชิญ: ชื่อ + บทบาท · "รอรับคำเชิญ · เบอร์ปิดเลข · หมดอายุ" · ปุ่ม ส่งอีกครั้ง / ยกเลิก (ส่งมาเมื่อจัดการได้)
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/ui/text";
import type { StaffInvite, StaffPerson } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { glassStyle, useTheme } from "@/src/theme/index";
import { radii, type as T } from "@/src/theme/tokens";
import { roleLabel } from "./AddMemberSheet";
import { Avatar } from "./MemberBubble";

export type StaffWork = { running: number; waiting: number; shared: number; onDuty: boolean };
export type StaffRowIds = { row: string; chat: string; pending: string; resend: string; cancel: string };

export function StaffRow({ person, work, ids, chatText, onPress }: { person: StaffPerson; work: StaffWork; ids: StaffRowIds; chatText: string; onPress?: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const rest = [
    person.units.length ? t("sec.staff.units", { n: person.units.length }) : t("sec.staff.unitsAll"),
    ...(work.running ? [t("sec.staff.running", { n: work.running })] : []),
    ...(work.waiting ? [t("sec.staff.waiting", { n: work.waiting })] : []),
    ...(work.shared ? [t("sec.staff.shared", { n: work.shared })] : []),
    ...(work.onDuty ? [t("sec.staff.onDuty")] : []),
    ...(!person.active ? [t("sec.staff.suspended")] : []),
  ];
  const body = (
    <>
      <Avatar name={person.name} seed={person.userId} />
      <View style={styles.x}>
        <Text style={[styles.nm, { color: c.text }]} numberOfLines={1}>
          {person.name || t("sec.room.someone")}
          <Text style={[styles.role, { color: c.textMuted }]}>{`  ${person.me ? t("sec.staff.me", { role: roleLabel(t, person.role) }) : roleLabel(t, person.role)}`}</Text>
        </Text>
        <Text style={[styles.line, { color: c.textDim }]} numberOfLines={2}>
          <Text testID={ids.chat} style={person.chat === "NONE" ? [styles.none, { color: c.bad.fg }] : undefined}>
            {chatText}
          </Text>
          {` · ${rest.join(" · ")}`}
        </Text>
      </View>
      {work.waiting > 0 ? (
        <View style={[styles.badge, { backgroundColor: c.status.wait }]}>
          <Text style={[styles.badgeT, { color: c.onSys }]}>{work.waiting > 99 ? "99+" : work.waiting}</Text>
        </View>
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable testID={ids.row} accessibilityRole="button" onPress={onPress} style={[glassStyle(c, radii.sugg), styles.row, !person.active && styles.dim]}>
      {body}
    </Pressable>
  ) : (
    <View testID={ids.row} style={[glassStyle(c, radii.sugg), styles.row, !person.active && styles.dim]}>
      {body}
    </View>
  );
}

export function PendingRow({
  invite,
  ids,
  busy,
  dateText,
  onResend,
  onCancel,
}: {
  invite: StaffInvite;
  ids: StaffRowIds;
  busy: boolean;
  dateText: string;
  onResend?: () => void;
  onCancel?: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const sub = [invite.expired ? t("sec.staff.inviteExpired") : t("sec.staff.invitePending"), ...(invite.phoneMasked ? [invite.phoneMasked] : []), ...(dateText && !invite.expired ? [t("sec.staff.inviteUntil", { date: dateText })] : [])];
  return (
    <View testID={ids.pending} style={[glassStyle(c, radii.sugg), styles.prow]}>
      <View style={styles.ptop}>
        <View style={styles.dimAv}>
          <Avatar name={invite.name} seed={invite.inviteId} />
        </View>
        <View style={styles.x}>
          <Text style={[styles.nm, { color: c.text }]} numberOfLines={1}>
            {invite.name || t("sec.staff.invitee")}
            <Text style={[styles.role, { color: c.textMuted }]}>{`  ${roleLabel(t, invite.role)}`}</Text>
          </Text>
          <Text style={[styles.line, { color: invite.expired ? c.bad.fg : c.warn.fg }]} numberOfLines={1}>
            {sub.join(" · ")}
          </Text>
        </View>
      </View>
      {onResend || onCancel ? (
        <View style={styles.pacts}>
          {onCancel ? (
            <Pressable testID={ids.cancel} accessibilityRole="button" disabled={busy} onPress={onCancel} style={[glassStyle(c, 17), styles.pbtn]}>
              <Text style={[styles.pbtnT, { color: c.textDim }]}>{t("sec.staff.cancel")}</Text>
            </Pressable>
          ) : null}
          {onResend ? (
            <Pressable testID={ids.resend} accessibilityRole="button" disabled={busy} onPress={onResend} style={[styles.pbtn, { backgroundColor: c.accent }]}>
              <Text style={[styles.pbtnT, { color: c.onAccent }]}>{t("sec.staff.resend")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14, marginTop: 10, minHeight: 68 },
  prow: { paddingVertical: 14, paddingHorizontal: 14, marginTop: 10 },
  ptop: { flexDirection: "row", alignItems: "center", gap: 12 },
  x: { flex: 1, minWidth: 0 },
  nm: { fontSize: T.body - 1, fontWeight: "700", lineHeight: 22 },
  role: { fontSize: T.cap, fontWeight: "400" },
  line: { fontSize: T.cap, lineHeight: 18, marginTop: 3 },
  none: { fontWeight: "600" },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  badgeT: { fontSize: 11, fontWeight: "700", lineHeight: 14 },
  dim: { opacity: 0.6 },
  dimAv: { opacity: 0.55 },
  pacts: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  pbtn: { height: 34, borderRadius: 17, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  pbtnT: { fontSize: T.cap + 0.5, fontWeight: "600" },
});
