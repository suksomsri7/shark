// ห้องงานของเลขา (ใบ S2.4 · แบบ A3/A4/A5 sec-a.jpg หน้า 3–5 · C4 sec-c.jpg หน้า 5) — 14 พ.ย. 2026: ย้ายจาก app/(app)/secretary/room/[id].tsx มาเป็นคอมโพเนนต์
//   ใช้ 2 ที่: จอห้องงาน (room/[id].tsx = <RoomView id/>) และจอเริ่มงานใหม่หลังกดส่ง (new.tsx = <RoomView id seed lead/> · แบบ Ⓑ newtask.png)
//   seed = คำสั่งที่เพิ่งส่ง (ข้อความ+ไฟล์แนบในเครื่อง) ⇒ ฟองของเรา + "{ชื่อ} กำลังดูในระบบ…" ขึ้นทันทีโดยไม่ต้องรอห้อง/ไม่มีวงหมุน ·
//     id ว่าง = ยังเปิดห้องไม่เสร็จ (ไม่โหลด · ช่องพิมพ์ปิด) · id มาแล้ว = โหลดต่อในคอมโพเนนต์เดิม (ไม่ remount ⇒ ไม่มีการเปลี่ยนหน้า/กะพริบ)
//     ซ่อน seed เมื่อข้อความของผู้ใช้จากเซิร์ฟเวอร์มาแล้ว · lead = ส่วนหัวรายการ (คำทักจางของจอเริ่มงานใหม่)
//   ปุ่ม + = แผ่นแนบ (รูปภาพ/ถ่ายรูป/ไฟล์ · SecAttach) — ไฟล์ไปกับข้อความถัดไป · ส่ง = ฟองของเรา (pending) ขึ้นทันที ล้ม = ข้อความ+ไฟล์กลับช่องพิมพ์
//   ฟองแสดงไฟล์แนบ (รูปย่อ/ชิป) · "กำลังพิมพ์" (จุด 3 จุด) ระหว่างรอคำตอบแรกของคำสั่งล่าสุด แทนแถบ "ทำงานอยู่เบื้องหลัง"
//   ข้อมูล (S1.14 · ชื่อเส้นในตาราง src/api/secretary.ts): GET secretary/rooms/[id] · secretary/rooms/[id]/messages · secretary/rooms/[id]/proposals ·
//          secretary/log?roomId · เขียน: secretary/rooms/[id]/send · secretary/rooms/[id]/close · secretary/proposals/[id]/approve|reject|edit ·
//          secretary/plans/[id]/approve|reject · secretary/log/[id]/undo
//   polling: ทุก 5 วิ ขณะงานกำลังทำ (QUEUED/RUNNING) · 15 วิ สถานะอื่น · เริ่มเมื่อจอ focus หยุดเมื่อ blur (useFocusEffect + setInterval) · ไม่มี SSE
//   ไทม์ไลน์เรียงตามเวลา: ฟอง (ผู้ใช้/เลขา/คนอื่น/ระบบ) · ขั้นของแผน (✓ ● ⏸) · การ์ดอนุมัติ (ApprovalCard = ตรรกะอนุมัติทั้งหมด) · การ์ดทำแล้ว (DoneCard)
//   แถบ "ทำงานอยู่เบื้องหลัง…" เมื่อกำลังทำ (A3) · เมนู ⋯ ปิดห้อง/เพิ่มคน/แจ้งปัญหา · สมาชิก seeHistory=false กรองที่เซิร์ฟเวอร์แล้ว
// S2.10 (D2 ห้องร่วม · sec-d.jpg หน้า 2): ฟองคนอื่น = อวตาร + ชื่อ · บทบาท (MemberBubble) · ข้อความระบบกลางห้อง · ป้ายการ์ด "รออนุมัติ · <ผู้มีสิทธิ์>" ·
//   ปุ่ม user-plus + เมนู ⋯ "เพิ่มคน" (canManage = OWNER/ผู้เปิดห้อง) → AddMemberSheet (D3)
// S2.10 (RESOLUTIONS §S): ย้อนต่อแถว + ชีตยืนยัน (canUndo ของเซิร์ฟเวอร์) · โหลดซ้อนระหว่าง poll = ตั้งธงวิ่งซ้ำ (ไม่ทิ้ง) · สำเร็จ = เอาการ์ดออกทันที ·
//   หยุด poll เมื่อแอปอยู่เบื้องหลัง (AppState) + ถอยห่างเมื่อออฟไลน์ · clientMessageId ใหม่เมื่อแก้ร่างหลังส่งล้ม + แจ้งเมื่อซ้ำ · ปิดห้องมีชีตยืนยัน · กดซ้ำกันด้วย ref
// B1 (cal-review-b): calendarCards ของผู้ดู → RoomCalCard (AGENDA = agenda ของช่วงวัน · LIST = เตือนวันนี้+ต่อไป) วางตาม createdAt
// CAL2.7 (แบบ cal-2.png จอ 5): การ์ดเตือน/นัดที่ผู้ดูสั่งในห้องนี้ (RoomDetail.reminders) วางตาม createdAt · แก้ไข = AddCalSheet โหมดแก้ ·
//   ยกเลิก = ถามยืนยัน → DELETE calendar/items/[id] · DRAFT = ฟองยืนยัน "เตือนประจำ" + ใช่ ตั้งเลย (POST confirm) / แก้เวลา
//   RoomStatus ตามเซิร์ฟเวอร์ (OPEN|RUNNING|WAITING|DONE · DONE = ปิดห้อง) · แผนของห้องที่ยัง PENDING แสดงเป็นการ์ดอนุมัติใบเดียว (ไม่ซ้ำ)
// Lekaa FAB (15 พ.ย. · แบบ fab6/fab4 จอ 3):
//   `embedded` = วาดในแผ่น Lekaa (ไม่มีพื้นจอ/safe area บน · หัว = ‹ กลับรายการ (ถ้ามี) + โลโก้ Lekaa + ชื่องาน + ⋯ + ✕ ปิดแผ่น ·
//     ทางที่พาไปจออื่น (สั่งซ้ำ/เปิดของจริง/แจ้งปัญหา/กลับหน้าแรก) ปิดแผ่นก่อนแล้วค่อยไป)
//   ไม่ embedded = จอห้องงานเดิม + ปุ่ม Lekaa ในแถวเดียวกับช่องพิมพ์ (LekaaFabSlot · แบบ team4 จอ 4)
//   หน้าที่เปิดอยู่ (RoomDetail.pageContext): ข้อความของเลขาที่ถาม (askId · สถานะ ASKED) = การ์ด CONTEXT_CONFIRM ปุ่ม "ใช่ <ป้าย>"/"ไม่ใช่"
//     (POST rooms/[id]/page-context) · ข้อความที่อ้าง (refIds) = ชิป "📍 อ้างอิง: <ป้าย>" ใต้คำตอบ
//   ถอดทางเข้า "เพิ่มคน" (ปุ่ม user-plus + เมนู) — งานของใครของมัน (เซิร์ฟเวอร์ปิดการเพิ่มด้วย) · AddMemberSheet ยังอยู่ในโค้ด (ไม่เปิด)
// 17 พ.ย. (เจ้าของเห็นบนเครื่องจริง: งานล้มแล้วห้องเงียบเป็น "รอคำสั่งเพิ่ม") ▸ RoomDetail.failed (งานล่าสุดล้ม · ไม่มีคำตอบตามมา) ⇒
//   ประกาศ "ไม่สำเร็จ" ในไทม์ไลน์แทนจุด 3 จุด (sec-room-failed · ข้อความตาม reason th/en หรือข้อความไทยของเซิร์ฟเวอร์) + ปุ่ม "ลองอีกครั้ง"
//   (sec-room-retry → POST rooms/[id]/retry {jobId} · job เดิมกลับคิว ไม่สร้างข้อความซ้ำ · เฉพาะผู้เปิดห้อง canRetry) · บรรทัดสถานะ "ไม่สำเร็จ · เวลา" ◂
// ข้อความทั้งหมดผ่าน i18n (sec.room.*) · สีจากธีม · สเกล R-UI1 (ระยะแนวตั้ง × F · ตัวอักษร tokens.type)
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Dot, Glass, Icon, IconBtn, InputBar, LoadError, Loading, Sheet, type DotStatus } from "@/src/components/airy";
import { ApprovalCard, useApprovalFlow, type ApprovalActions, type ApprovalDone, type ApprovalIds } from "@/src/components/secretary/ApprovalCard";
import { AddMemberSheet, roleLabel, type AddMemberIds } from "@/src/components/secretary/AddMemberSheet";
import { AssistantRow, Bubble, ROOM_INDENT } from "@/src/components/secretary/Bubble";
import { AttachSheet, AttachTray, localAttachments, useSecAttach, type PendingAttach } from "@/src/components/secretary/SecAttach";
import { MemberBubble, SystemMsg } from "@/src/components/secretary/MemberBubble";
import { DoneCard, type DoneIds } from "@/src/components/secretary/DoneCard";
import { StepList } from "@/src/components/secretary/StepCard";
import { ReminderCard } from "@/src/components/calendar/ReminderCard";
import { ContextConfirmCard, PageRefChip } from "@/src/components/secretary/ContextConfirm";
import { KeyboardFrame, LekaaFabSlot, LEKAA_SLOT_GAP } from "@/src/components/lekaa/core";
import { LekaaLogo } from "@/src/components/lekaa/LekaaLogo";
import { RoomCalCard } from "@/src/components/calendar/RoomCalCard";
import { ConfirmSheet } from "@/src/components/calendar/ConfirmSheet";
import { useCalSheet } from "@/src/components/calendar/AddCalSheet";
import { calApi, calChanged, onCalChanged, type CalItemDto } from "@/src/api/calendar";
import { apiErrorText } from "@/src/api/client";
import { ApiError } from "@/src/api/client";
import {
  DEFAULT_SECRETARY_NAME,
  clientMessageId,
  entityRoute,
  normalizeApprovals,
  normalizeLog,
  normalizeMessages,
  normalizeRoomDetail,
  retryPending,
  secGet,
  secGetId,
  secPostId,
  useSecretaryMe,
  type ApprovalItem,
  type LogItem,
  type MsgAttachment,
  type MsgRow,
  type RoomDetail,
  type RoomFailed,
  type RoomStatus,
} from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useLang, useT } from "@/src/i18n";
import { F, glassStyle, shadow, useTheme } from "@/src/theme/index";
import { cardGap, radii, size, spacing, type as T } from "@/src/theme/tokens";

