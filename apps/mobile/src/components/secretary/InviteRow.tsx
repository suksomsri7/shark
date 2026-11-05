// คำเชิญ (ใบ S2.21 · แบบ G2 sec-g.jpg หน้า 2)
//   InviteRow         = แถวคำเชิญค้างที่ร้านส่ง (GET staff/invites) — ใช้ PendingRow ของ D1 (S2.10) ด้วย testID ของ G2 · ส่งอีกครั้ง / ยกเลิก
//   ReceivedInvites   = การ์ด "คุณได้รับคำเชิญจาก <ร้าน>" ของผู้ใช้เดิมที่มีคำเชิญค้างถึงเบอร์ตัวเอง (R-S1.25b · pendingInvitesForUser)
//                       GET secretary/invites/pending (S1.14 ยังไม่มี ⇒ 404 = ไม่แสดง) · รับ ⇒ POST secretary/invites/accept {inviteId}
//                       ⇒ refreshMe ⇒ switchTenant(tenantId) ⇒ /secretary · ผู้ใช้ต้องกดรับเอง (ไม่มีการเข้าร่วมอัตโนมัติ)
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { Glass, Icon } from "@/src/components/airy";
import { PendingRow, type StaffRowIds } from "@/src/components/secretary/StaffRow";
import { roleLabel } from "@/src/components/secretary/AddMemberSheet";
import { dateBkk } from "@/src/components/secretary/bkk";
import { normalizeReceived, resetSecretaryMe, secGet, secPost, serverNote, type ReceivedInvite, type StaffInvite } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { radii, size, type as T } from "@/src/theme/tokens";

/** แถวคำเชิญค้าง · `ids` = testID ของจอที่เรียก (G2: inv-pending-row / inv-resend / inv-cancel) */
export function InviteRow({ invite, ids, busy, onResend, onCancel }: { invite: StaffInvite; ids: StaffRowIds; busy: boolean; onResend?: () => void; onCancel?: () => void }) {
  const t = useT();
  const d = dateBkk(invite.expiresAt);
  return <PendingRow invite={invite} ids={ids} busy={busy} dateText={d ? t("sec.staff.date", { d: d.date, m: d.month }) : ""} onResend={onResend} onCancel={onCancel} />;
}

export function ReceivedInvites({ testID }: { testID: string }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { refreshMe, switchTenant } = useAuth();
  const [items, setItems] = useState<ReceivedInvite[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      secGet("secretary/invites/pending")
        .then((v) => live && setItems(normalizeReceived(v)))
        .catch(() => live && setItems([]));
      return () => {
        live = false;
      };
    }, []),
  );

  const accept = async (inv: ReceivedInvite) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      const r = await secPost("secretary/invites/accept", { inviteId: inv.inviteId });
      await refreshMe();
      if (r.tenantId) await switchTenant(r.tenantId);
      resetSecretaryMe();
      setItems((x) => x.filter((i) => i.inviteId !== inv.inviteId));
      router.replace("/secretary");
    } catch (e) {
      setNote(serverNote(e) ?? t("inv.recv.fail"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!items.length) return null;
  return (
    <View testID={testID} style={styles.wrap}>
      {items.map((i) => {
        const d = dateBkk(i.expiresAt);
        return (
          <Glass key={i.inviteId} testID={`${testID}-card`} radius={radii.sugg} pad={{ v: 14, h: 16 }}>
            <View style={styles.row}>
              <View style={[styles.ico, { backgroundColor: c.surface }]}>
                <Icon name="mail" size={18} />
              </View>
              <View style={styles.body}>
                <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
                  {t("inv.recv.title", { shop: i.tenantName })}
                </Text>
                <Text style={[styles.sub, { color: c.textMuted }]} numberOfLines={1}>
                  {[roleLabel(t, i.role), ...(d ? [t("inv.recv.until", { d: d.date, m: d.month })] : [])].join(" · ")}
                </Text>
              </View>
            </View>
            <Pressable testID={`${testID}-accept`} accessibilityRole="button" disabled={busy} onPress={() => void accept(i)} style={[styles.btn, { backgroundColor: c.accent }]}>
              <Text style={[styles.btnT, { color: c.onAccent }]}>{busy ? t("inv.recv.accepting") : t("inv.recv.accept")}</Text>
            </Pressable>
          </Glass>
        );
      })}
      {note ? (
        <Text testID={`${testID}-note`} style={[styles.note, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  ico: { width: 38, height: 38, borderRadius: radii.k + 2, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: T.body - 0.5, fontWeight: "700", lineHeight: 21 },
  sub: { fontSize: T.cap, marginTop: 2 },
  btn: { height: size.iconBtn - 4, borderRadius: (size.iconBtn - 4) / 2, alignItems: "center", justifyContent: "center", marginTop: 12 },
  btnT: { fontSize: T.sub + 0.5, fontWeight: "600" },
  note: { fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, overflow: "hidden" },
});
