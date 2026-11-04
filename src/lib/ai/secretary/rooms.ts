// rooms.ts — ห้องเลขา = งาน (ใบ S1.4 · สัญญา docs/modules/31-secretary.md §5.4 + §6 · RESOLUTIONS R-K1 R-K6)
//
// 1 ห้อง = 1 งาน: `startRoom` สร้างบทสนทนา (รหัสฝังผู้สร้าง `u~<userId>~…`) + แถว `AiRoom` + ข้อความสั่งงาน + นับงาน 1 ครั้ง
//   ทั้งหมดใน transaction เดียว · ตัวนับ = conditional `updateMany` คำสั่งเดียว (`jobs < limit`) — ห้ามอ่านแล้วค่อยเขียน (COMMON §C.5 · X3)
//   โควตาหมด = ไม่สร้างอะไรเลย (ทั้ง tx ย้อนกลับ) · ยังไม่เรียกโมเดล — คิวงานของห้องอยู่ที่ S1.5
// การมองเห็นห้อง (R-K1) = ผู้เปิดห้อง ∪ สมาชิกห้อง (`AiRoomMember`) ∪ เจ้าของร้าน (role OWNER) — ห้องที่มองไม่เห็น = เหมือนไม่มี (null/false)
// สถานะห้องไม่เก็บเป็นคอลัมน์ — คำนวณจาก closedAt + งานที่ค้าง + ข้อเสนอ/แผนที่รออนุมัติ (ลำดับ DONE > RUNNING > WAITING > OPEN)
//
// 🔴 ห้าม import `../service` (วงกลม: service → conversations → …) · ข้อความถึงผู้ใช้เป็นไทย · ไม่แตะ usage.ts/credit.ts (S1.13)
// 🔴 `AiRoom.startedById` = `conversationCreatorOf(conversationId).id` เสมอ (denormalize — ข้อสอบ S1.4 ตรวจ)

import type { AiRoom, Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { actorProblem, type AiMemberActor } from "../actor";
import { conversationCreatorOf, newConversationId, type ConvCtx } from "../conversation-owner";
import { countsAsJob, FREE_PACK, monthKeyBangkok, nextResetBangkok, quotaMessage } from "./pack";
import { roomMemberRows, type RoomMemberRow } from "./members";

export type RoomStatus = "OPEN" | "RUNNING" | "WAITING" | "DONE";

export type RoomCard = {
  id: string;
  conversationId: string;
  title: string;
  status: RoomStatus;
  systems: string[];
  startedById: string;
  startedByName: string;
  memberIds: string[];
  updatedAt: Date;
  closedAt: Date | null;
  unread: boolean;
};

export type StartRoomInput = {
  instruction: string;
  title?: string;
  systems?: string[];
  context?: { chatConversationId?: string; contactId?: string };
};

export type StartRoomResult =
  | { ok: true; roomId: string; conversationId: string; jobsUsed: number; jobsLimit: number }
  | { ok: false; error: "empty" | "actor" | "quota"; message: string; resetAt?: Date; jobsUsed?: number; jobsLimit?: number };

const TITLE_MAX = 60;
const NEW_ROOM_TITLE = "งานใหม่";
const LIST_TAKE_DEFAULT = 50;
const LIST_TAKE_MAX = 100;
const SYSTEMS_MAX = 20;
const ACTIVE_JOB_STATUSES = ["QUEUED", "RUNNING"];
const MSG_EMPTY = "พิมพ์งานที่อยากให้เลขาช่วยก่อนนะ";
const MSG_ACTOR = "เปิดห้องงานได้เฉพาะคนในกิจการที่เข้าสู่ระบบอยู่ — ลองเข้าสู่ระบบใหม่อีกครั้ง";

/** ชื่อห้องจากคำสั่ง — บรรทัดแรกที่มีตัวอักษร (trim) · ยาวเกิน 60 ตัว = ตัดแล้วเติม "…" · ว่าง = "งานใหม่" (pure) */
export function roomTitleFrom(instruction: string): string {
  const raw = typeof instruction === "string" ? instruction : "";
  const first = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  if (!first) return NEW_ROOM_TITLE;
  const chars = Array.from(first); // นับเป็นตัวอักษร (ไม่ตัดกลาง surrogate pair)
  return chars.length > TITLE_MAX ? `${chars.slice(0, TITLE_MAX).join("").trimEnd()}…` : first;
}

/** สถานะห้อง (pure) — ปิดแล้ว = DONE > มีงานค้างในคิว = RUNNING > มีข้อเสนอ/แผนรออนุมัติ = WAITING > อื่น ๆ = OPEN */
export function roomStatusOf(x: { closedAt: Date | null; queuedJobs: number; pendingProposals: number; pendingPlans: number }): RoomStatus {
  if (x.closedAt) return "DONE";
  if (x.queuedJobs > 0) return "RUNNING";
  if (x.pendingProposals > 0 || x.pendingPlans > 0) return "WAITING";
  return "OPEN";
}

/** ผู้กระทำที่เปิด/ดูห้องได้ = คนในร้าน (member) ที่ actor ถูกต้องเท่านั้น */
function memberActorOf(ctx: { tenantId: string; actor?: unknown }): AiMemberActor | null {
  if (actorProblem(ctx)) return null;
  const a = ctx.actor as AiMemberActor;
  return a.kind === "member" ? a : null;
}

function cleanSystems(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = typeof x === "string" ? x.trim().slice(0, 40) : "";
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= SYSTEMS_MAX) break;
  }
  return out;
}