const FAST_MS = 5_000;
const SLOW_MS = 15_000;
/** ออฟไลน์: ถอยห่างทีละ 2 เท่า สูงสุด 60 วิ (R-S2.4e) */
const MAX_BACKOFF_MS = 60_000;
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
/** ห้องร่วม D2/D3 (spec s2.10) */
const MEMBER_BUBBLE_ID = "sec-room-member-bubble";
const SYSTEM_MSG_ID = "sec-room-system-msg";
const ADD_IDS: AddMemberIds = {
  sheet: "sec-room-add-sheet",
  row: "sec-room-add-row",
  history: "sec-room-add-history",
  confirm: "sec-room-add-confirm",
  member: "sec-room-member",
  remove: "sec-room-member-remove",
  removeSheet: "sec-room-remove-confirm",
};
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

/** คำสั่งที่เพิ่งส่งจากจอเริ่มงานใหม่ — แสดงทันทีก่อนห้อง/ข้อความจากเซิร์ฟเวอร์มาถึง */
export type RoomSeed = { title: string; text: string; attachments: MsgAttachment[]; at: string };

/** วาดในแผ่น Lekaa (LekaaSheet) — onClose = ปิดแผ่น · onBack = กลับรายการงานในแผ่น (ไม่ใส่ = ไม่มีปุ่ม ‹) · title = หัวก่อนได้ห้อง (เช่น "งานใหม่") */
export type RoomEmbed = { onClose: () => void; onBack?: () => void; title?: string };

