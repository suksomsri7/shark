// ข้อมูลของจอเลขา AI ฝั่งแอป — type ตาม docs/api/SECRETARY-API.md + docs/modules/31-secretary.md (COMMON §C.12)
// ทุกเส้นของ /api/mobile/secretary/* อยู่ในไฟล์นี้ไฟล์เดียว (ตาราง PATH) — ชื่อเส้นเปลี่ยนหลัง S1.14 = แก้ PATH ที่เดียว
// จอเรียกด้วยชื่อเส้น เช่น secGet("secretary/rooms") · DTO ที่ยังไม่นิ่ง (S1.14 ยังไม่ merge) ผ่านตัว normalize* ที่รับได้หลายรูป
// ทุกเส้นพลาดได้ — จอใช้ค่าปริยาย/สถานะของตัวเอง (isDenied / startErrorKind)
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { api, ApiError, BASE_URL } from "@/src/api/client";
import { getTenantId, getToken } from "@/src/lib/session";
import { useAuth } from "@/src/lib/auth-context";
import { langFrom, setLang } from "@/src/i18n";
import { resetInboxState } from "@/src/api/inbox";

// ───────── ตารางเส้น (ชื่อที่จอใช้ → path จริง) ─────────
const PATH = {
  "secretary/me": "/api/mobile/secretary/me",
  "secretary/rooms": "/api/mobile/secretary/rooms",
  "secretary/suggestions": "/api/mobile/secretary/suggestions",
  "secretary/frequent": "/api/mobile/secretary/frequent",
  "secretary/access": "/api/mobile/secretary/access",
  "secretary/inbox/count": "/api/mobile/secretary/inbox/count",
  "inbox/unread": "/api/mobile/inbox/unread",
  // S2.14 (R-S2.13b · §Y.2): ตัวเลข badge 3 โซนในเส้นเดียว (S1.14c) — แทน inbox/count + inbox/unread + staff/invites + support/cases
  "secretary/badges": "/api/mobile/secretary/badges",
  // ตั้งค่า (ใบ S2.7–S2.9 · ชื่อตาม S1.14 docs/api/SECRETARY-API.md)
  "secretary": "/api/mobile/secretary/secretary",
  "secretary/quota": "/api/mobile/secretary/quota",
  "secretary/rules": "/api/mobile/secretary/rules",
  "secretary/log": "/api/mobile/secretary/log", // ใช้ร่วม S2.4 (ห้องงาน ?roomId) + S2.8 (B5)
  "secretary/lessons": "/api/mobile/secretary/lessons",
  "secretary/memories/pending": "/api/mobile/secretary/memories/pending",
  "secretary/digest": "/api/mobile/secretary/digest",
  "secretary/after-hours": "/api/mobile/secretary/after-hours",
  "secretary/staff": "/api/mobile/secretary/staff",
  // S2.10 D1: จุดเข้าเวร (eligibleResponders · onDuty) — เส้นแชทลูกค้า (ไม่ใช่ secretary/*) · พลาด = ไม่แสดงเวร
  "inbox/staff": "/api/mobile/inbox/staff",
  // S2.5 กล่องรวมรออนุมัติ (ทุกกิจการ · ไม่ส่ง x-tenant-id) · งานประจำ · S2.6 badge ไอคอนแอป
  "secretary/inbox": "/api/mobile/secretary/inbox",
  "secretary/scheduled": "/api/mobile/secretary/scheduled",
  "secretary/badge": "/api/mobile/secretary/badge",
  // S2.15 ช่วยเหลือ H1/H2 (S1.14 · R-K12 · R-S1.14c) — เรื่องเป็นของกิจการ (ส่ง x-tenant-id)
  "secretary/support/cases": "/api/mobile/secretary/support/cases",
  "secretary/support/upload": "/api/mobile/secretary/support/upload",
  // S2.21/S2.22 กิจการ · เชิญพนักงาน · บัญชีของฉัน (ชื่อตาม S1.14 docs/api/SECRETARY-API.md)
  "secretary/tenants/create": "/api/mobile/secretary/tenants/create",
  "secretary/staff/invite": "/api/mobile/secretary/staff/invite",
  "secretary/staff/invites": "/api/mobile/secretary/staff/invites",
  "secretary/invites/accept": "/api/mobile/secretary/invites/accept",
  // คำเชิญที่ส่งถึงตัวเรา (pendingInvitesForUser · R-S1.25b) — S1.14 ยังไม่มีเส้นนี้ (DTO-REQ ใน wo-notes sec-s2.21) · 404 = ไม่แสดงการ์ด
  "secretary/invites/pending": "/api/mobile/secretary/invites/pending",
  "secretary/notify": "/api/mobile/secretary/notify",
  "secretary/account/delete": "/api/mobile/secretary/account/delete",
  "secretary/account/delete/preview": "/api/mobile/secretary/account/delete/preview",
  // เข้า/ออกเวร (เส้นแชทลูกค้า S1.24 · ไม่ใช่ secretary/*)
  "inbox/shift": "/api/mobile/inbox/shift",
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
  // S2.9 ความรู้ของกิจการ (B6)
  "secretary/lessons/[id]": "/api/mobile/secretary/lessons/[id]",
  "secretary/lessons/[id]/confirm": "/api/mobile/secretary/lessons/[id]/confirm",
  "secretary/memories/[id]": "/api/mobile/secretary/memories/[id]",
  "secretary/memories/[id]/confirm": "/api/mobile/secretary/memories/[id]/confirm",
  // S2.10 D1/D3 สมาชิกห้อง + คำเชิญค้าง
  "secretary/rooms/[id]/members": "/api/mobile/secretary/rooms/[id]/members",
  "secretary/staff/invites/[id]": "/api/mobile/secretary/staff/invites/[id]",
  "secretary/staff/invites/[id]/resend": "/api/mobile/secretary/staff/invites/[id]/resend",
  "secretary/scheduled/[id]": "/api/mobile/secretary/scheduled/[id]",
  // S2.15 ห้องแจ้งปัญหา H2
  "secretary/support/cases/[id]": "/api/mobile/secretary/support/cases/[id]",
  "secretary/support/cases/[id]/reply": "/api/mobile/secretary/support/cases/[id]/reply",
  "secretary/support/cases/[id]/resolve": "/api/mobile/secretary/support/cases/[id]/resolve",
  // S2.22 สิทธิ์ต่อคน (G3)
  "secretary/staff/[id]": "/api/mobile/secretary/staff/[id]",
  "secretary/staff/[id]/suspend": "/api/mobile/secretary/staff/[id]/suspend",
  "secretary/staff/[id]/remove": "/api/mobile/secretary/staff/[id]/remove",
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
/** GET secretary/badges (S1.14c) — approvals = รออนุมัติของกิจการนี้ · customers = ห้องลูกค้าที่ยังไม่อ่าน · team = คำเชิญ + ขอให้ช่วย + เรื่องช่วยเหลือ */
export type ZoneBadgesRes = { approvals: number; customers: number; team: { invites: number; help: number; support: number }; total: number };

/** ชื่อเลขาปริยายก่อนโหลด/เมื่อโหลดไม่ได้ (ค่าเริ่มต้นของระบบ · C1) */
export const DEFAULT_SECRETARY_NAME = "Shark";

type GetMap = {
  "secretary/me": SecretaryMe;
  "secretary/rooms": { items?: RoomRaw[]; nextBefore?: string | null };
  "secretary/suggestions": { items?: unknown[]; frequent?: unknown[] } | unknown[];
  "secretary/frequent": { items?: unknown[] } | unknown[];
  "secretary/access": { items?: AccessItem[]; levels?: string[]; autoAvailable?: boolean };
  "secretary/inbox/count": InboxCount;
  "inbox/unread": { unread: number };
  "secretary/badges": ZoneBadgesRes;
  "secretary": SecretaryIdentity;
  "secretary/quota": QuotaView;
  "secretary/rules": RulesView;
  "secretary/log": { items?: LogRow[] };
  "secretary/lessons": { items?: Lesson[] };
  "secretary/memories/pending": { items?: PendingMemory[] };
  "secretary/digest": { digest?: Digest | null };
  "secretary/after-hours": AfterHours;
  "secretary/staff": { items?: StaffRow[] };
  "inbox/staff": { items?: { userId: string; name?: string | null; role?: string; onDuty?: boolean }[] };
  "inbox/shift": { onDuty: boolean; onDutyAt: string | null };
  "secretary/inbox": { items?: unknown[] };
  "secretary/scheduled": { items?: unknown[]; max?: number };
  "secretary/badge": { badge?: number };
  "secretary/support/cases": { items?: unknown[]; unread?: number; categories?: string[] };
  "secretary/staff/invites": { items?: unknown[] };
  "secretary/invites/pending": { items?: unknown[] } | unknown[];
  "secretary/notify": { prefs?: Partial<Record<string, string>>; kinds?: string[]; modes?: string[] };
  "secretary/account/delete/preview": DeletePreview;
};
type PostMap = {
  // S2.19 K3 "สั่ง Shark เรื่องลูกค้านี้": context = รหัสห้องแชทลูกค้า/ผู้ติดต่อ (ไม่ใส่ชื่อ/เบอร์ลูกค้า · เซิร์ฟเวอร์ resolve เอง)
  "secretary/rooms": { body: { instruction: string; clientMessageId: string; systems?: string[]; context?: { chatConversationId?: string; contactId?: string } }; res: { roomId: string; conversationId?: string; status?: string } };
  "secretary/scheduled": { body: ScheduleBody; res: { id: string } };
  "secretary/support/cases": { body: HelpOpenBody; res: { id: string; caseNo: number } };
  "secretary/tenants/create": { body: { name: string; type: string; systems: string[] }; res: TenantCreateRes };
  "secretary/staff/invite": { body: InviteBody; res: InviteRes };
  "secretary/invites/accept": { body: { inviteId: string } | { code: string }; res: { ok: boolean; tenantId?: string } };
  // R-Z21/R-Z29 step-up: code = OTP 6 หลักที่ขอด้วย auth/sms/request (เบอร์ตัวเอง) หรือ auth/otp (อีเมล · บัญชีไม่มีเบอร์)
  "secretary/account/delete": { body: { confirm: string; code: string }; res: { ok: boolean } };
  "inbox/shift": { body: { onDuty: boolean }; res: { onDuty: boolean; onDutyAt: string | null } };
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

/** เส้นระดับผู้ใช้ (ข้ามกิจการ · ไม่ส่ง x-tenant-id · SECRETARY-API ข้อ 1): secretary/me · secretary · กล่องรวมทุกกิจการ secretary/inbox */
const USER_LEVEL: ReadonlySet<SecPath> = new Set<SecPath>([
  "secretary/me",
  "secretary",
  "secretary/inbox",
  // S2.21/S2.22: เส้นระดับผู้ใช้ (ยังไม่มี/ไม่ผูกกิจการ)
  "secretary/tenants/create",
  "secretary/invites/accept",
  "secretary/invites/pending",
  "secretary/account/delete",
  "secretary/account/delete/preview",
]);

/** GET เส้นของเลขา · เส้นระดับผู้ใช้ไม่ส่ง x-tenant-id */
export function secGet<P extends keyof GetMap>(path: P, q?: Query): Promise<GetMap[P]> {
  return api<GetMap[P]>(url(path, q), { tenant: !USER_LEVEL.has(path) });
}

export function secPost<P extends keyof PostMap>(path: P, body: PostMap[P]["body"]): Promise<PostMap[P]["res"]> {
  return afterAction(path, api<PostMap[P]["res"]>(url(path), { method: "POST", body, tenant: !USER_LEVEL.has(path) }));
}

// ───────── S2.20 badge แถบบน "หลัง action" — การกระทำที่เปลี่ยนตัวเลข badge สำเร็จ ⇒ โหลด badge ใหม่ (รวบ 400 ms เป็นครั้งเดียว) ─────────
// รออนุมัติ (approve/reject ข้อเสนอ/แผน) · ทีม (เชิญ/ส่งใหม่/ยกเลิกคำเชิญ · รับคำเชิญ · เรื่องขอความช่วยเหลือ เปิด/ตอบ/ปิด)
// R-S2.13f: GET support/cases/[id] (อ่านเรื่อง) ไม่อยู่ในชุดนี้ — H2 poll ทุก 15 วิ · จอ H2 เรียก scheduleZoneBadges() เองเมื่อโหลดแรก/ข้อความหรือสถานะเปลี่ยน
const BADGE_AFTER = new Set<string>([
  "secretary/proposals/[id]/approve",
  "secretary/proposals/[id]/reject",
  "secretary/plans/[id]/approve",
  "secretary/plans/[id]/reject",
  "secretary/staff/invite",
  "secretary/staff/invites/[id]",
  "secretary/staff/invites/[id]/resend",
  "secretary/invites/accept",
  "secretary/support/cases",
  "secretary/support/cases/[id]/reply",
  "secretary/support/cases/[id]/resolve",
]);
let badgeTimer: ReturnType<typeof setTimeout> | null = null;
/** โหลด badge ใหม่ครั้งเดียวหลังการกระทำ (หลายการกระทำติดกัน = ครั้งเดียว) */
export function scheduleZoneBadges(): void {
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    badgeTimer = null;
    void refreshZoneBadges();
  }, 400);
}
function afterAction<T>(path: string, p: Promise<T>): Promise<T> {
  if (!BADGE_AFTER.has(path)) return p;
  return p.then((r) => {
    scheduleZoneBadges();
    return r;
  });
}

