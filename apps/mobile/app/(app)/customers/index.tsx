// รายการลูกค้า (ใบ S2.17 · แบบ K1 sec-k.jpg หน้า 1 · sec-dark-k.jpg หน้า 1)
//   ข้อมูล (S1.21 · ชื่อเส้นในตาราง src/api/inbox.ts): GET inbox/systems (ระบบแชท · ช่องทาง · unread · canReply) ·
//     GET inbox/conversations?systemId&status&channel&assignee&q&before → { items, nextBefore } (cursor คู่ `<iso>|<id>`) ·
//     GET inbox/routing (กฎที่จะใช้กับแถวที่ยังไม่มีคนรับ · พลาด = ไม่แสดงบรรทัดกฎ)
//   แท็บ: ทั้งหมด · ยังไม่ตอบ (OPEN ไม่มีคนรับ หรือ staffUnreadCount > 0 — กรองในแอป) · ของฉัน (assignee=me) · ปิดแล้ว (status RESOLVED)
//   แถว: อวตารตัวอักษร · ป้ายช่องทาง · ชื่อ · แท็ก ("รอคน" เมื่อเซิร์ฟเวอร์ส่ง tags) · ตัวอย่างข้อความ · เวลา · ยังไม่อ่าน · ผู้ดูแล ·
//     "Shark ร่างคำตอบไว้แล้ว" (aiDraft) · ไม่มีคนรับ = "ยังไม่มีคนรับ · รอ N นาที" (waitingMin) + กฎที่จะใช้
//   ดึงลง + poll 15 วิ (จออยู่ + แอปอยู่หน้า) · หน้าต่อไปด้วย nextBefore · โหลดมากกว่า 1 หน้าแล้ว poll รวมด้วย id (ไม่ทิ้งหน้าที่เลื่อนมา · R-S2.17b) · 403 ⇒ จอ "ไม่มีสิทธิ์" + ซ่อนไอคอนโซนลูกค้า (setCustomersAccess)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Chip, Glass, Icon, Loading, Note, Tabs, type TabItem } from "@/src/components/airy";
import { SecTopBar } from "@/src/components/secretary/SecTopBar";
import { Avatar, ChannelBadge, firstName, useChannelLabel, useListTime } from "@/src/components/customers/parts";
import { setCustomersAccess } from "@/src/api/secretary";
import {
  WAITING_HUMAN_TAG,
  getCurrentSystem,
  inboxGet,
  isUnanswered,
  setCurrentSystem,
  setInboxCanReply,
  statusOf,
  type ConvItem,
  type InboxSystem,
  type Routing,
} from "@/src/api/inbox";
import { useAuth } from "@/src/lib/auth-context";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

const POLL_MS = 15_000;
type TabKey = "all" | "unanswered" | "mine" | "closed";
const TABS: { key: TabKey; label: I18nKey; testID: string }[] = [
  { key: "all", label: "cust.tab.all", testID: "cust-tab-all" },
  { key: "unanswered", label: "cust.tab.unanswered", testID: "cust-tab-unanswered" },
  { key: "mine", label: "cust.tab.mine", testID: "cust-tab-mine" },
  { key: "closed", label: "cust.tab.closed", testID: "cust-tab-closed" },
];
const MODE_SHORT: Record<string, I18nKey> = { ROUND_ROBIN: "cust.rule.short.ROUND_ROBIN", LAST_ASSIGNEE: "cust.rule.short.LAST_ASSIGNEE", OWNER: "cust.rule.short.OWNER" };

/** ตัวกรองของแท็บ → query ของ GET inbox/conversations (assignee = "me" | "none" | userId) */
function queryOf(tab: TabKey): { status?: string; assignee?: string } {
  if (tab === "mine") return { assignee: "me" };
  if (tab === "closed") return { status: "RESOLVED" };
  return {};
}

