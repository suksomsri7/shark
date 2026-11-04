// ห้องงานของเลขา (ใบ S2.4 · แบบ A3/A4/A5 sec-a.jpg หน้า 3–5 · C4 sec-c.jpg หน้า 5)
//   ข้อมูล (S1.14 · ชื่อเส้นในตาราง src/api/secretary.ts): GET secretary/rooms/[id] · secretary/rooms/[id]/messages · secretary/rooms/[id]/proposals ·
//          secretary/log?roomId · เขียน: secretary/rooms/[id]/send · secretary/rooms/[id]/close · secretary/proposals/[id]/approve|reject|edit ·
//          secretary/plans/[id]/approve|reject · secretary/log/[id]/undo
//   polling: ทุก 5 วิ ขณะงานกำลังทำ (QUEUED/RUNNING) · 15 วิ สถานะอื่น · เริ่มเมื่อจอ focus หยุดเมื่อ blur (useFocusEffect + setInterval) · ไม่มี SSE
//   ไทม์ไลน์เรียงตามเวลา: ฟอง (ผู้ใช้/เลขา/คนอื่น/ระบบ) · ขั้นของแผน (✓ ● ⏸) · การ์ดอนุมัติ (ApprovalCard = ตรรกะอนุมัติทั้งหมด) · การ์ดทำแล้ว (DoneCard)
//   แถบ "ทำงานอยู่เบื้องหลัง…" เมื่อกำลังทำ (A3) · เมนู ⋯ ปิดห้อง/เพิ่มคน/แจ้งปัญหา · สมาชิก seeHistory=false กรองที่เซิร์ฟเวอร์แล้ว
// ข้อความทั้งหมดผ่าน i18n (sec.room.*) · สีจากธีม · สเกล R-UI1 (ระยะแนวตั้ง × F · ตัวอักษร tokens.type)
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Dot, Glass, Icon, IconBtn, InputBar, Sheet, type DotStatus } from "@/src/components/airy";
import { ApprovalCard, useApprovalFlow, type ApprovalActions, type ApprovalIds } from "@/src/components/secretary/ApprovalCard";
import { AssistantRow, Bubble, ROOM_INDENT } from "@/src/components/secretary/Bubble";
import { DoneCard, type DoneIds } from "@/src/components/secretary/DoneCard";
import { StepList } from "@/src/components/secretary/StepCard";
import { ApiError } from "@/src/api/client";
import {
  DEFAULT_SECRETARY_NAME,
  clientMessageId,
  entityRoute,
  normalizeApprovals,
  normalizeLog,
  normalizeMessages,
  normalizeRoomDetail,
  secGet,
  secGetId,
  secPostId,
  useSecretaryMe,
  type ApprovalItem,
  type LogItem,
  type MsgRow,
  type RoomDetail,
  type RoomStatus,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { cardGap, radii, size, spacing, type as T } from "@/src/theme/tokens";

const FAST_MS = 5_000;
const SLOW_MS = 15_000;
const INPUT_BOTTOM = 26;
const BKK_MS = 7 * 3600_000;

/** testID ของการ์ดอนุมัติ/ชีต (spec s2.4) */
const AP_IDS: ApprovalIds = {
  card: "sec-room-approval",
  approve: "sec-room-approve",
  reject: "sec-room-reject",
  edit: "sec-room-edit",
  why: "sec-room-why",
  auto: "sec-room-auto",
  steps: "sec-room-plan-steps",
  step: "sec-room-step",
  confirm2x: "sec-room-confirm2x",
  rejectSheet: "sec-room-reject-sheet",
  editSheet: "sec-room-edit-sheet",
};
const DONE_IDS: DoneIds = { card: "sec-room-done", link: "sec-room-open-link", undo: "sec-room-undo", teach: "sec-room-teach", repeat: "sec-room-repeat" };
const DOT: Record<RoomStatus, DotStatus> = { OPEN: "done", RUNNING: "run", WAITING: "wait", DONE: "done" };

/** HH:MM เวลาไทย (UTC+7 · ไม่พึ่งเขตเวลาเครื่อง) */
function hhmm(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + BKK_MS);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

type Gone = "notFound" | "denied" | null;
type Row = { key: string; at: number; order: number; node: ReactNode; anchor?: boolean };

export default function SecretaryRoomScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { activeTenantId, user } = useAuth();
  const myId = user?.id ?? null;
  const name = useSecretaryMe()?.name ?? DEFAULT_SECRETARY_NAME;

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [msgs, setMsgs] = useState<MsgRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [gone, setGone] = useState<Gone>(null);
  const [offline, setOffline] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [menu, setMenu] = useState(false);
  const [menuNote, setMenuNote] = useState<string | null>(null);
  const tenantRef = useRef(activeTenantId);
  const inflight = useRef(false);
  const cmid = useRef<string | null>(null);

  // กิจการ/ห้องเปลี่ยน ⇒ ล้างของเดิมทันที (ไม่โชว์ของร้านก่อนหน้า)
  useEffect(() => {
    tenantRef.current = activeTenantId;
    setRoom(null);
    setMsgs([]);
    setApprovals([]);
    setLogs([]);
    setGone(null);
  }, [activeTenantId, id]);

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    if (!tenant || !id || inflight.current) return;
    inflight.current = true;
    try {
      const [r, m, p, l] = await Promise.allSettled([
        secGetId("secretary/rooms/[id]", id),
        secGetId("secretary/rooms/[id]/messages", id, { take: 100 }),
        secGetId("secretary/rooms/[id]/proposals", id),
        secGet("secretary/log", { roomId: id, take: 50 }),
      ]);
      if (tenantRef.current !== tenant) return;
      if (r.status === "rejected") {
        const e = r.reason;
        if (e instanceof ApiError && e.status === 404) setGone("notFound");
        else if (e instanceof ApiError && e.status === 403) setGone("denied");
        else setOffline(true);
        return;
      }
      const now = Date.now();
      setGone(null);
      setOffline(false);
      setRoom(normalizeRoomDetail(r.value));
      if (m.status === "fulfilled") setMsgs(normalizeMessages(m.value));
      if (p.status === "fulfilled") setApprovals(normalizeApprovals(p.value));
      if (l.status === "fulfilled") setLogs(normalizeLog(l.value, now));
      setNowMs(now);
    } finally {
      inflight.current = false;
    }
  }, [activeTenantId, id]);

  // โหลดทุกครั้งที่จอได้ focus · polling เฉพาะตอนจออยู่ (5 วิ ขณะทำงาน · 15 วิ อื่น ๆ) · blur = หยุด
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void load();
      return () => setFocused(false);
    }, [load]),
  );
  const working = sending || room?.status === "RUNNING";
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!focused) return;
    const h = setInterval(() => void loadRef.current(), working ? FAST_MS : SLOW_MS);
    return () => clearInterval(h);
  }, [focused, working]);

  // ───────── การกระทำ (ชื่อเส้นในตาราง PATH ของ src/api/secretary.ts) ─────────
  const actions: ApprovalActions = useMemo(
    () => ({
      approve: (item, confirm2x) =>
        item.type === "plan"
          ? secPostId("secretary/plans/[id]/approve", item.id, confirm2x ? { confirm2x: true } : {})
          : secPostId("secretary/proposals/[id]/approve", item.id, confirm2x ? { confirm2x: true } : {}),
      reject: (item, body) => (item.type === "plan" ? secPostId("secretary/plans/[id]/reject", item.id, {}) : secPostId("secretary/proposals/[id]/reject", item.id, body)),
      edit: async (item, patch) => {
        await secPostId("secretary/proposals/[id]/edit", item.id, { patch });
      },
    }),
    [],
  );
  const flow = useApprovalFlow({ actions, onChanged: () => void load(), name, ids: AP_IDS });
  const { flash, clearFlash } = flow;
  useEffect(() => {
    if (!flash) return;
    const h = setTimeout(clearFlash, 4000);
    return () => clearTimeout(h);
  }, [flash, clearFlash]);

  const undo = useCallback(
    async (l: LogItem) => {
      const r = await secPostId("secretary/log/[id]/undo", l.id, {});
      void load();
      return r;
    },
    [load],
  );

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !room || room.closed) return;
    setSending(true);
    setSendErr(null);
    cmid.current = cmid.current ?? clientMessageId(); // ส่งซ้ำหลังเน็ตหลุด = รหัสเดิม (เซิร์ฟเวอร์กันซ้ำ 24 ชม.)
    try {
      await secPostId("secretary/rooms/[id]/send", id, { text, clientMessageId: cmid.current });
      cmid.current = null;
      setDraft("");
      setRoom((r) => (r ? { ...r, status: "RUNNING", rawStatus: "RUNNING" } : r));
      void load();
    } catch (e) {
      setSendErr(e instanceof ApiError && e.detail ? e.detail : t("sec.room.sendErr"));
    } finally {
      setSending(false);
    }
  };

  const closeRoom = async () => {
    try {
      await secPostId("secretary/rooms/[id]/close", id, {});
      setMenu(false);
      void load();
    } catch (e) {
      setMenuNote(e instanceof ApiError && e.detail ? e.detail : t("sec.room.ap.err"));
    }
  };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.navigate("/secretary");
  };

  const teach = () => {
    setDraft(t("sec.room.teachPrefix"));
    setFocusKey((k) => k + 1);
  };
  const instruction = msgs.find((m) => m.role === "user")?.content ?? room?.title ?? "";
  const repeat = () => router.push({ pathname: "/secretary/new", params: { q: instruction } });
  const openEntity = (l: LogItem) => {
    const r = entityRoute(l.entity, String(Date.now()));
    if (r) router.push(r);
  };

  // ───────── ไทม์ไลน์ ─────────
  const names = useMemo(() => new Map((room?.members ?? []).map((m) => [m.userId, m.name])), [room]);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let seq = 0;
    const at = (iso: string) => {
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? ms : 0;
    };
    for (const m of msgs) {
      const mine = m.role === "user" && (!m.authorId || m.authorId === myId);
      const author = m.role === "user" && !mine ? (names.get(m.authorId ?? "") ?? t("sec.room.someone")) : null;
      out.push({ key: `m-${m.id}`, at: at(m.at), order: seq++, node: <Bubble msg={m} mine={mine} authorName={author} testID="sec-room-bubble" /> });
    }
    for (const p of room?.plans ?? []) {
      out.push({ key: `p-${p.id}`, at: at(p.at), order: seq++, node: <View style={styles.indent}><StepList steps={p.steps} testID="sec-room-steps" stepTestID="sec-room-step" /></View> });
    }
    const lastAp = approvals.length - 1;
    approvals.forEach((a, i) => {
      out.push({
        key: `a-${a.id}`,
        at: at(a.at),
        order: seq++,
        anchor: true,
        node: (
          <View style={styles.indent}>
            <ApprovalCard item={a} flow={flow} showPolicy={i === lastAp} />
          </View>
        ),
      });
    });
    if (logs.length > 0) {
      out.push({
        key: "done",
        // งานเสร็จ ⇒ การ์ดทำแล้วอยู่ท้ายสุด (สรุปของเลขาก่อน · แบบ A5) · ระหว่างทำ ⇒ ตามเวลาของแถวล่าสุด
        at: room?.status === "DONE" ? Number.MAX_SAFE_INTEGER - 1 : Math.max(...logs.map((l) => at(l.at))),
        order: seq++,
        node: (
          <View style={styles.indent}>
            <DoneCard
              logs={logs}
              nowMs={nowMs}
              name={name}
              ids={DONE_IDS}
              canOpen={(l) => !!entityRoute(l.entity, "")}
              onOpen={openEntity}
              onUndo={undo}
              onTeach={teach}
              onRepeat={repeat}
            />
          </View>
        ),
      });
    }
    out.sort((a, b) => a.at - b.at || a.order - b.order);
    if (room?.status === "RUNNING") {
      out.push({
        key: "bg",
        at: Number.MAX_SAFE_INTEGER,
        order: seq++,
        node: (
          <View style={styles.indent}>
            <Glass testID="sec-room-background" pad={{ v: 10, h: 14 }} radius={18} style={styles.bg}>
              <Dot status="run" />
              <Text style={[styles.bgT, { color: c.textDim }]}>{t("sec.room.background", { name })}</Text>
            </Glass>
          </View>
        ),
      });
    }
    return out;
  }, [msgs, room, approvals, logs, nowMs, name, myId, names, flow, c, t]);

  // เลื่อนครั้งแรก: มีการ์ดรออนุมัติ ⇒ ไปที่การ์ดแรก (สิ่งที่ต้องทำ) · ไม่มี ⇒ ท้ายสุด · ต่อจากนั้น = ท้ายเมื่อมีของใหม่และอยู่ใกล้ท้าย
  const scroll = useRef<ScrollView>(null);
  const firstAnchorY = useRef<number | null>(null);
  const scrolled = useRef(false);
  const nearEnd = useRef(true);
  const rowCount = useRef(0);
  const hasAnchor = rows.some((r) => r.anchor);
  const onContent = () => {
    if (!room) return;
    if (!scrolled.current) {
      // มีการ์ดรออนุมัติ ⇒ รอ onLayout ของการ์ดแรก (onAnchor) · ไม่มี ⇒ ท้ายสุด
      if (!hasAnchor) {
        scrolled.current = true;
        scroll.current?.scrollToEnd({ animated: false });
      }
    } else if (rows.length > rowCount.current && nearEnd.current) scroll.current?.scrollToEnd({ animated: true });
    rowCount.current = rows.length;
  };
  const onAnchor = (e: LayoutChangeEvent) => {
    firstAnchorY.current = e.nativeEvent.layout.y;
    if (scrolled.current) return;
    scrolled.current = true;
    scroll.current?.scrollTo({ y: Math.max(0, firstAnchorY.current - F.v(130)), animated: false });
  };

  const closed = !!room?.closed;
  const statusText = room
    ? closed
      ? t("sec.room.status.closed", { time: hhmm(room.updatedAt) })
      : t(`sec.room.status.${room.status}`, { time: hhmm(room.status === "RUNNING" ? room.createdAt : room.updatedAt) })
    : "";
  const firstAnchorKey = rows.find((r) => r.anchor)?.key;

  return (
    <AiryScreen testID="sec-room">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.bar}>
          <IconBtn testID="sec-room-back" icon="chevron-left" label={t("sec.room.back")} onPress={back} />
          <View style={styles.center}>
            <Text testID="sec-room-title" style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {room?.title ?? ""}
            </Text>
            {room ? (
              <View style={styles.statusRow}>
                <Dot status={closed ? "done" : DOT[room.status]} />
                <Text testID="sec-room-status" style={[styles.status, { color: c.textMuted }]} numberOfLines={1}>
                  {statusText}
                </Text>
              </View>
            ) : null}
          </View>
          <IconBtn
            testID="sec-room-menu"
            icon="more-horizontal"
            label={t("sec.room.menu")}
            onPress={() => {
              setMenuNote(null);
              setMenu(true);
            }}
          />
        </View>

        {gone ? (
          <Glass testID="sec-room-gone" style={styles.gone}>
            <Icon name={gone === "denied" ? "lock" : "search"} size={22} color={c.textMuted} />
            <Text style={[styles.goneT, { color: c.text }]}>{gone === "denied" ? t("sec.room.denied") : t("sec.room.notFound")}</Text>
            <Pressable testID="sec-room-gone-home" accessibilityRole="button" onPress={() => router.navigate("/secretary")} style={[styles.goneBtn, { backgroundColor: c.accent }]}>
              <Text style={[styles.goneBtnT, { color: c.onAccent }]}>{t("sec.room.toHome")}</Text>
            </Pressable>
          </Glass>
        ) : (
          <ScrollView
            ref={scroll}
            testID="sec-room-list"
            style={styles.flex}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={onContent}
            scrollEventThrottle={200}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              nearEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
            }}
          >
            {rows.map((r) => (
              <View
                key={r.key}
                onLayout={r.key === firstAnchorKey ? onAnchor : undefined}
              >
                {r.node}
              </View>
            ))}
            {offline ? <Text style={[styles.offline, { color: c.textMuted }]}>{t("sec.room.offline")}</Text> : null}
          </ScrollView>
        )}

        {flash || sendErr ? (
          <Text testID="sec-room-flash" style={[styles.flash, { color: sendErr ? c.warn.fg : c.text, backgroundColor: sendErr ? c.warn.bg : c.chip.bg }]}>
            {sendErr ?? flash}
          </Text>
        ) : null}
        {gone ? null : closed ? (
          <Text testID="sec-room-closed" style={[styles.closedNote, { color: c.textMuted }]}>
            {t("sec.room.closedNote")}
          </Text>
        ) : (
          <InputBar
            key={focusKey}
            testID="sec-room-input"
            sendTestID="sec-room-send"
            autoFocus={focusKey > 0}
            placeholder={room?.status === "DONE" ? t("sec.room.inputDone") : t("sec.room.input")}
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              if (sendErr) setSendErr(null);
            }}
            onSend={() => void send()}
            onPlus={() => setDraft("")}
            sendDisabled={!draft.trim() || sending || !room}
            style={styles.input}
          />
        )}
      </KeyboardAvoidingView>

      <Sheet visible={menu} onClose={() => setMenu(false)} testID="sec-room-menu-sheet" top={520}>
        <Text style={[styles.menuH, { color: c.text }]}>{t("sec.room.menu.title")}</Text>
        {room?.canManage && !closed ? (
          <MenuRow testID="sec-room-menu-close" icon="check-circle" label={t("sec.room.menu.close")} onPress={() => void closeRoom()} />
        ) : null}
        <MenuRow testID="sec-room-menu-members" icon="user-plus" label={t("sec.room.menu.members")} onPress={() => setMenuNote(t("sec.room.menu.membersSoon"))} />
        <MenuRow
          testID="sec-room-menu-help"
          icon="help-circle"
          label={t("sec.room.menu.help")}
          onPress={() => {
            setMenu(false);
            router.push({ pathname: "/secretary/help", params: { roomId: id } });
          }}
        />
        {menuNote ? <Text style={[styles.menuNote, { color: c.textMuted }]}>{menuNote}</Text> : null}
      </Sheet>
      {flow.sheets}
    </AiryScreen>
  );
}

