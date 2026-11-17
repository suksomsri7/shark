// แผ่น Lekaa (เจ้าของอนุมัติแบบ fab6 จอ 2–3 + fab4 จอ 3 · 15 พ.ย.) — เปิดจากปุ่มลอย Lekaa (LekaaFabHost)
//
// มุมมอง "list" (fab6 จอ 2): หัว = โลโก้ Lekaa วงกลม + "Lekaa" + ชื่อกิจการ + ✕ · ช่องค้นหา "ค้นหาชื่องานที่เคยสั่ง" + ปุ่มกลมดำ + ท้ายแถว
//   ชิป ทั้งหมด / กำลังทำ (n) / รออนุมัติ / เสร็จ (ไม่มี "ของฉัน/ทุกคนในกิจการ" — งานของใครของมัน) · การ์ดงาน = RoomCard เดิมของหน้าเลขา
//   ปัดการ์ดไปซ้าย = ปุ่มแดง "ลบ" → ชีตยืนยัน → DELETE secretary/rooms/[id] (soft delete · ผู้เปิดห้องเท่านั้น) · ข้อมูล: GET secretary/rooms (ของตัวเอง ∪ ที่เป็นสมาชิก)
//   โหลดทุกครั้งที่เปิด + ทุก 15 วิ ระหว่างเปิดอยู่
// มุมมอง "task": แตะการ์ด = ห้องงานในแผ่นเดียวกัน (RoomView embedded · ‹ กลับรายการ) · + = งานใหม่ในแผ่น (fab6 จอ 3: หัว "งานใหม่" ·
//   ช่องพิมพ์ "สั่งงาน…" มีปุ่ม + แนบ (SecAttach รูป/ถ่ายรูป/ไฟล์) หน้าช่อง) → POST secretary/rooms { instruction, clientMessageId, attachments?, pageContext }
//   แล้วคุยต่อในแผ่นเดิม (RoomView seed แบบจอเริ่มงานใหม่ · R-Z28 cmid เดิมเมื่อกดซ้ำ · R-Z30 409 pending ลองใหม่เงียบ)
//   pageContext = หน้าที่ผู้ใช้เปิดอยู่ตอนแตะปุ่ม (Host จับไว้) — ส่งเงียบ ๆ ไม่แสดงในแผ่น (แบบ: "แอปแนบหน้าที่เปิดอยู่ไปเงียบ ๆ")
// ความสูง: รายการเริ่มที่ ~30% จากบน · งาน ~22% · ลากหัวแผ่นขึ้น = เต็มจอ · ลากลงไกล = ปิด · แตะพื้นมืด = ปิด · ปุ่มย้อนของ Android = ย้อน/ปิด
// ข้อความผ่าน i18n (lekaa.* + sec.home.*) · สีจากธีม
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, BackHandler, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { Text, TextInput } from "@/src/components/ui/text";
import { Icon, InputBar, LoadError, Loading, Note } from "@/src/components/airy";
import { RoomCard, isTodayBkk } from "@/src/components/secretary/RoomCard";
import { RoomFilters, type RoomFilterKey, type RoomFilterOption } from "@/src/components/secretary/RoomFilters";
import { RoomView, type RoomSeed } from "@/src/components/secretary/RoomView";
import { AttachSheet, AttachTray, localAttachments, useSecAttach } from "@/src/components/secretary/SecAttach";
import { ConfirmSheet } from "@/src/components/calendar/ConfirmSheet";
import {
  DEFAULT_SECRETARY_NAME,
  clientMessageId,
  isDenied,
  normalizeRoom,
  refreshZoneBadges,
  retryPending,
  secDeleteId,
  secGet,
  secPost,
  startErrorKind,
  useSecretaryMe,
  type PageContext,
  type RoomCard as Room,
  type RoomStatus,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, glassStyle, shadow, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";
import { LekaaLogo } from "./LekaaLogo";
import { KeyboardFrame } from "./core";

const POLL_MS = 15_000;
const SEARCH_H = 42;
const DEL_W = 76;
const FILTER_OF: Record<RoomStatus, RoomFilterKey> = { OPEN: "working", RUNNING: "working", WAITING: "approval", DONE: "done" };
type View_ = { kind: "list" } | { kind: "new" } | { kind: "room"; id: string };

export function LekaaSheet({ visible, onClose, pageContext }: { visible: boolean; onClose: () => void; pageContext: PageContext | null }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const [view, setView] = useState<View_>({ kind: "list" });
  const [full, setFull] = useState(false);
  // เปิดใหม่ = เริ่มที่รายการ ความสูงปกติ
  useEffect(() => {
    if (visible) {
      setView({ kind: "list" });
      setFull(false);
    }
  }, [visible]);

  const fullTop = insets.top + 8;
  // 17 พ.ย. (ภาพคู่ fab6): ขอบบนตามแบบ — รายการ top 200/844 · ห้อง/งานใหม่ top 120/844
  const restTop = Math.round(H * (view.kind === "list" ? 0.237 : 0.142));
  const baseTop = full ? fullTop : Math.max(restTop, fullTop);
  const top = useRef(new Animated.Value(baseTop)).current;
  useEffect(() => {
    Animated.spring(top, { toValue: baseTop, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  }, [baseTop, top]);

  const baseRef = useRef(baseTop);
  baseRef.current = baseTop;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => top.setValue(Math.max(fullTop, baseRef.current + g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -60) setFull(true);
          else if (g.dy > 140) {
            if (full) setFull(false);
            else onClose();
          }
          Animated.spring(top, { toValue: g.dy < -60 ? fullTop : baseRef.current, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
        },
      }),
    [top, fullTop, full, onClose],
  );

  // ปุ่มย้อนของ Android: งาน → รายการ · รายการ → ปิด
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (view.kind !== "list") setView({ kind: "list" });
      else onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, view.kind, onClose]);

  if (!visible) return null;
  const toList = () => setView({ kind: "list" });

  return (
    <View testID="lekaa-sheet" style={StyleSheet.absoluteFill}>
      <Pressable testID="lekaa-sheet-dim" accessibilityRole="button" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: c.dim }]} />
      <Animated.View style={[styles.panel, { top, backgroundColor: c.dock.solid }]}>
        <View {...pan.panHandlers} style={styles.grabZone}>
          <View style={[styles.grab, { backgroundColor: c.sheet.grab }]} />
        </View>
        {view.kind === "list" ? (
          <ListView pan={pan} onClose={onClose} onNew={() => setView({ kind: "new" })} onOpen={(id) => setView({ kind: "room", id })} />
        ) : view.kind === "room" ? (
          <RoomView key={view.id} id={view.id} embedded={{ onClose, onBack: toList }} />
        ) : (
          <NewTask onClose={onClose} pageContext={pageContext} />
        )}
      </Animated.View>
    </View>
  );
}

