// ข้อมูลของจอเลขา AI ฝั่งแอป — type ตาม docs/api/SECRETARY-API.md + docs/modules/31-secretary.md (COMMON §C.12)
// ทุกเส้นของ /api/mobile/secretary/* อยู่ในไฟล์นี้ไฟล์เดียว (ตาราง PATH) — ชื่อเส้นเปลี่ยนหลัง S1.14 = แก้ PATH ที่เดียว
// จอเรียกด้วยชื่อเส้น เช่น secGet("secretary/rooms") · DTO ที่ยังไม่นิ่ง (S1.14 ยังไม่ merge) ผ่านตัว normalize* ที่รับได้หลายรูป
// ทุกเส้นพลาดได้ — จอใช้ค่าปริยาย/สถานะของตัวเอง (isDenied / startErrorKind)
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, ApiError } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import { langFrom, setLang } from "@/src/i18n";

// ───────── ตารางเส้น (ชื่อที่จอใช้ → path จริง) ─────────
const PATH = {
  "secretary/me": "/api/mobile/secretary/me",
  "secretary/rooms": "/api/mobile/secretary/rooms",
  "secretary/suggestions": "/api/mobile/secretary/suggestions",
  "secretary/frequent": "/api/mobile/secretary/frequent",
  "secretary/access": "/api/mobile/secretary/access",
  "secretary/inbox/count": "/api/mobile/secretary/inbox/count",
  "inbox/unread": "/api/mobile/inbox/unread",
  // S2.4 ห้องงาน — ชื่อ = path ใต้ /api/mobile (S1.14) · "[id]" แทนด้วย id ตอนเรียก (secGetId/secPostId)
  "secretary/log": "/api/mobile/secretary/log",
  // S2.5 กล่องรวมรออนุมัติ (ทุกกิจการ · ไม่ส่ง x-tenant-id) · งานประจำ · S2.6 badge ไอคอนแอป
  "secretary/inbox": "/api/mobile/secretary/inbox",
  "secretary/scheduled": "/api/mobile/secretary/scheduled",
  "secretary/badge": "/api/mobile/secretary/badge",
} as const;
export type SecPath = keyof typeof PATH;

/** เส้นที่มี [id] (ห้อง/ข้อเสนอ/แผน/บันทึก) — แยกตารางเพราะต้องแทน id */
const PATH_ID = {
  "secretary/rooms/[id]": "/api/mobile/secretary/rooms/[id]",
  "secretary/rooms/[id]/messages": "/api/mobile/secretary/rooms/[id]/messages",
  "secretary/rooms/[id]/proposals": "/api/mobile/secretary/rooms/[id]/proposals",
  "secretary/rooms/[id]/send": "/api/mobile/secretary/rooms/[id]/send",
  "secretary/rooms/[id]/close": "/api/mobile/secretary/rooms/[id]/close",
  "secretary/proposals/[id]/approve": "/api/mobile/secretary/proposals/[id]/approve",
  "secretary/proposals/[id]/reject": "/api/mobile/secretary/proposals/[id]/reject",
  "secretary/proposals/[id]/edit": "/api/mobile/secretary/proposals/[id]/edit",
  "secretary/plans/[id]/approve": "/api/mobile/secretary/plans/[id]/approve",
  "secretary/plans/[id]/reject": "/api/mobile/secretary/plans/[id]/reject",
  "secretary/log/[id]/undo": "/api/mobile/secretary/log/[id]/undo",
  "secretary/scheduled/[id]": "/api/mobile/secretary/scheduled/[id]",
} as const;
export type SecIdPath = keyof typeof PATH_ID;

export type SecretaryMe = {
  name: string;
  suffix: string;
  tone?: "polite" | "friendly" | "brief";
  languages: string[];
  stats?: { jobs: number; approvedClean: number; edited: number; rejected: number };
};

