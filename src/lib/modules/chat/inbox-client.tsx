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
import { ChannelBadge, ChannelChip, channelLabel } from "./channel-icon";
import { DateDivider, MessageBubble, dayKey } from "./bubble";
import {
  loadInboxAction,
  loadThreadAction,
  type InboxRow,
  type ThreadSnapshot,
} from "./inbox-actions";
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

type Filter = "all" | "unread" | "mine" | "closed";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "unread", label: "ยังไม่อ่าน" },
  { key: "mine", label: "ของฉัน" },
  { key: "closed", label: "ปิดแล้ว" },
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
  const [thread, setThread] = useState<ThreadSnapshot | null>(initialThread);
  const [filter, setFilter] = useState<Filter>("all");
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

  const listRef = useRef<HTMLDivElement | null>(null);
  const attachRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const qRef = useRef(q);
  qRef.current = q;
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
  const refreshNow = useCallback(async () => {
    const id = activeRef.current;
    const [nextRows, nextThread] = await Promise.all([
      loadInboxAction(systemId, qRef.current).catch(() => null),
      id ? loadThreadAction(systemId, id).catch(() => null) : Promise.resolve(null),
    ]);
    if (nextRows) setRows(nextRows);
    if (id && nextThread) setThread(nextThread);
  }, [systemId]);

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

  const visibleRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "unread" && r.staffUnreadCount <= 0) return false;
      if (filter === "mine" && r.assigneeUserId !== meUserId) return false;
      if (filter === "closed" && r.status !== "RESOLVED") return false;
      if (filter !== "closed" && r.status === "RESOLVED") return false;
      if (!needle) return true;
      return (
        r.title.toLowerCase().includes(needle) ||
        (r.phone ?? "").toLowerCase().includes(needle) ||
        (r.preview ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, q, meUserId]);

  const notifyRows: ChatNotifyRow[] = useMemo(
    () =>
      rows.map((r) => ({
        conversationId: r.id,
        unread: r.staffUnreadCount,
        lastMessageAt: r.lastMessageAt,
        title: r.title,
        preview: r.preview,
      })),
    [rows],
  );

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
    setDraft("");
    setFiles([]);
    setSuggest(null);
    setSuggestionId(null);
    setOriginalBody(null);
    setTranslatePreview(null);
    startTransition(async () => {
      try {
        await sendReplyAction(fd);
      } catch {
        // redirect ของ server action ถูก Next จัดการเอง — ที่ตกมาถึงนี่คือความผิดพลาดจริง
        setDraft(keep);
        setFormErr("ส่งข้อความไม่สำเร็จ — ข้อความที่พิมพ์ไว้ยังอยู่ กดส่งอีกครั้งได้เลย");
      } finally {
        setSending(false);
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
        {/* ══════════ คอลัมน์ซ้าย: รายการแชท ══════════ */}
        <aside
          className={`card min-w-0 flex-col gap-2 p-3 ${activeId ? "hidden sm:flex" : "flex"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">แชทลูกค้า</h2>
            <span className="text-xs text-[color:var(--color-muted)]">{rows.length} ห้อง</span>
          </div>

          {/* แจ้งเตือนตอนเปิดหน้าอยู่ — 🔴 ป้อน rows จาก polling ของหน้านี้ (ตัวมันไม่ poll เอง) */}
          <ChatNotifyClient
            rows={notifyRows}
            activeConversationId={activeId}
            baseTitle="แชทลูกค้า"
            enabled
            hideControls={false}
          />

          <label className="sr-only" htmlFor="chat-search">
            ค้นหาแชท
          </label>
          <input
            id="chat-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์ หรือข้อความ"
            className="input text-sm"
          />

          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  filter === f.key
                    ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-white"
                    : "border-[color:var(--color-line)] text-[color:var(--color-muted)]"
                }`}
              >
                {f.label}
                {f.key === "unread" && rows.some((r) => r.staffUnreadCount > 0)
                  ? ` (${rows.filter((r) => r.staffUnreadCount > 0).length})`
                  : ""}
              </button>
            ))}
          </div>

          <div className="-mx-1 flex max-h-[60vh] min-h-0 flex-col overflow-y-auto sm:max-h-[calc(100vh-19rem)]">
            {visibleRows.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-[color:var(--color-muted)]">
                {rows.length === 0
                  ? "ยังไม่มีแชท — เปิดลิงก์แชทหน้าเว็บหรือเชื่อม LINE OA ที่แท็บ “เชื่อมช่องทาง” เพื่อเริ่มรับข้อความ"
                  : "ไม่มีห้องที่ตรงกับตัวกรองนี้"}
              </p>
            ) : (
              visibleRows.map((r) => {
                const on = r.id === activeId;
                return (
                  <Link
                    key={r.id}
                    href={`${baseHref}?c=${r.id}`}
                    scroll={false}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-2 ${
                      on ? "bg-[color:var(--color-surface-2)]" : "hover:bg-[color:var(--color-surface-2)]"
                    }`}
                  >
                    <span className="relative shrink-0">
                      <span className="flex size-9 items-center justify-center rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-sm font-medium">
                        {initialsOf(r.title)}
                      </span>
                      <ChannelBadge type={r.channel} title={`ทักมาจาก ${channelLabel(r.channel)}`} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`min-w-0 truncate text-sm ${r.staffUnreadCount > 0 ? "font-semibold" : ""}`}>
                          {r.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-[color:var(--color-muted)]">
                          {shortTime(r.lastMessageAt)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs text-[color:var(--color-muted)]">
                          {r.preview ?? "—"}
                        </span>
                        {r.staffUnreadCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-[color:var(--color-accent)] px-1.5 text-[10px] font-medium text-white">
                            {r.staffUnreadCount}
                          </span>
                        ) : r.status !== "OPEN" ? (
                          <span className="shrink-0 text-[10px] text-[color:var(--color-muted)]">
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                );
              })
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
                {thread.messages.length === 0 ? (
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
