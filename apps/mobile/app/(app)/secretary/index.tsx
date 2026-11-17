// เลขา AI · หน้าแรก (ใบ S2.2 · แบบ A1 sec-a.jpg หน้า 1 / C3 sec-c.jpg หน้า 4)
//   ข้อมูล: GET secretary/rooms (scope mine · take 50) ผ่าน src/api/secretary.ts · โหลดใหม่ทุกครั้งที่จอได้ focus (กลับจากห้อง = สด)
//           + polling ทุก 15 วิ เฉพาะตอนจออยู่ (useFocusEffect + setInterval · ล้างตอน blur) + ดึงลง (RefreshControl)
//   มีห้อง ⇒ A1: ค้นหา (กรองชื่อในแอป) · ชิปกรอง 4 ตัว · การ์ดห้อง (RoomCard) → /secretary/room/[id]
//   ไม่มีห้อง ⇒ C3: orb + ข้อเสนองานแรกจาก secretary/suggestions (ไม่มี/พลาด = ข้อเสนอตั้งต้นใน i18n) → /secretary/new พร้อมเติมคำสั่ง
//   403 ⇒ "บัญชีนี้ยังใช้เลขาไม่ได้" (R-S2.1d · ไม่ใช่ C3)
//   S2.14: ก่อนผลแรก = Loading (ไม่ใช่ C3) · ล้ม (500/เน็ต) ครั้งแรก = LoadError + ลองใหม่ (ไม่ตก C3)
//   15 พ.ย. (เจ้าของสั่ง "Lekaa = งานของใครของมัน"): ถอดปุ่มคู่ "ของฉัน / ทุกคนในกิจการ" (R-S2.14k เดิม) — ทุกบทบาทเห็นเฉพาะงานของตัวเอง ∪ ห้องที่ถูกชวน (รุ่นเดิม)
//     ไม่มีปุ่ม + บนแถบบนแล้ว (สั่งงานใหม่ = ปุ่มลอย Lekaa ทุกจอ)
// 14 พ.ย. (เจ้าของสั่ง): ไม่มีชื่อกิจการใหญ่/บรรทัดสถานะ (ไอคอนกิจการอยู่ซ้ายของแถบบนแล้ว) · ไม่มีช่องสั่งงานล่าง (หน้ารวมห้อง · สั่งใหม่ = ปุ่ม + บนแถบ)
// CAL2.5 (แบบ cal-1.png จอ 2): การ์ด "วันนี้" ของปฏิทิน (TodayCard · GET calendar/today) ใต้ช่องค้นหา · หน้าว่าง (C3) = บนสุด · ไม่มีเรื่อง = ไม่แสดง
// ข้อความทั้งหมดผ่าน i18n · สเกล R-UI1: ระยะแนวตั้ง = แบบ × 0.73 (F.v) · ตัวอักษรตาม tokens.type
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, LoadError, Loading, Orb, SectionLabel, SysBadge } from "@/src/components/airy";
import { SecTopBar } from "@/src/components/secretary/SecTopBar";
import { RoomCard, isTodayBkk, sysName } from "@/src/components/secretary/RoomCard";
import { TodayCard } from "@/src/components/calendar/TodayCard";
import { RoomFilters, type RoomFilterKey, type RoomFilterOption } from "@/src/components/secretary/RoomFilters";
import { sysColor } from "@/src/components/secretary/sys";
import {
  isDenied,
  normalizeRoom,
  normalizeSuggestions,
  refreshZoneBadges,
  secGet,
  type RoomCard as Room,
  type RoomStatus,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { cardGap, radii, size, spacing, type as T } from "@/src/theme/tokens";

const POLL_MS = 15_000;
const SEARCH_H = size.iconBtn;
/** ระยะท้ายรายการ (ไม่มีช่องสั่งงานล่างแล้ว) */
const LIST_BOTTOM = cardGap * 2;

/** ข้อเสนอตั้งต้นของ C3 เมื่อ secretary/suggestions ไม่มี/พลาด (ข้อความใน i18n) */
const FALLBACK: { id: "s1" | "s2" | "s3"; system: string }[] = [
  { id: "s1", system: "pos" },
  { id: "s2", system: "crm" },
  { id: "s3", system: "booking" },
];

const FILTER_OF: Record<RoomStatus, RoomFilterKey> = { OPEN: "working", RUNNING: "working", WAITING: "approval", DONE: "done" };

type C3Item = { testID: string; system: string; badge: string; title: string; sub: string; instruction: string };

export default function SecretaryHome() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeTenantId, user } = useAuth();
  const userId = user?.id ?? null;

  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sugg, setSugg] = useState<C3Item[] | null>(null);
  const [filter, setFilter] = useState<RoomFilterKey>("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const tenantRef = useRef(activeTenantId);

  // กิจการเปลี่ยน ⇒ ล้างของเดิม (ไม่โชว์ห้องของร้านก่อนหน้าแม้ชั่วขณะ)
  useEffect(() => {
    tenantRef.current = activeTenantId;
    setRooms(null);
    setDenied(false);
    setFailed(false);
    setSugg(null);
  }, [activeTenantId]);

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    if (!tenant) return;
    void refreshZoneBadges();
    try {
      const r = await secGet("secretary/rooms", { take: 50 });
      if (tenantRef.current !== tenant) return;
      setDenied(false);
      setFailed(false);
      setRooms((r.items ?? []).map((x) => normalizeRoom(x, userId)));
    } catch (e) {
      if (tenantRef.current !== tenant) return;
      if (isDenied(e)) {
        setDenied(true);
        setRooms([]);
      } else setFailed(true); // ออฟไลน์/เส้นยังไม่ขึ้น: คงรายการเดิม (ยังไม่เคยได้ = LoadError)
    }
    setNowMs(Date.now());
  }, [activeTenantId, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const id = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(id);
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const retry = useCallback(() => {
    setFailed(false);
    void load();
  }, [load]);

  const hasRooms = !!rooms && !denied && rooms.length > 0;
  const empty = !!rooms && rooms.length === 0 && !denied && !hasRooms;

  // C3: ข้อเสนองานแรก (โหลดครั้งเดียวต่อกิจการเมื่อว่าง)
  useEffect(() => {
    if (!empty || sugg !== null) return;
    const tenant = activeTenantId;
    const fallback: C3Item[] = FALLBACK.map((f) => ({
      testID: `sec-suggest-${f.id}`,
      system: f.system,
      badge: t(`sec.c3.${f.id}.badge` as I18nKey),
      title: t(`sec.c3.${f.id}.title` as I18nKey),
      sub: t(`sec.c3.${f.id}.sub` as I18nKey),
      instruction: t(`sec.c3.${f.id}.title` as I18nKey),
    }));
    secGet("secretary/suggestions")
      .then((r) => normalizeSuggestions(r))
      .catch(() => [])
      .then((list) => {
        if (tenantRef.current !== tenant) return;
        setSugg(
          list.length === 0
            ? fallback
            : list.slice(0, 3).map((s, i) => ({ testID: `sec-suggest-s${i + 1}`, system: s.system, badge: sysName(t, s.system), title: s.title, sub: s.instruction, instruction: s.instruction })),
        );
      });
  }, [empty, sugg, activeTenantId, t]);

  const counts = useMemo(() => {
    const list = rooms ?? [];
    return {
      working: list.filter((r) => FILTER_OF[r.status] === "working").length,
      approval: list.filter((r) => r.status === "WAITING").length,
      doneToday: list.filter((r) => r.status === "DONE" && isTodayBkk(r.updatedAt, nowMs)).length,
    };
  }, [rooms, nowMs]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rooms ?? []).filter((r) => (filter === "all" || FILTER_OF[r.status] === filter) && (!q || r.title.toLowerCase().includes(q)));
  }, [rooms, filter, query]);

  const filters: RoomFilterOption[] = [
    { key: "all", testID: "sec-home-filter-all", label: t("sec.home.filter.all") },
    { key: "working", testID: "sec-home-filter-working", label: t("sec.home.filter.working"), count: counts.working, tone: "run" },
    { key: "approval", testID: "sec-home-filter-approval", label: t("sec.home.filter.approval"), count: counts.approval, tone: "wait" },
    { key: "done", testID: "sec-home-filter-done", label: t("sec.home.filter.done") },
  ];

  const startWith = (instruction: string) => router.push({ pathname: "/secretary/new", params: { q: instruction } });


  return (
    <AiryScreen testID="sec-secretary">
      <ScrollView
        testID="sec-home"
        contentContainerStyle={[styles.page, { paddingBottom: LIST_BOTTOM + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.textMuted} />}
      >
        <SecTopBar zone="secretary" center="none" showPlus={false} />

        {denied ? (
          <Glass testID="sec-home-denied" style={styles.denied}>
            <Icon name="lock" size={22} color={c.textMuted} />
            <Text style={[styles.deniedT, { color: c.text }]}>{t("sec.home.denied.title")}</Text>
            <Text style={[styles.deniedB, { color: c.textMuted }]}>{t("sec.home.denied.body")}</Text>
            <Pressable testID="sec-home-denied-back" accessibilityRole="button" onPress={() => router.navigate("/")} style={[styles.deniedBtn, { backgroundColor: c.accent }]}>
              <Text style={[styles.deniedBtnT, { color: c.onAccent }]}>{t("sec.home.denied.back")}</Text>
            </Pressable>
          </Glass>
        ) : hasRooms ? (
          <>
            <View style={[glassStyle(c, SEARCH_H / 2), styles.search]}>
              <Icon name="search" size={17} color={c.iconDim} />
              <TextInput
                testID="sec-home-search"
                value={query}
                onChangeText={setQuery}
                placeholder={t("sec.home.search")}
                placeholderTextColor={c.placeholder}
                returnKeyType="search"
                style={[styles.searchField, { color: c.text }]}
              />
            </View>
            <TodayCard />
            <RoomFilters options={filters} value={filter} onChange={setFilter} />
            {visible.map((r) => (
              <RoomCard key={r.id} testID="sec-home-card" room={r} nowMs={nowMs} onPress={() => router.push(`/secretary/room/${r.id}`)} />
            ))}
            {visible.length === 0 ? (
              <Text testID="sec-home-nomatch" style={[styles.none, { color: c.textMuted }]}>
                {query.trim() ? t("sec.home.noMatch") : t("sec.home.filterEmpty")}
              </Text>
            ) : null}
          </>
        ) : empty ? (
          <View testID="sec-home-empty">
            <TodayCard />
            <View style={styles.hero}>
              <Orb size={size.orbHero} testID="sec-orb" />
              <Text style={[styles.h2, { color: c.text }]}>{t("sec.c3.heroTitle")}</Text>
              <Text style={[styles.p, { color: c.textMuted }]}>{t("sec.c3.heroBody")}</Text>
            </View>
            <SectionLabel style={styles.sec}>{t("sec.c3.suggestLabel")}</SectionLabel>
            {(sugg ?? []).map((s) => (
              <Pressable testID={s.testID} key={s.testID} accessibilityRole="button" onPress={() => startWith(s.instruction)} style={[glassStyle(c, radii.sugg), styles.sugg]}>
                <SysBadge sys={sysColor(s.system)} label={s.badge} />
                <View style={styles.sx}>
                  <Text style={[styles.st, { color: c.text }]} numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text style={[styles.ss, { color: c.textMuted }]} numberOfLines={1}>
                    {s.sub}
                  </Text>
                </View>
                <Icon name="chevron-right" size={16} />
              </Pressable>
            ))}
          </View>
        ) : failed ? (
          <LoadError testID="sec-home-error" onRetry={retry} />
        ) : (
          <Loading testID="sec-home-loading" />
        )}
      </ScrollView>

    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingTop: 14 },
  search: { height: SEARCH_H, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 16, marginTop: F.v(22) },
  searchField: { flex: 1, minWidth: 0, fontSize: T.sub, paddingVertical: 0, outlineWidth: 0 },
  none: { fontSize: T.sub, textAlign: "center", marginTop: F.v(40) },
  denied: { marginTop: F.v(40), alignItems: "center", gap: spacing.sm },
  deniedT: { fontSize: T.h, fontWeight: "700", lineHeight: 24, textAlign: "center" },
  deniedB: { fontSize: T.sub, lineHeight: 20, textAlign: "center" },
  deniedBtn: { marginTop: spacing.sm, height: size.iconBtn, borderRadius: size.iconBtn / 2, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center" },
  deniedBtnT: { fontSize: T.sub, fontWeight: "600" },
  hero: { alignItems: "center", marginTop: 39 },
  h2: { fontSize: F.h2, fontWeight: "700", letterSpacing: -0.5, marginTop: 14, lineHeight: 30 },
  p: { fontSize: F.p, lineHeight: 21, marginTop: 6, textAlign: "center" },
  sec: { marginTop: 22, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
  sugg: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, marginTop: 8 },
  sx: { flex: 1, minWidth: 0 },
  st: { fontSize: F.row, lineHeight: 20 },
  ss: { fontSize: F.rowSub, lineHeight: 17 },
});