/** สถานะห้องของการ์ด (lib rooms.ts roomStatusOf) — รูปอื่นจาก DTO (QUEUED/WAITING_APPROVAL/CLOSED/FAILED) ผ่าน normStatus */
export type RoomStatus = "OPEN" | "RUNNING" | "WAITING" | "DONE";
type Person = { id?: string; name?: string | null; isMe?: boolean };
/** รูปดิบของแถวห้องจาก GET secretary/rooms — รับทั้งรูปในร่าง API และรูปของ lib (startedById/startedByName/memberIds) */
export type RoomRaw = {
  id: string;
  title?: string | null;
  status?: string;
  systems?: string[] | null;
  startedBy?: Person | null;
  startedById?: string;
  startedByName?: string | null;
  sharedWith?: Person[] | null;
  members?: Person[] | null;
  memberIds?: string[] | null;
  unread?: boolean | number;
  pendingProposals?: number;
  badge?: { pendingProposals?: number; unread?: number } | null;
  updatedAt?: string;
};
/** แถวห้องที่จอใช้ (ผ่าน normalizeRoom แล้ว) */
export type RoomCard = {
  id: string;
  title: string;
  status: RoomStatus;
  systems: string[];
  starterName: string | null;
  startedByMe: boolean;
  /** คนอื่นในห้อง (ไม่รวมเรา) */
  others: { id: string; name: string | null }[];
  pending: number;
  unread: boolean;
  updatedAt: string;
};

export type Suggestion = { key: string; system: string; title: string; instruction: string };
export type Frequent = { title: string; instruction: string };
export type AccessItem = { module: string; level: "OFF" | "READ" | "DRAFT" | "AUTO" | string };
export type InboxCount = { total: number; canApprove: number };

/** ชื่อเลขาปริยายก่อนโหลด/เมื่อโหลดไม่ได้ (ค่าเริ่มต้นของระบบ · C1) */
export const DEFAULT_SECRETARY_NAME = "Shark";

type GetMap = {
  "secretary/me": SecretaryMe;
  "secretary/rooms": { items?: RoomRaw[]; nextBefore?: string | null };
  "secretary/suggestions": { items?: unknown[]; frequent?: unknown[] } | unknown[];
  "secretary/frequent": { items?: unknown[] } | unknown[];
  "secretary/access": { items?: AccessItem[]; autoAvailable?: boolean };
  "secretary/inbox/count": InboxCount;
  "inbox/unread": { unread: number };
  "secretary/log": { items?: unknown[] };
  "secretary/inbox": { items?: unknown[] };
  "secretary/scheduled": { items?: unknown[]; max?: number };
  "secretary/badge": { badge?: number };
};
type PostMap = {
  "secretary/rooms": { body: { instruction: string; clientMessageId: string; systems?: string[] }; res: { roomId: string; conversationId?: string; status?: string } };
  "secretary/scheduled": { body: ScheduleBody; res: { id: string } };
};
type Query = Record<string, string | number | undefined>;

function url(path: SecPath, q?: Query): string {
  const qs = q
    ? Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return qs ? `${PATH[path]}?${qs}` : PATH[path];
}

/** เส้นระดับผู้ใช้ (ไม่ส่ง x-tenant-id · SECRETARY-API ข้อ 1): secretary/me · กล่องรวมทุกกิจการ secretary/inbox */
const USER_LEVEL: ReadonlySet<SecPath> = new Set<SecPath>(["secretary/me", "secretary/inbox"]);

/** GET เส้นของเลขา · เส้นระดับผู้ใช้ไม่ส่ง x-tenant-id */
export function secGet<P extends keyof GetMap>(path: P, q?: Query): Promise<GetMap[P]> {
  return api<GetMap[P]>(url(path, q), { tenant: !USER_LEVEL.has(path) });
}

export function secPost<P extends keyof PostMap>(path: P, body: PostMap[P]["body"]): Promise<PostMap[P]["res"]> {
  return api<PostMap[P]["res"]>(url(path), { method: "POST", body });
}

// ───────── เส้นที่มี [id] (S2.4 ห้องงาน · ชื่อ/รูปตาม S1.14 docs/api/SECRETARY-API.md) ─────────
/** ผลอนุมัติ (200 เสมอ · ไม่ผ่าน = ok:false + note ไทย) · DESTRUCTIVE ที่ยังไม่ยืนยัน 2 ชั้น ⇒ needsSecondConfirm */
export type ApproveRes = { ok: boolean; note?: string; needsSecondConfirm?: boolean; why?: string; doneCount?: number };
export type RejectBody = { note?: string; remember?: "JOB" | "RULE" };
/** POST/PUT งานประจำ (สัญญา SECRETARY-API · รุ่นแรกแอปตั้งได้แค่ DAILY/WEEKLY) */
export type ScheduleBody = { instruction: string; hourBkk: number; frequency: "DAILY" | "WEEKLY"; days?: number[]; channels: ("push" | "room")[] };
type GetIdMap = {
  "secretary/rooms/[id]": Record<string, unknown>;
  "secretary/rooms/[id]/messages": { items?: unknown[]; nextBefore?: string | null };
  "secretary/rooms/[id]/proposals": { items?: unknown[] };
};
type PostIdMap = {
  "secretary/rooms/[id]/send": { body: { text: string; clientMessageId: string }; res: { ok?: boolean; messageId?: string; jobId?: string; duplicate?: boolean } };
  "secretary/rooms/[id]/close": { body: Record<string, never>; res: { ok: boolean } };
  "secretary/proposals/[id]/approve": { body: { confirm2x?: boolean }; res: ApproveRes };
  "secretary/proposals/[id]/reject": { body: RejectBody; res: { ok: boolean; memoryId?: string } };
  "secretary/proposals/[id]/edit": { body: { patch: Record<string, unknown> }; res: { ok: boolean; input?: Record<string, unknown> | null } };
  "secretary/plans/[id]/approve": { body: { confirm2x?: boolean }; res: ApproveRes };
  "secretary/plans/[id]/reject": { body: Record<string, never>; res: { ok: boolean } };
  "secretary/log/[id]/undo": { body: Record<string, never>; res: { ok: boolean; note?: string } };
};

