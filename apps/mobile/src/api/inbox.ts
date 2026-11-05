// ข้อมูลของโซน "ลูกค้า" (แชทลูกค้าแทนร้าน · ใบ S2.17–S2.19 · แบบ K1–K5) — type ตาม docs/api/SECRETARY-API.md แถว /api/mobile/inbox/**
//   + src/lib/mobile/inbox-dto.ts (S1.21 merge แล้ว — ของจริง)
// ทุกเส้นของ /api/mobile/inbox/* อยู่ในตาราง PATH/PATH_ID ไฟล์นี้ไฟล์เดียว (แบบเดียวกับ src/api/secretary.ts) — จอเรียกด้วยชื่อเส้น
//   เช่น inboxGet("inbox/conversations") · inboxPostId("inbox/conversations/[id]/reply", id, …)
// 🔴 3 แชทไม่ปน: เส้นตอบลูกค้า (…/reply) อยู่ที่นี่เท่านั้น · ไฟล์นี้ไม่มีเส้นของห้องเลขา (secretary/rooms*) และไม่มี mobile/chat/send
// 🔴 PII: ไม่เก็บข้อความ/เบอร์ลูกค้าลงเครื่อง (ไม่มี storage ในไฟล์นี้) · เบอร์ที่แสดงผ่าน maskPhone เสมอ
import { useSyncExternalStore } from "react";
import { getTenantId, getToken } from "@/src/lib/session";
import { ApiError, BASE_URL } from "@/src/api/client";

// ───────── ตารางเส้น (ชื่อที่จอใช้ → path จริง) ─────────
const PATH = {
  "inbox/systems": "/api/mobile/inbox/systems",
  "inbox/conversations": "/api/mobile/inbox/conversations",
  "inbox/quick-replies": "/api/mobile/inbox/quick-replies",
  "inbox/staff": "/api/mobile/inbox/staff",
  "inbox/connections": "/api/mobile/inbox/connections",
  "inbox/routing": "/api/mobile/inbox/routing",
  "inbox/shift": "/api/mobile/inbox/shift",
  "inbox/attachments": "/api/mobile/inbox/attachments",
  // ค่าตั้งแจ้งเตือนต่อชนิด (S1.23 · route ของ S1.14 `GET/PUT notify {kind, mode}`) — K4 ใช้ kind=inbox
  "secretary/notify": "/api/mobile/secretary/notify",
  // ค้นสมาชิกเพื่อผูกกับแชท (เส้นเดิมของแอป 1.0 · คืน phoneMasked)
  "member/search": "/api/mobile/member/search",
} as const;
export type InboxPath = keyof typeof PATH;

const PATH_ID = {
  "inbox/conversations/[id]": "/api/mobile/inbox/conversations/[id]",
  "inbox/conversations/[id]/read": "/api/mobile/inbox/conversations/[id]/read",
  "inbox/conversations/[id]/reply": "/api/mobile/inbox/conversations/[id]/reply",
  "inbox/conversations/[id]/assign": "/api/mobile/inbox/conversations/[id]/assign",
  "inbox/conversations/[id]/status": "/api/mobile/inbox/conversations/[id]/status",
  "inbox/conversations/[id]/helpers": "/api/mobile/inbox/conversations/[id]/helpers",
  "inbox/conversations/[id]/handoff": "/api/mobile/inbox/conversations/[id]/handoff",
  "inbox/conversations/[id]/contact": "/api/mobile/inbox/conversations/[id]/contact",
  // ร่างคำตอบของ Shark (S1.22 ai-suggest) — ยังไม่มี route Bearer บนเซิร์ฟเวอร์ ⇒ 404 = ซ่อนการ์ด (หนี้ใน wo-notes sec-s2.17)
  "inbox/conversations/[id]/ai-suggest": "/api/mobile/inbox/conversations/[id]/ai-suggest",
  "inbox/quick-replies/[id]/apply": "/api/mobile/inbox/quick-replies/[id]/apply",
} as const;
export type InboxIdPath = keyof typeof PATH_ID;