// ───────── เส้นที่มี [id] (S2.4 ห้องงาน · ชื่อ/รูปตาม S1.14 docs/api/SECRETARY-API.md) ─────────
/** ผลอนุมัติ (200 เสมอ · ไม่ผ่าน = ok:false + note ไทย) · DESTRUCTIVE ที่ยังไม่ยืนยัน 2 ชั้น ⇒ needsSecondConfirm */
export type ApproveRes = { ok: boolean; note?: string; needsSecondConfirm?: boolean; why?: string; doneCount?: number; results?: { summary?: string; ok?: boolean; note?: string }[] };
export type RejectBody = { note?: string; remember?: "JOB" | "RULE" };
/** POST/PUT งานประจำ (สัญญา SECRETARY-API · รุ่นแรกแอปตั้งได้แค่ DAILY/WEEKLY) */
export type ScheduleBody = { instruction: string; hourBkk: number; frequency: "DAILY" | "WEEKLY"; days?: number[]; channels: ("push" | "room")[] };
type GetIdMap = {
  "secretary/rooms/[id]": Record<string, unknown>;
  "secretary/rooms/[id]/messages": { items?: unknown[]; nextBefore?: string | null };
  "secretary/rooms/[id]/proposals": { items?: unknown[] };
  "secretary/rooms/[id]/members": { items?: unknown[]; max?: number };
  "secretary/support/cases/[id]": { case?: unknown; messages?: unknown[] };
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
  "secretary/lessons/[id]/confirm": { body: Record<string, never>; res: { ok: boolean } };
  "secretary/memories/[id]/confirm": { body: Record<string, never>; res: { ok: boolean } };
  "secretary/rooms/[id]/members": { body: { userId: string; seeHistory: boolean }; res: { ok: boolean; member?: unknown } };
  "secretary/staff/invites/[id]/resend": { body: Record<string, never>; res: { ok: boolean; sms?: string; expiresAt?: string; link?: string | null } };
  "secretary/support/cases/[id]/reply": { body: { body: string; attachments?: HelpAttachment[] }; res: { ok: boolean } };
  "secretary/support/cases/[id]/resolve": { body: Record<string, never>; res: { ok: boolean } };
  "secretary/staff/[id]/suspend": { body: Record<string, never>; res: { ok: boolean } };
  "secretary/staff/[id]/remove": { body: Record<string, never>; res: { ok: boolean } };
};
type DeleteIdMap = { "secretary/lessons/[id]": { ok: boolean }; "secretary/memories/[id]": { ok: boolean }; "secretary/staff/invites/[id]": { ok: boolean }; "secretary/scheduled/[id]": { ok: boolean } };

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
  return afterAction(path, api<PostIdMap[P]["res"]>(urlId(path, id), { method: "POST", body, ...(opts?.tenantId ? { tenantId: opts.tenantId } : {}) }));
}