export function RoomView({ id, seed, lead, embedded }: { id: string; seed?: RoomSeed | null; lead?: ReactNode; embedded?: RoomEmbed }) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /** ไปจออื่นจากในแผ่น = ปิดแผ่นก่อน */
  const leave = useCallback(() => embedded?.onClose(), [embedded]);
  const { activeTenantId, user, tenants } = useAuth();
  const myId = user?.id ?? null;
  const myName = user?.name?.trim().split(/\s+/)[0] ?? "";
  const tenantName = tenants.find((x) => x.tenantId === activeTenantId)?.name ?? t("sec.tenant.fallback");
  const name = useSecretaryMe()?.name ?? DEFAULT_SECRETARY_NAME;
  const lang = useLang();
  /** 17 พ.ย. ▸ ชื่อในข้อความอังกฤษ: ชื่อปริยาย "เลขา" ⇒ "Lekaa" (กติกาชื่อ) */
  const nameEn = lang === "en" && name === DEFAULT_SECRETARY_NAME ? "Lekaa" : name;

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [msgs, setMsgs] = useState<MsgRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [gone, setGone] = useState<Gone>(null);
  const [offline, setOffline] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [focused, setFocused] = useState(false);
  // CAL2.7 การ์ดเตือนในห้อง (จอ 5)
  const calSheet = useCalSheet();
  const [remAsk, setRemAsk] = useState<CalItemDto | null>(null);
  const [remBusy, setRemBusy] = useState<string | null>(null);
  const [remNote, setRemNote] = useState<string | null>(null);
  const [active, setActive] = useState(() => AppState.currentState !== "background");
  const [draft, setDraft] = useState("");
  /** ฟองของเราที่กำลังส่ง (ข้อความ+ไฟล์) — ออกเมื่อโหลดรอบถัดไปเสร็จ · ล้ม = ออกทันที */
  const [pendingMsg, setPendingMsg] = useState<MsgRow | null>(null);
  /** รหัสข้อความของผู้ใช้ที่มีอยู่ตอนกดส่ง — ข้อความใหม่ที่เนื้อความตรงกันมาถึง = ฟอง pending ออก (ไม่กะพริบ) */
  const pendingBase = useRef<Set<string>>(new Set());
  const [attachOpen, setAttachOpen] = useState(false);
  const attach = useSecAttach();
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [menu, setMenu] = useState(false);
  const [menuNote, setMenuNote] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [undoAsk, setUndoAsk] = useState<LogItem | null>(null);
  const [undoBusyId, setUndoBusyId] = useState<string | null>(null);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  // Lekaa FAB ▸ คำตอบการ์ด "หมายถึงหน้านี้ใช่ไหม"
  const [ctxBusy, setCtxBusy] = useState(false);
  const [ctxNote, setCtxNote] = useState<string | null>(null);
  // 17 พ.ย. ▸ ปุ่ม "ลองอีกครั้ง" ของงานที่ล้ม
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryErr, setRetryErr] = useState<string | null>(null);
  const tenantRef = useRef(activeTenantId);
  const inflight = useRef(false);
  /** มีการกระทำระหว่างที่ poll วิ่งอยู่ ⇒ ผลของรอบนั้นเก่า ให้วิ่งซ้ำ (R-S2.4b) */
  const rerun = useRef(false);
  const failCount = useRef(0);
  const cmid = useRef<string | null>(null);
  /** ข้อความที่ส่งล้มด้วย cmid ปัจจุบัน — แก้ร่างแล้ว = รหัสใหม่ (R-S2.4e) */
  const failedText = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const actRef = useRef(false);

  // กิจการ/ห้องเปลี่ยน ⇒ ล้างของเดิมทันที (ไม่โชว์ของร้านก่อนหน้า)
  useEffect(() => {
    tenantRef.current = activeTenantId;
    setRoom(null);
    setMsgs([]);
    setApprovals([]);
    setLogs([]);
    setGone(null);
    setPendingMsg(null);
  }, [activeTenantId, id]);

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    if (!tenant || !id) return;
    if (inflight.current) {
      rerun.current = true; // ไม่ทิ้ง: รอบที่วิ่งอยู่จบแล้วโหลดใหม่อีกรอบ
      return;
    }
    inflight.current = true;
    try {
      do {
        rerun.current = false;
        const [r, m, p, l] = await Promise.allSettled([
          secGetId("secretary/rooms/[id]", id),
          secGetId("secretary/rooms/[id]/messages", id, { take: 100 }),
          secGetId("secretary/rooms/[id]/proposals", id),
          secGet("secretary/log", { roomId: id, take: 50 }),
        ]);
        if (tenantRef.current !== tenant) return;
        if (rerun.current) continue; // มีการกระทำระหว่างรอ ⇒ ผลนี้เก่า
        if (r.status === "rejected") {
          const e = r.reason;
          if (e instanceof ApiError && e.status === 404) setGone("notFound");
          else if (e instanceof ApiError && e.status === 403) setGone("denied");
          else {
            setOffline(true);
            failCount.current = Math.min(failCount.current + 1, 8);
          }
          return;
        }
        const now = Date.now();
        failCount.current = 0;
        setGone(null);
        setOffline(false);
        setRoom(normalizeRoomDetail(r.value));
        if (m.status === "fulfilled") setMsgs(normalizeMessages(m.value));
        if (p.status === "fulfilled") setApprovals(normalizeApprovals(p.value));
        if (l.status === "fulfilled") setLogs(normalizeLog(l.value, now));
        setNowMs(now);
      } while (rerun.current);
    } finally {
      inflight.current = false;
    }
  }, [activeTenantId, id]);

  const loadRef = useRef(load);
  loadRef.current = load;
  // แผ่นเพิ่ม/แก้เตือนบันทึกแล้ว ⇒ การ์ดในห้องอัปเดต
  useEffect(() => onCalChanged(() => void loadRef.current()), []);
  const remAct = useCallback(async (it: CalItemDto, kind: "confirm" | "cancel") => {
    setRemBusy(it.id);
    setRemNote(null);
    try {
      if (kind === "confirm") await calApi.confirm(it.id);
      else await calApi.remove(it.id);
      calChanged();
    } catch (e) {
      setRemNote(apiErrorText(e));
    } finally {
      setRemBusy(null);
      void loadRef.current();
    }
  }, []);

  // โหลดทุกครั้งที่จอได้ focus · polling เฉพาะตอนจออยู่และแอปอยู่หน้า (5 วิ ขณะทำงาน · 15 วิ อื่น ๆ · ออฟไลน์ถอยห่าง) · blur/เบื้องหลัง = หยุด
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void load();
      return () => setFocused(false);
    }, [load]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      const on = s === "active";
      setActive(on);
      if (on) void loadRef.current(); // กลับมาหน้าแอป ⇒ สดทันที
    });
    return () => sub.remove();
  }, []);
  const working = sending || room?.status === "RUNNING";
  useEffect(() => {
    if (!focused || !active) return;
    let h: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    const tick = () => {
      const base = working ? FAST_MS : SLOW_MS;
      const wait = failCount.current > 0 ? Math.min(base * 2 ** failCount.current, MAX_BACKOFF_MS) : base;
      h = setTimeout(() => {
        void loadRef.current().finally(() => live && tick());
      }, wait);
    };
    tick();
    return () => {
      live = false;
      if (h) clearTimeout(h);
    };
  }, [focused, active, working]);

  // ───────── การกระทำ (ชื่อเส้นในตาราง PATH ของ src/api/secretary.ts) ─────────
  const actions: ApprovalActions = useMemo(
    () => ({
      approve: (item, confirm2x) =>
        item.type === "plan"
          ? secPostId("secretary/plans/[id]/approve", item.id, confirm2x ? { confirm2x: true } : {})
          : secPostId("secretary/proposals/[id]/approve", item.id, confirm2x ? { confirm2x: true } : {}),
      reject: (item, body) => (item.type === "plan" ? secPostId("secretary/plans/[id]/reject", item.id, {}) : secPostId("secretary/proposals/[id]/reject", item.id, body)),
      edit: (item, patch) => secPostId("secretary/proposals/[id]/edit", item.id, { patch }),
    }),
    [],
  );
  // สำเร็จ ⇒ การ์ดออกทันที แล้วโหลดใหม่ · ไม่ผ่าน/หมดอายุ ⇒ โหลดใหม่ทันที (R-S2.4b)
  const onDone: ApprovalDone = useCallback(
    (item, removed) => {
      if (removed) setApprovals((list) => list.filter((a) => a.id !== item.id));
      void load();
    },
    [load],
  );
  const flow = useApprovalFlow({ actions, onDone, name, ids: AP_IDS });
  const { flash, setFlash, clearFlash } = flow;
  useEffect(() => {
    if (!flash) return;
    const h = setTimeout(clearFlash, flash.warn ? 10_000 : 4000);
    return () => clearTimeout(h);
  }, [flash, clearFlash]);

  const undo = async () => {
    const l = undoAsk;
    if (!l || actRef.current) return;
    actRef.current = true;
    setUndoBusyId(l.id);
    setUndoNote(null);
    try {
      const r = await secPostId("secretary/log/[id]/undo", l.id, {});
      setUndoNote(r.note || (r.ok ? t("sec.room.done.undoOk") : t("sec.room.ap.err")));
    } catch (e) {
      setUndoNote(e instanceof ApiError && e.detail ? e.detail : t("sec.room.ap.err"));
    } finally {
      actRef.current = false;
      setUndoBusyId(null);
      setUndoAsk(null);
      void load();
    }
  };

  const send = async () => {
    const typed = draft.trim();
    const hasFiles = attach.items.length > 0;
    if ((!typed && !hasFiles) || !attach.ready || sendingRef.current || !room || room.closed) return;
    // ไฟล์อย่างเดียว ⇒ คำสั่งปริยาย "ช่วยดูไฟล์ที่แนบมาให้หน่อย" (เซิร์ฟเวอร์ต้องมีข้อความเสมอ)
    const text = typed || t("sec.attach.defaultText");
    const files: PendingAttach[] = attach.take();
    const refs = attach.refs(files);
    sendingRef.current = true;
    setSending(true);
    setSendErr(null);
    // ฟองของเราขึ้นทันที + ช่องพิมพ์ว่าง (ล้ม = คืนข้อความ/ไฟล์)
    pendingBase.current = new Set(msgs.filter((m) => m.role === "user").map((m) => m.id));
    setPendingMsg({ id: "pending", role: "user", content: text, authorId: myId, at: new Date().toISOString(), attachments: localAttachments(files), pending: true });
    setDraft("");
    // ส่งซ้ำข้อความเดิมหลังเน็ตหลุด = รหัสเดิม (เซิร์ฟเวอร์กันซ้ำ 24 ชม.) · แก้ร่างแล้ว = รหัสใหม่
    const sig = `${text}|${refs.map((r) => r.id).join(",")}`;
    if (failedText.current !== null && failedText.current !== sig) cmid.current = null;
    cmid.current = cmid.current ?? clientMessageId();
    try {
      const cm = cmid.current;
      // R-Z30: ข้อความเดิมครั้งแรกยังทำไม่เสร็จ (409 pending) ⇒ รอแล้วลองใหม่เงียบ ๆ ด้วยรหัสเดิม ≤ 3 ครั้ง
      const r = await retryPending(() => secPostId("secretary/rooms/[id]/send", id, { text, clientMessageId: cm, ...(refs.length ? { attachments: refs } : {}) }));
      cmid.current = null;
      failedText.current = null;
      if (r.duplicate) setFlash(t("sec.room.dup"));
      else setRoom((x) => (x ? { ...x, status: "RUNNING", rawStatus: "RUNNING", failed: null } : x));
      if (r.duplicate) setPendingMsg(null);
      void load();
    } catch (e) {
      failedText.current = sig;
      setPendingMsg(null);
      setDraft((d) => d || typed);
      attach.restore(files);
      setSendErr(e instanceof ApiError && e.detail ? e.detail : t("sec.room.sendErr"));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const closeRoom = async () => {
    if (actRef.current) return;
    actRef.current = true;
    try {
      await secPostId("secretary/rooms/[id]/close", id, {});
      setConfirmClose(false);
      setFlash(t("sec.room.menu.closed"));
      void load();
    } catch (e) {
      setConfirmClose(false);
      setMenu(true);
      setMenuNote(e instanceof ApiError && e.detail ? e.detail : t("sec.room.ap.err"));
    } finally {
      actRef.current = false;
    }
  };

  const back = () => {
    if (embedded) return (embedded.onBack ?? embedded.onClose)();
    if (router.canGoBack()) router.back();
    else router.navigate("/secretary");
  };

  // Lekaa FAB ▸ ตอบการ์ด CONTEXT_CONFIRM — เซิร์ฟเวอร์ส่งข้อความ "ใช่ …"/"ไม่ใช่" + งานต่อให้เอง
  const answerCtx = async (yes: boolean) => {
    if (ctxBusy || actRef.current) return;
    actRef.current = true;
    setCtxBusy(true);
    setCtxNote(null);
    try {
      await secPostId("secretary/rooms/[id]/page-context", id, { answer: yes ? "yes" : "no" });
      setRoom((x) => (x ? { ...x, status: "RUNNING", rawStatus: "RUNNING", pageContext: x.pageContext ? { ...x.pageContext, state: yes ? "CONFIRMED" : "REJECTED" } : null } : x));
    } catch (e) {
      setCtxNote(e instanceof ApiError && e.detail ? e.detail : t("sec.ctx.err"));
    } finally {
      actRef.current = false;
      setCtxBusy(false);
      void load();
    }
  };

  // 17 พ.ย. ▸ ลองอีกครั้ง: job เดิมกลับคิว (เซิร์ฟเวอร์ตรวจผู้เปิดห้อง/ห้องปิด/เพดานถี่) — สำเร็จ = จุด 3 จุดทันที · ไม่ผ่าน = ข้อความใต้ปุ่ม
  //   (ไม่อ่าน event ใน callback — ปุ่มไม่ส่งอะไรมา) ◂
  const retry = async () => {
    const f = room?.failed;
    if (!f || retryBusy || actRef.current) return;
    actRef.current = true;
    setRetryBusy(true);
    setRetryErr(null);
    try {
      await secPostId("secretary/rooms/[id]/retry", id, { jobId: f.jobId });
      setRoom((x) => (x ? { ...x, failed: null, status: "RUNNING", rawStatus: "RUNNING" } : x));
    } catch (e) {
      setRetryErr(e instanceof ApiError && e.detail ? e.detail : t("sec.room.failed.retryErr"));
    } finally {
      actRef.current = false;
      setRetryBusy(false);
      void load();
    }
  };

  const teach = () => {
    setDraft(t("sec.room.teachPrefix"));
    setFocusKey((k) => k + 1);
  };
  const instruction = msgs.find((m) => m.role === "user")?.content ?? room?.title ?? "";
  const repeat = () => {
    leave();
    router.push({ pathname: "/secretary/new", params: { q: instruction } });
  };
  const openEntity = (l: LogItem) => {
    const r = entityRoute(l.entity, String(Date.now()));
    if (!r) return;
    leave();
    router.push(r);
  };

  // ───────── ห้องร่วม (D2) ─────────
  const members = room?.members ?? [];
  const shared = members.length > 0;
  const people = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const closed = !!room?.closed;
  // Lekaa FAB (เจ้าของสั่ง "งานของใครของมัน"): ไม่มีทางเข้า "เพิ่มคน" แล้ว — เซิร์ฟเวอร์ปิดการเพิ่มด้วย (สมาชิกเดิมยังเห็นห้อง)
  const canAdd = false;
  /** ผู้มีสิทธิ์อนุมัติในห้องร่วม: เรา (ถ้าเซิร์ฟเวอร์บอก canApprove) + สมาชิกเจ้าของ/ผู้จัดการ */
  const approverOf = useCallback(
    (a: ApprovalItem): string | null => {
      if (!shared) return null;
      const names = [...(a.canApprove && myName ? [myName] : []), ...members.filter((m) => (m.role === "OWNER" || m.role === "MANAGER") && m.userId !== myId && m.name).map((m) => m.name as string)];
      return names.length ? Array.from(new Set(names)).slice(0, 2).join(", ") : null;
    },
    [shared, members, myName, myId],
  );

  // ───────── ไทม์ไลน์ ─────────
  useEffect(() => {
    if (!pendingMsg) return;
    if (msgs.some((m) => m.role === "user" && !pendingBase.current.has(m.id) && m.content.trim() === pendingMsg.content.trim())) setPendingMsg(null);
  }, [msgs, pendingMsg]);
  // seed แสดงจนกว่าข้อความของผู้ใช้จากเซิร์ฟเวอร์จะมา (ไม่มีช่วงว่าง/วงหมุนระหว่างเปิดห้อง)
  const seedPhase = !!seed && !msgs.some((m) => m.role === "user");
  const shown = useMemo<MsgRow[]>(() => {
    const extra: MsgRow[] = [];
    if (seed && seedPhase) extra.push({ id: "seed", role: "user", content: seed.text, authorId: myId, at: seed.at, attachments: seed.attachments, pending: true });
    if (pendingMsg) extra.push(pendingMsg);
    return extra.length ? [...msgs, ...extra] : msgs;
  }, [msgs, seed, seedPhase, pendingMsg, myId]);
  // รอคำตอบของคำสั่งล่าสุด (ข้อความสุดท้ายเป็นของผู้ใช้ + กำลังทำ/เพิ่งส่ง) ⇒ จุด 3 จุดแทนแถบเบื้องหลัง
  const lastRole = shown.filter((m) => m.role !== "system").slice(-1)[0]?.role;
  // 17 พ.ย. ▸ งานล่าสุดล้ม (ห้องยังเปิด · ไม่ได้กำลังส่งใหม่) ⇒ ประกาศแทนจุด 3 จุด
  const failed: RoomFailed | null = room && !room.closed && !pendingMsg && !sending && room.status !== "RUNNING" ? room.failed : null;
  const typing = !failed && lastRole === "user" && (seedPhase || !!pendingMsg || room?.status === "RUNNING");

  const pc = room?.pageContext ?? null;
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let seq = 0;
    const at = (iso: string) => {
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? ms : 0;
    };
    for (const m of shown) {
      const mine = m.role === "user" && (!m.authorId || m.authorId === myId);
      let node: ReactNode;
      if (m.role === "system") node = <SystemMsg msg={m} time={hhmm(m.at)} testID={SYSTEM_MSG_ID} />;
      else if (m.role === "user" && !mine) {
        const who = people.get(m.authorId ?? "");
        node = <MemberBubble msg={m} name={who?.name ?? t("sec.room.someone")} role={who?.role ? roleLabel(t, who.role) : null} testID={MEMBER_BUBBLE_ID} />;
      } else if (m.role === "assistant" && pc && pc.state === "ASKED" && pc.askId === m.id) {
        node = <ContextConfirmCard text={m.content} label={pc.label} entityType={pc.entityType} busy={ctxBusy} note={ctxNote} onAnswer={(yes) => void answerCtx(yes)} />;
      } else {
        const ref = m.role === "assistant" && pc && pc.refIds.includes(m.id) ? <PageRefChip label={pc.label} /> : undefined;
        node = <Bubble msg={m} mine={mine} authorName={null} testID="sec-room-bubble" footer={ref} />;
      }
      // ฟองที่กำลังส่ง = ท้ายสุดเสมอ (เวลาเครื่องอาจเหลื่อมกับเซิร์ฟเวอร์)
      out.push({ key: `m-${m.id}`, at: m.pending ? Number.MAX_SAFE_INTEGER - 2 : at(m.at), order: seq++, node });
    }
    const pendingIds = new Set(approvals.map((a) => a.id));
    for (const p of room?.plans ?? []) {
      if (pendingIds.has(p.id) || p.pending) continue; // แผน PENDING = การ์ดอนุมัติอยู่แล้ว
      out.push({ key: `p-${p.id}`, at: at(p.at), order: seq++, node: <View style={styles.indent}><StepList steps={p.steps} testID="sec-room-steps" stepTestID="sec-room-step" /></View> });
    }
    for (const r of room?.reminders ?? []) {
      out.push({
        key: `cal-${r.id}`,
        at: at(r.createdAt),
        order: seq++,
        node: (
          <View style={styles.indent}>
            <ReminderCard item={r} busy={remBusy === r.id} onEdit={(x) => calSheet?.openEdit(x)} onCancel={setRemAsk} onConfirm={(x) => void remAct(x, "confirm")} />
          </View>
        ),
      });
    }
    // B1: การ์ดปฏิทิน/รายการเตือนของผู้ดู (เซิร์ฟเวอร์ส่งเฉพาะของผู้เรียก) — แอปดึงรายละเอียดเอง
    for (const cc of room?.calendarCards ?? []) {
      out.push({ key: `calc-${cc.id}`, at: at(cc.createdAt), order: seq++, node: <View style={styles.indent}><RoomCalCard card={cc} /></View> });
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
            <ApprovalCard item={a} flow={flow} showPolicy={i === lastAp} approver={approverOf(a)} />
          </View>
        ),
      });
    });
    if (logs.length > 0) {
      const settled = room?.status === "OPEN" || room?.status === "DONE";
      out.push({
        key: "done",
        // งานจบแล้ว (OPEN = เสร็จแต่ยังไม่ปิด · DONE = ปิดห้อง) ⇒ การ์ดทำแล้วอยู่ท้ายสุด (สรุปของเลขาก่อน · แบบ A5) · ระหว่างทำ ⇒ ตามเวลาของแถวล่าสุด
        at: settled ? Number.MAX_SAFE_INTEGER - 1 : Math.max(...logs.map((l) => at(l.at))),
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
              onAskUndo={(l) => {
                setUndoNote(null);
                setUndoAsk(l);
              }}
              undoBusyId={undoBusyId}
              undoNote={undoNote}
              onTeach={teach}
              onRepeat={repeat}
            />
          </View>
        ),
      });
    }
    out.sort((a, b) => a.at - b.at || a.order - b.order);
    if (failed) {
      const body = failed.reason === "ai_unavailable" ? t("sec.room.failed.ai_unavailable") : failed.reason === "gave_up" ? t("sec.room.failed.gave_up", { name: nameEn }) : failed.error || t("sec.room.failed.retryErr");
      out.push({
        key: "failed",
        at: Number.MAX_SAFE_INTEGER,
        order: seq++,
        node: (
          <FailedNotice
            title={t("sec.room.failed.title", { name: nameEn })}
            body={body}
            canRetry={failed.canRetry}
            busy={retryBusy}
            note={retryErr ?? (failed.canRetry ? null : t("sec.room.failed.ownerOnly"))}
            retryLabel={t("sec.room.failed.retry")}
            onRetry={() => void retry()}
          />
        ),
      });
    } else if (typing) {
      out.push({
        key: "typing",
        at: Number.MAX_SAFE_INTEGER,
        order: seq++,
        node: <TypingRow testID="sec-room-typing" label={t("sec.new.working", { name })} />,
      });
    } else if (room?.status === "RUNNING") {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, typing, failed, retryBusy, retryErr, nameEn, room, approvals, logs, nowMs, name, myId, people, flow, approverOf, undoBusyId, undoNote, c, t, remBusy, calSheet, remAct, pc, ctxBusy, ctxNote]);

  // เลื่อนครั้งแรก: มีการ์ดรออนุมัติ ⇒ ไปที่การ์ดแรก (สิ่งที่ต้องทำ) · ไม่มี ⇒ ท้ายสุด · ต่อจากนั้น = ท้ายเมื่อมีของใหม่และอยู่ใกล้ท้าย
  const scroll = useRef<ScrollView>(null);
  const firstAnchorY = useRef<number | null>(null);
  const scrolled = useRef(false);
  const nearEnd = useRef(true);
  const rowCount = useRef(0);
  const hasAnchor = rows.some((r) => r.anchor);
  const onContent = () => {
    if (!room && !seed) return;
    if (!scrolled.current) {
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

  // 17 พ.ย. ▸ งานล่าสุดล้ม ⇒ "ไม่สำเร็จ · เวลา" (ไม่ใช่ "รอคำสั่งเพิ่ม")
  const baseStatus = room ? (failed ? t("sec.room.status.FAILED", { time: hhmm(failed.at || room.updatedAt) }) : t(`sec.room.status.${room.status}`, { time: hhmm(room.status === "RUNNING" ? room.createdAt : room.updatedAt) })) : "";
  const statusText = room
    ? closed
      ? t("sec.room.status.closed", { time: hhmm(room.updatedAt) })
      : shared
        ? t("sec.room.status.shared", { status: baseStatus, n: members.length + 1 })
        : baseStatus
    : "";
  const firstAnchorKey = rows.find((r) => r.anchor)?.key;
  const flashText = sendErr ?? flash?.text ?? null;
  const flashWarn = !!sendErr || !!flash?.warn;

  const body = (
      <KeyboardFrame inSheet={!!embedded} bottomInset={insets.bottom} style={styles.flex}>
        {embedded ? (
          <View style={styles.ebar}>
            {embedded.onBack ? <IconBtn testID="sec-room-back" icon="chevron-left" label={t("lekaa.back")} onPress={back} /> : null}
            <View style={[styles.elogo, { backgroundColor: c.lekaa.fabBg }, shadow(c.lekaa.logoRing)]}>
              <LekaaLogo size={22} />
            </View>
            <View style={styles.ecenter}>
              <Text testID="sec-room-title" style={[styles.etitle, { color: c.text }]} numberOfLines={1}>
                {room?.title ?? (seed && embedded.title ? embedded.title : seed?.title) ?? embedded.title ?? ""}
              </Text>
              <Text testID="sec-room-status" style={[styles.status, { color: c.textMuted }]} numberOfLines={1}>
                {room ? statusText : tenantName}
              </Text>
            </View>
            {room ? (
              <IconBtn
                testID="sec-room-menu"
                icon="more-horizontal"
                label={t("sec.room.menu")}
                onPress={() => {
                  setMenuNote(null);
                  setMenu(true);
                }}
              />
            ) : null}
            <Pressable testID="lekaa-sheet-close" accessibilityRole="button" accessibilityLabel={t("lekaa.close")} onPress={embedded.onClose} style={[styles.ex, { backgroundColor: c.chip.bg }]}>
              <Icon name="x" size={17} color={c.text} />
            </Pressable>
          </View>
        ) : (
        <View style={styles.bar}>
          <IconBtn testID="sec-room-back" icon="chevron-left" label={t("sec.room.back")} onPress={back} />
          <View style={styles.center}>
            <Text testID="sec-room-title" style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {room?.title ?? seed?.title ?? ""}
            </Text>
            {!room && seed ? (
              <View style={styles.statusRow}>
                <Dot status="run" />
                <Text testID="sec-room-status" style={[styles.status, { color: c.textMuted }]} numberOfLines={1}>
                  {`${tenantName} · ${t("sec.room.status.RUNNING", { time: hhmm(seed.at) })}`}
                </Text>
              </View>
            ) : null}
            {room ? (
              <View style={styles.statusRow}>
                <Dot status={closed ? "done" : failed ? "fail" : DOT[room.status]} />
                <Text testID="sec-room-status" style={[styles.status, { color: c.textMuted }]} numberOfLines={1}>
                  {statusText}
                </Text>
              </View>
            ) : null}
          </View>
          {canAdd ? <IconBtn testID="sec-room-add-member" icon="user-plus" label={t("sec.room.menu.members")} onPress={() => setAddOpen(true)} /> : null}
          {room ? (
          <IconBtn
            testID="sec-room-menu"
            icon="more-horizontal"
            label={t("sec.room.menu")}
            onPress={() => {
              setMenuNote(null);
              setMenu(true);
            }}
          />
          ) : (
            <View style={styles.spacer} />
          )}
        </View>
        )}

        {gone ? (
          <Glass testID="sec-room-gone" style={styles.gone}>
            <Icon name={gone === "denied" ? "lock" : "search"} size={22} color={c.textMuted} />
            <Text style={[styles.goneT, { color: c.text }]}>{gone === "denied" ? t("sec.room.denied") : t("sec.room.notFound")}</Text>
            <Pressable testID="sec-room-gone-home" accessibilityRole="button" onPress={() => (embedded ? back() : router.navigate("/secretary"))} style={[styles.goneBtn, { backgroundColor: c.accent }]}>
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
            {lead}
            {rows.map((r) => (
              <View key={r.key} onLayout={r.key === firstAnchorKey ? onAnchor : undefined}>
                {r.node}
              </View>
            ))}
            {/* S2.14: ยังไม่ได้ห้อง = Loading · ล้มก่อนได้ห้อง = LoadError (poll ต่อเองด้วย) */}
            {room || (seed && !offline) ? null : offline ? <LoadError testID="sec-room-error" onRetry={() => void load()} /> : <Loading testID="sec-room-loading" />}
            {offline && room ? <Text style={[styles.offline, { color: c.textMuted }]}>{t("sec.room.offline")}</Text> : null}
          </ScrollView>
        )}

        {flashText ? (
          <Text testID="sec-room-flash" style={[styles.flash, { color: flashWarn ? c.warn.fg : c.text, backgroundColor: flashWarn ? c.warn.bg : c.chip.bg }]}>
            {flashText}
          </Text>
        ) : null}
        {gone ? null : closed ? (
          <Text testID="sec-room-closed" style={[styles.closedNote, { color: c.textMuted }]}>
            {t("sec.room.closedNote")}
          </Text>
        ) : (
          <>
          <AttachTray items={attach.items} note={attach.note} onRemove={attach.remove} testID="sec-room-attach" />
          <View style={styles.inputRow}>
          <InputBar
            key={focusKey}
            testID="sec-room-input"
            sendTestID="sec-room-send"
            autoFocus={focusKey > 0}
            placeholder={room?.status === "OPEN" && logs.length > 0 ? t("sec.room.inputDone") : t("sec.room.input")}
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              if (sendErr) setSendErr(null);
            }}
            onSend={() => void send()}
            onPlus={() => setAttachOpen(true)}
            plusDisabled={!room}
            sendDisabled={(!draft.trim() && attach.items.length === 0) || !attach.ready || sending || !room}
            style={styles.flex}
          />
          {/* Lekaa FAB ▸ ปุ่ม Lekaa แถวเดียวกับช่องพิมพ์ (ในแผ่น Lekaa ไม่มี — แผ่นเปิดอยู่แล้ว) */}
          {embedded ? null : <LekaaFabSlot />}
          </View>
          </>
        )}
      </KeyboardFrame>
  );

  return (
    <Frame embedded={!!embedded} bottom={insets.bottom}>
      {body}

      <Sheet visible={menu} onClose={() => setMenu(false)} testID="sec-room-menu-sheet" top={520}>
        <Text style={[styles.menuH, { color: c.text }]}>{t("sec.room.menu.title")}</Text>
        {room?.canManage && !closed ? (
          <MenuRow
            testID="sec-room-menu-close"
            icon="check-circle"
            label={t("sec.room.menu.close")}
            onPress={() => {
              setMenu(false);
              setConfirmClose(true);
            }}
          />
        ) : null}
        {canAdd ? (
          <MenuRow
            testID="sec-room-menu-members"
            icon="user-plus"
            label={t("sec.room.menu.members")}
            onPress={() => {
              setMenu(false);
              setAddOpen(true);
            }}
          />
        ) : null}
        <MenuRow
          testID="sec-room-menu-help"
          icon="help-circle"
          label={t("sec.room.menu.help")}
          onPress={() => {
            setMenu(false);
            leave();
            router.push({ pathname: "/secretary/help", params: { roomId: id } });
          }}
        />
        {menuNote ? <Text style={[styles.menuNote, { color: c.textMuted }]}>{menuNote}</Text> : null}
      </Sheet>

      <ConfirmSheet
        testID="cal-rc-ask"
        visible={!!remAsk}
        title={t("cal.rc.cancelAsk")}
        body={remAsk?.title}
        yes={t("cal.rc.cancel")}
        no={t("cal.g.keep")}
        onClose={() => setRemAsk(null)}
        onYes={() => {
          const it = remAsk;
          setRemAsk(null);
          if (it) void remAct(it, "cancel");
        }}
      />
      {remNote ? (
        <Pressable testID="cal-rc-note" onPress={() => setRemNote(null)} style={[glassStyle(c, 16), styles.remNote]}>
          <Text style={{ color: c.bad.fg, fontSize: 13 }}>{remNote}</Text>
        </Pressable>
      ) : null}

      <Sheet visible={confirmClose} onClose={() => setConfirmClose(false)} testID="sec-room-close-confirm" top={500}>
        <Text style={[styles.menuH, { color: c.text }]}>{t("sec.room.close.title")}</Text>
        <Text style={[styles.sheetB, { color: c.textMuted }]}>{t("sec.room.close.body", { title: room?.title ?? "" })}</Text>
        <View style={styles.acts}>
          <Pressable testID="sec-room-close-confirm-cancel" accessibilityRole="button" onPress={() => setConfirmClose(false)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("sec.room.c2.cancel")}</Text>
          </Pressable>
          <Pressable testID="sec-room-close-confirm-ok" accessibilityRole="button" onPress={() => void closeRoom()} style={[styles.btn, styles.main, { backgroundColor: c.accent }]}>
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.room.close.ok")}</Text>
          </Pressable>
        </View>
      </Sheet>

      <Sheet visible={!!undoAsk} onClose={undoBusyId ? undefined : () => setUndoAsk(null)} testID="sec-room-undo-confirm" top={480}>
        <Text style={[styles.menuH, { color: c.text }]}>{t("sec.room.undo.title")}</Text>
        <Text style={[styles.sheetB, { color: c.textMuted }]}>{t("sec.room.undo.body")}</Text>
        {undoAsk ? (
          <Text testID="sec-room-undo-confirm-item" style={[styles.undoItem, { color: c.text, backgroundColor: c.chip.bg }]} numberOfLines={4}>
            {undoAsk.summary}
          </Text>
        ) : null}
        <View style={styles.acts}>
          <Pressable testID="sec-room-undo-confirm-cancel" accessibilityRole="button" disabled={!!undoBusyId} onPress={() => setUndoAsk(null)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("sec.room.c2.cancel")}</Text>
          </Pressable>
          <Pressable testID="sec-room-undo-confirm-ok" accessibilityRole="button" disabled={!!undoBusyId} onPress={() => void undo()} style={[styles.btn, styles.main, { backgroundColor: c.accent }]}>
            <Text style={[styles.btnT, { color: c.onAccent }]}>{t("sec.room.undo.ok")}</Text>
          </Pressable>
        </View>
      </Sheet>

      {room ? (
        <AddMemberSheet
          visible={addOpen}
          roomId={id}
          members={members}
          exclude={[room.startedById, ...(myId ? [myId] : [])]}
          canManage={canAdd}
          tenantName={tenantName}
          secretaryName={name}
          ids={ADD_IDS}
          onClose={() => setAddOpen(false)}
          onChanged={() => void load()}
        />
      ) : null}
      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onPick={(k) => void attach.pick(k)} name={name} testID="sec-room-attach-sheet" />
      {flow.sheets}
    </Frame>
  );
}

