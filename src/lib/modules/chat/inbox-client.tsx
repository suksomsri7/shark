"use client";

// inbox-client.tsx — กล่องแชทลูกค้าแบบ WhatsApp (WO-CW4 · PLAN-CHAT-WHATSAPP §6)
//
// ═══ สิ่งที่ไฟล์นี้ต้องไม่ทำพัง (ของเดิมทำได้อยู่แล้ว — ถอยหลังไม่ได้) ═══
//  1. `AutoRefresh ms={7000}` ของเดิมพา **3 อย่าง** มาสดฟรี ๆ: ข้อความใหม่ · ตัวนับ
//     `staffUnreadCount` · ติ๊กคู่ ✓✓  ⇒ ตัวใหม่ poll เองต้องพามาครบทั้ง 3 (§6.4)
//  2. จอแคบ = คอลัมน์เดียว สลับ "รายการ ↔ ห้อง" ด้วย `?c=` (ลิงก์เดิมของ push ใช้รูปนี้)
//
// ═══ 🔴 ห้ามเด้งคนที่กำลังพิมพ์ ═══
//  • **ห้าม `router.refresh()` ในลูป poll** — มันรีเซ็ตทั้งต้นไม้ ร่างที่พิมพ์ค้างและไฟล์ที่เลือกไว้
//    จะหายทันที (นี่คือเหตุผลทั้งหมดที่ต้องเลิกใช้ AutoRefresh)
//  • ร่างเก็บเป็น state **แยกตามห้อง** (`drafts[conversationId]`) — สลับห้องไปมาแล้วกลับมา
//    ข้อความที่พิมพ์ค้างต้องยังอยู่
//  • server action ที่ใช้ poll (`loadInboxAction`/`loadThreadAction`) ต้องไม่มี `revalidatePath`
//    ไม่งั้น Next จะแนบ RSC payload ใหม่กลับมาแล้วสั่ง re-render ทุก 5 วิ = ผลเดียวกับ refresh
//
// ═══ 🔴 heartbeat (มติ M-1 ข้อ 2) ═══
//  การ poll ห้องที่เปิดอยู่รีเฟรช `ChatReadState.lastReadAt` ทุกรอบ (ทำใน `loadThreadAction`)
//  สาย E ใช้ค่านี้ตัดสินว่า "กำลังเปิดดูอยู่ไหม" ภายในหน้าต่าง 20 วิ

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChatNotifyClient, type ChatNotifyRow } from "@/components/chat-notify-client";
import {
  CHANNEL_META,
  CHANNEL_ORDER,
  ChannelBadge,
  ChannelChip,
  channelLabel,
} from "./channel-icon";
import { Icon } from "./icons";
import { DateDivider, MessageBubble, dayKey, dayLabel } from "./bubble";
import {
  loadInboxAction,
  loadInboxCountsAction,
  loadThreadAction,
  muteConversationAction,
  pinConversationAction,
  type InboxQuery,
  type InboxRow,
  type ThreadMessage,
  type ThreadSnapshot,
} from "./inbox-actions";
import {
  EMPTY_COUNTS,
  INBOX_FILTER_KEYS,
  NO_EXTRA_FILTER,
  extraFilterCount,
  formatDuration,
  isMuted,
  previewKindOf,
  rowTickOf,
  type InboxCounts,
  type InboxExtraFilter,
  type InboxFilterKey,
} from "./list-filters";
import {
  sendReplyAction,
  setStatusAction,
  assignAction,
  linkCustomerAction,
  suggestReplyAction,
  ignoreSuggestionsAction,
  translateDraftAction,
} from "./actions";
import type { SuggestOption } from "./ai-suggest";

/** จังหวะ poll — ของเดิมคือ 7 วิ · ห้ามช้าลงกว่านี้ (§6.4) */
const POLL_MS = 5000;

// 🔴 ชิปกรอง + ตัวกรองหลังกรวยย้ายไป `list-filters.ts` แล้ว — เพราะ **ฝั่งเซิร์ฟเวอร์ต้องใช้ชุดเดียวกัน**
//    (ชิปที่จอนิยามเอง แต่ query นิยามอีกอย่าง = ชิปที่กดแล้วได้รายการเดิม)

/**
 * คำไทยของชิปกรอง (แบบร่างจอ 1 · `.chips`) — 4 ตัวตามแบบร่าง
 * 🔴 `Record<InboxFilterKey, string>` เต็มรูป: เพิ่มชิปในสัญญาแล้วลืมตั้งชื่อ = typecheck แดง
 */
const FILTER_LABEL: Record<InboxFilterKey, string> = {
  all: "ทั้งหมด",
  unread: "ยังไม่อ่าน",
  mine: "ของฉัน",
  unassigned: "ยังไม่มีคนรับ",
};

/** ตัวเลือกระยะเวลาปิดเสียง — ตรงกับพารามิเตอร์ของ `muteConversationAction` */
const MUTE_CHOICES: { mode: number | "forever"; label: string }[] = [
  { mode: 60, label: "1 ชั่วโมง" },
  { mode: 8 * 60, label: "8 ชั่วโมง" },
  { mode: "forever", label: "ปิดไปเลย" },
];

const STATUS_LABEL: Record<string, string> = {
  OPEN: "กำลังคุย",
  PENDING: "พักไว้",
  RESOLVED: "ปิดแล้ว",
};

const initialsOf = (name: string) => (name.trim()[0] ?? "?").toUpperCase();