// ───────── DTO (inbox-dto.ts) ─────────
export type ConvStatus = "OPEN" | "PENDING" | "RESOLVED";
export type InboxSystem = { id: string; name: string; channels: { type: string; label: string }[]; unread: number };
export type InboxContact = { id: string; displayName: string | null; avatarUrl: string | null; customerId: string | null };
export type ConvItem = {
  id: string;
  channel: string;
  contact: InboxContact;
  status: ConvStatus | string;
  assigneeUserId: string | null;
  assigneeName: string | null;
  unitId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  staffUnreadCount: number;
  /** OPEN ที่ยังไม่มีคำตอบแรก: นาทีที่ลูกค้ารอ · อื่น = null */
  waitingMin: number | null;
  aiDraft: boolean;
  helpers: string[];
  /** ยังไม่อยู่ใน DTO ของ S1.21 (หนี้ §N tags) — มีเมื่อเซิร์ฟเวอร์ส่ง ("รอคน" = ป้ายส่งต่อคนของ S1.22 §O) */
  tags?: string[];
};
export type AiMeta = { roomId: string | null; proposalId: string; approvedBy: string | null };
export type MsgAttachment = { name: string; url: string; kind: string; mimeType: string; durationMs: number | null };
export type MsgItem = {
  id: string;
  direction: "IN" | "OUT" | string;
  type: string;
  body: string | null;
  senderUserId: string | null;
  senderName: string | null;
  isInternal: boolean;
  deliveryStatus: "PENDING" | "SENT" | "FAILED" | string;
  stickerMeta: unknown;
  attachments: MsgAttachment[];
  meta: { ai: AiMeta } | null;
  createdAt: string;
};
export type Helper = { userId: string; name: string | null; calledById: string | null; note: string | null; createdAt: string };
export type Thread = {
  conversation: ConvItem;
  messages: MsgItem[];
  contact: InboxContact;
  linkedMember: { id: string; name: string | null; phone: string | null } | null;
  helpers: Helper[];
  nextBefore: string | null;
};
export type QuickReply = { id: string; shortcut: string | null; title: string; body: string; channelTypes: string[] };
export type StaffPick = { userId: string; name: string | null; role?: string; onDuty?: boolean };
export type Connection = { id: string; type: string; label: string; displayName: string; status: string; lastInboundAt: string | null; lastErrorAt: string | null };
export type RoutingMode = "ROUND_ROBIN" | "LAST_ASSIGNEE" | "OWNER";
export const ROUTING_MODES: readonly RoutingMode[] = ["ROUND_ROBIN", "LAST_ASSIGNEE", "OWNER"];
export type RoutingRule = { id?: string; channel: string | null; mode: RoutingMode | string; enabled: boolean; order: number };
export type Routing = { rules: RoutingRule[]; onDuty: { userId: string; name: string | null; since: string }[]; sla: { firstResponseMin: number | null; unassignedAlertMin: number | null } | null };
export type NotifyMode = "ALL" | "ASSIGNED" | "OFF";
export const NOTIFY_MODES: readonly NotifyMode[] = ["ALL", "ASSIGNED", "OFF"];
export type Upload = { url: string; name?: string; mimeType: string; size?: number; width?: number | null; height?: number | null; durationMs?: number };
export type ReplyAttachment = { url: string; mimeType: string; fileName?: string; sizeBytes?: number; width?: number; height?: number; durationMs?: number };
export type MemberHit = { id: string; memberCode?: string; name: string; phoneMasked?: string };