/** PUT secretary/staff/[membershipId] (G3 · setStaffLevels) — levels เฉพาะโมดูลที่แก้ · chat เฉพาะเมื่อแก้ (ส่งค่าเดิมซ้ำ = เซิร์ฟเวอร์จัดคีย์ใหม่ตามระดับ) */
export function putStaff(membershipId: string, body: StaffPutBody): Promise<{ ok: boolean }> {
  return api(urlId("secretary/staff/[id]", membershipId), { method: "PUT", body });
}

/** PUT secretary/scheduled/[id] — เซิร์ฟเวอร์รุ่นนี้รับเฉพาะ {active} (เวลา/ความถี่ = 400 not_supported → ลบแล้วตั้งใหม่) */
export function secPutId(path: "secretary/scheduled/[id]", id: string, body: { active: boolean }): Promise<{ ok: boolean; active?: boolean }> {
  return api(urlId(path, id), { method: "PUT", body });
}

/** DELETE เส้นที่มี [id] (S2.9 ไม่รับบทเรียน / ลบความจำ · S2.5 ลบงานประจำ) */
export function secDeleteId<P extends keyof DeleteIdMap>(path: P, id: string): Promise<DeleteIdMap[P]> {
  return afterAction(path, api<DeleteIdMap[P]>(urlId(path, id), { method: "DELETE" }));
}