function urlId(path: SecIdPath, id: string, q?: Query): string {
  const base = PATH_ID[path].replace("[id]", encodeURIComponent(id));
  const qs = q
    ? Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return qs ? `${base}?${qs}` : base;
}

export function secGetId<P extends keyof GetIdMap>(path: P, id: string, q?: Query): Promise<GetIdMap[P]> {
  return api<GetIdMap[P]>(urlId(path, id, q));
}

/** opts.tenantId = ยิงในนามกิจการของรายการ (กล่องรวม S2.5) แทนกิจการ active */
export function secPostId<P extends keyof PostIdMap>(path: P, id: string, body: PostIdMap[P]["body"], opts?: { tenantId?: string }): Promise<PostIdMap[P]["res"]> {
  return api<PostIdMap[P]["res"]>(urlId(path, id), { method: "POST", body, ...(opts?.tenantId ? { tenantId: opts.tenantId } : {}) });
}

/** PUT secretary/scheduled/[id] — เซิร์ฟเวอร์รุ่นนี้รับเฉพาะ {active} (เวลา/ความถี่ = 400 not_supported → ลบแล้วตั้งใหม่) */
export function secPutId(path: "secretary/scheduled/[id]", id: string, body: { active: boolean }): Promise<{ ok: boolean; active?: boolean }> {
  return api(urlId(path, id), { method: "PUT", body });
}

export function secDeleteId(path: "secretary/scheduled/[id]", id: string): Promise<{ ok: boolean }> {
  return api(urlId(path, id), { method: "DELETE" });
}

/** รหัสข้อความฝั่งแอป (กันส่งซ้ำ · POST rooms) */
export function clientMessageId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────── สถานะผิดพลาด ─────────
/** 403 = บัญชีนี้ยังใช้เลขาในกิจการนี้ไม่ได้ (R-S2.1d) */
export function isDenied(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403;
}

/** ผลของ POST rooms ที่ล้ม → ชนิดข้อความบนจอ A2 */
export function startErrorKind(e: unknown): "quota" | "rate" | "denied" | "other" {
  if (!(e instanceof ApiError)) return "other";
  if (e.status === 402 || /quota/i.test(e.code)) return "quota";
  if (e.status === 429) return "rate";
  if (e.status === 403) return "denied";
  return "other";
}

// ───────── normalize (DTO ยังไม่นิ่งจน S1.14) ─────────
export function normStatus(s: unknown): RoomStatus {
  switch (s) {
    case "RUNNING":
    case "QUEUED":
      return "RUNNING";
    case "WAITING":
    case "WAITING_APPROVAL":
      return "WAITING";
    case "DONE":
    case "CLOSED":
    case "FAILED":
      return "DONE";
    default:
      return "OPEN";
  }
}

export function normalizeRoom(r: RoomRaw, myUserId: string | null | undefined): RoomCard {
  const starterId = r.startedBy?.id ?? r.startedById ?? null;
  const startedByMe = r.startedBy?.isMe ?? (!!myUserId && starterId === myUserId);
  const people: { id: string; name: string | null }[] = (r.sharedWith ?? r.members ?? []).map((p, i) => ({ id: p.id ?? `p${i}`, name: p.name ?? null }));
  const fromIds = people.length === 0 ? (r.memberIds ?? []).map((id) => ({ id, name: null })) : people;
  const others = fromIds.filter((p) => p.id !== myUserId && p.id !== starterId);
  const pending = Math.max(0, Math.floor(Number(r.badge?.pendingProposals ?? r.pendingProposals ?? 0) || 0));
  const unread = typeof r.unread === "number" ? r.unread > 0 : !!(r.unread ?? (r.badge?.unread ?? 0) > 0);
  return {
    id: r.id,
    title: (r.title ?? "").trim(),
    status: normStatus(r.status),
    systems: Array.isArray(r.systems) ? r.systems.filter((x) => typeof x === "string") : [],
    starterName: r.startedBy?.name ?? r.startedByName ?? null,
    startedByMe,
    others,
    pending,
    unread,
    updatedAt: r.updatedAt ?? "",
  };
}