function cleanContext(v: StartRoomInput["context"]): Prisma.InputJsonObject | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const k of ["chatConversationId", "contactId"] as const) {
    const s = typeof v[k] === "string" ? v[k].trim() : "";
    if (s) out[k] = s.slice(0, 200);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

class QuotaExceeded extends Error {
  constructor() {
    super("job quota exhausted");
  }
}

/**
 * เปิดห้องงานใหม่ + นับงาน 1 ครั้ง (R-K6: ตัวนับงานอยู่ที่นี่ ไม่ใช่ sendMessage · สั่งเพิ่มในห้องเดิมไม่นับ)
 *   ใน `prisma.$transaction` เดียว: (1) แถวตัวนับของเดือน (INSERT … ON CONFLICT DO NOTHING) (2) conditional `updateMany` `jobs < limit`
 *   → count 0 = โควตาหมด ⇒ throw ⇒ ย้อนทั้ง tx (3) AiConversation (4) AiRoom (5) ข้อความ USER (`authorUserId`)
 *   `now` ฉีดได้ (เดือนไทยของตัวนับ + วันรีเซ็ต)
 */
export async function startRoom(ctx: { tenantId: string; actor: AiMemberActor }, input: StartRoomInput, now: Date = new Date()): Promise<StartRoomResult> {
  const actor = memberActorOf(ctx);
  if (!actor) return { ok: false, error: "actor", message: MSG_ACTOR };
  const instruction = typeof input?.instruction === "string" ? input.instruction.trim() : "";
  if (!instruction) return { ok: false, error: "empty", message: MSG_EMPTY };

  let conversationId: string;
  try {
    conversationId = newConversationId({ tenantId: ctx.tenantId, actor });
  } catch {
    return { ok: false, error: "actor", message: MSG_ACTOR };
  }
  // denormalize ต้องตรงกับรหัสห้องเสมอ (รหัสคือแหล่งความจริงของ "ผู้สร้าง")
  if (conversationCreatorOf(conversationId)?.id !== actor.userId) return { ok: false, error: "actor", message: MSG_ACTOR };

  const tenantId = ctx.tenantId;
  const month = monthKeyBangkok(now);
  const limit = FREE_PACK.jobsPerMonth;
  const inc = countsAsJob({ kind: "room_new" });
  const title = roomTitleFrom(typeof input.title === "string" && input.title.trim() ? input.title : instruction);
  const systems = cleanSystems(input.systems);
  const contextJson = cleanContext(input.context);

  try {
    const res = await prisma.$transaction(async (tx) => {
      // (1) แถวของเดือน — ON CONFLICT DO NOTHING (เปิดห้องแรกของเดือนพร้อมกันหลายทางไม่ชน unique)
      await tx.aiJobCounter.createMany({ data: [{ tenantId, month, jobs: 0 }], skipDuplicates: true });
      // (2) X3: เงื่อนไข + บวก ในคำสั่งเดียว (แถวถูกล็อกจนจบ tx — ทางที่มาทีหลังเห็นค่าใหม่)
      const got = await tx.aiJobCounter.updateMany({
        where: { tenantId, month, jobs: { lt: limit } },
        data: { jobs: { increment: inc } },
      });
      if (got.count === 0) throw new QuotaExceeded();
      await tx.aiConversation.create({ data: { id: conversationId, tenantId, title } });
      const room = await tx.aiRoom.create({
        data: { conversationId, tenantId, startedById: actor.userId, title, systems, ...(contextJson ? { contextJson } : {}), jobsCounted: inc },
        select: { id: true },
      });
      await tx.aiMessage.create({ data: { tenantId, conversationId, role: "USER", content: instruction, authorUserId: actor.userId } });
      const counter = await tx.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId, month } }, select: { jobs: true } });
      return { roomId: room.id, jobsUsed: counter?.jobs ?? inc };
    });
    return { ok: true, roomId: res.roomId, conversationId, jobsUsed: res.jobsUsed, jobsLimit: limit };
  } catch (e) {
    if (!(e instanceof QuotaExceeded)) throw e;
    const resetAt = nextResetBangkok(now);
    const counter = await prisma.aiJobCounter.findUnique({ where: { tenantId_month: { tenantId, month } }, select: { jobs: true } });
    const used = Math.max(counter?.jobs ?? limit, limit);
    const message = quotaMessage(used, limit, resetAt, now).text ?? "โควตางานเดือนนี้หมดแล้ว";
    return { ok: false, error: "quota", message, resetAt, jobsUsed: counter?.jobs ?? limit, jobsLimit: limit };
  }
}

