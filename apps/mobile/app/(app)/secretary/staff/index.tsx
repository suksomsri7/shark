// ทีม = รายชื่อแชท (B27 · มติเจ้าของ 15 พ.ย. 2026 · แบบ /root/mockups/team-invite/team2.png จอ 1 + team4.png จอ 1) — โซนทีม (ไอคอนคนบนแถบ)
//   แทนรายชื่อพนักงานเดิม (S2.10 D1): ทุกคนในร้านเห็นทีม (สมาชิก "คุยอย่างเดียว" ด้วย) · แตะคน = แชท 1:1 · แตะกลุ่ม = แชทกลุ่ม
//   ข้อมูล: GET secretary/team (threads + people + pending) · poll 15 วิ ขณะจออยู่ · badge ทีมรวมข้อความยังไม่อ่าน (secretary/badges team.messages)
//   ลำดับ: แชทที่มีข้อความ (ใหม่→เก่า) → คนที่ยังไม่เคยคุย → รอยอมรับคำเชิญ (จาง · OWNER/MANAGER แตะ = ยกเลิกคำเชิญ)
//   ช่องค้นหา "ค้นหาคนในทีม" + ปุ่มกลมดำ + ท้ายแถว (ทุกคนในทีม)
//     17 พ.ย. (team4.png จอ 2 อนุมัติแล้ว): + = เมนูเล็ก 2 ทาง "เพิ่มคนเข้าทีม" (/secretary/team/add) / "สร้างกลุ่ม" (/secretary/team/new-group)
//     สิทธิ์ตามเซิร์ฟเวอร์: เพิ่มคน = OWNER/MANAGER (canManage) · สร้างกลุ่ม = สมาชิกทุกคน ⇒ ทำได้ทางเดียว (ไม่ใช่ผู้จัดการ) = + ไปจอสร้างกลุ่มตรง
//   คำเชิญถึงตัวเรา (ผู้ใช้เดิม) = การ์ด ReceivedInvites บนสุด (รับแล้วเข้าร้านนั้น)
//   ปุ่ม Lekaa มุมขวาล่าง = โฮสต์กลางของเลน b27-fab — จอนี้เว้นท้ายรายการไว้ (TEAM_LIST_FAB_CLEARANCE · TODO(b27-fab))
//   ปุ่ม + ของแถบบน (SecTopBar) ปิดในโซนนี้ — + อยู่ท้ายช่องค้นหาตามแบบ
// ข้อความผ่าน i18n (team.*) · สีจากธีม (c.team) · สเกล R-UI1
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Icon, LoadError, Loading, Sheet } from "@/src/components/airy";
import { SecTopBar } from "@/src/components/secretary/SecTopBar";
import { ReceivedInvites } from "@/src/components/secretary/InviteRow";
import { TeamRow } from "@/src/components/team/TeamRow";
import { TEAM_LIST_FAB_CLEARANCE } from "@/src/components/team/layout";
import { scheduleZoneBadges, secDeleteId, serverNote } from "@/src/api/secretary";
import { getTeam, listTimeOf, openDirect, previewOf, type TeamList, type TeamPending, type TeamPerson, type TeamThread } from "@/src/api/team";
import { useAuth } from "@/src/lib/auth-context";
import { useLang, useT } from "@/src/i18n";
import { F, glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

const POLL_MS = 15_000;
const SEARCH_H = 52;
const DAY = 86_400_000;
const MENU_W = 272;

type Row =
  | { kind: "thread"; key: string; th: TeamThread }
  | { kind: "person"; key: string; p: TeamPerson }
  | { kind: "pending"; key: string; inv: TeamPending };

export default function TeamListScreen() {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTenantId } = useAuth();

  const [data, setData] = useState<TeamList | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<TeamPending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const tenantRef = useRef(activeTenantId);
  const [now, setNow] = useState(() => Date.now());
  const [plusMenu, setPlusMenu] = useState(false);
  const [menuTop, setMenuTop] = useState(0);
  const searchBottom = useRef(0);
  const scrollY = useRef(0);

  useEffect(() => {
    tenantRef.current = activeTenantId;
    setData(null);
    setFailed(false);
  }, [activeTenantId]);

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    if (!tenant) return;
    try {
      const r = await getTeam();
      if (tenantRef.current !== tenant) return;
      setData(r);
      setFailed(false);
      setNow(Date.now());
    } catch {
      if (tenantRef.current === tenant) setFailed(true); // คงรายการเดิม · ยังไม่เคยได้ = LoadError
    }
  }, [activeTenantId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      scheduleZoneBadges();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void load();
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const manage = data?.me.canManage === true;
  const q = query.trim().toLowerCase();
  const hit = (name: string) => !q || name.toLowerCase().includes(q);
  const rows: Row[] = [];
  if (data) {
    for (const th of data.threads) if (hit(th.name)) rows.push({ kind: "thread", key: `t-${th.id}`, th });
    const talked = new Set(data.threads.filter((x) => x.kind === "DIRECT" && x.peer).map((x) => x.peer!.userId));
    for (const p of data.people) if (!p.me && !talked.has(p.userId) && hit(p.name)) rows.push({ kind: "person", key: `p-${p.userId}`, p });
    for (const inv of data.pending) if (hit(inv.name)) rows.push({ kind: "pending", key: `i-${inv.inviteId}`, inv });
  }

  const openPerson = async (p: TeamPerson) => {
    if (busyRef.current) return;
    if (p.directThreadId) {
      router.push(`/secretary/team/${p.directThreadId}`);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      const r = await openDirect(p.userId);
      router.push(`/secretary/team/${r.threadId}`);
    } catch (e) {
      setNote(serverNote(e) ?? t("team.openErr"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const cancel = async () => {
    const i = cancelling;
    setCancelling(null);
    if (!i || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await secDeleteId("secretary/staff/invites/[id]", i.inviteId);
      setNote(t("sec.staff.cancelled"));
      void load();
    } catch (e) {
      setNote(serverNote(e) ?? t("sec.staff.actionErr"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // + : ผู้จัดการ = เมนู 2 ทาง · คนอื่น = สร้างกลุ่มตรง (เพิ่มคนเข้าทีมไม่ได้ · เซิร์ฟเวอร์ 403)
  const onPlus = () => {
    if (!manage) {
      router.push("/secretary/team/new-group");
      return;
    }
    setMenuTop(Math.max(0, searchBottom.current - scrollY.current + 8));
    setPlusMenu(true);
  };
  const go = (to: "/secretary/team/add" | "/secretary/team/new-group") => {
    setPlusMenu(false);
    router.push(to);
  };
  const onSearchLayout = (e: LayoutChangeEvent) => {
    searchBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
  };

  const tag = (th: TeamThread) => (th.kind === "GROUP" ? "GROUP" : (th.peer?.tag ?? null));

  return (
    <AiryScreen testID="team">
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: TEAM_LIST_FAB_CLEARANCE + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={64}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.textMuted} />}
      >
        <SecTopBar zone="team" center="none" showPlus={false} />

        <View style={styles.searchRow} onLayout={onSearchLayout}>
          <View style={[glassStyle(c, SEARCH_H / 2), styles.search]}>
            <TextInput
              testID="team-search"
              value={query}
              onChangeText={setQuery}
              placeholder={t("team.search")}
              placeholderTextColor={c.placeholder}
              returnKeyType="search"
              style={[styles.searchField, { color: c.text }]}
            />
          </View>
          {data ? (
            <Pressable testID="team-plus" accessibilityRole="button" accessibilityLabel={manage ? t("team.plus") : t("team.menu.group")} onPress={onPlus} style={[styles.plus, { backgroundColor: c.accent }]}>
              <Icon name="plus" size={22} color={c.onAccent} />
            </Pressable>
          ) : null}
        </View>

        <ReceivedInvites testID="team-received" />

        {note ? (
          <Text testID="team-note" style={[styles.note, { color: c.text, backgroundColor: c.chip.bg }]}>
            {note}
          </Text>
        ) : null}

        {data === null ? (
          failed ? (
            <LoadError testID="team-error" onRetry={() => void load()} />
          ) : (
            <Loading testID="team-loading" />
          )
        ) : (
          <>
            {rows.map((r) =>
              r.kind === "thread" ? (
                <TeamRow
                  key={r.key}
                  testID="team-row"
                  name={r.th.name || t("sec.room.someone")}
                  seed={r.th.peer?.userId ?? r.th.id}
                  group={r.th.kind === "GROUP"}
                  photo={r.th.kind === "GROUP" && r.th.photoFileId ? { threadId: r.th.id, fileId: r.th.photoFileId } : null}
                  tag={tag(r.th)}
                  tagLabel={r.th.kind === "GROUP" ? t("team.group", { n: r.th.memberCount }) : undefined}
                  preview={previewOf(r.th.last, r.th.kind, t)}
                  time={r.th.last ? listTimeOf(r.th.last.at, now, lang) : ""}
                  unread={r.th.muted ? 0 : r.th.unread}
                  muted={r.th.muted}
                  onPress={() => router.push(`/secretary/team/${r.th.id}`)}
                />
              ) : r.kind === "person" ? (
                <TeamRow
                  key={r.key}
                  testID="team-person"
                  name={r.p.name || t("sec.room.someone")}
                  seed={r.p.userId}
                  tag={r.p.tag}
                  preview={t("team.startChat")}
                  time=""
                  onPress={busy ? undefined : () => void openPerson(r.p)}
                />
              ) : (
                <TeamRow
                  key={r.key}
                  testID="team-pending"
                  name={r.inv.name}
                  seed={r.inv.inviteId}
                  tag={null}
                  pending
                  preview={t("team.pending")}
                  time={t("team.days", { n: Math.max(0, Math.floor((now - (Date.parse(r.inv.at) || now)) / DAY)) })}
                  onPress={manage ? () => setCancelling(r.inv) : undefined}
                />
              ),
            )}
            {rows.length === 0 ? (
              <Text testID="team-empty" style={[styles.none, { color: c.textMuted }]}>
                {q ? t("team.noMatch") : manage ? t("team.empty") : t("team.emptyRead")}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      {plusMenu ? (
        <View testID="team-plus-menu" style={StyleSheet.absoluteFill}>
          <Pressable testID="team-plus-menu-dim" accessibilityRole="button" accessibilityLabel={t("team.menu.close")} onPress={() => setPlusMenu(false)} style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} />
          <View style={[styles.menu, { top: menuTop, backgroundColor: c.surface }, shadow(c.tabShadow)]}>
            <Pressable testID="team-menu-add" accessibilityRole="button" onPress={() => go("/secretary/team/add")} style={styles.mi}>
              <Icon name="user-plus" size={20} color={c.zone.team} />
              <View style={styles.miX}>
                <Text style={[styles.miT, { color: c.text }]}>{t("team.menu.add")}</Text>
                <Text style={[styles.miS, { color: c.textMuted }]}>{t("team.menu.addSub")}</Text>
              </View>
            </Pressable>
            <View style={[styles.miLine, { backgroundColor: c.divider }]} />
            <Pressable testID="team-menu-group" accessibilityRole="button" onPress={() => go("/secretary/team/new-group")} style={styles.mi}>
              <Icon name="users" size={20} color={c.zone.team} />
              <View style={styles.miX}>
                <Text style={[styles.miT, { color: c.text }]}>{t("team.menu.group")}</Text>
                <Text style={[styles.miS, { color: c.textMuted }]}>{t("team.menu.groupSub")}</Text>
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Sheet visible={!!cancelling} onClose={() => setCancelling(null)} testID="team-cancel-sheet" top={520}>
        <Text style={[styles.sh, { color: c.text }]}>{t("sec.staff.cancelTitle", { name: cancelling?.name || t("sec.staff.invitee") })}</Text>
        <View style={styles.acts}>
          <Pressable testID="team-cancel-no" accessibilityRole="button" onPress={() => setCancelling(null)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("sec.staff.keep")}</Text>
          </Pressable>
          <Pressable testID="team-cancel-ok" accessibilityRole="button" disabled={busy} onPress={() => void cancel()} style={[styles.btn, styles.main, { backgroundColor: c.accent }]}>
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.staff.cancelOk")}</Text>
          </Pressable>
        </View>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: F.v(22), marginBottom: 4 },
  search: { flex: 1, height: SEARCH_H, flexDirection: "row", alignItems: "center", paddingHorizontal: 18 },
  searchField: { flex: 1, minWidth: 0, fontSize: T.sub + 0.5, paddingVertical: 0, outlineWidth: 0 },
  plus: { width: SEARCH_H, height: SEARCH_H, borderRadius: SEARCH_H / 2, alignItems: "center", justifyContent: "center" },
  note: { fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, overflow: "hidden", textAlign: "center" },
  none: { fontSize: T.sub, textAlign: "center", marginTop: F.v(40) },
  sh: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26 },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
  // เมนูเล็กของ + (team4.png จอ 2): การ์ดขาวมน 18 กว้าง 272 ชิดขวาใต้ช่องค้นหา
  menu: { position: "absolute", right: spacing.page, width: MENU_W, borderRadius: 18, padding: 6 },
  mi: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12 },
  miX: { flex: 1, minWidth: 0 },
  miT: { fontSize: T.sub + 1, fontWeight: "700", lineHeight: 21 },
  miS: { fontSize: T.cap, lineHeight: 17, marginTop: 1 },
  miLine: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
});