const shortTime = (ts: number | null) => {
  if (ts === null) return "";
  const today = dayKey(Date.now());
  const opts: Intl.DateTimeFormatOptions =
    dayKey(ts) === today
      ? { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }
      : { timeZone: "Asia/Bangkok", day: "numeric", month: "short" };
  return new Intl.DateTimeFormat("th-TH", opts).format(new Date(ts));
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export type ChatInboxClientProps = {
  systemId: string;
  /** ฐานลิงก์ของหน้านี้ — เลือกห้องด้วย `?c=` ต่อท้าย (จอแคบใช้สลับหน้า) */
  baseHref: string;
  meUserId: string;
  staff: { userId: string; name: string }[];
  initialRows: InboxRow[];
  initialThread: ThreadSnapshot | null;
  activeId: string | null;
  /** ข้อความผิดพลาดจาก `?err=` ของ server action (แสดง inline ไม่ใช่ Alert) */
  err?: string | null;
  canSend: boolean;
  canAssign: boolean;
  canSetStatus: boolean;
  canLink: boolean;
  /** เปิดใช้ + มีสิทธิ์จริงเท่านั้นจึงจะเห็นปุ่ม (ค่าเริ่มต้นของทั้งคู่คือปิด) */
  canSuggest: boolean;
  canTranslate: boolean;
  memberLinked: boolean;
  /** เพดานไฟล์แนบจาก `storage/service` — ห้ามพิมพ์ตัวเลขซ้ำที่นี่ */
  maxAttachmentBytes: number;
  /** ชนิดไฟล์ที่ระบบรับ (มาจากทะเบียนเดียวกับที่เซิร์ฟเวอร์ตรวจ) */
  acceptTypes: string;
};

export function ChatInboxClient(props: ChatInboxClientProps) {
  const {
    systemId,
    baseHref,
    meUserId,
    staff,
    initialRows,
    initialThread,
    activeId,
    canSend,
    canAssign,
    canSetStatus,
    canLink,
    canSuggest,
    canTranslate,
    memberLinked,
    maxAttachmentBytes,
    acceptTypes,
  } = props;

  const [rows, setRows] = useState<InboxRow[]>(initialRows);
  /**
   * ชุดแถว "ไม่ถูกกรอง" สำหรับป้อนตัวแจ้งเตือน — null = ใช้ `rows` ได้เลย (ยังไม่มีตัวกรองเปิดอยู่)
   * 🔴 ถ้าป้อนแถวที่ถูกกรองไปให้ตัวแจ้งเตือน คนที่เปิดชิป "ของฉัน" ค้างไว้จะเงียบสนิทกับห้องอื่น
   */
  const [notifySource, setNotifySource] = useState<InboxRow[] | null>(null);
  const [thread, setThread] = useState<ThreadSnapshot | null>(initialThread);
  const [filter, setFilter] = useState<InboxFilterKey>("all");
  const [extra, setExtra] = useState<InboxExtraFilter>(NO_EXTRA_FILTER);
  const [counts, setCounts] = useState<InboxCounts>(EMPTY_COUNTS);
  /** แผ่นกรองหลังไอคอนกรวย (มติ D3) · เมนู ⋮ ของหัวรายการ · เมนูของแถว */
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  /** ข้อผิดพลาดของ "ฝั่งรายการ" — ต้องขึ้นตรงที่ผู้ใช้กด ไม่ใช่ไปโผล่ในกล่องพิมพ์ของอีกคอลัมน์ */
  const [listErr, setListErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [isInternal, setIsInternal] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(props.err ?? null);
  const [suggest, setSuggest] = useState<{ options: SuggestOption[]; sourceMessageId: string } | null>(null);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [originalBody, setOriginalBody] = useState<string | null>(null);
  const [translatePreview, setTranslatePreview] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  // 🔴 ฟองชั่วคราวระหว่างรอเซิร์ฟเวอร์ตอบ (เจ้าของสั่ง 1 ก.ย. 2026):
  //    "ต้องรอสักพักเป็นรูปนาฬิกาว่ากำลังส่ง แล้วถ้าส่งไม่สำเร็จค่อยขึ้นว่าไม่สำเร็จ"
  //    ของเดิมข้อความหายจากช่องพิมพ์ทันทีแล้วเงียบไปจนกว่ารอบ poll ถัดไปจะดึงมา
  //    ⇒ ผู้ใช้ไม่รู้ว่ากำลังส่งอยู่หรือหายไปแล้ว · ฟองนี้ใช้ deliveryStatus="PENDING" → 🕐
  const [pendingMsgs, setPendingMsgs] = useState<ThreadMessage[]>([]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const attachRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const qRef = useRef(q);
  qRef.current = q;
  // 🔴 ตัวกรองต้องเดินทางไปถึง query จริง ⇒ เก็บใน ref ให้ลูป poll อ่านค่าล่าสุดได้
  //    โดยไม่ต้องสร้าง interval ใหม่ทุกครั้งที่ผู้ใช้กดชิป
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const extraRef = useRef(extra);
  extraRef.current = extra;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const draft = activeId ? (drafts[activeId] ?? "") : "";
  const setDraft = useCallback(
    (value: string) => {
      const id = activeRef.current;
      if (!id) return;
      setDrafts((d) => ({ ...d, [id]: value }));
    },
    [],
  );

  // ── เปลี่ยนห้อง: ล้างของที่ผูกกับห้องเดิม (ไฟล์/คำแนะนำ/คำแปล) แต่ **ไม่ล้างร่าง** ──
  useEffect(() => {
    setThread(initialThread);
    setFiles([]);
    setFileErr(null);
    setSuggest(null);
    setSuggestErr(null);
    setSuggestionId(null);
    setOriginalBody(null);
    setTranslatePreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // ข้อความผิดพลาดจาก server action มาถึงเป็น `?err=` หลัง redirect (ห้องเดิม prop เปลี่ยนเฉย ๆ)
  // ถ้าไม่ซิงก์ตรงนี้ ทีมจะกดส่งแล้วเงียบ ไม่รู้ว่าไฟล์ถูกปฏิเสธเพราะอะไร
  useEffect(() => {
    setFormErr(props.err ?? null);
  }, [props.err]);

  // preview ของไฟล์: สร้าง object URL ครั้งเดียวต่อไฟล์ แล้วคืนหน่วยความจำเมื่อเปลี่ยน
  // (สร้างตอน render = รั่วรอบละใบทุก 5 วิ ตามจังหวะ poll)
  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [files],
  );
  useEffect(() => {
    return () => {
      for (const u of previews) if (u) URL.revokeObjectURL(u);
    };
  }, [previews]);

  // ── poll: รายการซ้าย + ห้องที่เปิดอยู่ (ไม่แตะ state ของร่าง/ไฟล์เลย) ──
  //
  // 🔴 ตัวกรอง/คำค้นเดินทางไปกับคำขอทุกรอบ — การกรองเกิดที่ชั้นข้อมูล ไม่ใช่กรองแถวที่โหลดมาแล้ว
  //    (กรองบนจอ = ห้องที่ตรงเงื่อนไขแต่ตกอยู่นอก 50 แถวแรกจะหายไปเงียบ ๆ)
  // 🔴 ตัวนับบนชิปมาจากคำสั่งนับของมันเอง ⇒ กดชิปแล้วเลขของชิปอื่นต้องไม่กลายเป็น 0
  const refreshNow = useCallback(async () => {
    const id = activeRef.current;
    const query: InboxQuery = {
      q: qRef.current,
      filter: filterRef.current,
      closed: extraRef.current.closed,
      channel: extraRef.current.channel,
      assignee: extraRef.current.assignee,
    };
    // บริบทของ "ตัวเลขบนชิป" = คำค้น + ตัวกรองหลังกรวย (ไม่รวมชิปที่กดอยู่)
    const countQuery: InboxQuery = { ...query, filter: "all" };
    // 🔴 การแจ้งเตือน (เสียง/เลขบนหัวแท็บ) ต้องมองเห็น **ทุกห้อง** ไม่ใช่เฉพาะห้องที่ตัวกรองปล่อยผ่าน
    //    ไม่งั้นคนที่กด "ของฉัน" ค้างไว้จะไม่ได้ยินข้อความใหม่ของห้องคนอื่นเลย
    //    ⇒ ดึงชุดไม่กรองเพิ่ม **เฉพาะตอนที่มีตัวกรองเปิดอยู่จริง** (ปกติไม่มี = ไม่มีคำขอเพิ่ม)
    const filtered =
      query.filter !== "all" ||
      !!query.q?.trim() ||
      extraFilterCount(extraRef.current) > 0;
    const [nextRows, nextThread, nextCounts, allRows] = await Promise.all([
      loadInboxAction(systemId, query.q, query).catch(() => null),
      id ? loadThreadAction(systemId, id).catch(() => null) : Promise.resolve(null),
      loadInboxCountsAction(systemId, countQuery).catch(() => null),
      filtered ? loadInboxAction(systemId).catch(() => null) : Promise.resolve(null),
    ]);
    if (nextRows) setRows(nextRows);
    if (id && nextThread) setThread(nextThread);
    if (nextCounts) setCounts(nextCounts);
    setNotifySource(allRows ?? nextRows ?? null);
  }, [systemId]);

  // เปลี่ยนตัวกรอง/พิมพ์คำค้น → ดึงใหม่ทันที (หน่วงสั้น ๆ กันยิงทุกตัวอักษร)
  // 🔴 ไม่แตะ `drafts` เลย — ร่างที่พิมพ์ค้างต้องรอดจากการสลับตัวกรองทุกครั้ง
  useEffect(() => {
    const t = setTimeout(() => void refreshNow(), 250);
    return () => clearTimeout(t);
  }, [q, filter, extra, refreshNow]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      void refreshNow();
    };
    const t = setInterval(tick, POLL_MS);
    tick(); // รอบแรกทันที — เปิดห้องแล้วต้องถูกนับว่าอ่าน ไม่ใช่รออีก 5 วิ
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshNow, activeId]);

  // เลื่อนลงล่างสุดเมื่อมีข้อความใหม่ (ไม่แตะตำแหน่งถ้าผู้ใช้เลื่อนขึ้นไปอ่านของเก่า)
  const lastMsgId = thread?.messages.at(-1)?.id ?? "";
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [lastMsgId]);

  const nameOf = useCallback(
    (uid?: string | null) => (uid ? (staff.find((s) => s.userId === uid)?.name ?? "พนักงาน") : "—"),
    [staff],
  );

  /**
   * หัวข้อคั่นในรายการ: **ปักหมุด / วันนี้ / เมื่อวาน / วันที่** (แบบร่าง `.sect`)
   *
   * 🔴 ชื่อวันมาจาก `dayLabel()` ซึ่งคิดที่เขตเวลาไทยเสมอ — ห้ามใช้ `getDay()/toDateString()`
   *    เซิร์ฟเวอร์รันบน UTC ⇒ ข้อความตอนตี 4 ของไทยจะถูกนับเป็น "เมื่อวาน" ทั้งวัน
   * ลำดับแถวมาจากคำสั่ง query แล้ว (ปักหมุดก่อน → ใหม่สุดก่อน) ที่นี่แค่ตัดเป็นก้อนตามที่เรียงมา
   */
  const groups = useMemo(() => {
    const out: { key: string; label: string; pinned: boolean; items: InboxRow[] }[] = [];
    for (const r of rows) {
      const label = r.pinned
        ? "ปักหมุด"
        : r.lastMessageAt === null
          ? "ยังไม่มีข้อความ"
          : dayLabel(r.lastMessageAt);
      const tail = out.at(-1);
      if (tail && tail.label === label) tail.items.push(r);
      else out.push({ key: `${label}#${out.length}`, label, pinned: r.pinned, items: [r] });
    }
    return out;
  }, [rows]);

  const notifyRows: ChatNotifyRow[] = useMemo(
    () =>
      (notifySource ?? rows).map((r) => ({
        conversationId: r.id,
        unread: r.staffUnreadCount,
        lastMessageAt: r.lastMessageAt,
        title: r.title,
        preview: r.preview,
      })),
    [notifySource, rows],
  );

  // ── ปักหมุด / ปิดเสียง (WO-CV10) ──
  // 🔴 ปรับแถวบนจอทันที (optimistic) แล้วค่อยให้รอบ refresh ยืนยัน — ไม่งั้นกดแล้วนิ่งไป 5 วิ
  //    ล้มเหลว = ข้อความบอกตรง ๆ ไม่ใช่เงียบ (ค่าเดิมกลับมาเองจากรอบ refresh)
  const togglePin = (r: InboxRow) => {
    setRowMenu(null);
    setRowBusy(r.id);
    setListErr(null);
    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, pinned: !r.pinned } : x)));
    void (async () => {
      const res = await pinConversationAction(systemId, r.id, !r.pinned).catch(() => ({
        ok: false as const,
        reason: "เครือข่ายขัดข้องระหว่างปักหมุด — กดอีกครั้งได้เลย",
      }));
      setRowBusy(null);
      if (!res.ok) setListErr(res.reason ?? "ปักหมุดไม่สำเร็จ — กดอีกครั้งได้เลย");
      await refreshNow();
    })();
  };

  const setMute = (r: InboxRow, mode: number | "forever" | "off") => {
    setRowMenu(null);
    setRowBusy(r.id);
    setListErr(null);
    const until =
      mode === "off" ? null : mode === "forever" ? Date.now() + 3_153_600_000_000 : Date.now() + mode * 60_000;
    setRows((xs) => xs.map((x) => (x.id === r.id ? { ...x, mutedUntil: until } : x)));
    void (async () => {
      const res = await muteConversationAction(systemId, r.id, mode).catch(() => ({
        ok: false as const,
        reason: "เครือข่ายขัดข้องระหว่างตั้งค่าเสียง — กดอีกครั้งได้เลย",
      }));
      setRowBusy(null);
      if (!res.ok) setListErr(res.reason ?? "ตั้งค่าการแจ้งเตือนไม่สำเร็จ — กดอีกครั้งได้เลย");
      await refreshNow();
    })();
  };

  const closePopovers = () => {
    setFilterOpen(false);
    setMenuOpen(false);
    setRowMenu(null);
  };
  const anyPopover = filterOpen || menuOpen || rowMenu !== null;
  const extraCount = extraFilterCount(extra);

  // ── ไฟล์แนบ: ตรวจ **ก่อน** อัป (ไม่ใช่ปล่อยให้รอ 30 วิ แล้วค่อยบอกว่าใหญ่เกิน) ──
  const addFiles = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const next: File[] = [];
    const tooBig: string[] = [];
    for (const f of Array.from(picked)) {
      if (f.size > maxAttachmentBytes) tooBig.push(`${f.name} (${mb(f.size)})`);
      else next.push(f);
    }
    setFileErr(
      tooBig.length > 0
        ? `ไฟล์ใหญ่เกิน ${mb(maxAttachmentBytes)} จึงยังส่งไม่ได้: ${tooBig.join(", ")} — ย่อขนาดแล้วเลือกใหม่ได้เลย`
        : null,
    );
    if (next.length > 0) setFiles((cur) => [...cur, ...next].slice(0, 10));
  };

  const removeFile = (idx: number) => setFiles((cur) => cur.filter((_, i) => i !== idx));

  // ── ส่งข้อความ ──
  const send = () => {
    if (!activeId || !canSend || sending) return;
    const text = draft.trim();
    if (!text && files.length === 0) return;
    setFormErr(null);
    setSending(true);
    const fd = new FormData();
    fd.set("systemId", systemId);
    fd.set("conversationId", activeId);
    fd.set("body", draft);
    if (isInternal) fd.set("isInternal", "on");
    if (originalBody) fd.set("originalBody", originalBody);
    if (suggestionId) fd.set("suggestionId", suggestionId);
    // 🔴 ชื่อช่องต้องเป็น `files` — สัญญาที่ `sendReplyAction` + qc-chat-attachments ล็อกไว้
    for (const f of files) fd.append("files", f);

    const keep = draft;
    const tempId = `pending-${Date.now()}`;
    setPendingMsgs((xs) => [
      ...xs,
      {
        id: tempId,
        direction: "OUT",
        type: files.length > 0 && !text ? "IMAGE" : "TEXT",
        body: text || (files.length > 0 ? `กำลังส่งไฟล์ ${files.length} รายการ` : ""),
        translatedBody: null,
        translatedLang: null,
        isInternal,
        senderUserId: null,
        deliveryStatus: "PENDING", // → 🕐 "กำลังส่ง" ใน MessageBubble
        deliveryError: null,
        createdAt: Date.now(),
        attachments: [],
      },
    ]);
    setDraft("");
    setFiles([]);
    setSuggest(null);
    setSuggestionId(null);
    setOriginalBody(null);
    setTranslatePreview(null);
    startTransition(async () => {
      let ok = false;
      let reason: string | null = null;
      try {
        // 🔴 `sendReplyAction` **คืนผลลัพธ์ ไม่ redirect** แล้ว (แก้ 1 ก.ย. 2026)
        //    ของเดิมมันจบด้วย redirect() ซึ่ง Next ใช้การ "โยน error" เป็นกลไก
        //    ⇒ catch ตรงนี้คว้าไปตีความว่าล้ม ทั้งที่ข้อความส่งสำเร็จและขึ้นในห้องแล้ว
        //    (เจ้าของเจอจริง: จอแดงว่าส่งไม่สำเร็จ + ข้อความเด้งกลับเข้าช่องพิมพ์ = เสี่ยงส่งซ้ำ)
        const res = await sendReplyAction(fd);
        ok = res.ok;
        reason = res.reason ?? null;
      } catch {
        ok = false;
        reason = null; // เครือข่ายล่ม/เซิร์ฟเวอร์ไม่ตอบ — ของจริงที่ควรบอกผู้ใช้
      } finally {
        setSending(false);
        // ฟองชั่วคราวจบหน้าที่แล้ว — ของจริงจะเข้ามาจากรอบ refresh
        setPendingMsgs((xs) => xs.filter((x) => x.id !== tempId));
        if (!ok) {
          // 🔴 คืนข้อความให้ผู้ใช้เฉพาะตอน **ไม่ได้บันทึกจริง** เท่านั้น
          // คืนร่างให้เฉพาะตอนผู้ใช้ยังไม่พิมพ์อะไรใหม่ทับ — ไม่งั้นจะไปทับสิ่งที่เขากำลังพิมพ์อยู่
          const backId = activeRef.current;
          if (backId) setDrafts((d) => (d[backId]?.trim() ? d : { ...d, [backId]: keep }));
          setFormErr(reason ?? "ส่งข้อความไม่สำเร็จ — ข้อความที่พิมพ์ไว้ยังอยู่ กดส่งอีกครั้งได้เลย");
        }
        void refreshNow();
      }
    });
  };

  // ── ✨ AI แนะนำคำตอบ ──
  const askSuggest = () => {
    if (!activeId) return;
    setSuggestErr(null);
    startTransition(async () => {
      const res = await suggestReplyAction(systemId, activeId);
      if (res.ok) setSuggest({ options: res.options, sourceMessageId: res.sourceMessageId });
      else setSuggestErr(res.reason);
    });
  };

  const useSuggestion = (o: SuggestOption) => {
    setDraft(o.body);
    setSuggestionId(o.id);
    setSuggest(null);
  };

  const skipSuggestions = () => {
    if (!activeId || !suggest) return;
    const src = suggest.sourceMessageId;
    setSuggest(null);
    startTransition(async () => {
      await ignoreSuggestionsAction(systemId, activeId, src).catch(() => null);
    });
  };

  // ── 🌐 แปลก่อนส่ง (ต้องให้ทีมเห็นและกดยืนยัน ห้ามส่งเอง) ──
  const translateDraft = () => {
    if (!activeId || !draft.trim()) return;
    setSuggestErr(null);
    startTransition(async () => {
      const res = await translateDraftAction(systemId, activeId, draft);
      if (res.ok) setTranslatePreview(res.text);
      else setSuggestErr(res.reason);
    });
  };

  const acceptTranslation = () => {
    if (!translatePreview) return;
    setOriginalBody(draft); // ต้นฉบับที่ทีมพิมพ์ — เก็บไว้ให้ย้อนดูได้ (§5.2)
    setDraft(translatePreview);
    setTranslatePreview(null);
  };

  const closed = thread?.status === "RESOLVED";

  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="grid min-h-0 gap-0 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)] sm:gap-4">
        {/* ══════════ คอลัมน์ซ้าย: รายการแชท (WO-CV3 · แบบร่างจอ 1 + `.dcol1`) ══════════ */}
        <aside
          className={`card relative min-w-0 flex-col gap-0 p-0 ${activeId ? "hidden sm:flex" : "flex"}`}
        >
          {/* ── หัวรายการ (แบบร่าง `.hdr`) ── */}
          <div className="flex items-center gap-1 border-b border-[color:var(--color-line)] px-2 py-1.5">
            <h2 className="min-w-0 flex-1 truncate px-1 text-[17.5px] font-bold tracking-[-0.015em]">
              แชทลูกค้า
            </h2>

            {/* 🔴 กรวย = ตัวกรองเพิ่มเติม (มติ D3) — "ปิดแล้ว" ของเดิมย้ายมาอยู่ที่นี่ ไม่ได้หายไป
                แบบร่างวาดกรวยไว้แต่ไม่ได้ให้หน้าที่ · ชิป 4 ตัวคือของที่ใช้บ่อยที่สุดเท่านั้น */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setRowMenu(null);
                setFilterOpen((o) => !o);
              }}
              aria-expanded={filterOpen}
              aria-label="ตัวกรองเพิ่มเติม"
              className={`relative grid size-[34px] place-items-center rounded-[10px] text-[color:var(--color-ink)] ${
                filterOpen ? "bg-[color:var(--color-surface-2)]" : ""
              }`}
            >
              <Icon name="filter" />
              {extraCount > 0 && (
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[color:var(--color-accent)]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterOpen(false);
                setRowMenu(null);
                setMenuOpen((o) => !o);
              }}
              aria-expanded={menuOpen}
              aria-label="เมนูของรายการแชท"
              className={`grid size-[34px] place-items-center rounded-[10px] text-[color:var(--color-ink)] ${
                menuOpen ? "bg-[color:var(--color-surface-2)]" : ""
              }`}
            >
              <Icon name="more" />
            </button>
          </div>

          {/* ฉากหลังสำหรับกดปิดแผ่นที่เปิดอยู่ (กดที่ว่างแล้วต้องปิด — ไม่ใช่ค้างจนกว่าจะกดปุ่มเดิม) */}
          {anyPopover && (
            <button
              type="button"
              aria-label="ปิดเมนู"
              onClick={closePopovers}
              className="fixed inset-0 z-10 cursor-default"
            />
          )}

          {/* ── แผ่นตัวกรองเพิ่มเติม ── */}
          {filterOpen && (
            <div className="absolute right-2 top-[46px] z-20 w-[248px] rounded-[13px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3 shadow-lg">
              <p className="pb-2 text-[11px] font-bold tracking-wide text-[color:var(--color-muted)]">
                ตัวกรองเพิ่มเติม
              </p>

              <label className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  className="size-3.5"
                  checked={extra.closed}
                  onChange={(e) => setExtra((x) => ({ ...x, closed: e.target.checked }))}
                />
                ดูเฉพาะห้องที่ปิดแล้ว
              </label>

              <label className="mt-2 block text-[11px] text-[color:var(--color-muted)]">
                ตามช่องทาง
                <select
                  className="input mt-1 h-8 py-0 text-xs"
                  value={extra.channel ?? ""}
                  onChange={(e) => setExtra((x) => ({ ...x, channel: e.target.value || null }))}
                >
                  <option value="">ทุกช่องทาง</option>
                  {CHANNEL_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {CHANNEL_META[c].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-2 block text-[11px] text-[color:var(--color-muted)]">
                ตามผู้รับผิดชอบ
                <select
                  className="input mt-1 h-8 py-0 text-xs"
                  value={extra.assignee ?? ""}
                  onChange={(e) => setExtra((x) => ({ ...x, assignee: e.target.value || null }))}
                >
                  <option value="">ทุกคน</option>
                  {staff.map((sf) => (
                    <option key={sf.userId} value={sf.userId}>
                      {sf.name}
                      {sf.userId === meUserId ? " (ฉัน)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-3 flex justify-between">
                <button
                  type="button"
                  onClick={() => setExtra(NO_EXTRA_FILTER)}
                  className="text-xs underline text-[color:var(--color-muted)]"
                >
                  ล้างตัวกรอง
                </button>
                <button type="button" onClick={() => setFilterOpen(false)} className="btn-sm">
                  เสร็จ
                </button>
              </div>
            </div>
          )}

          {/* ── เมนู ⋮ ของหัวรายการ ──
              🔴 ตัวแจ้งเตือนต้อง **ติดตั้งค้างไว้เสมอ** (ซ่อนด้วย CSS ไม่ใช่ถอดออกจากต้นไม้)
                 ถอดออกเมื่อไหร่ ตัวจับ "ของใหม่" จะลืมสถานะรอบก่อน แล้วเปิดเมนูทีก็มีเสียงเตือนที */}
          <div
            className={`absolute right-2 top-[46px] z-20 w-[248px] rounded-[13px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3 shadow-lg ${
              menuOpen ? "" : "hidden"
            }`}
          >
            <p className="pb-2 text-[11px] font-bold tracking-wide text-[color:var(--color-muted)]">
              การแจ้งเตือนบนเบราว์เซอร์
            </p>
            <ChatNotifyClient
              rows={notifyRows}
              activeConversationId={activeId}
              baseTitle="แชทลูกค้า"
              enabled
              hideControls={false}
            />
            <p className="mt-2 border-t border-[color:var(--color-line)] pt-2 text-[11.5px] text-[color:var(--color-muted)]">
              {counts.all} ห้องในรายการนี้
            </p>
          </div>

          {/* ── ช่องค้นหา (แบบร่าง `.search`) ── */}
          <label className="sr-only" htmlFor="chat-search">
            ค้นหาแชท
          </label>
          <div className="mx-3 mb-1.5 mt-2 flex h-9 items-center gap-2 rounded-[10px] bg-[color:var(--color-surface-2)] px-3">
            <Icon name="search" size="sm" className="shrink-0 text-[color:var(--color-muted)]" />
            <input
              id="chat-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ เบอร์ หรือข้อความ"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--color-muted)]"
            />
            {q !== "" && (
              <button type="button" onClick={() => setQ("")} aria-label="ล้างคำค้น" className="shrink-0">
                <Icon name="x" size="sm" className="text-[color:var(--color-muted)]" />
              </button>
            )}
          </div>

          {/* ── ชิปกรอง (แบบร่าง `.chips`) — ตัวเลขมาจากการนับที่ชั้นข้อมูล ── */}
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2">
            {INBOX_FILTER_KEYS.map((key) => {
              const on = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={on}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] ${
                    on
                      ? "bg-[color:var(--color-ink)] font-semibold text-white"
                      : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]"
                  }`}
                >
                  {FILTER_LABEL[key]}
                  {key !== "all" && counts[key] > 0 && (
                    <span className="opacity-60">{counts[key]}</span>
                  )}
                </button>
              );
            })}
          </div>

          {listErr && (
            <p className="mx-3 mb-1.5 text-xs text-[color:var(--color-danger)]" role="alert">
              {listErr}
            </p>
          )}

          {/* ── รายการ ── */}
          <div className="flex max-h-[60vh] min-h-0 flex-1 flex-col overflow-y-auto pb-2 sm:max-h-[calc(100vh-19rem)]">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[color:var(--color-muted)]">
                {counts.all === 0 && q.trim() === "" && filter === "all" && extraCount === 0
                  ? "ยังไม่มีแชท — เปิดลิงก์แชทหน้าเว็บหรือเชื่อม LINE OA ที่แท็บ “เชื่อมช่องทาง” เพื่อเริ่มรับข้อความ"
                  : "ไม่มีห้องที่ตรงกับตัวกรองนี้"}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="flex flex-col">
                  <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-[11px] text-[11.5px] font-bold text-[color:var(--color-muted)]">
                    {g.pinned && <Icon name="bookmark" size="sm" />}
                    {g.label}
                  </div>
                  {g.items.map((r) => {
                    const on = r.id === activeId;
                    const unread = r.staffUnreadCount > 0;
                    const kind = previewKindOf(r.preview);
                    const tick = rowTickOf(r);
                    const muted = isMuted(r.mutedUntil);
                    return (
                      <div
                        key={r.id}
                        className="group relative flex items-center"
                        // 🔴 คลิกขวา (เดสก์ท็อป) / กดค้าง (มือถือ) = เปิดเมนูของแถว
                        //    ทางเข้าที่ไม่กินพื้นที่บนแถวเลย — แบบร่างวาดแถวไว้สะอาด ไม่มีปุ่มใด ๆ
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setFilterOpen(false);
                          setMenuOpen(false);
                          setRowMenu(r.id);
                        }}
                      >
                        <Link
                          href={`${baseHref}?c=${r.id}`}
                          scroll={false}
                          className={`relative flex min-w-0 flex-1 items-center gap-[11px] px-3 py-[9px] ${
                            on ? "bg-[#f1f5ff]" : "hover:bg-[color:var(--color-surface-2)]"
                          }`}
                        >
                          <span className="relative shrink-0">
                            {/* แบบร่าง `.av` — 46px มุม 14px (ไม่ใช่วงกลม) */}
                            <span className="grid size-[46px] place-items-center rounded-[14px] bg-[color:var(--color-surface-2)] text-base font-bold text-[color:var(--color-muted)]">
                              {initialsOf(r.title)}
                            </span>
                            <ChannelBadge
                              type={r.channel}
                              title={`ทักมาจาก ${channelLabel(r.channel)}`}
                            />
                          </span>

                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex items-baseline gap-2">
                              <span
                                className={`min-w-0 flex-1 truncate text-[15px] ${unread ? "font-bold" : "font-semibold"}`}
                              >
                                {r.title}
                              </span>
                              <span
                                className={`shrink-0 text-[11.5px] ${
                                  unread
                                    ? "font-bold text-[color:var(--color-accent)]"
                                    : "text-[color:var(--color-muted)]"
                                }`}
                              >
                                {shortTime(r.lastMessageAt)}
                              </span>
                            </span>

                            <span className="mt-0.5 flex items-center gap-[7px]">
                              <span className="flex min-w-0 flex-1 items-center gap-[5px] text-[13.5px] text-[color:var(--color-muted)]">
                                {/* ทีมตอบล่าสุด → "คุณ:" นำหน้า (แบบร่าง `.pv b`) */}
                                {r.lastMessageDirection === "OUT" && (
                                  <b className="shrink-0 font-semibold text-[#3f4652]">คุณ:</b>
                                )}
                                {/* ข้อความที่ไม่ใช่ตัวหนังสือ → **ไอคอนจากทะเบียน + คำ** (ห้าม emoji · มติ V2) */}
                                {kind === "IMAGE" ? (
                                  <>
                                    <Icon name="image" size="sm" className="shrink-0" />
                                    รูปภาพ
                                  </>
                                ) : kind === "STICKER" ? (
                                  <>
                                    <Icon name="sparkle" size="sm" className="shrink-0" />
                                    สติกเกอร์
                                  </>
                                ) : kind === "FILE" ? (
                                  <>
                                    <Icon name="clip" size="sm" className="shrink-0" />
                                    ไฟล์แนบ
                                  </>
                                ) : kind === "AUDIO" ? (
                                  <>
                                    <Icon name="mic" size="sm" className="shrink-0" />
                                    ข้อความเสียง
                                    {r.audioMs !== null ? ` ${formatDuration(r.audioMs)}` : ""}
                                  </>
                                ) : (
                                  <span className="truncate">{r.preview ?? "—"}</span>
                                )}
                              </span>

                              {/* ห้องที่มีคนรับแล้ว → ชื่อคนรับ (แบบร่าง `.who-tag` — "มุก รับเรื่อง") */}
                              {r.assigneeUserId && !unread && (
                                <span className="shrink-0 text-[11px] text-[#8b919b]">
                                  {nameOf(r.assigneeUserId)} รับเรื่อง
                                </span>
                              )}
                              {muted && (
                                <Icon
                                  name="belloff"
                                  size="sm"
                                  className="shrink-0 text-[#c3c7ce]"
                                  label="ปิดเสียงแจ้งเตือนของห้องนี้อยู่"
                                />
                              )}
                              {r.status === "RESOLVED" && (
                                <Icon
                                  name="checkcircle"
                                  size="sm"
                                  className="shrink-0 text-[#c3c7ce]"
                                  label="ปิดบทสนทนาแล้ว"
                                />
                              )}
                              {unread ? (
                                <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-[7px] bg-[color:var(--color-accent)] px-1.5 text-[11.5px] font-bold text-white">
                                  {r.staffUnreadCount}
                                </span>
                              ) : tick ? (
                                tick.read ? (
                                  <Icon
                                    name="check2"
                                    size="sm"
                                    strokeWidth={2.2}
                                    className="shrink-0 text-[color:var(--color-accent)]"
                                    label={tick.title}
                                  />
                                ) : (
                                  <Icon
                                    name="check"
                                    size="sm"
                                    strokeWidth={2.2}
                                    className="shrink-0 text-[#a3a8b1]"
                                    label={tick.title}
                                  />
                                )
                              ) : null}
                            </span>
                          </span>
                        </Link>

                        {/* ปุ่มเมนูของแถว — โผล่ตอนชี้เมาส์/โฟกัสเท่านั้น
                            🔴 แบบร่างวางปักหมุด/ปิดเสียงไว้ในเมนู ⋮ ของ **ห้องแชท** (จอ 3) ซึ่งเป็นงานรอบถัดไป
                               ระหว่างนี้ต้องมีทางเข้าที่ใช้ได้จริง ไม่งั้น action ที่ทำไว้ = ปุ่มที่เดินไปไม่ถึง
                               ⇒ ซ่อนไว้จนกว่าจะชี้/โฟกัส เพื่อให้หน้าตาตั้งต้นตรงแบบร่างเป๊ะ */}
                        <button
                          type="button"
                          onClick={() => {
                            setFilterOpen(false);
                            setMenuOpen(false);
                            setRowMenu((cur) => (cur === r.id ? null : r.id));
                          }}
                          aria-expanded={rowMenu === r.id}
                          aria-label={`ตัวเลือกของห้อง ${r.title}`}
                          className={`absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg bg-[color:var(--color-surface)] text-[color:var(--color-muted)] shadow-sm ${
                            rowMenu === r.id
                              ? "opacity-100"
                              : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                          }`}
                        >
                          <Icon name="more" size="sm" />
                        </button>

                        {rowMenu === r.id && (
                          <div className="absolute right-1 top-[46px] z-20 w-[212px] rounded-[13px] border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-1.5 shadow-lg">
                            {canSetStatus ? (
                              <button
                                type="button"
                                onClick={() => togglePin(r)}
                                disabled={rowBusy === r.id}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
                              >
                                <Icon name="bookmark" size="sm" />
                                {r.pinned ? "เอาหมุดออก" : "ปักหมุดห้องนี้"}
                              </button>
                            ) : (
                              <p className="px-2.5 py-2 text-[11px] text-[color:var(--color-muted)]">
                                ปักหมุดได้เมื่อมีสิทธิ์ปิด/เปิดห้องแชท
                              </p>
                            )}

                            <div className="my-1 h-px bg-[color:var(--color-line)]" />
                            <p className="px-2.5 pb-1 text-[11px] text-[color:var(--color-muted)]">
                              ปิดเสียงแจ้งเตือน (เฉพาะของคุณ)
                            </p>
                            {isMuted(r.mutedUntil) ? (
                              <button
                                type="button"
                                onClick={() => setMute(r, "off")}
                                disabled={rowBusy === r.id}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
                              >
                                <Icon name="belloff" size="sm" />
                                เปิดเสียงคืน
                              </button>
                            ) : (
                              MUTE_CHOICES.map((c) => (
                                <button
                                  key={String(c.mode)}
                                  type="button"
                                  onClick={() => setMute(r, c.mode)}
                                  disabled={rowBusy === r.id}
                                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
                                >
                                  <Icon name="belloff" size="sm" />
                                  {c.label}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ══════════ คอลัมน์ขวา: ห้องแชท ══════════ */}
        {/* 🔴 ความสูง **ตายตัว** ไม่ใช่ min-h — วัดจากจอจริง 31 ส.ค.: ของเดิม `min-h-[60vh]` ทำให้
            การ์ดสูงตามเนื้อหา (header + ฟอง + กล่องพิมพ์) แล้วดันหน้าให้เลื่อนทั้งหน้า
            ⇒ กล่องพิมพ์ตกใต้ขอบจอ (textarea top=933px บนจอสูง 900px · หน้าสูง 1096px)
            ทีมต้องเลื่อนผ่านรายการห้องก่อนถึงจะพิมพ์ได้ = ผิดหลัก WhatsApp (มติ W1)
            ⇒ ล็อกความสูงเท่าคอลัมน์ซ้าย แล้วให้ **พื้นที่ข้อความ** เลื่อนข้างในตัวเอง (บรรทัด overflow-y-auto)
            ใช้ dvh บนจอแคบ เพราะแถบเบราว์เซอร์มือถือยืดหดทำให้ vh โกหก */}
        <div
          className={`card h-[calc(100dvh-13rem)] min-h-0 min-w-0 flex-col p-0 sm:h-[calc(100vh-19rem)] ${activeId ? "flex" : "hidden sm:flex"}`}
        >
          {!thread ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="text-center text-sm text-[color:var(--color-muted)]">
                เลือกแชททางซ้ายเพื่ออ่านและตอบกลับ
              </p>
            </div>
          ) : (
            <>
              {/* ── หัวห้อง ── */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--color-line)] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Link href={baseHref} scroll={false} className="text-sm sm:hidden" aria-label="กลับไปรายการแชท">
                    ‹
                  </Link>
                  <span className="relative shrink-0">
                    <span className="flex size-8 items-center justify-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-xs font-medium">
                      {initialsOf(thread.title)}
                    </span>
                    <ChannelBadge type={thread.channel} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-semibold">{thread.title}</span>
                      <ChannelChip type={thread.channel} />
                    </span>
                    <span className="block text-[11px] text-[color:var(--color-muted)]">
                      {STATUS_LABEL[thread.status] ?? thread.status} · ผู้รับผิดชอบ{" "}
                      {nameOf(thread.assigneeUserId)}
                      {thread.memberName ? ` · สมาชิก ${thread.memberName}` : ""}
                      {thread.phone ? ` · ${thread.phone}` : ""}
                    </span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {canAssign && (
                    <>
                      <form action={assignAction}>
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="conversationId" value={thread.conversationId} />
                        <input type="hidden" name="assigneeUserId" value="me" />
                        <button className="btn-sm">รับเรื่องเอง</button>
                      </form>
                      <form action={assignAction} className="flex items-center gap-1">
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="conversationId" value={thread.conversationId} />
                        <select
                          name="assigneeUserId"
                          defaultValue={thread.assigneeUserId ?? "none"}
                          className="input h-8 py-0 text-xs"
                          aria-label="มอบหมายให้"
                        >
                          <option value="none">ยังไม่มอบหมาย</option>
                          {staff.map((s) => (
                            <option key={s.userId} value={s.userId}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <button className="btn-sm">มอบหมาย</button>
                      </form>
                    </>
                  )}
                  {canSetStatus &&
                    (closed ? (
                      <form action={setStatusAction}>
                        <input type="hidden" name="systemId" value={systemId} />
                        <input type="hidden" name="conversationId" value={thread.conversationId} />
                        <input type="hidden" name="status" value="OPEN" />
                        <button className="btn-sm">เปิดใหม่</button>
                      </form>
                    ) : (
                      <>
                        <form action={setStatusAction}>
                          <input type="hidden" name="systemId" value={systemId} />
                          <input type="hidden" name="conversationId" value={thread.conversationId} />
                          <input type="hidden" name="status" value="PENDING" />
                          <button className="btn-sm">พักไว้</button>
                        </form>
                        <form action={setStatusAction}>
                          <input type="hidden" name="systemId" value={systemId} />
                          <input type="hidden" name="conversationId" value={thread.conversationId} />
                          <input type="hidden" name="status" value="RESOLVED" />
                          <button className="btn-sm">ปิดบทสนทนา</button>
                        </form>
                      </>
                    ))}
                </div>
              </div>

              {/* ── ผูกสมาชิก (ย่อ) ── */}
              {canLink && memberLinked && (
                <div className="border-b border-[color:var(--color-line)] px-3 py-1.5 text-[11px]">
                  {thread.customerId ? (
                    <form action={linkCustomerAction} className="flex items-center gap-2">
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="conversationId" value={thread.conversationId} />
                      <input type="hidden" name="contactId" value={thread.contactId} />
                      <input type="hidden" name="unlink" value="1" />
                      <span className="text-[color:var(--color-muted)]">
                        ผูกกับสมาชิก {thread.memberName ?? "แล้ว"}
                      </span>
                      <button className="underline text-[color:var(--color-danger)]">ถอดการผูก</button>
                    </form>
                  ) : (
                    <form action={linkCustomerAction} className="flex items-center gap-2">
                      <input type="hidden" name="systemId" value={systemId} />
                      <input type="hidden" name="conversationId" value={thread.conversationId} />
                      <input type="hidden" name="contactId" value={thread.contactId} />
                      <input
                        name="phone"
                        inputMode="tel"
                        placeholder="เบอร์โทรลูกค้า"
                        defaultValue={thread.phone ?? ""}
                        className="input h-7 w-40 py-0 text-xs"
                        aria-label="เบอร์โทรลูกค้า"
                      />
                      <button className="underline">ผูกสมาชิก</button>
                    </form>
                  )}
                </div>
              )}

              {/* ── ข้อความ ── */}
              <div
                ref={listRef}
                className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto bg-[color:var(--color-surface-2)] px-3 py-2"
              >
                {thread.messages.length === 0 && pendingMsgs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[color:var(--color-muted)]">
                    ยังไม่มีข้อความในห้องนี้
                  </p>
                ) : (
                  thread.messages.map((m, i) => {
                    const prev = thread.messages[i - 1];
                    const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
                    return (
                      <div key={m.id} className="flex flex-col">
                        {newDay && <DateDivider ts={m.createdAt} />}
                        <MessageBubble
                          systemId={systemId}
                          conversationId={thread.conversationId}
                          msg={m}
                          senderLabel={nameOf(m.senderUserId)}
                          customerLastReadAt={thread.customerLastReadAt}
                          canTranslate={canTranslate}
                          canSaveExample={canSend}
                        />
                      </div>
                    );
                  })
                )}
                {/* ฟองชั่วคราว "กำลังส่ง" — 🕐 จนกว่าของจริงจะเข้ามาจากรอบ refresh
                    🔴 ไม่ผูกกับ deliveryStatus ของ DB เพราะแถวยังไม่มี · เป็นสถานะฝั่งจอล้วน */}
                {pendingMsgs.map((m) => (
                  <div key={m.id} className="flex flex-col opacity-70">
                    <MessageBubble
                      systemId={systemId}
                      conversationId={thread.conversationId}
                      msg={m}
                      senderLabel={nameOf(null)}
                      customerLastReadAt={thread.customerLastReadAt}
                      canTranslate={false}
                      canSaveExample={false}
                    />
                  </div>
                ))}
              </div>

              {/* ── กล่องพิมพ์ (ติดล่างเสมอ) ── */}
              <div className="border-t border-[color:var(--color-line)] p-2">
                {closed ? (
                  <p className="rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-xs text-[color:var(--color-muted)]">
                    บทสนทนานี้ปิดแล้ว — กด “เปิดใหม่” ด้านบนเพื่อตอบต่อ
                  </p>
                ) : !canSend ? (
                  <p className="rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-xs text-[color:var(--color-muted)]">
                    บัญชีของคุณดูแชทได้อย่างเดียว — ขอสิทธิ์ “ตอบแชทลูกค้า” จากผู้ดูแลร้านเพื่อพิมพ์ตอบ
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {formErr && (
                      <p className="text-xs text-[color:var(--color-danger)]" role="alert">
                        {formErr}
                      </p>
                    )}

                    {/* คำแนะนำของ AI */}
                    {suggest && (
                      <div className="flex flex-col gap-1 rounded-lg border border-[color:var(--color-line)] p-2">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span>AI แนะนำคำตอบ (เลือกแล้วแก้ได้ ระบบไม่ส่งเอง)</span>
                          <button type="button" onClick={skipSuggestions} className="underline text-[color:var(--color-muted)]">
                            ข้ามคำแนะนำ
                          </button>
                        </div>
                        {suggest.options.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => useSuggestion(o)}
                            className="rounded border border-[color:var(--color-line)] px-2 py-1 text-left text-xs hover:bg-[color:var(--color-surface-2)]"
                          >
                            <span className="block whitespace-pre-wrap">{o.body}</span>
                            {o.warn && (
                              <span className="mt-0.5 block text-[10px] text-[color:var(--color-danger)]">
                                ⚠️ ข้อความนี้ไม่มีแหล่งอ้างอิงจากข้อมูลร้าน — ตรวจให้แน่ใจก่อนส่ง
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* คำแปลของร่าง — ต้องกดยืนยันเอง */}
                    {translatePreview && (
                      <div className="flex flex-col gap-1 rounded-lg border border-[color:var(--color-line)] p-2 text-xs">
                        <span className="font-medium">คำแปลที่จะส่งให้ลูกค้า</span>
                        <span className="whitespace-pre-wrap">{translatePreview}</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={acceptTranslation} className="btn-sm">
                            ใช้คำแปลนี้
                          </button>
                          <button
                            type="button"
                            onClick={() => setTranslatePreview(null)}
                            className="underline text-[color:var(--color-muted)]"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    )}

                    {suggestErr && (
                      <p className="text-xs text-[color:var(--color-danger)]" role="alert">
                        {suggestErr}
                      </p>
                    )}

                    {/* ตัวอย่างไฟล์ที่เลือกไว้ */}
                    {files.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {files.map((f, i) => (
                          <span
                            key={`${f.name}-${i}`}
                            className="flex items-center gap-1 rounded border border-[color:var(--color-line)] px-1.5 py-1 text-[11px]"
                          >
                            {previews[i] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={previews[i]!}
                                alt={f.name}
                                className="size-10 rounded object-cover"
                              />
                            ) : (
                              <span aria-hidden>📄</span>
                            )}
                            <span className="max-w-[9rem] truncate">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => removeFile(i)}
                              aria-label={`ลบไฟล์ ${f.name}`}
                              className="text-[color:var(--color-danger)]"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {fileErr && (
                      <p className="text-xs text-[color:var(--color-danger)]" role="alert">
                        {fileErr}
                      </p>
                    )}

                    <div className="flex items-end gap-1.5">
                      {/* 📎 แนบไฟล์ */}
                      <input
                        ref={attachRef}
                        type="file"
                        name="files"
                        multiple
                        accept={acceptTypes}
                        onChange={(e) => {
                          addFiles(e.target.files);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => attachRef.current?.click()}
                        className="btn-sm"
                        title="แนบไฟล์"
                        aria-label="แนบไฟล์"
                      >
                        📎
                      </button>

                      {/* 📷 ถ่ายรูป — มือถือเปิดกล้องจริง เดสก์ท็อปตกเป็นเลือกไฟล์ */}
                      <input
                        ref={cameraRef}
                        type="file"
                        name="files"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          addFiles(e.target.files);
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => cameraRef.current?.click()}
                        className="btn-sm"
                        title="ถ่ายรูป"
                        aria-label="ถ่ายรูป"
                      >
                        📷
                      </button>

                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            send();
                          }
                        }}
                        rows={1}
                        placeholder={isInternal ? "เขียนโน้ตภายใน (ลูกค้าไม่เห็น)…" : "พิมพ์ข้อความตอบลูกค้า…"}
                        aria-label="ข้อความตอบลูกค้า"
                        className="input max-h-32 min-h-[2.25rem] flex-1 resize-y py-1.5"
                      />

                      <button
                        type="button"
                        onClick={send}
                        disabled={sending || busy || (!draft.trim() && files.length === 0)}
                        className="btn btn-primary px-3 py-1.5 text-sm"
                      >
                        {sending ? "กำลังส่ง…" : "ส่ง"}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <label className="flex items-center gap-1.5 text-[color:var(--color-muted)]">
                        <input
                          type="checkbox"
                          checked={isInternal}
                          onChange={(e) => setIsInternal(e.target.checked)}
                          className="size-3.5"
                        />
                        โน้ตภายใน (ลูกค้าไม่เห็น)
                      </label>
                      {canSuggest && (
                        <button type="button" onClick={askSuggest} disabled={busy} className="underline">
                          ✨ AI แนะนำคำตอบ
                        </button>
                      )}
                      {canTranslate && (
                        <button
                          type="button"
                          onClick={translateDraft}
                          disabled={busy || !draft.trim()}
                          className="underline"
                        >
                          🌐 แปลก่อนส่ง
                        </button>
                      )}
                      {originalBody && (
                        <span className="text-[color:var(--color-muted)]">
                          จะส่งเป็นคำแปล · เก็บต้นฉบับไว้ให้ย้อนดู
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default ChatInboxClient;