type GetMap = {
  "inbox/systems": { items?: InboxSystem[]; canReply?: boolean };
  "inbox/conversations": { items?: ConvItem[]; nextBefore?: string | null };
  "inbox/quick-replies": { items?: QuickReply[] };
  "inbox/staff": { items?: StaffPick[] };
  "inbox/connections": { items?: Connection[] };
  "inbox/routing": Routing;
  "secretary/notify": { prefs?: Partial<Record<string, string>> };
  "member/search": { items?: MemberHit[] };
};
type PostMap = {
  "inbox/shift": { body: { onDuty: boolean }; res: { onDuty: boolean; onDutyAt: string | null } };
};
type PutMap = {
  "inbox/routing": { body: { systemId?: string; rules: Omit<RoutingRule, "id">[] }; res: Routing };
  "secretary/notify": { body: { kind: "inbox"; mode: NotifyMode }; res: { prefs?: Partial<Record<string, string>> } };
};
type GetIdMap = {
  "inbox/conversations/[id]": Thread;
};
type PostIdMap = {
  "inbox/conversations/[id]/read": { body: { systemId?: string; lastReadMessageId?: string }; res: { ok: boolean } };
  "inbox/conversations/[id]/reply": {
    body: { systemId?: string; body?: string; attachments?: ReplyAttachment[]; isInternal?: boolean; clientMessageId: string };
    res: { messageId?: string; duplicate?: boolean; deliveryFailed?: boolean; message?: string };
  };
  "inbox/conversations/[id]/assign": { body: { systemId?: string; assigneeUserId: string | null }; res: { ok: boolean } };
  "inbox/conversations/[id]/status": { body: { systemId?: string; status: ConvStatus }; res: { ok: boolean } };
  "inbox/conversations/[id]/helpers": { body: { systemId?: string; helperUserId: string; note?: string }; res: { ok: boolean } };
  "inbox/conversations/[id]/handoff": { body: { systemId?: string; toUserId: string; reason: string }; res: { ok: boolean } };
  "inbox/conversations/[id]/contact": { body: { systemId?: string; customerId: string | null }; res: { ok: boolean } };
  "inbox/conversations/[id]/ai-suggest": { body: { systemId?: string }; res: { suggestionId?: string; options?: { id?: string; body: string }[]; body?: string } };
  "inbox/quick-replies/[id]/apply": { body: { systemId?: string; conversationId: string }; res: { body: string } };
};

type Query = Record<string, string | number | undefined | null>;
const qs = (q?: Query) =>
  q
    ? Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
const withQ = (p: string, q?: Query) => (qs(q) ? `${p}?${qs(q)}` : p);
const idPath = (p: InboxIdPath, id: string) => PATH_ID[p].replace("[id]", encodeURIComponent(id));

/** ล้มจากเซิร์ฟเวอร์ (ApiError เดิม + Retry-After ของ 429) */
export class InboxError extends ApiError {
  retryAfterSec: number | null;
  constructor(status: number, code: string, detail: string | undefined, retryAfterSec: number | null) {
    super(status, code, detail);
    this.retryAfterSec = retryAfterSec;
  }
}

/** ตัวเรียกของโซนลูกค้า (เหมือน api() ของ client.ts แต่เก็บ Retry-After ไว้ให้ 429 · body = JSON หรือ FormData) */
async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const tid = await getTenantId();
  if (tid) headers["x-tenant-id"] = tid;
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !form) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body) });
  if (!res.ok) {
    let code = "error";
    let detail: string | undefined;
    try {
      const b = (await res.json()) as { error?: string; message?: string };
      code = b.error ?? "error";
      detail = typeof b.message === "string" ? b.message : undefined;
    } catch {
      /* body ไม่ใช่ JSON */
    }
    const ra = Number(res.headers.get("retry-after"));
    throw new InboxError(res.status, code, detail, Number.isFinite(ra) && ra > 0 ? ra : null);
  }
  return (await res.json()) as T;
}

export function inboxGet<P extends keyof GetMap>(path: P, q?: Query): Promise<GetMap[P]> {
  return call<GetMap[P]>(withQ(PATH[path], q), "GET");
}
export function inboxPost<P extends keyof PostMap>(path: P, body: PostMap[P]["body"]): Promise<PostMap[P]["res"]> {
  return call<PostMap[P]["res"]>(PATH[path], "POST", body);
}
export function inboxPut<P extends keyof PutMap>(path: P, body: PutMap[P]["body"]): Promise<PutMap[P]["res"]> {
  return call<PutMap[P]["res"]>(PATH[path], "PUT", body);
}
export function inboxGetId<P extends keyof GetIdMap>(path: P, id: string, q?: Query): Promise<GetIdMap[P]> {
  return call<GetIdMap[P]>(withQ(idPath(path, id), q), "GET");
}
export function inboxPostId<P extends keyof PostIdMap>(path: P, id: string, body: PostIdMap[P]["body"]): Promise<PostIdMap[P]["res"]> {
  return call<PostIdMap[P]["res"]>(idPath(path, id), "POST", body);
}

/** แนบไฟล์ (multipart `file` ≤ 10 MB → POST inbox/attachments) — ผลใส่ใน attachments ของ …/reply */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export function inboxUpload(path: "inbox/attachments", form: FormData): Promise<Upload> {
  return call<Upload>(PATH[path], "POST", form);
}