/** ถอดสมาชิกออกจากห้อง (D3 · DELETE secretary/rooms/[id]/members/[userId] — 2 พารามิเตอร์ จึงแยกจาก PATH_ID) */
export function secDeleteRoomMember(roomId: string, userId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`${urlId("secretary/rooms/[id]/members", roomId)}/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

/** รหัสข้อความฝั่งแอป (กันส่งซ้ำ · POST rooms) */
export function clientMessageId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────── สถานะผิดพลาด ─────────
/** R-Z11/R-Z30: ส่งซ้ำด้วย clientMessageId เดิมขณะครั้งแรกยังทำไม่เสร็จ ⇒ 409 `pending` (rooms · rooms/[id]/send) */
export function isPending(e: unknown): boolean {
  return e instanceof ApiError && e.status === 409 && e.code === "pending";
}

/** เพดานลองใหม่เมื่อเจอ 409 pending (R-Z30) · เว้น PENDING_WAIT_MS ต่อครั้ง */
export const PENDING_RETRIES = 3;
export const PENDING_WAIT_MS = 1500;

/** เรียก fn · 409 pending ⇒ รอแล้วลองใหม่เงียบ ๆ (ไม่โยน error ให้จอ) สูงสุด PENDING_RETRIES ครั้ง · ยังค้าง/error อื่น ⇒ โยนตามปกติ
 *  fn ต้องใช้ clientMessageId เดิมทุกครั้ง (จอเก็บใน ref · R-Z28) เซิร์ฟเวอร์จึงคืนห้อง/ข้อความเดิมเมื่อครั้งแรกเสร็จ */
export async function retryPending<T>(fn: () => Promise<T>, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isPending(e) || i >= PENDING_RETRIES) throw e;
      await wait(PENDING_WAIT_MS);
    }
  }
}

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

/** สถานะขั้น (S1.14: PENDING|RUNNING|DONE|FAILED|SKIPPED) → done ✓ · run ● · wait ⏸ · fail ✕ · skip – */
export type StepStatus = "done" | "run" | "wait" | "fail" | "skip";
export type StepRow = { kind: string; module: string; summary: string; status: StepStatus };
function stepStatus(v: unknown, fallback: StepStatus): StepStatus {
  const s = String(v ?? "").toUpperCase();
  if (s === "DONE" || s === "OK" || s === "EXECUTED") return "done";
  if (s === "RUNNING" || s === "RUN") return "run";
  if (s === "WAITING" || s === "PENDING" || s === "WAIT") return "wait";
  if (s === "FAILED" || s === "FAIL" || s === "ERROR") return "fail";
  if (s === "SKIPPED" || s === "SKIP") return "skip";
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
  /** dry-run ของด่านจริงสำหรับผู้ดู (S1.14 · ไม่ส่งมา = ถือว่าได้ แล้วให้ผล approve ตัดสิน) */
  canApprove: boolean;
  at: string;
};
export type PlanItem = { type: "plan"; id: string; title: string; steps: StepRow[]; destructive: boolean; why: string | null; pending: boolean; canApprove: boolean; at: string };
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
  return { type: "plan", id: str(o.id), title: str(o.title), steps, destructive: o.hasDestructive === true, why: whyOf(o.why), pending, canApprove: o.canApprove !== false, at: isoOf(o.createdAt) };
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
        canApprove: o.canApprove !== false,
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
/** GET log?roomId → การ์ด "ทำแล้ว" · ย้อนได้ = `canUndo` ของเซิร์ฟเวอร์ (สิทธิ์ + นาฬิกาเซิร์ฟเวอร์ · R-S2.4a) ∩ ยังไม่ย้อน
 *  เซิร์ฟเวอร์รุ่นเก่าไม่ส่ง canUndo ⇒ เทียบ undoableUntil ตอนโหลด (logCanUndo) · `link` อยู่ระดับแถว (S1.14) หรือใน entity */
export function normalizeLog(v: unknown, nowMs: number): LogItem[] {
  return listOf(v)
    .map((x) => {
      const o = rec(x);
      const e = rec(o.entity);
      const kind = str(o.kind);
      const until = isoOrNull(o.undoableUntil);
      const undoneAt = isoOrNull(o.undoneAt);
      const link = typeof o.link === "string" ? o.link : typeof e.link === "string" ? e.link : null;
      return {
        id: str(o.id),
        kind,
        module: str(o.module) || moduleOfKind(kind),
        summary: str(o.summary),
        entity: str(e.type) && str(e.id) ? { type: str(e.type), id: str(e.id), link } : null,
        undoableUntil: until,
        undoneAt,
        canUndo: logCanUndo({ undoneAt, undoableUntil: until, canUndo: typeof o.canUndo === "boolean" ? o.canUndo : undefined }, nowMs),
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
  members: { userId: string; name: string | null; role: string; seeHistory: boolean }[];
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
    members: (Array.isArray(o.members) ? o.members : [])
      .map((m) => rec(m))
      .filter((m) => str(m.userId))
      .map((m) => ({ userId: str(m.userId), name: str(m.name) || null, role: str(m.role), seeHistory: m.seeHistory === true })),
    // แผนของห้อง (S1.14: PENDING + RUNNING) — แผน PENDING ซ้ำกับการ์ดอนุมัติ จอกรองออกด้วย id
    plans: (Array.isArray(o.plans) ? o.plans : []).map((p) => planOf(rec(p), str(rec(p).status).toUpperCase() === "PENDING")).filter((p) => p.id && p.steps.length > 0),
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

// S2.14 (R-S2.13b · §Y.2): badge 3 โซนจาก `GET secretary/badges` เส้นเดียว (เดิมยิง 3–4 เส้น)
//   เลขา = approvals (รออนุมัติที่ฉันกดได้ของกิจการนี้) · ลูกค้า = customers (ห้องที่ยังไม่อ่าน · ไม่มีสิทธิ์อ่านแชท = 0)
//   ทีม = team.invites (คำเชิญรอรับ · server นับเฉพาะ OWNER/MANAGER) + team.help (ห้องที่ถูกเรียกมาช่วย) + team.support (เรื่องช่วยเหลือที่ยังไม่อ่าน)
//   สิทธิ์ดูแชทลูกค้า: เส้นนี้ไม่บอก (customers=0 ทั้ง "ไม่มีสิทธิ์" และ "อ่านหมด") ⇒ ไอคอนลูกค้าซ่อนจาก 403 ของ K1/K2/K3 เท่านั้น (ตั๋ว server: เพิ่มธงสิทธิ์ใน badges)
let badgeSeq = 0;
const nonNeg = (v: unknown) => Math.max(0, Math.floor(Number(v ?? 0) || 0));
/** แปลงผล secretary/badges เป็นตัวเลข 3 โซน (pure · รูปเสีย = 0) */
export function zoneCountsOf(r: Partial<ZoneBadgesRes> | null | undefined): ZoneCounts {
  if (!r) return ZERO;
  const team = r.team ?? { invites: 0, help: 0, support: 0 };
  return { secretary: nonNeg(r.approvals), customers: nonNeg(r.customers), team: nonNeg(team.invites) + nonNeg(team.help) + nonNeg(team.support) };
}
export async function refreshZoneBadges(): Promise<void> {
  const seq = ++badgeSeq;
  const r = await secGet("secretary/badges").catch(() => null);
  if (seq !== badgeSeq) return; // รอบใหม่กว่าเริ่มแล้ว (เปลี่ยนร้าน/กดซ้ำ) — ผลเก่าไม่ทับ
  if (!r) return; // พลาด = คงตัวเลขเดิม (เปลี่ยนร้านล้างเป็น 0 แล้วที่ useSecretaryZone)
  badges = zoneCountsOf(r);
  badgeListeners.forEach((fn) => fn());
}

// ───────── สิทธิ์ดูแชทลูกค้า (S2.17) — false = ซ่อนไอคอน "ลูกค้า" ใน SecTopBar ─────────
// ตั้งจาก 403 ของ K1/K2/K3 (inbox/systems · conversations) · K1 สำเร็จ = true · เริ่มต้น = แสดง (ไม่รู้ = ไม่ซ่อน) · เปลี่ยนผู้ใช้/กิจการ = ล้าง
let customersAccess = true;
const accessListeners = new Set<() => void>();
export function setCustomersAccess(ok: boolean): void {
  if (customersAccess === ok) return;
  customersAccess = ok;
  accessListeners.forEach((fn) => fn());
}
const getCustomersAccess = () => customersAccess;
export function useCustomersAccess(): boolean {
  return useSyncExternalStore(
    (l) => {
      accessListeners.add(l);
      return () => accessListeners.delete(l);
    },
    getCustomersAccess,
    getCustomersAccess,
  );
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
    badgeSeq++; // ผลของร้านเดิมที่ยังค้างอยู่ไม่ทับร้านใหม่
    badgeListeners.forEach((fn) => fn());
    setCustomersAccess(true);
    resetInboxState(); // R-S2.17c: ระบบแชทที่เลือก + canReply ของร้านเดิมไม่ข้ามร้าน
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

// ───────── ตั้งค่า (ใบ S2.7 B1/B2/B8 · S2.8 B3/B4/B5 · S2.9 B6/B7) — รูปตาม S1.14 dto.ts ─────────
/** ตัวตนเลขา (GET/PUT secretary · ระดับผู้ใช้) — `sample` = ประโยคตัวอย่างของเซิร์ฟเวอร์ */
export type SecretaryIdentity = { name: string; suffix: string; tone: "polite" | "friendly" | "brief" | string; languages: string[]; sample?: string; saved?: boolean };
export const TONES = ["polite", "friendly", "brief"] as const;
export type Tone = (typeof TONES)[number];
/** ภาษาที่เลขาตอบได้ (LANGUAGES ใน lib identity.ts) */
export const SEC_LANGUAGES = ["th", "en", "zh", "ja"] as const;
/** คำลงท้าย = ค่าจริงที่ส่งเซิร์ฟเวอร์ (ข้อมูล ไม่ใช่ข้อความบนจอ — ป้ายบนจออยู่ใน i18n sec.me.suffix.*) */
export const SUFFIXES = [
  { key: "khrap", value: "ครับ" },
  { key: "kha", value: "ค่ะ" },
  { key: "none", value: "" },
] as const;
export type SuffixKey = (typeof SUFFIXES)[number]["key"];
export function suffixKeyOf(v: string | undefined | null): SuffixKey {
  return SUFFIXES.find((s) => s.value === (v ?? "").trim())?.key ?? "none";
}
export function suffixValueOf(k: SuffixKey): string {
  return SUFFIXES.find((s) => s.key === k)?.value ?? "";
}

/** โควตา (R-S1.13i wire shape) — ไม่มียอดเงิน · assist มาเป็นหน่วยไมโคร แต่จอแสดงเป็น % เท่านั้น (§C.6) */
export type QuotaView = {
  jobs?: { used?: number; limit?: number; left?: number; pct?: number; level?: string; text?: string | null; resetAt?: string; month?: string };
  assist?: { usedMicro?: number; capMicro?: number; pct?: number };
  credit?: { blocked?: string | null };
  pack?: { enabled?: boolean; jobsPerMonth?: number; scheduledMax?: number; approversMax?: number };
};
const pct100 = (v: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)));
/** ตัวเลขที่จอโควตาใช้ — ทุก % ถูกตัดที่ 0..100 (B8 cap) · ไม่คืนค่าที่เป็นเงิน */
export function quotaNumbers(q: QuotaView | null | undefined): { used: number; limit: number; left: number; pct: number; assistPct: number; resetAt: string | null; level: string; text: string | null; blocked: boolean } {
  const used = Math.max(0, Number(q?.jobs?.used ?? 0) || 0);
  const limit = Math.max(0, Number(q?.jobs?.limit ?? q?.pack?.jobsPerMonth ?? 0) || 0);
  const left = Math.max(0, Number(q?.jobs?.left ?? limit - used) || 0);
  const pct = pct100(q?.jobs?.pct ?? (limit > 0 ? (used / limit) * 100 : 0));
  const a = q?.assist;
  const cap = Number(a?.capMicro ?? 0) || 0;
  const assistPct = pct100(a?.pct ?? (cap > 0 ? ((Number(a?.usedMicro ?? 0) || 0) / cap) * 100 : 0));
  return { used, limit, left, pct, assistPct, resetAt: q?.jobs?.resetAt ?? null, level: q?.jobs?.level ?? "ok", text: q?.jobs?.text ?? null, blocked: !!q?.credit?.blocked };
}

/** ระดับเลขาต่อระบบ — รุ่นแรก 3 ระดับ (AUTO ไม่มีใน API · จอแสดงขั้นที่ 4 แบบล็อก) */
export const ACCESS_LEVELS = ["OFF", "READ", "DRAFT"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** กฎอนุมัติ 3 ข้อ (R-K3b: เก็บ + แสดง + ใช้ในข้อความ "ทำไมต้องอนุมัติ") */
export const RULE_KEYS = ["chat.send", "money.limit", "pii.export"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export type RuleState = { enabled: boolean; limitSatang: number | null };
export type RulesView = { rules?: Partial<Record<RuleKey, RuleState>>; keys?: string[]; alwaysApprove?: string[] };

/** บันทึกการกระทำ (B5 · logDto) */
export type LogRow = {
  id: string;
  kind: string;
  module: string;
  summary: string;
  roomId?: string | null;
  proposalId?: string | null;
  userId?: string | null;
  approverId?: string | null;
  entity?: { type: string; id: string } | null;
  undoableUntil?: string | null;
  undoneAt?: string | null;
  canUndo?: boolean;
  createdAt: string;
};
/** ย้อนได้ = ยังไม่ย้อน และเซิร์ฟเวอร์บอก canUndo (สิทธิ์ + เวลา ฝั่งเซิร์ฟเวอร์ · RESOLUTIONS R-S2.4a ไม่ใช้นาฬิกาเครื่อง)
 *  · เซิร์ฟเวอร์ไม่ส่ง canUndo (รุ่นเก่า) ⇒ ดู undoableUntil เทียบตอนโหลด · สิทธิ์จริงตรวจตอนกด */
export function logCanUndo(r: Pick<LogRow, "undoneAt" | "undoableUntil" | "canUndo">, nowMs: number): boolean {
  if (r.undoneAt) return false;
  if (typeof r.canUndo === "boolean") return r.canUndo;
  const until = r.undoableUntil ? Date.parse(r.undoableUntil) : NaN;
  return Number.isFinite(until) && until > nowMs;
}

export type Lesson = { id: string; kind: string; pattern: string; example?: string | null; status: "PENDING" | "CONFIRMED" | "REJECTED" | string; occurrences?: number; sourceRoomId?: string | null; sourceUserId?: string | null; createdAt?: string; updatedAt?: string };
export type PendingMemory = { id: string; content: string; createdAt?: string; byUserId?: string | null };
/** ข้อมูลสดของกิจการ (computeDigest → digestForViewer · ส่วนที่อ่านไม่ได้ = null) */
export type Digest = {
  at?: string;
  activeSystems?: string[];
  sales?: { todaySatang: number; todayCount: number; d7Satang: number; d7Count: number; d30Satang: number; d30Count: number } | null;
  quietCustomers?: { count: number } | null;
  lowStock?: { count: number } | null;
  receivables?: { count: number; totalSatang: number; overdueCount: number } | null;
  tomorrow?: { appointments: number; firstAt?: string | null } | null;
  pending?: { approvalsAged: number; leavesAged: number; shopOrders: number } | null;
};
/** ตอบลูกค้านอกเวลา (B7 · afterHoursSettings) */
export type AfterHours = { reply: boolean; handoff: boolean; disclosure: string };
/** แถวของ GET secretary/staff (S1.14 · listStaffAccess includeInvites + staffViewOf) — รูปดิบ · จอ D1/D3 ใช้ผ่าน normalizeStaff */
export type StaffRow = {
  pending?: boolean;
  userId?: string;
  name?: string | null;
  role?: string;
  me?: boolean;
  active?: boolean;
  membershipId?: string;
  joinedAt?: string | null;
  units?: string[];
  levels?: Record<string, string>;
  chat?: string;
  inviteId?: string;
  phoneMasked?: string | null;
  expiresAt?: string;
  expired?: boolean;
};
/** ระดับแชทลูกค้าของพนักงาน (staffViewOf.chat · R-S1.25h) */
export type ChatLevel = "NONE" | "VIEW" | "REPLY";
export const CHAT_LEVELS: readonly ChatLevel[] = ["NONE", "VIEW", "REPLY"];
export type StaffPerson = { membershipId: string; userId: string; name: string; role: string; active: boolean; me: boolean; units: string[]; levels: Record<string, string>; chat: ChatLevel; joinedAt?: string | null };
export type StaffInvite = { inviteId: string; name: string; phoneMasked: string; role: string; expiresAt: string; expired: boolean };
export function chatLevelOf(v: unknown): ChatLevel {
  return v === "REPLY" || v === "VIEW" ? v : "NONE";
}
/** แยกพนักงาน / คำเชิญค้าง (แถว pending:true) · ระดับต่อโมดูลไม่มีแชท (ดู chat) */
export function normalizeStaff(v: unknown): { people: StaffPerson[]; invites: StaffInvite[] } {
  const people: StaffPerson[] = [];
  const invites: StaffInvite[] = [];
  for (const x of listOf(v)) {
    const o = rec(x);
    if (o.pending === true) {
      if (!str(o.inviteId)) continue;
      invites.push({ inviteId: str(o.inviteId), name: str(o.name), phoneMasked: str(o.phoneMasked), role: str(o.role) || "STAFF", expiresAt: isoOf(o.expiresAt), expired: o.expired === true });
      continue;
    }
    if (!str(o.userId)) continue;
    const lv = rec(o.levels);
    people.push({
      membershipId: str(o.membershipId),
      userId: str(o.userId),
      name: str(o.name),
      role: str(o.role) || "STAFF",
      active: o.active !== false,
      me: o.me === true,
      units: Array.isArray(o.units) ? o.units.filter((u): u is string => typeof u === "string") : [],
      levels: Object.fromEntries(Object.entries(lv).filter(([, l]) => typeof l === "string")) as Record<string, string>,
      chat: chatLevelOf(o.chat),
      joinedAt: isoOrNull(o.joinedAt),
    });
  }
  return { people, invites };
}

/** ข้อความแจ้งลูกค้าต้องบอกว่าเป็น AI (กติกาเดียวกับเซิร์ฟเวอร์ · RESOLUTIONS R-S1.22d) · ≤ 200 ตัว */
export const DISCLOSURE_MAX = 200;
const DISCLOSURE_AI_RE = /AI|เอไอ|ผู้ช่วย/i;
export function disclosureProblem(v: string): "empty" | "noAi" | "long" | null {
  const d = v.trim();
  if (!d) return "empty";
  if (Array.from(d).length > DISCLOSURE_MAX) return "long";
  if (!DISCLOSURE_AI_RE.test(d)) return "noAi";
  return null;
}

type PutMap = {
  secretary: { body: { name?: string; suffix?: string; tone?: string; languages?: string[] }; res: SecretaryIdentity };
  "secretary/access": { body: { module: string; level: AccessLevel }; res: { items?: AccessItem[] } };
  "secretary/rules": { body: { key: RuleKey; enabled?: boolean; limitSatang?: number | null }; res: RulesView };
  "secretary/after-hours": { body: Partial<AfterHours>; res: AfterHours };
  "secretary/notify": { body: { kind: NotifyKind; mode: NotifyMode }; res: { prefs?: Partial<Record<string, string>>; scope?: string } };
};
/** บันทึกตัวตนเลขา (PUT secretary · ระดับผู้ใช้ — B2 + C1) */
export function updateSecretary(body: PutMap["secretary"]["body"]): Promise<SecretaryIdentity> {
  return secPut("secretary", body);
}

/** PUT เส้นตั้งค่า (เซิร์ฟเวอร์ตรวจสิทธิ์เจ้าของเอง — จอแค่ซ่อนปุ่ม) */
export function secPut<P extends keyof PutMap>(path: P, body: PutMap[P]["body"]): Promise<PutMap[P]["res"]> {
  return api<PutMap[P]["res"]>(url(path), { method: "PUT", body, tenant: !USER_LEVEL.has(path) });
}

/** ข้อความไทยของเซิร์ฟเวอร์ (400/403 ของ lib) — ไม่มี = null (จอใช้ข้อความ i18n ของตัวเอง) */
export function serverNote(e: unknown): string | null {
  return e instanceof ApiError && typeof e.detail === "string" && e.detail.trim() ? e.detail.trim() : null;
}

/** บทบาทของผู้ใช้ในกิจการที่ใช้อยู่ (จาก /me) — หน้าตั้งค่าของเจ้าของแสดงอ่านอย่างเดียวเมื่อไม่ใช่ OWNER */
export function useActiveRole(): string | null {
  const { tenants, activeTenantId } = useAuth();
  return tenants.find((x) => x.tenantId === activeTenantId)?.role ?? null;
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
  if (r.type === "plan") return { type: "plan", id: r.id, title: r.summary, steps: [], destructive: r.cls.destructive, why: r.why, pending: true, canApprove: r.canApprove, at: r.createdAt };
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
    canApprove: r.canApprove,
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

// ───────── S2.15 ช่วยเหลือ (H1 รายการ+เปิดเรื่อง · H2 ห้องแจ้งปัญหา) — รูปตาม route จริง src/app/api/mobile/secretary/support/** ─────────
/** หมวดของเรื่อง (CASE_CATEGORIES ของ support/service.ts) */
export type HelpCategory = "secretary_wrong" | "bug" | "question" | "billing" | "feature" | "other";
/** ไฟล์แนบของ cases/reply (AttachmentsSchema · ≤ 5 ชิ้น) */
export type HelpAttachment = { name: string; url: string; kind: "image" | "file" };
export const HELP_MAX_ATTACHMENTS = 5;
export type HelpOpenBody = { subject: string; body: string; category?: HelpCategory; roomId?: string; attachments?: HelpAttachment[] };
export type HelpStatus = "OPEN" | "PENDING" | "RESOLVED";
export type HelpCaseRow = { id: string; caseNo: number; subject: string; status: HelpStatus; updatedAt: string; unread: number };
export type HelpCase = { id: string; caseNo: number; subject: string; status: HelpStatus; category: string | null; roomId: string | null; createdAt: string; updatedAt: string };
/** ข้อความในเรื่อง — ไม่มี id/ชื่อของทีมงานแพลตฟอร์ม (route ตัดออก) · `mine` = ผู้ใช้นี้พิมพ์เอง */
export type HelpMsg = { id: string; side: "SHOP" | "PLATFORM"; mine: boolean; body: string; attachments: { name: string; url: string; kind: string }[]; at: string };

const helpStatusOf = (v: unknown): HelpStatus => (v === "PENDING" || v === "RESOLVED" ? v : "OPEN");
const intOf = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));

export function normalizeHelpCases(v: unknown): HelpCaseRow[] {
  return listOf(v)
    .map((x) => {
      const o = rec(x);
      return { id: str(o.id), caseNo: intOf(o.caseNo), subject: str(o.subject), status: helpStatusOf(o.status), updatedAt: isoOf(o.updatedAt), unread: intOf(o.unreadCount ?? o.unread) };
    })
    .filter((c) => c.id);
}

export function normalizeHelpDetail(v: unknown): { case: HelpCase | null; messages: HelpMsg[] } {
  const r = rec(v);
  const o = rec(r.case);
  const kase: HelpCase | null = str(o.id)
    ? { id: str(o.id), caseNo: intOf(o.caseNo), subject: str(o.subject), status: helpStatusOf(o.status), category: str(o.category) || null, roomId: str(o.roomId) || null, createdAt: isoOf(o.createdAt), updatedAt: isoOf(o.updatedAt) }
    : null;
  const messages = listOf(r.messages ?? [])
    .map((x): HelpMsg => {
      const m = rec(x);
      const atts = (Array.isArray(m.attachments) ? m.attachments : []).map((a) => rec(a)).filter((a) => typeof a.url === "string" && a.url);
      return {
        id: str(m.id),
        side: m.side === "PLATFORM" ? "PLATFORM" : "SHOP",
        mine: m.mine === true,
        body: typeof m.body === "string" ? m.body : "",
        attachments: atts.map((a) => ({ name: str(a.name), url: a.url as string, kind: a.kind === "image" ? "image" : "file" })),
        at: isoOf(m.createdAt),
      };
    })
    .filter((m) => m.id && (m.body.trim() || m.attachments.length > 0));
  return { case: kase, messages };
}

/** เลขเรื่องที่ผู้ใช้เห็น (แบบ H1/H2: SHARK-00042) */
export function caseNoText(n: number): string {
  return `SHARK-${String(Math.max(0, Math.floor(n))).padStart(5, "0")}`;
}

/** จุดสถานะ H1/H2: ส้ม = รอทีม (OPEN ไม่มีของใหม่) · เขียว = ทีมตอบแล้วรอคุณ (PENDING หรือมีข้อความทีมที่ยังไม่อ่าน) · เทา = ปิด (RESOLVED) */
export function helpDot(status: HelpStatus, unread: number): "wait" | "run" | "done" {
  if (status === "RESOLVED") return "done";
  if (status === "PENDING" || unread > 0) return "run";
  return "wait";
}

/** หัวเรื่อง = บรรทัดแรกที่ไม่ว่าง (≤ 120 ตัว) · เนื้อหา = ทั้งข้อความ (≤ 4000) — สัญญา POST support/cases */
export function helpSubjectBody(text: string): { subject: string; body: string } | null {
  const body = text.trim().slice(0, 4000);
  if (!body) return null;
  const first = body.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? body;
  const subject = Array.from(first).length > 120 ? `${Array.from(first).slice(0, 119).join("")}…` : first;
  return { subject, body };
}

// ลิงก์หน้าในแอปจากทีม (H2 ปุ่ม "เปิดหน้า"): `[ชื่อ](sharkai://…)` · `sharkai://…` · `/app/…` (หน้าเว็บของร้านใน WebView หน้าแรก 1.0) ·
//   `/secretary/…` `/customers/…` `/business/…` (จอ native) — อย่างอื่น (http ภายนอก ฯลฯ) ไม่ทำเป็นปุ่ม (กันพาออกนอกแอป)
const LINK_RE = /\[([^\]\n]{1,80})\]\((sharkai:\/\/[^\s)]+|\/[^\s)]+)\)|(sharkai:\/\/[^\s)\]]+)|(^|\s)(\/(?:app|secretary|customers|business)(?:\/[A-Za-z0-9_\-/]*)?(?:\?[A-Za-z0-9_=&\-]*)?)/g;
const NATIVE_RE = /^\/(?:secretary|customers|business)(?:\/[A-Za-z0-9_\-]+)*\/?(?:\?[A-Za-z0-9_=&\-]*)?$/;
const WEB_RE = /^\/app\/[A-Za-z0-9_\-/]*(?:\?[A-Za-z0-9_=&\-]*)?$/;
export type HelpLink = { label: string | null; path: string; route: { pathname: string; params?: Record<string, string> } };