const listOf = (v: unknown, key = "items"): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as Record<string, unknown>)[key]) ? ((v as Record<string, unknown>)[key] as unknown[]) : []);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function normalizeSuggestions(v: unknown): Suggestion[] {
  return listOf(v)
    .map((x, i) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { key: str(o.key) || `s${i + 1}`, system: str(o.system), title: str(o.title), instruction: str(o.instruction) || str(o.title) };
    })
    .filter((s) => s.title && s.instruction);
}

/** สั่งบ่อย: GET frequent (`{items:[{instruction,count}]}`) หรือ `frequent` ที่แนบมากับ suggestions (ร่าง API) */
export function normalizeFrequent(v: unknown, key = "items"): Frequent[] {
  return listOf(v, key)
    .map((x) => {
      const o = (typeof x === "string" ? { instruction: x } : (x ?? {})) as Record<string, unknown>;
      const instruction = str(o.instruction);
      return { title: str(o.title) || instruction, instruction };
    })
    .filter((f) => f.instruction);
}

// ───────── ห้องงาน (S2.4) — normalize DTO ของ S1.14 (รับรูปที่ขยายภายหลังได้: why · step.status · room.plans · entity.link) ─────────
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isoOf = (v: unknown): string => (typeof v === "string" ? v : "");
const isoOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** โมดูลจาก kind ("chat.send" → chat · "kanban_create_card" → kanban · "member.points.give" → member) */
export function moduleOfKind(kind: string): string {
  return (kind.split(/[._]/)[0] ?? "").toLowerCase();
}

export type MsgRow = { id: string; role: "user" | "assistant" | "system"; content: string; authorId: string | null; at: string };
export function normalizeMessages(v: unknown): MsgRow[] {
  return listOf(v)
    .map((x) => {
      const o = rec(x);
      const role = String(o.role ?? "").toLowerCase();
      const system = o.system === true || o.authorUserId === "system";
      return {
        id: str(o.id),
        role: system ? "system" : role === "user" ? "user" : role === "assistant" ? "assistant" : "system",
        content: typeof o.content === "string" ? o.content : "",
        authorId: typeof o.authorUserId === "string" && o.authorUserId !== "system" ? o.authorUserId : null,
        at: isoOf(o.createdAt),
      } as MsgRow;
    })
    .filter((m) => m.id && m.content.trim());
}

export type StepStatus = "done" | "run" | "wait";
export type StepRow = { kind: string; module: string; summary: string; status: StepStatus };
function stepStatus(v: unknown, fallback: StepStatus): StepStatus {
  const s = String(v ?? "").toUpperCase();
  if (s === "DONE" || s === "OK" || s === "EXECUTED") return "done";
  if (s === "RUNNING" || s === "RUN") return "run";
  if (s === "WAITING" || s === "PENDING" || s === "WAIT") return "wait";
  return fallback;
}

export type ProposalItem = {
  type: "proposal";
  id: string;
  kind: string;
  module: string;
  /** ข้อความเต็มจากเซิร์ฟเวอร์ (chat.send = เนื้อความทั้งฉบับ · §M) */
  summary: string;
  destructive: boolean;
  money: boolean;
  customerFacing: boolean;
  piiExport: boolean;
  /** เหตุผล "ทำไมต้องอนุมัติ" จากเซิร์ฟเวอร์ (approvalGate) — ไม่มี = ไม่แสดง (ไม่แต่งเอง) */
  why: string | null;
  editable: boolean;
  input: Record<string, unknown> | null;
  edited: boolean;
  at: string;
};
export type PlanItem = { type: "plan"; id: string; title: string; steps: StepRow[]; destructive: boolean; why: string | null; pending: boolean; at: string };
export type ApprovalItem = ProposalItem | PlanItem;

const whyOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).join(" · ") || null : null);