// ───────── ตัวช่วยของจอ ─────────
/** สถานะ/รหัสของข้อผิดพลาด */
export const statusOf = (e: unknown): number | null => (e instanceof ApiError ? e.status : null);
/** ข้อความไทยของเซิร์ฟเวอร์ (ไม่มี = null · จอใช้ i18n ของตัวเอง) */
export function inboxNote(e: unknown): string | null {
  return e instanceof ApiError && typeof e.detail === "string" && e.detail.trim() ? e.detail.trim() : null;
}

/** รหัสข้อความฝั่งแอปของการตอบลูกค้า (กันส่งซ้ำ · ส่งซ้ำหลังล้ม/429 ใช้รหัสเดิม) */
export function replyMessageId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** เบอร์สำหรับแสดง: เหลือ 3 ตัวหน้า + 4 ตัวท้าย (เซิร์ฟเวอร์ส่ง linkedMember.phone เต็ม — หนี้ PII ใน wo-notes) */
export function maskPhone(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length < 7) return d ? "•••" : null;
  return `${d.slice(0, 3)}-xxx-${d.slice(-4)}`;
}

/** ป้ายส่งต่อคน (S1.22 §O) — แท็กนี้ในห้อง = Shark ส่งเรื่องให้คนดูแล */
export const WAITING_HUMAN_TAG = "รอคน";

/** ห้องที่ "ยังไม่ตอบ" (แท็บ K1): OPEN และยังไม่มีคนรับ หรือ มีข้อความที่ทีมยังไม่อ่าน */
export function isUnanswered(c: Pick<ConvItem, "status" | "assigneeUserId" | "staffUnreadCount">): boolean {
  return (c.status === "OPEN" && !c.assigneeUserId) || c.staffUnreadCount > 0;
}

/** ช่องทางที่มีหน้าต่างตอบ 24 ชม. (Meta) — เลยเวลา = ส่งไม่ได้ (แถบเตือน K2) */
export const WINDOW_CHANNELS: ReadonlySet<string> = new Set(["FACEBOOK", "INSTAGRAM"]);
export const REPLY_WINDOW_MS = 24 * 3600_000;
/** ชั่วโมงที่ยังตอบได้ (ช่องทางที่มีหน้าต่าง) · ไม่มีหน้าต่าง = null · หมด = 0 */
export function replyWindowHours(channel: string, msgs: Pick<MsgItem, "direction" | "createdAt">[], nowMs: number): number | null {
  if (!WINDOW_CHANNELS.has(channel)) return null;
  const lastIn = [...msgs].reverse().find((m) => m.direction === "IN");
  const at = lastIn ? Date.parse(lastIn.createdAt) : NaN;
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.floor((at + REPLY_WINDOW_MS - nowMs) / 3600_000));
}

/** เปิดลิงก์ไฟล์/เสียงได้เฉพาะ https (R-S2.17c) — อย่างอื่น (javascript: data: http: ฯลฯ) ไม่เปิด */
export function isSafeLink(url: string | null | undefined): boolean {
  return typeof url === "string" && /^https:\/\/[^\s]+$/i.test(url.trim());
}

// ───────── ระบบแชทที่เลือกอยู่ (K1 → K2/K3 ส่งต่อทาง ?s=) · ล้างตอนสลับผู้ใช้/ร้าน (resetInboxState) ─────────
let currentSystemId: string | null = null;
export function setCurrentSystem(id: string | null): void {
  currentSystemId = id;
}
export function getCurrentSystem(): string | null {
  return currentSystemId;
}

// ───────── สิทธิ์ตอบลูกค้า (inbox/systems.canReply) — store กลาง (R-S2.17a) · null = ยังไม่รู้ ─────────
let canReplyState: boolean | null = null;
const replyListeners = new Set<() => void>();
export function setInboxCanReply(v: boolean | null): void {
  if (canReplyState === v) return;
  canReplyState = v;
  replyListeners.forEach((fn) => fn());
}
const getCanReply = () => canReplyState;
export function useInboxCanReply(): boolean | null {
  return useSyncExternalStore(
    (l) => {
      replyListeners.add(l);
      return () => replyListeners.delete(l);
    },
    getCanReply,
    getCanReply,
  );
}

/** สลับผู้ใช้/ร้าน ⇒ ล้างระบบที่เลือก + สิทธิ์ตอบ (เรียกจาก useSecretaryZone) */
export function resetInboxState(): void {
  currentSystemId = null;
  setInboxCanReply(null);
}