/** กรอบของห้อง: จอเต็ม (AiryScreen) หรือในแผ่น Lekaa (ไม่มีพื้นจอ/safe area บน · เว้นล่างตาม safe area) */
function Frame({ embedded, bottom, children }: { embedded: boolean; bottom: number; children?: ReactNode }) {
  if (!embedded) return <AiryScreen testID="sec-room">{children}</AiryScreen>;
  return (
    <View testID="sec-room" style={[styles.flex, { paddingBottom: bottom }]}>
      {children}
    </View>
  );
}

/** 17 พ.ย. ▸ ประกาศงานไม่สำเร็จในไทม์ไลน์ (แทนจุด 3 จุด) — ไอคอนแดง + หัว + ข้อความ + ปุ่ม "ลองอีกครั้ง" (เฉพาะผู้เปิดห้อง) + ข้อความใต้ปุ่ม */
function FailedNotice({ title, body, canRetry, busy, note, retryLabel, onRetry }: { title: string; body: string; canRetry: boolean; busy: boolean; note: string | null; retryLabel: string; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.indent}>
      <Glass testID="sec-room-failed" pad={{ v: 14, h: 16 }} radius={18} style={styles.failBox}>
        <View style={styles.failHead}>
          <Icon name="alert-circle" size={18} color={c.bad.fg} />
          <Text style={[styles.failT, { color: c.text }]}>{title}</Text>
        </View>
        <Text testID="sec-room-failed-text" style={[styles.failB, { color: c.textDim }]}>
          {body}
        </Text>
        {canRetry ? (
          <Pressable
            testID="sec-room-retry"
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={onRetry}
            style={[styles.failBtn, { backgroundColor: c.accent }, busy && styles.failBusy]}
          >
            <Icon name="refresh-cw" size={15} color={c.onAccent} />
            <Text style={[styles.failBtnT, { color: c.onAccent }]}>{retryLabel}</Text>
          </Pressable>
        ) : null}
        {note ? (
          <Text testID="sec-room-failed-note" style={[styles.failNote, { color: c.textMuted }]}>
            {note}
          </Text>
        ) : null}
      </Glass>
    </View>
  );
}