function planOf(o: Record<string, unknown>, pending: boolean): PlanItem {
  const steps = (Array.isArray(o.steps) ? o.steps : [])
    .map((x) => rec(x))
    .filter((x) => typeof x.summary === "string")
    .map((x) => {
      const kind = str(x.kind);
      return { kind, module: str(x.module) || moduleOfKind(kind), summary: str(x.summary), status: stepStatus(x.status, "wait") };
    });
  return { type: "plan", id: str(o.id), title: str(o.title), steps, destructive: o.hasDestructive === true, why: whyOf(o.why), pending, at: isoOf(o.createdAt) };
}

/** GET rooms/[id]/proposals → ข้อเสนอ + แผนที่รออนุมัติ */
export function normalizeApprovals(v: unknown): ApprovalItem[] {
  return listOf(v)
    .map((x): ApprovalItem | null => {
      const o = rec(x);
      if (!str(o.id)) return null;
      if (o.type === "plan") return planOf(o, true);
      const kind = str(o.kind);
      const cls = rec(o.class ?? o.classes);
      const input = o.input && typeof o.input === "object" && !Array.isArray(o.input) ? (o.input as Record<string, unknown>) : null;
      return {
        type: "proposal",
        id: str(o.id),
        kind,
        module: moduleOfKind(kind),
        summary: typeof o.summary === "string" ? o.summary.trim() : "",
        destructive: o.risk === "DESTRUCTIVE" || cls.destructive === true || o.destructive === true,
        money: cls.money === true,
        customerFacing: cls.customerFacing === true,
        piiExport: cls.piiExport === true,
        why: whyOf(o.why),
        editable: o.editable === true && !!input,
        input,
        edited: o.edited === true,
        at: isoOf(o.createdAt),
      };
    })
    .filter((x): x is ApprovalItem => !!x);
}