function MenuRow({ testID, icon, label, onPress }: { testID: string; icon: "check-circle" | "user-plus" | "help-circle"; label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={[styles.menuRow, { borderBottomColor: c.divider }]}>
      <Icon name={icon} size={19} />
      <Text style={[styles.menuT, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 6 },
  center: { flex: 1, minWidth: 0, alignItems: "center" },
  title: { fontSize: T.h - 1, fontWeight: "700", lineHeight: 22 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  status: { fontSize: T.cap, lineHeight: 16 },
  page: { paddingHorizontal: spacing.page, paddingBottom: cardGap * 2 },
  indent: { marginLeft: ROOM_INDENT },
  bg: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: F.v(22) },
  bgT: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 19 },
  offline: { fontSize: T.cap, textAlign: "center", marginTop: spacing.lg },
  gone: { marginHorizontal: spacing.page, marginTop: F.v(60), alignItems: "center", gap: spacing.sm },
  goneT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, textAlign: "center" },
  goneBtn: { marginTop: spacing.sm, height: size.iconBtn, borderRadius: size.iconBtn / 2, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center" },
  goneBtnT: { fontSize: T.sub, fontWeight: "600" },
  flash: { marginHorizontal: spacing.page, marginBottom: spacing.sm, fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, overflow: "hidden", textAlign: "center" },
  closedNote: { fontSize: T.sub, textAlign: "center", marginHorizontal: spacing.page, marginBottom: INPUT_BOTTOM, lineHeight: 20 },
  input: { marginHorizontal: spacing.page, marginBottom: INPUT_BOTTOM },
  menuH: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26, marginBottom: 4 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: size.iconBtn + 8, borderBottomWidth: StyleSheet.hairlineWidth },
  menuT: { fontSize: T.body - 1 },
  menuNote: { fontSize: T.cap, lineHeight: 18, marginTop: spacing.md },
});