const pathOfTarget = (target: string) => (target.startsWith("sharkai://") ? `/${target.slice("sharkai://".length).replace(/^\/+/, "")}` : target);

/** path ภายในที่ปลอดภัย → เส้นทาง router (ไม่ผ่าน = null) */
export function helpRouteOf(target: string, nonce: string): HelpLink["route"] | null {
  const path = pathOfTarget(target);
  if (WEB_RE.test(path)) return { pathname: "/", params: { open: path, t: nonce } };
  if (!NATIVE_RE.test(path)) return null;
  const [pathname, qs] = path.split("?");
  const params: Record<string, string> = {};
  for (const kv of (qs ?? "").split("&").filter(Boolean)) {
    const [k, val] = kv.split("=");
    if (k) params[k] = val ?? "";
  }
  return Object.keys(params).length ? { pathname: pathname!, params } : { pathname: pathname! };
}

/** แยกข้อความของทีมเป็น ข้อความที่แสดง + ปุ่มลิงก์หน้าในแอป (เครื่องหมายวรรคตอนท้ายลิงก์ไม่นับเป็นส่วนของ path) */
export function splitHelpLinks(body: string, nonce: string): { text: string; links: HelpLink[] } {
  const links: HelpLink[] = [];
  const text = body.replace(LINK_RE, (m: string, label?: string, inner?: string, scheme?: string, pre?: string, bare?: string) => {
    const raw = inner ?? scheme ?? bare ?? "";
    const tail = label ? "" : (/[.,!?;:]+$/.exec(raw)?.[0] ?? "");
    const target = tail ? raw.slice(0, -tail.length) : raw;
    const route = helpRouteOf(target, nonce);
    if (!route) return m;
    links.push({ label: label?.trim() || null, path: pathOfTarget(target), route });
    // ข้อความลิงก์แบบ [ชื่อ](…) ย้ายไปเป็นชื่อบนปุ่ม (ไม่ซ้ำในฟอง)
    return label ? "" : `${pre ?? ""}${tail}`;
  });
  return { text: text.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim(), links };
}