export type LogItem = {
  id: string;
  kind: string;
  module: string;
  summary: string;
  entity: { type: string; id: string; link: string | null } | null;
  undoableUntil: string | null;
  undoneAt: string | null;
  canUndo: boolean;
  at: string;
};
/** GET log?roomId → การ์ด "ทำแล้ว" (canUndo จากเซิร์ฟเวอร์ ∩ ยังไม่เลยเวลาที่เครื่อง) */
export function normalizeLog(v: unknown, nowMs: number): LogItem[] {
  return listOf(v)
    .map((x) => {
      const o = rec(x);
      const e = rec(o.entity);
      const kind = str(o.kind);
      const until = isoOrNull(o.undoableUntil);
      const undoneAt = isoOrNull(o.undoneAt);
      const inTime = !!until && Date.parse(until) > nowMs;
      return {
        id: str(o.id),
        kind,
        module: str(o.module) || moduleOfKind(kind),
        summary: str(o.summary),
        entity: str(e.type) && str(e.id) ? { type: str(e.type), id: str(e.id), link: typeof e.link === "string" ? e.link : null } : null,
        undoableUntil: until,
        undoneAt,
        canUndo: (o.canUndo === undefined ? true : o.canUndo === true) && !undoneAt && inTime,
        at: isoOf(o.createdAt),
      };
    })
    .filter((l) => l.id && l.summary)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export type RoomDetail = {
  id: string;
  title: string;
  status: RoomStatus;
  /** สถานะดิบ (QUEUED/RUNNING ⇒ poll เร็ว) */
  rawStatus: string;
  startedById: string;
  createdAt: string;
  updatedAt: string;
  closed: boolean;
  canManage: boolean;
  members: { userId: string; name: string | null }[];
  /** ความคืบหน้าของแผนที่กำลังทำ (ถ้าเซิร์ฟเวอร์ส่ง `plans`) */
  plans: PlanItem[];
};
export function normalizeRoomDetail(v: unknown): RoomDetail {
  const o = rec(rec(v).room ?? v);
  const raw = str(o.status).toUpperCase();
  return {
    id: str(o.id),
    title: str(o.title),
    status: normStatus(raw),
    rawStatus: raw,
    startedById: str(o.startedById),
    createdAt: isoOf(o.createdAt),
    updatedAt: isoOf(o.updatedAt),
    closed: !!o.closedAt || raw === "CLOSED",
    canManage: o.canManage === true,
    members: (Array.isArray(o.members) ? o.members : []).map((m) => rec(m)).filter((m) => str(m.userId)).map((m) => ({ userId: str(m.userId), name: str(m.name) || null })),
    plans: (Array.isArray(o.plans) ? o.plans : []).map((p) => planOf(rec(p), false)).filter((p) => p.id && p.steps.length > 0),
  };
}

/**
 * ลิงก์ "เปิดของจริง" ของ entity → เส้นทางแอป · `link` ของเซิร์ฟเวอร์ (/app/…) ชนะ (เปิดใน WebView หน้าแรก 1.0 ด้วย `?open=`)
 *   crm.deal → จอดีล native (/crm?dealId=) · booking.appointment → ปฏิทินของร้าน · kanban.card → หน้าแรกเว็บของร้าน (ยังไม่มีลิงก์ตรงจนเซิร์ฟเวอร์ส่ง link)
 */
export function entityRoute(e: { type: string; id: string; link: string | null } | null, nonce: string): { pathname: string; params: Record<string, string> } | null {
  if (!e) return null;
  if (e.link && /^\/app\/[A-Za-z0-9_\-/]*(\?[A-Za-z0-9_=&\-]*)?$/.test(e.link)) return { pathname: "/", params: { open: e.link, t: nonce } };
  if (e.type === "crm.deal") return { pathname: "/crm", params: { dealId: e.id } };
  if (e.type === "booking.appointment") return { pathname: "/", params: { open: "/app/calendar", t: nonce } };
  if (e.type === "kanban.card") return { pathname: "/", params: { open: "/app/", t: nonce } };
  return null;
}

// ───────── secretary/me — cache ต่อผู้ใช้ (R-S2.1b) · ล้ม = ไม่ cache ─────────
let me: { userId: string; data: SecretaryMe } | null = null;
let inflight: { userId: string; p: Promise<SecretaryMe | null> } | null = null;
const meListeners = new Set<() => void>();
const emitMe = () => meListeners.forEach((fn) => fn());

/** โหลดเลขาของผู้ใช้นี้ (ครั้งเดียวต่อ user.id) · เปลี่ยนภาษาของจอเลขาตาม languages[0] */
export function loadSecretaryMe(userId: string | null | undefined, force = false): Promise<SecretaryMe | null> {
  if (!userId) {
    resetSecretaryMe();
    return Promise.resolve(null);
  }
  if (!force && me?.userId === userId) return Promise.resolve(me.data);
  if (!force && inflight?.userId === userId) return inflight.p;
  const p: Promise<SecretaryMe | null> = secGet("secretary/me")
    .then((r) => {
      if (inflight?.p !== p) return r; // ถูก reset ระหว่างรอ — ไม่เขียนทับ
      inflight = null;
      me = { userId, data: r };
      const l = langFrom(r.languages?.[0]);
      if (l) setLang(l);
      emitMe();
      return r;
    })
    .catch(() => {
      if (inflight?.p === p) inflight = null; // offline/401 ⇒ ไม่ cache ครั้งหน้าลองใหม่
      return null;
    });
  inflight = { userId, p };
  return p;
}

/** ล้าง cache (signOut · switchTenant · เปลี่ยนผู้ใช้) */
export function resetSecretaryMe(): void {
  me = null;
  inflight = null;
  emitMe();
}

const getMe = () => me?.data ?? null;
export function useSecretaryMe(): SecretaryMe | null {
  return useSyncExternalStore(
    (l) => {
      meListeners.add(l);
      return () => meListeners.delete(l);
    },
    getMe,
    getMe,
  );
}

// ───────── badge 3 โซน — store กลาง (R-S2.1e) · โหลดที่ layout ของโซน (focus/foreground) ─────────
export type ZoneCounts = { secretary: number; customers: number; team: number };
const ZERO: ZoneCounts = { secretary: 0, customers: 0, team: 0 };
let badges: ZoneCounts = ZERO;
const badgeListeners = new Set<() => void>();

export async function refreshZoneBadges(): Promise<void> {
  const [sec, cust] = await Promise.all([secGet("secretary/inbox/count").catch(() => null), secGet("inbox/unread").catch(() => null)]);
  // ทีม = ยังไม่มีแหล่ง (S2.10)
  badges = { secretary: sec?.canApprove ?? 0, customers: cust?.unread ?? 0, team: 0 };
  badgeListeners.forEach((fn) => fn());
}

const getBadges = () => badges;
export function useZoneBadgeCounts(): ZoneCounts {
  return useSyncExternalStore(
    (l) => {
      badgeListeners.add(l);
      return () => badgeListeners.delete(l);
    },
    getBadges,
    getBadges,
  );
}

/**
 * ชั้น layout ของโซน (secretary/customers/business): โหลด secretary/me ต่อ user.id ·
 * ผู้ใช้/กิจการเปลี่ยน (signOut · switchTenant) ⇒ resetSecretaryMe + โหลดใหม่ · badge โหลดตอน focus + กลับมา foreground
 */
export function useSecretaryZone(): void {
  const { user, activeTenantId } = useAuth();
  const userId = user?.id ?? null;
  useEffect(() => {
    resetSecretaryMe();
    badges = ZERO;
    badgeListeners.forEach((fn) => fn());
    void loadSecretaryMe(userId);
    if (userId && activeTenantId) void refreshZoneBadges();
  }, [userId, activeTenantId]);
  useFocusEffect(
    useCallback(() => {
      if (!userId || !activeTenantId) return;
      void refreshZoneBadges();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") void refreshZoneBadges();
      });
      return () => sub.remove();
    }, [userId, activeTenantId]),
  );
}

