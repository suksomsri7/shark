// notify.ts — แจ้งเตือนของเลขา (ใบ S1.23 · สัญญา docs/modules/31-secretary.md §5.25a · RESOLUTIONS R-K20)
//
// จุดเดียวที่ตัดสินว่า "push ถึงคนนี้ไหม": ค่าตั้งของผู้ใช้ (`AiNotifyPref`) → กันสแปม (link เดิมใน 60 วิ) → ตัวเลข badge → `sendPushToUser`
//   ค่าตั้ง 4 ชนิด: inbox (แชทลูกค้า) · approval (รออนุมัติ) · room (ห้องเลขา) · help (ทีมงานตอบเรื่องที่แจ้ง)
//   3 โหมด: ALL (ปริยาย) · ASSIGNED (เฉพาะแชทที่ตัวเองดูแล — มีผลกับ inbox เท่านั้น) · OFF
//   แถวของร้าน (tenantId) ชนะแถวทุกร้าน (tenantId null) · ไม่มีแถว = ALL ⇒ ผู้ใช้ที่ไม่เคยตั้ง = พฤติกรรมเดิม
// push ห้องเลขา/ช่วยเหลือ = `sendPushToUser(userId)` **ไม่กรองร้านของเครื่อง** (R-K20 · A6 ข้ามร้าน)
//
// 🔴 `notifyUser` ไม่ throw เด็ดขาด (ค่าตั้ง/badge อ่านไม่ได้ = ส่งตามปริยาย ไม่มี badge) · ต้องเรียกนอกทรานแซกชัน
// 🔴 กันสแปมอยู่ในหน่วยความจำของโปรเซส (ต่อ instance) — ไม่ใช่การรับประกันข้ามเครื่อง · `now` ฉีดได้ (ทดสอบ)
// 🔴 `AiNotifyPref` เป็น axis global (scope.ts) ⇒ ใช้ prisma ตรง · ส่วนอื่นผ่าน tenantDb

import { Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { sendPushToUser } from "@/lib/core/push";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { unreadCaseTotalForUser } from "@/lib/support/service";
import { NOT_SYSTEM_MESSAGE } from "./members";

export const NOTIFY_KINDS = ["inbox", "approval", "room", "help"] as const;
export const NOTIFY_MODES = ["ALL", "ASSIGNED", "OFF"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type NotifyMode = (typeof NOTIFY_MODES)[number];
export type NotifyPrefs = Record<NotifyKind, NotifyMode>;

type PushPost = NonNullable<NonNullable<Parameters<typeof sendPushToUser>[2]>["post"]>;
export type NotifyMsg = { title: string; body: string; data: Record<string, unknown> & { link: string } };
export type NotifyDeps = { post?: PushPost; now?: Date; assigneeUserId?: string | null };
export type NotifyResult = { sent: number; skipped: "pref" | "spam" | "none" | null };

/** หน้าต่างกันสแปม — link เดิมถึงคนเดิมซ้ำภายในเวลานี้ = ไม่ส่ง */
export const NOTIFY_SPAM_WINDOW_MS = 60_000;
const SPAM_MAP_MAX = 5_000;
const BADGE_ROOMS_MAX = 500;
const ID_MAX = 191;

const KIND_TH: Record<NotifyKind, string> = { inbox: "แชทลูกค้า", approval: "รออนุมัติ", room: "ห้องเลขา", help: "ช่วยเหลือ" };

const isKind = (x: unknown): x is NotifyKind => typeof x === "string" && (NOTIFY_KINDS as readonly string[]).includes(x);
const isMode = (x: unknown): x is NotifyMode => typeof x === "string" && (NOTIFY_MODES as readonly string[]).includes(x);
const cleanId = (x: unknown): string => (typeof x === "string" ? x.trim().slice(0, ID_MAX) : "");

function defaults(): NotifyPrefs {
  return { inbox: "ALL", approval: "ALL", room: "ALL", help: "ALL" };
}

/**
 * รวมแถวค่าตั้งเป็นค่าต่อชนิด (pure) — แถวของร้านชนะแถวทุกร้าน · ค่าที่ไม่รู้จักถูกเมิน · ไม่มีแถว = ALL
 *   แถวทุกร้านซ้ำ (tenantId null ไม่ติด unique ของ Postgres) ⇒ ตัวที่ updatedAt ใหม่สุดชนะ
 */
export function resolveNotifyPrefs(
  rows: readonly { tenantId: string | null; kind: string; mode: string; updatedAt?: Date }[],
  tenantId?: string | null,
): NotifyPrefs {
  const out = defaults();
  const tid = cleanId(tenantId);
  const rank = (r: { tenantId: string | null }) => (tid && r.tenantId === tid ? 2 : r.tenantId === null ? 1 : 0);
  const best = new Map<NotifyKind, { rank: number; at: number }>();
  for (const r of rows) {
    const k = r.kind;
    if (!isKind(k) || !isMode(r.mode)) continue;
    const rk = rank(r);
    if (rk === 0) continue;
    const at = r.updatedAt instanceof Date ? r.updatedAt.getTime() : 0;
    const cur = best.get(k);
    if (!cur || rk > cur.rank || (rk === cur.rank && at >= cur.at)) {
      best.set(k, { rank: rk, at });
      out[k] = r.mode;
    }
  }
  return out;
}

/** ค่าตั้งแจ้งเตือนของผู้ใช้ในร้านนี้ (แถวร้านชนะแถวทุกร้าน · ปริยาย ALL) — 1 query */
export async function getNotifyPrefs(userId: string, tenantId?: string | null): Promise<NotifyPrefs> {
  const uid = cleanId(userId);
  if (!uid) return defaults();
  const tid = cleanId(tenantId);
  const rows = await prisma.aiNotifyPref.findMany({
    where: { userId: uid, OR: tid ? [{ tenantId: tid }, { tenantId: null }] : [{ tenantId: null }] },
    select: { tenantId: true, kind: true, mode: true, updatedAt: true },
  });
  return resolveNotifyPrefs(rows, tid || null);
}

/**
 * โหมดของชนิดหนึ่งสำหรับผู้ใช้หลายคนในร้านเดียว (ตัวกรองผู้รับของ `sendPushToChatStaff`) — 1 query
 *   คืนเฉพาะคนที่มีแถว (ไม่มีแถว = ไม่อยู่ใน Map = ALL) ⇒ ร้านที่ไม่มีใครตั้ง = Map ว่าง = ผู้เรียกไม่ต้องกรอง
 */
export async function notifyModesFor(tenantId: string, userIds: readonly string[], kind: NotifyKind): Promise<Map<string, NotifyMode>> {
  const ids = [...new Set(userIds.map(cleanId).filter(Boolean))];
  const tid = cleanId(tenantId);
  if (ids.length === 0) return new Map();
  const rows = await prisma.aiNotifyPref.findMany({
    where: { userId: { in: ids }, kind, OR: tid ? [{ tenantId: tid }, { tenantId: null }] : [{ tenantId: null }] },
    select: { userId: true, tenantId: true, kind: true, mode: true, updatedAt: true },
  });
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  const out = new Map<string, NotifyMode>();
  for (const [uid, list] of byUser) out.set(uid, resolveNotifyPrefs(list, tid || null)[kind]);
  return out;
}

/**
 * ตั้งค่าแจ้งเตือน 1 ชนิด — `tenantId` null/ไม่ส่ง = ค่าทุกร้าน · ชนิด/โหมดผิด = throw ไทย · คืนค่าตั้งที่มีผลในร้านนั้น (หรือทุกร้าน)
 *   เขียนแบบ update-then-create (unique ที่มีคอลัมน์ null ใช้ upsert ของ Prisma ไม่ได้) · ชนกันพร้อมกัน (P2002) = update ซ้ำ
 */
export async function setNotifyPref(userId: string, input: { tenantId?: string | null; kind: string; mode: string }): Promise<NotifyPrefs> {
  const uid = cleanId(userId);
  if (!uid) throw new Error("ไม่พบผู้ใช้ — เข้าสู่ระบบใหม่อีกครั้ง");
  const kind = typeof input?.kind === "string" ? input.kind.trim() : "";
  const mode = typeof input?.mode === "string" ? input.mode.trim().toUpperCase() : "";
  if (!isKind(kind)) throw new Error(`ไม่รู้จักชนิดการแจ้งเตือน — เลือกได้: ${NOTIFY_KINDS.map((k) => KIND_TH[k]).join(" · ")}`);
  if (!isMode(mode)) throw new Error("ไม่รู้จักรูปแบบการแจ้งเตือน — เลือกได้: ทุกครั้ง · เฉพาะที่มอบหมายให้ฉัน · ปิด");
  const tid = cleanId(input?.tenantId) || null;
  const where = { userId: uid, tenantId: tid, kind };
  const upd = await prisma.aiNotifyPref.updateMany({ where, data: { mode } });
  if (upd.count === 0) {
    try {
      await prisma.aiNotifyPref.create({ data: { userId: uid, tenantId: tid, kind, mode } });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      await prisma.aiNotifyPref.updateMany({ where, data: { mode } });
    }
  }
  return getNotifyPrefs(uid, tid);
}

/**
 * ตัวเลขบนไอคอนแอปของผู้ใช้ในร้านนี้ = (1) ห้องเลขาที่ผู้ใช้อยู่ (เปิดเอง/เป็นสมาชิก · **ไม่นับ** OWNER-เห็นทุกห้อง)
 *   ที่มีคำตอบเลขา (ไม่นับข้อความระบบ R-S1.6b) ใหม่กว่า `lastReadAt` — สมาชิก seeHistory=false นับเฉพาะคำตอบตั้งแต่ addedAt
 *   + (2) `unreadCount` ของทุกระบบ CHAT ที่เปิดอยู่ ถ้ามีสิทธิ์ `chat.conversation.read` + (3) `unreadCaseTotalForUser`
 *   ไม่มี Membership ที่รับแล้วในร้านนี้ = 0 · throw ได้ (ผู้เรียกดักเอง — `notifyUser` ดักแล้ว)
 */
export async function badgeTotalFor(userId: string, tenantId: string): Promise<number> {
  const uid = cleanId(userId);
  const tid = cleanId(tenantId);
  if (!uid || !tid) return 0;
  const m = await prisma.membership.findFirst({
    where: { tenantId: tid, userId: uid, acceptedAt: { not: null } },
    select: { role: true, unitAccess: true, permissions: true },
  });
  if (!m) return 0;
  const db = tenantDb({ tenantId: tid });

  // (1) ห้องเลขา
  const rooms = await db.aiRoom.findMany({
    where: { OR: [{ startedById: uid }, { members: { some: { userId: uid } } }] },
    orderBy: { updatedAt: "desc" },
    take: BADGE_ROOMS_MAX,
    select: {
      conversationId: true,
      startedById: true,
      conversation: { select: { lastReadAt: true } },
      members: { where: { userId: uid }, select: { addedAt: true, seeHistory: true }, take: 1 },
    },
  });
  let roomsUnread = 0;
  if (rooms.length > 0) {
    const last = await db.aiMessage.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: rooms.map((r) => r.conversationId) }, role: "ASSISTANT", ...NOT_SYSTEM_MESSAGE },
      _max: { createdAt: true },
    });
    const lastOf = new Map(last.map((x) => [x.conversationId, x._max.createdAt]));
    for (const r of rooms) {
      const at = lastOf.get(r.conversationId) ?? null;
      if (!at) continue;
      const readAt = r.conversation?.lastReadAt ?? null;
      if (readAt && at <= readAt) continue;
      const mem = r.members[0];
      // สมาชิกที่ไม่เห็นประวัติ: คำตอบล่าสุดเก่ากว่าวันที่ถูกเพิ่ม = มองไม่เห็นเลย (ล่าสุดคือค่ามากสุด)
      if (r.startedById !== uid && mem && !mem.seeHistory && at < mem.addedAt) continue;
      roomsUnread++;
    }
  }

  // (2) แชทลูกค้า — ตัวนับเดิมของกล่องแชท (ต่อระบบ) · ไม่มีสิทธิ์อ่าน = ไม่นับ
  let chatUnread = 0;
  const mctx: MembershipCtx = {
    role: m.role,
    unitAccess: Array.isArray(m.unitAccess) ? m.unitAccess.filter((u): u is string => typeof u === "string") : [],
    permissions: m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? (m.permissions as Record<string, unknown>) : {},
  };
  if (evaluate(mctx, { module: "chat", action: "chat.conversation.read" })) {
    const systems = await db.appSystem.findMany({ where: { type: "CHAT", active: true }, select: { id: true } });
    if (systems.length > 0) {
      // นำเข้าแบบ dynamic — กล่องแชทลาก adapter/ai เยอะ และ import core/push กลับมา (กันวงตอนโหลดโมดูล)
      const { unreadCount } = await import("@/lib/modules/chat/service");
      for (const s of systems) chatUnread += await unreadCount(tid, s.id);
    }
  }

  // (3) เรื่องที่แจ้งทีมงาน (ทีมตอบแล้วยังไม่อ่าน)
  const helpUnread = await unreadCaseTotalForUser({ tenantId: tid }, uid, m.role);
  return roomsUnread + chatUnread + helpUnread;
}