export default function CustomersScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const chLabel = useChannelLabel();
  const listTime = useListTime();
  const { activeTenantId, user } = useAuth();
  const myId = user?.id ?? null;

  const [systems, setSystems] = useState<InboxSystem[]>([]);
  const [systemId, setSystemId] = useState<string | null>(getCurrentSystem());
  const [canReply, setCanReply] = useState(true);
  const [denied, setDenied] = useState(false);
  const [tab, setTab] = useState<TabKey>("all");
  const [channel, setChannel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [items, setItems] = useState<ConvItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ unanswered: number; mine: number; byChannel: [string, number][] } | null>(null);
  const [routing, setRouting] = useState<Routing | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(() => AppState.currentState !== "background");
  const seq = useRef(0);
  /** จำนวนหน้าที่โหลดของตัวกรองปัจจุบัน + คีย์ตัวกรอง (เปลี่ยนตัวกรอง = เริ่มหน้าแรกใหม่) */
  const pages = useRef(1);
  const filterKey = useRef("");

  // ค้นหา: รอพิมพ์เสร็จ 400 ms
  useEffect(() => {
    const h = setTimeout(() => setQ(qLive.trim()), 400);
    return () => clearTimeout(h);
  }, [qLive]);

  // กิจการเปลี่ยน ⇒ ล้างของเดิมทันที
  useEffect(() => {
    setSystems([]);
    setSystemId(null);
    setCurrentSystem(null);
    pages.current = 1;
    filterKey.current = "";
    setItems([]);
    setNext(null);
    setCounts(null);
    setRouting(null);
    setDenied(false);
    setLoading(true);
  }, [activeTenantId]);

  const load = useCallback(async () => {
    if (!activeTenantId) return;
    const my = ++seq.current;
    try {
      const sys = await inboxGet("inbox/systems");
      if (my !== seq.current) return;
      const list = sys.items ?? [];
      setSystems(list);
      setCanReply(sys.canReply !== false);
      setInboxCanReply(sys.canReply !== false);
      setDenied(false);
      setCustomersAccess(true);
      const sid = systemId && list.some((s) => s.id === systemId) ? systemId : (list[0]?.id ?? null);
      if (sid !== systemId) setSystemId(sid);
      setCurrentSystem(sid);
      if (!sid) {
        setItems([]);
        setNext(null);
        return;
      }
      const [page, rt] = await Promise.all([
        inboxGet("inbox/conversations", { systemId: sid, ...queryOf(tab), channel: channel ?? undefined, q: q || undefined }),
        inboxGet("inbox/routing", { systemId: sid }).catch(() => null),
      ]);
      if (my !== seq.current) return;
      const rows = page.items ?? [];
      const key = JSON.stringify([sid, tab, channel, q]);
      if (key === filterKey.current && pages.current > 1) {
        // poll ขณะเลื่อนดูหลายหน้า: หน้าแรกสด + แถวที่โหลดไว้ (รวมด้วย id) · nextBefore ของหน้าท้ายเดิมคงไว้
        const fresh = new Set(rows.map((x) => x.id));
        setItems((cur) => [...rows, ...cur.filter((x) => !fresh.has(x.id))]);
      } else {
        filterKey.current = key;
        pages.current = 1;
        setItems(rows);
        setNext(page.nextBefore ?? null);
      }
      setRouting(rt);
      if (tab === "all" && !channel && !q) {
        const by = new Map<string, number>();
        for (const r of rows) by.set(r.channel, (by.get(r.channel) ?? 0) + 1);
        setCounts({ unanswered: rows.filter(isUnanswered).length, mine: rows.filter((r) => r.assigneeUserId === myId).length, byChannel: [...by] });
      }
      setOffline(false);
      setNowMs(Date.now());
    } catch (e) {
      if (my !== seq.current) return;
      if (statusOf(e) === 403) {
        setDenied(true);
        setCustomersAccess(false);
        setInboxCanReply(false);
      } else setOffline(true);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [activeTenantId, systemId, tab, channel, q, myId]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    void load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void loadRef.current();
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!focused || !active || denied) return;
    const h = setInterval(() => void loadRef.current(), POLL_MS);
    return () => clearInterval(h);
  }, [focused, active, denied]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (!next || more || !systemId) return;
    setMore(true);
    const my = seq.current;
    try {
      const page = await inboxGet("inbox/conversations", { systemId, ...queryOf(tab), channel: channel ?? undefined, q: q || undefined, before: next });
      if (my !== seq.current) return;
      setItems((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...(page.items ?? []).filter((x) => !seen.has(x.id))];
      });
      setNext(page.nextBefore ?? null);
      pages.current += 1;
    } catch {
      setOffline(true);
    } finally {
      setMore(false);
    }
  };

  const shown = useMemo(() => (tab === "unanswered" ? items.filter(isUnanswered) : items), [items, tab]);
  const sys = systems.find((s) => s.id === systemId) ?? null;
  const ruleFor = useCallback(
    (ch: string): string | null => {
      if (!routing) return null;
      const r = [...routing.rules].filter((x) => x.enabled && (!x.channel || x.channel === ch)).sort((a, b) => a.order - b.order)[0];
      if (!r) return t("cust.rule.none");
      const label = MODE_SHORT[r.mode] ? t(MODE_SHORT[r.mode]!) : r.mode;
      const duty = routing.onDuty.map((d) => firstName(d.name)).filter(Boolean);
      return r.mode === "ROUND_ROBIN" && duty.length ? `${label} → ${duty.join(", ")}` : label;
    },
    [routing, t],
  );
  const tabItems: TabItem[] = TABS.map((x) => ({
    key: x.key,
    label: t(x.label),
    testID: x.testID,
    count: x.key === "unanswered" && counts ? counts.unanswered : x.key === "mine" && counts ? counts.mine : undefined,
    tone: "wait",
  }));
  const subtitle = counts
    ? [...counts.byChannel.map(([ch, n]) => `${chLabel(ch)} ${n}`), t("cust.sub.unanswered", { n: counts.unanswered }), t("cust.sub.mine", { n: counts.mine })].join(" · ")
    : "";
  const open = (x: ConvItem) => router.push(`/customers/${encodeURIComponent(x.id)}${systemId ? `?s=${encodeURIComponent(systemId)}` : ""}`);

  if (denied) {
    return (
      <AiryScreen testID="cust-list">
        <View style={styles.pad}>
          <SecTopBar zone="customers" center="none" />
          <Text style={[styles.title, { color: c.text }]}>{t("cust.title")}</Text>
          <Glass testID="cust-denied" style={styles.denied}>
            <Icon name="lock" size={22} color={c.warn.fg} />
            <Text style={[styles.deniedT, { color: c.text }]}>{t("cust.denied.title")}</Text>
            <Text style={[styles.deniedB, { color: c.textMuted }]}>{t("cust.denied.body")}</Text>
          </Glass>
        </View>
      </AiryScreen>
    );
  }

  return (
    <AiryScreen testID="cust-list">
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.textMuted} />}
      >
        <SecTopBar zone="customers" center="none" />
        <Text style={[styles.title, { color: c.text }]}>{t("cust.title")}</Text>
        {subtitle ? (
          <Text testID="cust-counts" style={[styles.sub, { color: c.textMuted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {!canReply ? <Note testID="cust-readonly">{t("cust.readOnly")}</Note> : null}

        {systems.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {systems.map((s) => (
              <Chip key={s.id} testID="cust-system-chip" label={s.unread ? `${s.name} · ${s.unread}` : s.name} active={s.id === systemId} onPress={() => setSystemId(s.id)} />
            ))}
          </ScrollView>
        ) : null}

        <View style={[glassStyle(c, radii.pill), styles.search, systems.length > 1 && styles.searchTight]}>
          <Icon name="search" size={16} color={c.iconDim} />
          <TextInput
            testID="cust-search"
            value={qLive}
            onChangeText={setQLive}
            placeholder={t("cust.search")}
            placeholderTextColor={c.placeholder}
            returnKeyType="search"
            style={[styles.searchIn, { color: c.text }]}
          />
        </View>

        <View style={styles.tabs}>
          <Tabs testID="cust-tab" items={tabItems} active={tab} onChange={(k) => setTab(k as TabKey)} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip testID="cust-channel-chip" label={t("cust.ch.all")} active={!channel} onPress={() => setChannel(null)} />
          {(sys?.channels ?? []).map((ch) => (
            <Chip key={ch.type} testID="cust-channel-chip" label={chLabel(ch.type)} active={channel === ch.type} onPress={() => setChannel(ch.type)} />
          ))}
        </ScrollView>

        {offline ? <Note warn testID="cust-offline">{t("cust.offline")}</Note> : null}
        {/* S2.14: ก่อนผลแรก = Loading · ล้มก่อนได้รายการ = แค่ note ออฟไลน์ (ไม่บอก "ยังไม่มีแชท") */}
        {loading && !offline ? <Loading testID="cust-loading" /> : null}
        {!loading && !(offline && items.length === 0) && shown.length === 0 ? (
          <Text testID="cust-empty" style={[styles.empty, { color: c.textMuted }]}>
            {q ? t("cust.empty.search") : t("cust.empty")}
          </Text>
        ) : null}

        {shown.map((x) => {
          const name = x.contact.displayName ?? t("cust.noName");
          const unassigned = x.status === "OPEN" && !x.assigneeUserId;
          const tags = (x.tags ?? []).filter(Boolean);
          const waitingHuman = tags.includes(WAITING_HUMAN_TAG);
          const otherTags = tags.filter((g) => g !== WAITING_HUMAN_TAG);
          const rule = unassigned ? ruleFor(x.channel) : null;
          return (
            <Pressable
              testID={unassigned ? "cust-row-unassigned" : "cust-row"}
              key={x.id}
              onPress={() => open(x)}
              accessibilityRole="button"
              accessibilityLabel={name}
              style={[glassStyle(c, radii.card), styles.row]}
            >
              <Avatar name={name} seed={x.contact.id} size={38} />
              <View style={styles.rowBody}>
                <View style={styles.nameRow}>
                  <ChannelBadge channel={x.channel} />
                  <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                    {name}
                  </Text>
                  {otherTags.length ? (
                    <Text style={[styles.tagT, { color: c.textMuted }]} numberOfLines={1}>
                      {otherTags.join(" · ")}
                    </Text>
                  ) : null}
                </View>
                {waitingHuman ? (
                  <View testID="cust-row-waiting" style={[styles.waitTag, { backgroundColor: c.warn.bg }]}>
                    <Text style={[styles.waitTagT, { color: c.warn.fg }]}>{t("cust.tag.waitingHuman")}</Text>
                  </View>
                ) : null}
                {x.lastMessagePreview ? (
                  <Text style={[styles.preview, { color: c.textDim }]} numberOfLines={1}>
                    {x.lastMessagePreview}
                  </Text>
                ) : null}
                {x.aiDraft ? <Text style={[styles.ai, { color: c.cust.ai }]}>✨ {t("cust.row.aiDraft")}</Text> : null}
                {unassigned ? (
                  <Text style={[styles.wait, { color: c.warn.fg }]}>
                    {x.waitingMin != null ? t("cust.row.unassignedWait", { n: x.waitingMin }) : t("cust.row.unassigned")}
                  </Text>
                ) : null}
                {rule ? (
                  <Text style={[styles.rule, { color: c.cust.ai }]} numberOfLines={1}>
                    · {t("cust.row.rule", { rule })}
                  </Text>
                ) : null}
              </View>
              <View style={styles.right}>
                <Text style={[styles.time, { color: c.textMuted }]}>{listTime(x.lastMessageAt, nowMs)}</Text>
                {x.staffUnreadCount > 0 ? (
                  <View style={[styles.unread, { backgroundColor: c.status.wait }]}>
                    <Text style={[styles.unreadT, { color: c.zone.onZone }]}>{x.staffUnreadCount > 99 ? "99+" : x.staffUnreadCount}</Text>
                  </View>
                ) : null}
                {x.assigneeUserId ? <Avatar name={x.assigneeName} seed={x.assigneeUserId} size={28} /> : null}
              </View>
            </Pressable>
          );
        })}

        {next ? (
          <Pressable testID="cust-more" onPress={() => void loadMore()} disabled={more} accessibilityRole="button" style={styles.more}>
            <Text style={[styles.moreT, { color: c.textMuted }]}>{more ? t("cust.busy") : t("cust.more")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxl },
  pad: { paddingHorizontal: spacing.page },
  title: { fontSize: F.title, fontWeight: "700", letterSpacing: -0.8, lineHeight: 38, marginTop: F.v(34) },
  sub: { fontSize: T.sub, lineHeight: 20, marginTop: 4 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 38, paddingHorizontal: 14, marginTop: F.v(34) },
  searchTight: { marginTop: 8 },
  searchIn: { flex: 1, minWidth: 0, fontSize: T.sub, paddingVertical: 0, outlineWidth: 0 },
  tabs: { marginTop: 14 },
  chips: { gap: 8, paddingVertical: 8 },
  empty: { fontSize: T.sub, textAlign: "center", marginTop: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14, marginTop: 10 },
  rowBody: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: T.body - 0.5, fontWeight: "700", flexShrink: 1 },
  tagT: { fontSize: T.cap - 0.5, flexShrink: 0, maxWidth: 90 },
  waitTag: { alignSelf: "flex-start", borderRadius: radii.tag, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  waitTagT: { fontSize: T.cap - 1, fontWeight: "700" },
  preview: { fontSize: T.cap + 0.5, lineHeight: 19, marginTop: 4 },
  ai: { fontSize: T.cap + 0.5, lineHeight: 19, marginTop: 3 },
  wait: { fontSize: T.sub + 0.5, fontWeight: "700", lineHeight: 21, marginTop: 4 },
  rule: { fontSize: T.cap, lineHeight: 18, marginTop: 1 },
  right: { alignItems: "flex-end", gap: 6, minWidth: 40 },
  time: { fontSize: T.cap - 0.5 },
  unread: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  unreadT: { fontSize: 11, fontWeight: "700" },
  more: { alignSelf: "center", paddingVertical: 14, paddingHorizontal: 24 },
  moreT: { fontSize: T.sub },
  denied: { marginTop: F.v(40), alignItems: "center", gap: 8 },
  deniedT: { fontSize: T.h, fontWeight: "700", textAlign: "center" },
  deniedB: { fontSize: T.sub, lineHeight: 21, textAlign: "center" },
});