type StatusCounts = { jobs: Map<string, number>; proposals: Map<string, number>; plans: Map<string, number> };

/** ตัวนับสถานะของหลายห้อง — 3 query รวม (groupBy · ไม่ N+1) */
async function statusCounts(tenantId: string, rooms: { id: string; conversationId: string }[], now: Date): Promise<StatusCounts> {
  const out: StatusCounts = { jobs: new Map(), proposals: new Map(), plans: new Map() };
  if (rooms.length === 0) return out;
  const db = tenantDb({ tenantId });
  const roomIds = rooms.map((r) => r.id);
  const convIds = rooms.map((r) => r.conversationId);
  const [jobs, props, plans] = await Promise.all([
    db.aiRoomJob.groupBy({ by: ["roomId"], where: { roomId: { in: roomIds }, status: { in: ACTIVE_JOB_STATUSES } }, _count: { _all: true } }),
    db.aiProposal.groupBy({ by: ["conversationId"], where: { conversationId: { in: convIds }, status: "PENDING", expiresAt: { gt: now } }, _count: { _all: true } }),
    db.aiPlan.groupBy({ by: ["conversationId"], where: { conversationId: { in: convIds }, status: "PENDING", expiresAt: { gt: now } }, _count: { _all: true } }),
  ]);
  for (const j of jobs) out.jobs.set(j.roomId, j._count._all);
  for (const p of props) out.proposals.set(p.conversationId, p._count._all);
  for (const p of plans) out.plans.set(p.conversationId, p._count._all);
  return out;
}

function statusFrom(c: StatusCounts, r: { id: string; conversationId: string; closedAt: Date | null }): RoomStatus {
  return roomStatusOf({
    closedAt: r.closedAt,
    queuedJobs: c.jobs.get(r.id) ?? 0,
    pendingProposals: c.proposals.get(r.conversationId) ?? 0,
    pendingPlans: c.plans.get(r.conversationId) ?? 0,
  });
}

/** สถานะของห้อง (ตามรหัสบทสนทนา) จาก DB — ไม่มีห้อง = OPEN */
export async function roomStatus(tenantId: string, conversationId: string, now: Date = new Date()): Promise<RoomStatus> {
  const room = await tenantDb({ tenantId }).aiRoom.findFirst({ where: { conversationId }, select: { id: true, conversationId: true, closedAt: true } });
  if (!room) return "OPEN";
  return statusFrom(await statusCounts(tenantId, [room], now), room);
}