// กันสแปม: `${userId}:${link}` → เวลาที่ส่งล่าสุด (ms) — ต่อโปรเซส
const lastSentAt = new Map<string, number>();

function pruneSpamMap(nowMs: number): void {
  if (lastSentAt.size < SPAM_MAP_MAX) return;
  for (const [k, at] of lastSentAt) if (Math.abs(nowMs - at) >= NOTIFY_SPAM_WINDOW_MS) lastSentAt.delete(k);
  // ยังเต็ม (ส่งถี่ผิดปกติ) — ทิ้งของเก่าสุดครึ่งหนึ่ง (Map เรียงตามลำดับใส่)
  if (lastSentAt.size >= SPAM_MAP_MAX) {
    let n = Math.floor(lastSentAt.size / 2);
    for (const k of lastSentAt.keys()) {
      if (n-- <= 0) break;
      lastSentAt.delete(k);
    }
  }
}

/**
 * ส่ง push 1 เรื่องถึงผู้ใช้ 1 คน ตามค่าตั้งของเขา — ไม่ throw
 *   OFF ⇒ `{sent:0, skipped:"pref"}` · inbox+ASSIGNED ⇒ ส่งเฉพาะเมื่อ `deps.assigneeUserId === userId` (ไม่ใช่ ⇒ "pref")
 *   (ASSIGNED ของชนิดอื่น = ALL — ไม่มีความหมาย "ผู้ดูแล" ในห้อง/อนุมัติ/ช่วยเหลือ)
 *   link เดิมถึงคนเดิมภายใน 60 วิ ⇒ "spam" (นับจากครั้งที่ส่งจริง ไม่เลื่อนหน้าต่างตอนถูกกัน)
 *   ใส่ `badge` = `badgeTotalFor(userId, tenantId)` (อ่านไม่ได้ = ไม่ใส่) · `sendPushToUser(userId, …, { post })` ไม่กรองร้าน (R-K20)
 *   ส่งแล้ว Expo ไม่รับสักใบ / ไม่มีเครื่อง ⇒ `{sent:0, skipped:"none"}`
 */