// ───────── S2.5 กล่องรวมรออนุมัติทุกกิจการ (A6) — GET secretary/inbox (ไม่ส่ง x-tenant-id) ─────────
/** ชั้นของรายการในกล่องรวม (แท็บ เงิน/ส่งลูกค้า/ลบ) */
export type InboxClass = { money: boolean; customer: boolean; destructive: boolean };
export type InboxRow = {
  tenantId: string;
  tenantName: string;
  type: "proposal" | "plan";
  id: string;
  roomId: string | null;
  conversationId: string | null;
  summary: string;
  kind: string;
  module: string;
  canApprove: boolean;
  /** เหตุผลที่ต้องอนุมัติจากเซิร์ฟเวอร์ (มีเมื่อ canApprove) — ไม่มี = ไม่แสดง */
  why: string | null;
  cls: InboxClass;
  createdAt: string;
  expiresAt: string | null;
};

// กระจกของ src/lib/ai/secretary/kind-class.ts (แอปอ่านโค้ดเซิร์ฟเวอร์ไม่ได้) — ใช้เฉพาะเมื่อ DTO ไม่ส่ง `class` มาเอง
//   destructive = risk DESTRUCTIVE ของแถว (ชุดเดียวกับยืนยัน 2 ชั้น) · เงิน/ส่งลูกค้า = โมดูล + prefix ของ kind
const MONEY_MODULES = new Set(["account", "payments", "finance", "cheques", "point", "reward", "ticket", "restaurant"]);
const MONEY_PREFIXES = ["member.points.", "member.giftcards.", "member.wallet.", "member.rewards.", "member.vouchers."];
const CUSTOMER_KINDS = new Set(["chat.send", "marketing_create_campaign", "coupon_create"]);
const CUSTOMER_PREFIXES = ["crm.emails.", "member.campaigns.", "member.journeys.", "member.notifications.", "crm.sequences."];

export function inboxClassOf(kind: string, risk: string, server?: unknown): InboxClass {
  const s = rec(server);
  if (Object.keys(s).length > 0) return { money: s.money === true, customer: s.customerFacing === true || s.customer === true, destructive: s.destructive === true || risk === "DESTRUCTIVE" };
  const k = kind;
  const mod = moduleOfKind(k);
  return {
    destructive: risk === "DESTRUCTIVE",
    money: !!k && (MONEY_MODULES.has(mod) || MONEY_PREFIXES.some((p) => k.startsWith(p)) || /refund|void|pay/i.test(k)),
    customer: CUSTOMER_KINDS.has(k) || CUSTOMER_PREFIXES.some((p) => k.startsWith(p)),
  };
}

export function normalizeInbox(v: unknown): InboxRow[] {
  return listOf(v)
    .map((x): InboxRow | null => {
      const o = rec(x);
      const id = str(o.id);
      const tenantId = str(o.tenantId);
      if (!id || !tenantId) return null;
      const kind = str(o.kind);
      const risk = str(o.risk).toUpperCase();
      return {
        tenantId,
        tenantName: str(o.tenantName),
        type: o.type === "plan" ? "plan" : "proposal",
        id,
        roomId: str(o.roomId) || null,
        conversationId: str(o.conversationId) || null,
        summary: str(o.summary),
        kind,
        module: moduleOfKind(kind),
        canApprove: o.canApprove === true,
        why: whyOf(o.why),
        cls: inboxClassOf(kind, risk, o.class ?? o.classes),
        createdAt: isoOf(o.createdAt),
        expiresAt: isoOrNull(o.expiresAt),
      };
    })
    .filter((x): x is InboxRow => !!x);
}