/** ตัวกรองห้องที่ผู้ใช้นี้เห็นในขอบเขต "mine" = เปิดเอง ∪ เป็นสมาชิก */
function mineWhere(userId: string): Prisma.AiRoomWhereInput {
  return { OR: [{ startedById: userId }, { members: { some: { userId } } }] };
}

/** ผู้ใช้นี้เห็นห้องนี้ไหม (R-K1) — ผู้เปิด · สมาชิก · OWNER */
function canSeeRoom(actor: AiMemberActor, room: { startedById: string; members: { userId: string }[] }): boolean {
  return actor.membership.role === "OWNER" || room.startedById === actor.userId || room.members.some((m) => m.userId === actor.userId);
}

/**
 * รายการห้องงาน — scope "tenant" ใช้ได้เฉพาะ OWNER (คนอื่นส่งมา = "mine" เงียบ ๆ) · "mine" = เปิดเอง ∪ เป็นสมาชิก
 *   เรียง updatedAt ใหม่→เก่า · take ≤ 100 (ปริยาย 50) · before = หน้าถัดไป (updatedAt < before) · q = ค้นในชื่อ (ไม่สนตัวพิมพ์)
 *   status กรองด้วยเงื่อนไขใน query (DONE/RUNNING) หรือชุดรหัสห้องที่มีข้อเสนอ/แผนรออนุมัติ (WAITING/OPEN) · สถานะของการ์ด = 3 query รวม
 *   unread = มีคำตอบเลขาใหม่กว่า `AiConversation.lastReadAt` (ค่าเดียวต่อห้อง — ต่อคนรอใบอ่านแล้ว)
 */
export async function listRooms(
  ctx: ConvCtx,
  opts?: { scope?: "mine" | "tenant"; status?: RoomStatus; q?: string; take?: number; before?: Date },
): Promise<RoomCard[]> {
  const actor = memberActorOf(ctx);
  if (!actor) return [];
  const db = tenantDb({ tenantId: ctx.tenantId });
  const now = new Date();
  const scope = opts?.scope === "tenant" && actor.membership.role === "OWNER" ? "tenant" : "mine";
  const take = Math.min(Math.max(Math.floor(Number(opts?.take) || LIST_TAKE_DEFAULT), 1), LIST_TAKE_MAX);
  const and: Prisma.AiRoomWhereInput[] = [];
  if (scope === "mine") and.push(mineWhere(actor.userId));
  const q = typeof opts?.q === "string" ? opts.q.trim().slice(0, 100) : "";
  if (q) and.push({ title: { contains: q, mode: "insensitive" } });
  if (opts?.before instanceof Date && !Number.isNaN(opts.before.getTime())) and.push({ updatedAt: { lt: opts.before } });

  const status = opts?.status;
  if (status === "DONE") and.push({ closedAt: { not: null } });
  else if (status) {
    and.push({ closedAt: null });
    const active: Prisma.AiRoomWhereInput = { jobs: { some: { status: { in: ACTIVE_JOB_STATUSES } } } };
    if (status === "RUNNING") and.push(active);
    else {
      // ห้องที่มีข้อเสนอ/แผนรออนุมัติ (ชุดเล็ก: ข้อเสนอหมดอายุใน 24 ชม.)
      const [props, plans] = await Promise.all([
        db.aiProposal.groupBy({ by: ["conversationId"], where: { status: "PENDING", expiresAt: { gt: now } } }),
        db.aiPlan.groupBy({ by: ["conversationId"], where: { status: "PENDING", expiresAt: { gt: now } } }),
      ]);
      const waiting = [...new Set([...props, ...plans].map((r) => r.conversationId))];
      and.push({ NOT: active });
      and.push(status === "WAITING" ? { conversationId: { in: waiting } } : { conversationId: { notIn: waiting } });
    }
  }

  const rows = await db.aiRoom.findMany({
    where: and.length > 0 ? { AND: and } : {},
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    include: { members: { select: { userId: true }, orderBy: { addedAt: "asc" } }, conversation: { select: { lastReadAt: true } } },
  });
  if (rows.length === 0) return [];

  const convIds = rows.map((r) => r.conversationId);
  const starterIds = [...new Set(rows.map((r) => r.startedById))];
  const [counts, users, lastReplies] = await Promise.all([
    statusCounts(ctx.tenantId, rows, now),
    prisma.user.findMany({ where: { id: { in: starterIds } }, select: { id: true, name: true, email: true } }),
    db.aiMessage.groupBy({ by: ["conversationId"], where: { conversationId: { in: convIds }, role: "ASSISTANT" }, _max: { createdAt: true } }),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name?.trim() || u.email.split("@")[0] || "สมาชิก"]));
  const lastReplyOf = new Map(lastReplies.map((m) => [m.conversationId, m._max.createdAt]));

  return rows.map((r) => {
    const last = lastReplyOf.get(r.conversationId) ?? null;
    const readAt = r.conversation?.lastReadAt ?? null;
    return {
      id: r.id,
      conversationId: r.conversationId,
      title: r.title,
      status: statusFrom(counts, r),
      systems: r.systems,
      startedById: r.startedById,
      startedByName: nameOf.get(r.startedById) ?? "สมาชิก",
      memberIds: r.members.map((m) => m.userId),
      updatedAt: r.updatedAt,
      closedAt: r.closedAt,
      unread: last !== null && (readAt === null || last > readAt),
    };
  });
}