/** เลขากำลังทำงาน (แบบ Ⓑ): ลูกแก้ว + ฟองจุด 3 จุด + บรรทัดสถานะ */
function TypingRow({ testID, label }: { testID: string; label: string }) {
  const { c } = useTheme();
  return (
    <AssistantRow testID={testID}>
      <View style={[glassStyle(c, 18), styles.dots]}>
        {[0.9, 0.6, 0.35].map((o, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: c.textMuted, opacity: o }]} />
        ))}
      </View>
      <Text style={[styles.typingT, { color: c.textMuted }]}>{label}</Text>
    </AssistantRow>
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
  spacer: { width: size.iconBtn },
  dots: { flexDirection: "row", alignSelf: "flex-start", gap: 5, paddingVertical: 12, paddingHorizontal: 14 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  typingT: { fontSize: T.cap, lineHeight: 18, marginTop: 6 },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 6 },
  center: { flex: 1, minWidth: 0, alignItems: "center" },
  title: { fontSize: T.h - 1, fontWeight: "700", lineHeight: 22 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  status: { fontSize: T.cap, lineHeight: 16 },
  page: { paddingHorizontal: spacing.page, paddingBottom: cardGap * 2 },
  indent: { marginLeft: ROOM_INDENT },
  remNote: { position: "absolute", left: 16, right: 16, top: 110, paddingVertical: 10, paddingHorizontal: 14 },
  bg: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: F.v(22) },
  bgT: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 19 },
  failBox: { marginTop: F.v(22), gap: 8 },
  failHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  failT: { flex: 1, minWidth: 0, fontSize: T.sub + 1, fontWeight: "700", lineHeight: 21 },
  failB: { fontSize: 13.5, lineHeight: 20 },
  failBtn: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, height: 38, borderRadius: 19, paddingHorizontal: 16, marginTop: 4 },
  failBusy: { opacity: 0.55 },
  failBtnT: { fontSize: T.sub, fontWeight: "600" },
  failNote: { fontSize: T.cap, lineHeight: 17 },
  offline: { fontSize: T.cap, textAlign: "center", marginTop: spacing.lg },
  gone: { marginHorizontal: spacing.page, marginTop: F.v(60), alignItems: "center", gap: spacing.sm },
  goneT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, textAlign: "center" },
  goneBtn: { marginTop: spacing.sm, height: size.iconBtn, borderRadius: size.iconBtn / 2, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center" },
  goneBtnT: { fontSize: T.sub, fontWeight: "600" },
  flash: { marginHorizontal: spacing.page, marginBottom: spacing.sm, fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, overflow: "hidden", textAlign: "center" },
  closedNote: { fontSize: T.sub, textAlign: "center", marginHorizontal: spacing.page, marginBottom: INPUT_BOTTOM, lineHeight: 20 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: LEKAA_SLOT_GAP, marginHorizontal: spacing.page, marginBottom: INPUT_BOTTOM },
  ebar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.page - 6, paddingTop: 2, paddingBottom: 8 },
  elogo: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  ecenter: { flex: 1, minWidth: 0 },
  etitle: { fontSize: T.h, fontWeight: "700", lineHeight: 24 },
  ex: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  menuH: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26, marginBottom: 4 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: size.iconBtn + 8, borderBottomWidth: StyleSheet.hairlineWidth },
  menuT: { fontSize: T.body - 1 },
  menuNote: { fontSize: T.cap, lineHeight: 18, marginTop: spacing.md },
  sheetB: { fontSize: T.sub, lineHeight: 21, marginTop: 6 },
  undoItem: { fontSize: T.sub, lineHeight: 20, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, marginTop: spacing.md, overflow: "hidden" },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
});