/** หัวแผ่น: โลโก้วงกลม + ชื่อ + ชื่อกิจการ + ✕ (ลากหัวได้) */
function Head({ title, pan, onClose, testID }: { title: string; pan: ReturnType<typeof PanResponder.create>; onClose: () => void; testID: string }) {
  const { c } = useTheme();
  const t = useT();
  const { tenants, activeTenantId } = useAuth();
  const biz = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  return (
    <View testID={testID} {...pan.panHandlers} style={styles.head}>
      <View style={[styles.logo, { backgroundColor: c.lekaa.fabBg }, shadow(c.lekaa.logoRing)]}>
        <LekaaLogo size={22} />
      </View>
      <View style={styles.headX}>
        <Text style={[styles.headT, { color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.headS, { color: c.textMuted }]} numberOfLines={1}>
          {biz}
        </Text>
      </View>
      <Pressable testID="lekaa-sheet-close" accessibilityRole="button" accessibilityLabel={t("lekaa.close")} onPress={onClose} hitSlop={8} style={[styles.x, { backgroundColor: c.chip.bg }]}>
        <Icon name="x" size={17} color={c.text} />
      </Pressable>
    </View>
  );
}

function ListView({ pan, onClose, onNew, onOpen }: { pan: ReturnType<typeof PanResponder.create>; onClose: () => void; onNew: () => void; onOpen: (id: string) => void }) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { activeTenantId, user } = useAuth();
  const userId = user?.id ?? null;
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState<RoomFilterKey>("all");
  const [query, setQuery] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ask, setAsk] = useState<Room | null>(null);
  const [delNote, setDelNote] = useState<string | null>(null);
  const tenantRef = useRef(activeTenantId);
  tenantRef.current = activeTenantId;
  const swipes = useRef(new Map<string, SwipeableMethods>());

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    if (!tenant) return;
    try {
      const r = await secGet("secretary/rooms", { take: 50 });
      if (tenantRef.current !== tenant) return;
      setFailed(false);
      setDenied(false);
      setRooms((r.items ?? []).map((x) => normalizeRoom(x, userId)));
    } catch (e) {
      if (tenantRef.current !== tenant) return;
      if (isDenied(e)) {
        setDenied(true);
        setRooms([]);
      } else setFailed(true);
    }
    setNowMs(Date.now());
  }, [activeTenantId, userId]);

  useEffect(() => {
    void load();
    const h = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(h);
  }, [load]);

  const counts = useMemo(() => {
    const list = rooms ?? [];
    return { working: list.filter((r) => FILTER_OF[r.status] === "working").length, doneToday: list.filter((r) => r.status === "DONE" && isTodayBkk(r.updatedAt, nowMs)).length };
  }, [rooms, nowMs]);
  const visibleRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rooms ?? []).filter((r) => (filter === "all" || FILTER_OF[r.status] === filter) && (!q || r.title.toLowerCase().includes(q)));
  }, [rooms, filter, query]);
  // แบบ fab6: ชิป "กำลังทำ" มีตัวเลข · ชิปอื่นไม่มี
  const filters: RoomFilterOption[] = [
    { key: "all", testID: "lekaa-filter-all", label: t("sec.home.filter.all") },
    { key: "working", testID: "lekaa-filter-working", label: t("sec.home.filter.working"), count: counts.working, tone: "run" },
    { key: "approval", testID: "lekaa-filter-approval", label: t("sec.home.filter.approval") },
    { key: "done", testID: "lekaa-filter-done", label: t("sec.home.filter.done") },
  ];

  const del = async (r: Room) => {
    setAsk(null);
    setDelNote(null);
    setRooms((list) => (list ? list.filter((x) => x.id !== r.id) : list)); // ออกจากรายการทันที · ล้ม = โหลดคืน
    try {
      await secDeleteId("secretary/rooms/[id]", r.id);
      void refreshZoneBadges();
    } catch {
      setDelNote(t("lekaa.deleteErr"));
    } finally {
      void load();
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.pad}>
        <Head title={t("lekaa.title")} pan={pan} onClose={onClose} testID="lekaa-sheet-head" />
        <View style={styles.srow}>
          <View style={[styles.search, { backgroundColor: c.lekaa.fabBg, borderColor: c.divider }]}>
            <Icon name="search" size={16} color={c.iconDim} />
            <TextInput
              testID="lekaa-search"
              value={query}
              onChangeText={setQuery}
              placeholder={t("sec.home.search")}
              placeholderTextColor={c.placeholder}
              returnKeyType="search"
              style={[styles.searchField, { color: c.text }]}
            />
          </View>
          <Pressable testID="lekaa-new" accessibilityRole="button" accessibilityLabel={t("lekaa.new")} onPress={onNew} disabled={denied} style={[styles.plus, { backgroundColor: c.accent }, shadow(c.accentShadow), denied && styles.off]}>
            <Icon name="plus" size={22} color={c.onAccent} />
          </Pressable>
        </View>
        <RoomFilters options={filters} value={filter} onChange={setFilter} />
        {delNote ? <Note warn testID="lekaa-del-note">{delNote}</Note> : null}
      </View>
      <ScrollView testID="lekaa-list" style={styles.flex} contentContainerStyle={[styles.pad, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {denied ? (
          <LoadError testID="lekaa-denied" denied />
        ) : rooms === null ? (
          failed ? <LoadError testID="lekaa-error" onRetry={() => void load()} /> : <Loading testID="lekaa-loading" />
        ) : visibleRooms.length === 0 ? (
          <Text testID="lekaa-empty" style={[styles.none, { color: c.textMuted }]}>
            {rooms.length === 0 ? t("lekaa.empty") : query.trim() ? t("sec.home.noMatch") : t("sec.home.filterEmpty")}
          </Text>
        ) : (
          visibleRooms.map((r) => {
            const mine = r.startedByMe;
            const card = <RoomCard testID="lekaa-card" room={r} nowMs={nowMs} onPress={() => onOpen(r.id)} />;
            if (!mine) return <View key={r.id}>{card}</View>; // ห้องที่ถูกชวนมา (รุ่นเดิม) ลบไม่ได้ — ลบได้เฉพาะงานที่สั่งเอง
            return (
              <ReanimatedSwipeable
                key={r.id}
                ref={(m) => {
                  if (m) swipes.current.set(r.id, m);
                  else swipes.current.delete(r.id);
                }}
                friction={1.6}
                rightThreshold={DEL_W / 2}
                overshootRight={false}
                renderRightActions={() => (
                  <View style={styles.delWrap}>
                    <Pressable
                      testID={`lekaa-del-${r.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={t("lekaa.delete")}
                      onPress={() => {
                        swipes.current.get(r.id)?.close();
                        setAsk(r);
                      }}
                      style={[styles.del, { backgroundColor: c.danger.bg }]}
                    >
                      <Icon name="trash-2" size={17} color={c.danger.fg} />
                      <Text style={[styles.delT, { color: c.danger.fg }]}>{t("lekaa.delete")}</Text>
                    </Pressable>
                  </View>
                )}
              >
                {card}
              </ReanimatedSwipeable>
            );
          })
        )}
      </ScrollView>
      <ConfirmSheet
        testID="lekaa-del-ask"
        visible={!!ask}
        title={t("lekaa.deleteAsk.title")}
        body={ask ? t("lekaa.deleteAsk.body", { title: ask.title }) : undefined}
        yes={t("lekaa.deleteAsk.ok")}
        no={t("lekaa.deleteAsk.cancel")}
        onClose={() => setAsk(null)}
        onYes={() => {
          if (ask) void del(ask);
        }}
      />
    </View>
  );
}

type ErrKind = "quota" | "rate" | "denied" | "other";
const ERR_KEY = { rate: "sec.new.err.rate", denied: "sec.new.err.denied", other: "sec.new.err.other", quota: "sec.new.quota.title" } as const;

/** งานใหม่ในแผ่น (fab6 จอ 3) — ช่องพิมพ์ "สั่งงาน…" + ปุ่ม + แนบ · ส่งแล้วคุยต่อในแผ่นเดิม (RoomView seed) */
function NewTask({ onClose, pageContext }: { onClose: () => void; pageContext: PageContext | null }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { activeTenantId } = useAuth();
  const sec = useSecretaryMe();
  const name = sec?.name ?? DEFAULT_SECRETARY_NAME;
  const [text, setText] = useState("");
  const [seed, setSeed] = useState<RoomSeed | null>(null);
  const [roomId, setRoomId] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const attach = useSecAttach();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ErrKind | null>(null);
  const cmidRef = useRef<string | null>(null);
  const cmidFor = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const { c } = useTheme();

  const send = async () => {
    const typed = text.trim();
    if ((!typed && attach.items.length === 0) || !attach.ready || sendingRef.current || err === "denied") return;
    const instruction = typed || t("sec.attach.defaultText");
    const files = attach.take();
    const refs = attach.refs(files);
    sendingRef.current = true;
    setBusy(true);
    setErr(null);
    setSeed({ title: instruction.length > 60 ? `${instruction.slice(0, 59)}…` : instruction, text: instruction, attachments: localAttachments(files), at: new Date().toISOString() });
    setText("");
    // R-Z28: คำสั่งเดิม (กดซ้ำ/ลองใหม่) = รหัสเดิม · แก้คำสั่ง/ไฟล์ หรือสลับกิจการ = รหัสใหม่
    const key = `${activeTenantId ?? ""}|${instruction}|${refs.map((r) => r.id).join(",")}`;
    if (cmidFor.current !== key) cmidRef.current = null;
    cmidRef.current = cmidRef.current ?? clientMessageId();
    cmidFor.current = key;
    const cmid = cmidRef.current;
    try {
      const r = await retryPending(() =>
        secPost("secretary/rooms", { instruction, clientMessageId: cmid, ...(refs.length ? { attachments: refs } : {}), ...(pageContext ? { pageContext } : {}) }),
      );
      cmidRef.current = null;
      cmidFor.current = null;
      setRoomId(r.roomId);
    } catch (e) {
      setSeed(null);
      setText((cur) => cur || typed);
      attach.restore(files);
      setErr(startErrorKind(e));
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  };

  if (seed) return <RoomView id={roomId} seed={seed} embedded={{ onClose, title: t("lekaa.newTitle") }} />;

  const denied = err === "denied";
  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
    <KeyboardFrame inSheet bottomInset={insets.bottom} style={styles.flex}>
      <View style={styles.pad}>
        <NewHead onClose={onClose} />
        {err ? (
          <Note warn testID="lekaa-new-error">
            {t(ERR_KEY[err])}
          </Note>
        ) : null}
      </View>
      <View style={styles.flex} />
      <AttachTray items={attach.items} note={attach.note} onRemove={attach.remove} testID="lekaa-new-attach" />
      <InputBar
        testID="lekaa-new-input"
        sendTestID="lekaa-new-send"
        value={text}
        onChangeText={(v) => {
          if (denied) return;
          setText(v);
          if (err && err !== "quota") setErr(null);
        }}
        onSend={() => void send()}
        onPlus={() => setAttachOpen(true)}
        plusDisabled={denied}
        sendDisabled={(!text.trim() && attach.items.length === 0) || !attach.ready || busy || denied}
        locked={denied}
        autoFocus
        placeholder={denied ? t("sec.new.lockedPh") : t("lekaa.input")}
        style={[styles.input, { borderColor: c.glass.border }]}
      />
      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onPick={(k) => void attach.pick(k)} name={name} testID="lekaa-new-attach-sheet" />
    </KeyboardFrame>
    </View>
  );
}

function NewHead({ onClose }: { onClose: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const { tenants, activeTenantId } = useAuth();
  const biz = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  return (
    <View testID="lekaa-new-head" style={styles.head}>
      <View style={[styles.logo, { backgroundColor: c.lekaa.fabBg }, shadow(c.lekaa.logoRing)]}>
        <LekaaLogo size={22} />
      </View>
      <View style={styles.headX}>
        <Text style={[styles.headT, { color: c.text }]} numberOfLines={1}>
          {t("lekaa.newTitle")}
        </Text>
        <Text style={[styles.headS, { color: c.textMuted }]} numberOfLines={1}>
          {biz}
        </Text>
      </View>
      <Pressable testID="lekaa-sheet-close" accessibilityRole="button" accessibilityLabel={t("lekaa.close")} onPress={onClose} hitSlop={8} style={[styles.x, { backgroundColor: c.chip.bg }]}>
        <Icon name="x" size={17} color={c.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  grabZone: { paddingTop: 10, paddingBottom: 6, alignItems: "center" },
  grab: { width: 40, height: size.grab, borderRadius: 3 },
  pad: { paddingHorizontal: spacing.page - 2 },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 4 },
  logo: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headX: { flex: 1, minWidth: 0 },
  headT: { fontSize: T.h, fontWeight: "700", lineHeight: 24 },
  headS: { fontSize: T.cap, lineHeight: 16 },
  x: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  srow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: F.v(16) },
  search: { flex: 1, height: SEARCH_H, borderRadius: SEARCH_H / 2, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 14 },
  searchField: { flex: 1, minWidth: 0, fontSize: T.sub, paddingVertical: 0, outlineWidth: 0 },
  plus: { width: SEARCH_H, height: SEARCH_H, borderRadius: SEARCH_H / 2, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.4 },
  none: { fontSize: T.sub, textAlign: "center", marginTop: F.v(40) },
  delWrap: { width: DEL_W + 8, marginTop: F.v(13), paddingLeft: 8 },
  del: { flex: 1, borderRadius: radii.sugg, alignItems: "center", justifyContent: "center", gap: 2 },
  delT: { fontSize: T.cap, fontWeight: "600" },
  input: { marginHorizontal: spacing.page - 2, marginBottom: 26 },
});