// รูปแนบเรื่องช่วยเหลือ (R-S1.14c): เฉพาะ jpeg/png/webp/heic/heif/gif · ≤ 4 MB · ต้องมี Content-Length (fetch ใส่ให้เองเมื่อ body = FormData ที่รู้ขนาด)
export const HELP_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const HELP_UPLOAD_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
export type HelpUpload = { url: string; name: string; kind: "image"; mimeType: string; size: number };

/** POST secretary/support/upload (multipart `file`) — api() ของ client.ts ส่ง JSON เท่านั้น จึงแยกตัวเรียก */
export async function secUpload(path: "secretary/support/upload", form: FormData): Promise<HelpUpload> {
  const headers: Record<string, string> = {};
  const token = await getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const tid = await getTenantId();
  if (tid) headers["x-tenant-id"] = tid;
  const res = await fetch(`${BASE_URL}${PATH[path]}`, { method: "POST", headers, body: form });
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
    throw new ApiError(res.status, code, detail);
  }
  return (await res.json()) as HelpUpload;
}
// ───────── S2.21 G1 สร้างกิจการ · G2 เชิญพนักงาน · S2.22 G3 สิทธิ์ต่อคน · G4 บัญชีของฉัน (สัญญา S1.14 docs/api/SECRETARY-API.md) ─────────
/** ประเภทกิจการ (TENANT_TYPES ของ createTenantFromApp · ไม่รู้จัก = other) */
export const TENANT_TYPES = ["restaurant", "retail", "service", "dorm", "clinic", "education", "other"] as const;
export type TenantType = (typeof TENANT_TYPES)[number];
/** ระบบที่เปิดได้ตอนสร้างจากแอป (SystemType ที่แอปมีจอ/เลขาใช้ได้) · เลือกได้ ≤ 6 (TENANT_SYSTEMS_MAX) */
export const TENANT_SYSTEMS = ["POS", "CRM", "MEMBER", "ACCOUNT", "KANBAN", "CHAT", "BOOKING", "INVENTORY"] as const;
export const TENANT_SYSTEMS_MAX = 6;
export type TenantCreateRes = { tenant: { id: string; name: string; slug?: string }; systems?: { type: string; id: string }[]; room?: { roomId: string; conversationId?: string } | null };