export async function notifyUser(userId: string, tenantId: string, kind: NotifyKind, msg: NotifyMsg, deps?: NotifyDeps): Promise<NotifyResult> {
  try {
    const uid = cleanId(userId);
    const link = typeof msg?.data?.link === "string" ? msg.data.link : "";
    if (!uid || !isKind(kind) || !link) return { sent: 0, skipped: "none" };

    let mode: NotifyMode = "ALL";
    try {
      mode = (await getNotifyPrefs(uid, tenantId))[kind];
    } catch {
      mode = "ALL"; // อ่านค่าตั้งไม่ได้ = ปริยาย (ไม่ทำให้แจ้งเตือนหายเงียบ)
    }
    if (mode === "OFF") return { sent: 0, skipped: "pref" };
    if (mode === "ASSIGNED" && kind === "inbox" && (deps?.assigneeUserId ?? null) !== uid) return { sent: 0, skipped: "pref" };

    const nowMs = deps?.now instanceof Date && !Number.isNaN(deps.now.getTime()) ? deps.now.getTime() : Date.now();
    const key = `${uid}:${link}`;
    const prev = lastSentAt.get(key);
    if (prev !== undefined && Math.abs(nowMs - prev) < NOTIFY_SPAM_WINDOW_MS) return { sent: 0, skipped: "spam" };
    pruneSpamMap(nowMs);
    lastSentAt.delete(key); // ใส่ใหม่ให้อยู่ท้าย (ลำดับใส่ = ลำดับเวลา)
    lastSentAt.set(key, nowMs); // จองก่อนส่ง — สองทางพร้อมกันได้ใบเดียว

    let badge: number | undefined;
    try {
      badge = await badgeTotalFor(uid, tenantId);
    } catch {
      badge = undefined;
    }
    const r = await sendPushToUser(
      uid,
      // S1.14 R-S1.14j ▸ data.tenantId ทุกใบ — แอปสลับร้านก่อนเปิด deep link (push ห้องเลขาไม่กรองร้าน · R-K20) ◂
      { title: msg.title, body: msg.body, data: { ...msg.data, tenantId }, ...(typeof badge === "number" ? { badge } : {}) },
      deps?.post ? { post: deps.post } : undefined,
    );
    return r.sent > 0 ? { sent: r.sent, skipped: null } : { sent: 0, skipped: "none" };
  } catch {
    return { sent: 0, skipped: "none" };
  }
}

