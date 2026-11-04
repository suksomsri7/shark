// ทุกคนในกิจการ (ใบ S2.10 · แบบ D1 sec-d.jpg หน้า 1 + sec-dark-d.jpg หน้า 1) — โซนทีม
//   ข้อมูล: GET secretary/staff (listStaffAccess includeInvites + staffViewOf · แถว pending = คำเชิญค้าง) ·
//           GET secretary/rooms (สถานะงานต่อคน: กำลังทำ/รออนุมัติ/ห้องร่วมกับคุณ · OWNER = scope tenant) · GET inbox/staff (onDuty = เข้าเวรอยู่ · พลาด = ไม่แสดง)
//   ป้ายแชทลูกค้า = ระดับ NONE/VIEW/REPLY (ไม่เห็น/ดูได้/ตอบได้) · หน่วย = unitAccess (ว่าง = ทุกหน่วย)
//   OWNER/MANAGER: แตะแถว → /secretary/staff/[membershipId] (S2.22) · ปุ่ม "เพิ่มพนักงาน" → /secretary/staff/invite (S2.21) · คำเชิญค้าง: ส่งอีกครั้ง / ยกเลิก (ยืนยัน)
//   STAFF: อ่านอย่างเดียว ไม่มีปุ่ม (เซิร์ฟเวอร์ตอบ 403 ⇒ จอ "เฉพาะเจ้าของ/ผู้จัดการ")
// ข้อความผ่าน i18n (sec.staff.*) · สีจากธีม · สเกล R-UI1
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, PrimaryButton, Sheet } from "@/src/components/airy";
import { SecTopBar, TenantTitle } from "@/src/components/secretary/SecTopBar";
import { PendingRow, StaffRow, type StaffRowIds, type StaffWork } from "@/src/components/secretary/StaffRow";
import { dateBkk } from "@/src/components/secretary/bkk";
import {
  isDenied,
  normalizeRoom,
  normalizeStaff,
  secDeleteId,
  secGet,
  secPostId,
  serverNote,
  useActiveRole,
  type RoomRaw,
  type ChatLevel,
  type StaffInvite,
  type StaffPerson,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

/** testID ของแถว (spec s2.10) — ป้ายแชท = "sec-staff-chat-badge" · ระดับที่แสดง NONE|VIEW|REPLY */
const ROW_IDS: StaffRowIds = { row: "sec-staff-row", chat: "sec-staff-chat-badge", pending: "sec-staff-pending", resend: "sec-staff-pending-resend", cancel: "sec-staff-pending-cancel" };
const SEARCH_H = 48;
const NO_WORK: StaffWork = { running: 0, waiting: 0, shared: 0, onDuty: false };
/** ป้ายแชทลูกค้าตามระดับ (staffViewOf.chat · R-S1.25h): NONE ไม่เห็น · VIEW ดูได้ · REPLY ตอบได้ */
const CHAT_LABEL: Record<ChatLevel, I18nKey> = { NONE: "sec.staff.chat.NONE", VIEW: "sec.staff.chat.VIEW", REPLY: "sec.staff.chat.REPLY" };

export default function SecretaryStaffScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTenantId, user } = useAuth();
  const myId = user?.id ?? null;
  const role = useActiveRole();
  const manage = role === "OWNER" || role === "MANAGER";

  const [people, setPeople] = useState<StaffPerson[] | null>(null);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [rooms, setRooms] = useState<RoomRaw[]>([]);
  const [onDuty, setOnDuty] = useState<Set<string>>(new Set());
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [cancelling, setCancelling] = useState<StaffInvite | null>(null);
  const tenantRef = useRef(activeTenantId);

  useEffect(() => {
    tenantRef.current = activeTenantId;
    setPeople(null);
    setInvites([]);
    setRooms([]);
    setDenied(false);
  }, [activeTenantId]);

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    if (!tenant) return;
    const [s, r, d] = await Promise.allSettled([
      secGet("secretary/staff"),
      secGet("secretary/rooms", { scope: role === "OWNER" ? "tenant" : "mine", take: 100 }),
      secGet("inbox/staff"),
    ]);
    if (tenantRef.current !== tenant) return;
    if (s.status === "rejected") {
      if (isDenied(s.reason)) {
        setDenied(true);
        setPeople([]);
      } else setPeople((p) => p ?? []);
    } else {
      const v = normalizeStaff(s.value);
      setDenied(false);
      setPeople(v.people);
      setInvites(v.invites);
    }
    if (r.status === "fulfilled") setRooms(r.value.items ?? []);
    if (d.status === "fulfilled") setOnDuty(new Set((d.value.items ?? []).filter((x) => x.onDuty === true).map((x) => x.userId)));
  }, [activeTenantId, role]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // สถานะงานต่อคน: ห้องที่คนนั้นเปิดหรือเป็นสมาชิก (สถานะ RoomStatus จริงของ S1.14)
  const work = useMemo(() => {
    const out = new Map<string, StaffWork>();
    const cards = rooms.map((x) => ({ card: normalizeRoom(x, myId), ids: new Set([x.startedById ?? x.startedBy?.id ?? "", ...(x.memberIds ?? [])].filter(Boolean)) }));
    for (const p of people ?? []) {
      const mine = cards.filter((r) => r.ids.has(p.userId));
      out.set(p.userId, {
        running: mine.filter((r) => r.card.status === "RUNNING").length,
        waiting: mine.filter((r) => r.card.status === "WAITING").length,
        shared: p.me || !myId ? 0 : mine.filter((r) => r.card.status !== "DONE" && r.ids.has(myId)).length,
        onDuty: onDuty.has(p.userId),
      });
    }
    return out;
  }, [rooms, people, onDuty, myId]);

  const q = query.trim().toLowerCase();
  // ตัวเราไว้ท้าย (แบบ D1 = รายชื่อทีม) · ที่เหลือตามลำดับของเซิร์ฟเวอร์
  const shownPeople = (people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q)).sort((a, b) => Number(a.me) - Number(b.me));
  const shownInvites = invites.filter((i) => !q || i.name.toLowerCase().includes(q));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setNote(ok);
      void load();
    } catch (e) {
      setNote(serverNote(e) ?? t("sec.staff.actionErr"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const resend = (i: StaffInvite) => void run(() => secPostId("secretary/staff/invites/[id]/resend", i.inviteId, {}), t("sec.staff.resent"));
  const cancel = async () => {
    const i = cancelling;
    setCancelling(null);
    if (i) await run(() => secDeleteId("secretary/staff/invites/[id]", i.inviteId), t("sec.staff.cancelled"));
  };
  const dateText = (iso: string) => {
    const d = dateBkk(iso);
    return d ? t("sec.staff.date", { d: d.date, m: d.month }) : "";
  };

  const count = (people ?? []).length;
  return (
    <AiryScreen testID="sec-staff">
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: (manage ? 120 : 40) + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.textMuted} />}
      >
        <SecTopBar zone="team" center="none" showPlus={manage} />
        <View style={styles.tenant}>
          <TenantTitle big />
        </View>
        {people !== null && !denied ? (
          <Text style={[styles.sub, { color: c.textMuted }]}>{manage ? t("sec.staff.sub", { n: count }) : t("sec.staff.subRead", { n: count })}</Text>
        ) : null}

        {denied ? (
          <Glass testID="sec-staff-denied" style={styles.denied}>
            <Icon name="lock" size={22} color={c.textMuted} />
            <Text style={[styles.deniedT, { color: c.text }]}>{t("sec.staff.denied")}</Text>
          </Glass>
        ) : (
          <>
            <View style={[glassStyle(c, SEARCH_H / 2), styles.search]}>
              <Icon name="search" size={17} color={c.iconDim} />
              <TextInput
                testID="sec-staff-search"
                value={query}
                onChangeText={setQuery}
                placeholder={t("sec.staff.search")}
                placeholderTextColor={c.placeholder}
                returnKeyType="search"
                style={[styles.searchField, { color: c.text }]}
              />
            </View>
            {note ? (
              <Text testID="sec-staff-note" style={[styles.note, { color: c.text, backgroundColor: c.chip.bg }]}>
                {note}
              </Text>
            ) : null}
            {shownPeople.map((p) => (
              <StaffRow
                key={p.userId}
                person={p}
                work={work.get(p.userId) ?? NO_WORK}
                ids={ROW_IDS}
                chatText={t(CHAT_LABEL[p.chat])}
                onPress={manage && p.membershipId ? () => router.push(`/secretary/staff/${p.membershipId}`) : undefined}
              />
            ))}
            {shownInvites.length > 0 ? <Text style={[styles.sec, { color: c.textFaint }]}>{t("sec.staff.pendingTitle", { n: shownInvites.length })}</Text> : null}
            {shownInvites.map((i) => (
              <PendingRow
                key={i.inviteId}
                invite={i}
                ids={ROW_IDS}
                busy={busy}
                dateText={dateText(i.expiresAt)}
                onResend={manage ? () => resend(i) : undefined}
                onCancel={manage && !i.expired ? () => setCancelling(i) : undefined}
              />
            ))}
            {people !== null && shownPeople.length === 0 && shownInvites.length === 0 ? (
              <Text testID="sec-staff-empty" style={[styles.none, { color: c.textMuted }]}>
                {q ? t("sec.staff.noMatch") : t("sec.staff.empty")}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      {manage && !denied ? (
        <View style={[styles.cta, { bottom: 26 + insets.bottom }]}>
          <PrimaryButton testID="sec-staff-invite" label={t("sec.staff.invite")} onPress={() => router.push("/secretary/staff/invite")} />
        </View>
      ) : null}

      <Sheet visible={!!cancelling} onClose={() => setCancelling(null)} testID="sec-staff-cancel-sheet" top={520}>
        <Text style={[styles.sh, { color: c.text }]}>{t("sec.staff.cancelTitle", { name: cancelling?.name || t("sec.staff.invitee") })}</Text>
        <Text style={[styles.sb, { color: c.textMuted }]}>{t("sec.staff.cancelBody")}</Text>
        <View style={styles.acts}>
          <Pressable testID="sec-staff-cancel-sheet-no" accessibilityRole="button" onPress={() => setCancelling(null)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("sec.staff.keep")}</Text>
          </Pressable>
          <Pressable testID="sec-staff-cancel-sheet-ok" accessibilityRole="button" disabled={busy} onPress={() => void cancel()} style={[styles.btn, styles.main, { backgroundColor: c.accent }]}>
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.staff.cancelOk")}</Text>
          </Pressable>
        </View>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14 },
  tenant: { marginTop: 14 },
  sub: { fontSize: F.sub, marginTop: 4, lineHeight: 20 },
  search: { height: SEARCH_H, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 16, marginTop: F.v(30), marginBottom: 2 },
  searchField: { flex: 1, minWidth: 0, fontSize: T.sub, paddingVertical: 0, outlineWidth: 0 },
  note: { fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, overflow: "hidden", textAlign: "center" },
  sec: { fontSize: 12, fontWeight: "600", letterSpacing: 1, marginTop: spacing.lg, marginLeft: 6 },
  none: { fontSize: T.sub, textAlign: "center", marginTop: F.v(40) },
  denied: { marginTop: F.v(40), alignItems: "center", gap: spacing.sm },
  deniedT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, textAlign: "center" },
  cta: { position: "absolute", left: spacing.page, right: spacing.page },
  sh: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26 },
  sb: { fontSize: T.sub, lineHeight: 21, marginTop: 6 },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
});