/** POST staff/invite — `unitIds` ส่งเสมอ (["*"] = ทุกสาขา) · S2.14: `levels` + `chat` ตรง ๆ (server แปลงเป็นคีย์เอง · S1.14b) — ไม่ส่ง permissions */
export type InviteBody = { name: string; phone: string; role: "MANAGER" | "STAFF"; unitIds: string[]; levels?: Record<string, "OFF" | "VIEW" | "USE">; chat?: ChatLevel };
export type InviteRes = { ok: boolean; inviteId?: string; sms?: "sent" | "mocked" | "unavailable" | string; expiresAt?: string; link?: string | null };
/** เหตุผลปฏิเสธของ inviteStaff/resendInvite (S1.25) ที่จอแสดงข้อความไทยของตัวเอง */
export const INVITE_REASONS = ["rate_limited", "already_member", "already_invited", "pending_cap", "bad_permissions", "sms_unavailable", "throttled", "bad_phone", "bad_role", "bad_units", "forbidden", "accepted", "not_found", "bad_level", "bad_module", "sensitive_key"] as const;
export type InviteReason = (typeof INVITE_REASONS)[number];
export function inviteReasonOf(e: unknown): InviteReason | null {
  return e instanceof ApiError && (INVITE_REASONS as readonly string[]).includes(e.code) ? (e.code as InviteReason) : null;
}