/** ห้องเดียว (มองไม่เห็น / ไม่มี / ร้านอื่น = null) + สถานะ + สมาชิก (S1.6 · ไม่รวมผู้เปิดห้อง · เรียง addedAt) */
export async function getRoom(ctx: ConvCtx, roomId: string): Promise<(AiRoom & { status: RoomStatus; members: RoomMemberRow[] }) | null> {
  const actor = memberActorOf(ctx);
  const id = typeof roomId === "string" ? roomId.trim() : "";
  if (!actor || !id) return null;
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiRoom.findFirst({ where: { id }, include: { members: { select: { userId: true } } } });
  if (!row || !canSeeRoom(actor, row)) return null;
  const { members: _members, ...room } = row;
  void _members;
  const [counts, members] = await Promise.all([statusCounts(ctx.tenantId, [room], new Date()), roomMemberRows(ctx.tenantId, room.id)]);
  return { ...room, status: statusFrom(counts, room), members };
}

/** ห้องที่ผู้ใช้นี้ "ดูแล" ได้ (ปิด/เปลี่ยนชื่อ) = ผู้เปิดห้อง หรือ OWNER · ไม่เห็น/ไม่ใช่ = null */
async function managedRoom(ctx: ConvCtx, roomId: string) {
  const actor = memberActorOf(ctx);
  const id = typeof roomId === "string" ? roomId.trim() : "";
  if (!actor || !id) return null;
  const row = await tenantDb({ tenantId: ctx.tenantId }).aiRoom.findFirst({ where: { id }, select: { id: true, conversationId: true, startedById: true, closedAt: true } });
  if (!row) return null;
  return actor.membership.role === "OWNER" || row.startedById === actor.userId ? row : null;
}

/** ปิดห้อง (→ DONE) — ผู้เปิดห้องหรือ OWNER เท่านั้น · ปิดอยู่แล้ว = false */
export async function closeRoom(ctx: ConvCtx, roomId: string, now: Date = new Date()): Promise<boolean> {
  const row = await managedRoom(ctx, roomId);
  if (!row) return false;
  const res = await tenantDb({ tenantId: ctx.tenantId }).aiRoom.updateMany({ where: { id: row.id, closedAt: null }, data: { closedAt: now } });
  return res.count > 0;
}

/** เปลี่ยนชื่อห้อง (AiRoom + AiConversation) — ผู้เปิดห้องหรือ OWNER เท่านั้น · ชื่อว่าง = false · ≤ 60 ตัว */
export async function renameRoom(ctx: ConvCtx, roomId: string, title: string): Promise<boolean> {
  const clean = typeof title === "string" && title.trim() ? roomTitleFrom(title) : "";
  if (!clean) return false;
  const row = await managedRoom(ctx, roomId);
  if (!row) return false;
  const tenantId = ctx.tenantId;
  const [r] = await prisma.$transaction([
    prisma.aiRoom.updateMany({ where: { id: row.id, tenantId }, data: { title: clean } }),
    prisma.aiConversation.updateMany({ where: { id: row.conversationId, tenantId }, data: { title: clean } }),
  ]);
  return r.count > 0;
}