/** แถวกล่องรวม → รูปของการ์ดอนุมัติ (ใช้ useApprovalFlow เดิม: ยืนยัน 2 ชั้น · ชีตตีกลับ C4) — ไม่มี payload ⇒ แก้ไม่ได้ (แก้ในห้อง) */
export function inboxToApproval(r: InboxRow): ApprovalItem {
  if (r.type === "plan") return { type: "plan", id: r.id, title: r.summary, steps: [], destructive: r.cls.destructive, why: r.why, pending: true, at: r.createdAt };
  return {
    type: "proposal",
    id: r.id,
    kind: r.kind,
    module: r.module,
    summary: r.summary,
    destructive: r.cls.destructive,
    money: r.cls.money,
    customerFacing: r.cls.customer,
    piiExport: false,
    why: r.why,
    editable: false,
    input: null,
    edited: false,
    at: r.createdAt,
  };
}

// ───────── S2.5 งานประจำ (A7) — GET/POST secretary/scheduled · PUT/DELETE secretary/scheduled/[id] ─────────
export type TaskRow = {
  id: string;
  instruction: string;
  hourBkk: number;
  /** DAILY | WEEKLY | อื่น ๆ ที่เซิร์ฟเวอร์มี (รายเดือนตั้งจากเว็บได้ — แอปรุ่นแรกแสดงอย่างเดียว) */
  frequency: string;
  days: number[];
  channels: ("push" | "room")[];
  active: boolean;
  mine: boolean;
  ownerUserId: string | null;
};

export function normalizeTasks(v: unknown, myUserId: string | null | undefined): TaskRow[] {
  return listOf(v)
    .map((x): TaskRow | null => {
      const o = rec(x);
      const id = str(o.id);
      const hour = Math.floor(Number(o.hourBkk));
      if (!id || !Number.isFinite(hour) || hour < 0 || hour > 23) return null;
      const owner = str(o.ownerUserId) || null;
      const channels = (Array.isArray(o.channels) ? o.channels : []).filter((c): c is "push" | "room" => c === "push" || c === "room");
      return {
        id,
        instruction: str(o.instruction),
        hourBkk: hour,
        frequency: str(o.frequency).toUpperCase() || "DAILY",
        days: (Array.isArray(o.days) ? o.days : []).map((d) => Math.floor(Number(d))).filter((d) => Number.isFinite(d)).sort((a, b) => a - b),
        channels: channels.length ? channels : ["push", "room"],
        active: o.active !== false,
        mine: o.mine === true || (!!myUserId && owner === myUserId),
        ownerUserId: owner,
      };
    })
    .filter((x): x is TaskRow => !!x && !!x.instruction);
}

const BKK_OFFSET_MS = 7 * 3600_000;

/**
 * รอบถัดไปของงานประจำ (เวลาไทย · pure · `nowMs` ฉีดได้ — COMMON A.11) → วันที่ห่างจากวันนี้ + วันในสัปดาห์ (0=อา) + วันที่/เดือน
 *   DAILY = ทุกวัน · WEEKLY = วันในสัปดาห์ไทย ∈ days · อื่น (รายเดือน) = วันที่ไทย ∈ days · ปิดอยู่/ไม่มีวัน = null
 *   ชั่วโมงนี้เลยแล้ว (นาทีใด ๆ ของชั่วโมงนั้นนับว่าเลย — cron รันต้นชั่วโมง) ⇒ เริ่มนับจากพรุ่งนี้
 */
export function nextRunOf(task: Pick<TaskRow, "active" | "hourBkk" | "frequency" | "days">, nowMs: number): { inDays: number; weekday: number; day: number; month: number } | null {
  if (!task.active) return null;
  const now = new Date(nowMs + BKK_OFFSET_MS);
  const start = now.getUTCHours() < task.hourBkk ? 0 : 1;
  for (let i = start; i < start + 62; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    const ok = task.frequency === "DAILY" ? true : task.frequency === "WEEKLY" ? task.days.includes(d.getUTCDay()) : task.days.includes(d.getUTCDate());
    if (ok) return { inDays: i, weekday: d.getUTCDay(), day: d.getUTCDate(), month: d.getUTCMonth() + 1 };
  }
  return null;
}

/** badge ไอคอนแอป (S2.6) — GET secretary/badge ของกิจการ active · พลาด = null */
export async function fetchAppBadge(): Promise<number | null> {
  try {
    const r = await secGet("secretary/badge");
    const n = Math.floor(Number(r?.badge));
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}