/** แถวคำเชิญที่ร้านส่ง (GET staff/invites · listInvites) → รูปเดียวกับแถว pending ของ D1 (StaffInvite) */
export function normalizeInvites(v: unknown): StaffInvite[] {
  return listOf(v)
    .map((x) => rec(x))
    .filter((o) => str(o.id) || str(o.inviteId))
    .map((o) => ({ inviteId: str(o.id) || str(o.inviteId), name: str(o.name), phoneMasked: str(o.phoneMasked), role: str(o.role) || "STAFF", expiresAt: isoOf(o.expiresAt), expired: o.expired === true }));
}

/** สาขา/หน่วยของกิจการ { id, name } — จาก GET secretary/staff: `units` ระดับบนสุด (DTO-REQ listTenantUnits) หรือ `units` ของแถวที่เป็น {id,name} (R-S1.14j) · ไม่มีชื่อ = ไม่แสดงชิป */
export type UnitOpt = { id: string; name: string };
export function normalizeUnits(v: unknown): UnitOpt[] {
  const out: UnitOpt[] = [];
  const add = (x: unknown) => {
    const o = rec(x);
    const id = str(o.id);
    if (id && id !== "*" && str(o.name) && !out.some((u) => u.id === id)) out.push({ id, name: str(o.name) });
  };
  listOf(v, "units").forEach(add);
  for (const row of listOf(v)) for (const u of listOf(rec(row).units ?? [], "units")) add(u);
  return out;
}
/** รหัสหน่วยของแถว (units เป็น string หรือ {id}) */
export function unitIdsOf(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map((u) => (typeof u === "string" ? u : str(rec(u).id))).filter(Boolean);
}

/** PUT staff/[membershipId] (setStaffLevels) */
export type StaffPutBody = { role?: "OWNER" | "MANAGER" | "STAFF"; unitIds?: string[]; levels?: Record<string, "OFF" | "VIEW" | "USE">; chat?: ChatLevel; extraPermissions?: Record<string, unknown> };

/** คำเชิญที่ส่งถึงผู้ใช้คนนี้ (pendingInvitesForUser · R-S1.25b) */
export type ReceivedInvite = { inviteId: string; tenantName: string; role: string; expiresAt: string };
export function normalizeReceived(v: unknown): ReceivedInvite[] {
  return listOf(v)
    .map((x) => rec(x))
    .filter((o) => str(o.inviteId) && str(o.tenantName))
    .map((o) => ({ inviteId: str(o.inviteId), tenantName: str(o.tenantName), role: str(o.role) || "STAFF", expiresAt: isoOf(o.expiresAt) }));
}

/** แจ้งเตือน 4 ชนิด × 3 โหมด (S1.23 NOTIFY_KINDS/NOTIFY_MODES) */
export const NOTIFY_KINDS = ["approval", "room", "inbox", "help"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export const NOTIFY_MODES = ["ALL", "ASSIGNED", "OFF"] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];
export type NotifyPrefs = Record<NotifyKind, NotifyMode>;
export function normalizeNotify(v: unknown): NotifyPrefs {
  const p = rec(rec(v).prefs);
  const mode = (x: unknown): NotifyMode => ((NOTIFY_MODES as readonly unknown[]).includes(x) ? (x as NotifyMode) : "ALL");
  return { approval: mode(p.approval), room: mode(p.room), inbox: mode(p.inbox), help: mode(p.help) };
}

/** ผลกระทบก่อนลบบัญชี (previewAccountDeletion) */
export type DeletePreview = { tenantsToDelete?: { id: string; name: string }[]; tenantsHandedOver?: { id: string; name: string; newOwner?: string | null }[]; tenantsLeftAlone?: { id: string; name: string }[] };
