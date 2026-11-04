// actions.ts — บันทึกการกระทำของเลขา + ย้อนกลับภายใน 24 ชม. (S1.8 · มติ 6 · R-S1.8a · §B.3 · §B.5)
//
// - `recordAction` เขียน `AiActionLog` 1 แถวหลังข้อเสนอ/ขั้นของแผนทำสำเร็จ (hook ใน proposals.ts — ล้ม = log ไม่ทำให้ข้อเสนอล้ม)
//   payload = **id ล้วน** (entity · ค่าก่อนทำ · id ที่อยู่ใน payload ของข้อเสนอ) — ห้ามเก็บข้อความ/ชื่อ/เบอร์
// - `undoAction` ย้อนได้เฉพาะ kind ใน `UNDOABLE_KINDS` (ไม่มีของที่ส่งข้อความหรือเงินออก) · claim อะตอมมิกบน `undoneAt: null` ก่อนลงมือ
//   (ผู้ชนะเท่านั้นทำ · ลงมือไม่สำเร็จ = คืน claim) · สำเร็จ = แถวใหม่ kind `undo:<kind>`
// - `listLog` OWNER เห็นทุกแถว · คนอื่น = แถวของห้องที่ตัวเองเห็น (ผู้เปิด/สมาชิก) หรือที่ตัวเองเป็นผู้สั่ง/ผู้อนุมัติ
// 🔴 proposals.ts import ไฟล์นี้แบบ dynamic เท่านั้น (ไฟล์นี้ import proposals.ts)

import type { AiActionLog, Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import * as kanbanSvc from "@/lib/modules/kanban/service";
import * as bookingSvc from "@/lib/modules/booking/service";
import * as crmSvc from "@/lib/modules/crm";
import { actorProblem } from "../actor";
import { conversationCreatorOf, type ConvCtx } from "../conversation-owner";
import { kindAccessOf } from "../proposals";

const HOURS_24 = 24 as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** kind ที่ย้อนได้ (รุ่นแรก · R-S1.8a) — ห้ามใส่ kind ที่ส่งข้อความถึงลูกค้าหรือมีเงินออก */
export const UNDOABLE_KINDS: Record<string, { entityType: string; hours: 24 }> = {
  kanban_create_card: { entityType: "kanban.card", hours: HOURS_24 },
  "kanban.cards.create": { entityType: "kanban.card", hours: HOURS_24 },
  "kanban.cards.move": { entityType: "kanban.card", hours: HOURS_24 },
  "crm.deals.move": { entityType: "crm.deal", hours: HOURS_24 },
  booking_create_appointment: { entityType: "booking.appointment", hours: HOURS_24 },
};

export type ActionEntity = { type: string; id: string; unitId?: string | null };
/** ช่องรับผลของ dispatch (out-param · R-S1.8a) — handler ตั้ง `entity` เมื่อรู้ id ของของที่สร้าง/แตะ */
export type DispatchOut = { entity?: ActionEntity | null };

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ID_RE = /^[A-Za-z0-9_~:.-]{1,80}$/;
const isIdKey = (k: string) => k === "id" || k.endsWith("Id");
const paramId = (payload: unknown): string | null => {
  const p = isRec(payload) && isRec(payload.params) ? payload.params : null;
  const id = p && typeof p.id === "string" ? p.id : null;
  return id && ID_RE.test(id) ? id : null;
};

/** ค่า string ที่ key ลงท้าย Id/`id` ของ payload (ชั้นบน + params + input) — id ล้วน ไม่มีข้อความอิสระ */
export function payloadIdsOf(payload: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRec(payload)) return out;
  const scan = (src: unknown, prefix: string) => {
    if (!isRec(src)) return;
    for (const [k, v] of Object.entries(src)) {
      if (isIdKey(k) && typeof v === "string" && ID_RE.test(v)) out[`${prefix}${k}`] = v;
    }
  };
  scan(payload, "");
  scan(payload.params, "params.");
  scan(payload.input, "input.");
  return out;
}

/** entity จาก payload เมื่อ handler ไม่ได้ตั้งให้ (คำสั่ง "ย้าย" ของทะเบียน op = params.id) */
function entityFromPayload(kind: string, payload: unknown): ActionEntity | null {
  if (kind === "kanban.cards.move" || kind === "crm.deals.move") {
    const id = paramId(payload);
    return id ? { type: UNDOABLE_KINDS[kind]!.entityType, id } : null;
  }
  return null;
}

/** ค่าก่อนทำ (id/ตัวเลขล้วน) ของ kind ที่ย้อนด้วยการ "ย้ายกลับ" — อื่น = null · อ่านไม่ได้ = null (ไม่ throw) */
export async function snapshotBefore(tenantId: string, kind: string, payload: unknown): Promise<unknown | null> {
  const id = paramId(payload);
  if (!id) return null;
  if (kind === "kanban.cards.move") {
    const c = await prisma.kanbanCard.findFirst({ where: { tenantId, id }, select: { systemId: true, columnId: true, sortOrder: true } });
    return c ? { systemId: c.systemId, columnId: c.columnId, position: c.sortOrder } : null;
  }
  if (kind === "crm.deals.move") {
    const d = await prisma.crmDeal.findFirst({ where: { tenantId, id }, select: { systemId: true, stageId: true } });
    return d ? { systemId: d.systemId, stageId: d.stageId } : null;
  }
  return null;
}

/** ค่าก่อนทำที่ปลอดภัยต่อการเก็บ (id/ตัวเลข/boolean/null เท่านั้น) */
function idsOnly(v: unknown): Record<string, string | number | boolean | null> | null {
  if (!isRec(v)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, x] of Object.entries(v)) {
    if (x === null || typeof x === "number" || typeof x === "boolean") out[k] = x;
    else if (typeof x === "string" && ID_RE.test(x)) out[k] = x;
  }
  return out;
}

export async function recordAction(input: {
  tenantId: string;
  conversationId: string | null;
  kind: string;
  summary: string;
  approverId: string | null;
  proposalId?: string | null;
  planId?: string | null;
  entity?: ActionEntity | null;
  before?: unknown;
  executedAt: Date;
  /** แถว undo: — ผู้สั่ง = คนกดย้อน (ไม่ใช่ผู้เปิดห้อง) */
  userId?: string | null;
  roomId?: string | null;
  undoable?: boolean;
  extraIds?: Record<string, string>;
}): Promise<AiActionLog> {
  const db = tenantDb({ tenantId: input.tenantId });
  const convId = typeof input.conversationId === "string" && input.conversationId ? input.conversationId : null;
  const roomId =
    input.roomId !== undefined ? input.roomId : convId ? ((await db.aiRoom.findFirst({ where: { conversationId: convId }, select: { id: true } }))?.id ?? null) : null;
  const creator = conversationCreatorOf(convId);
  const userId = input.userId ?? (creator?.kind === "member" ? creator.id : null) ?? input.approverId ?? "system";
  const baseKind = input.kind.replace(/^undo:/, "");
  const module = kindAccessOf(baseKind)?.module ?? (baseKind.split(".")[0] || "ai");
  const entityRaw = input.entity ?? null;
  const entity = entityRaw && typeof entityRaw.id === "string" && ID_RE.test(entityRaw.id) ? entityRaw : null;
  const undoable = input.undoable !== false && Object.prototype.hasOwnProperty.call(UNDOABLE_KINDS, input.kind) && !!entity;
  const payload = {
    entity: entity ? { type: entity.type, id: entity.id, ...(entity.unitId ? { unitId: entity.unitId } : {}) } : null,
    before: idsOnly(input.before),
    ...(input.planId ? { planId: input.planId } : {}),
    ids: input.extraIds ?? {},
  };
  return db.aiActionLog.create({
    data: {
      tenantId: input.tenantId,
      roomId,
      userId,
      approverId: input.approverId,
      module,
      kind: input.kind,
      summary: String(input.summary ?? "").slice(0, 200),
      payload: payload as Prisma.InputJsonValue,
      proposalId: input.proposalId ?? null,
      entityType: entity?.type ?? null,
      entityId: entity?.id ?? null,
      undoableUntil: undoable ? new Date(input.executedAt.getTime() + UNDOABLE_KINDS[input.kind]!.hours * 60 * 60 * 1000) : null,
      createdAt: input.executedAt,
    },
  });
}

/** hook ของ proposals.ts — entity จาก out-param หรือจาก payload (ผู้เรียกจับ error เอง · ล้มต้องไม่ทำให้ข้อเสนอล้ม) */
export async function recordFromDispatch(input: {
  tenantId: string;
  conversationId: string | null;
  kind: string;
  summary: string;
  approverId: string | null;
  proposalId?: string | null;
  planId?: string | null;
  payload: unknown;
  out: DispatchOut;
  before: unknown;
  executedAt: Date;
}): Promise<AiActionLog> {
  const entity = input.out.entity ?? entityFromPayload(input.kind, input.payload);
  return recordAction({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    kind: input.kind,
    summary: input.summary,
    approverId: input.approverId,
    proposalId: input.proposalId ?? null,
    planId: input.planId ?? null,
    entity,
    before: input.before,
    executedAt: input.executedAt,
    extraIds: payloadIdsOf(input.payload),
  });
}

// ─────────────────────────────── การมองเห็น ───────────────────────────────

type Viewer = { userId: string; owner: boolean };

function viewerOf(ctx: ConvCtx): Viewer | null {
  if (actorProblem(ctx) || ctx.actor.kind !== "member" || !ctx.actor.userId) return null;
  return { userId: ctx.actor.userId, owner: ctx.actor.membership?.role === "OWNER" };
}

/** ห้องเลขาที่ผู้ดูเห็น (ผู้เปิด ∪ สมาชิก — ความหมายเดียวกับ roomSightFor) */
async function visibleRoomIds(tenantId: string, userId: string): Promise<string[]> {
  const rows = await tenantDb({ tenantId }).aiRoom.findMany({
    where: { OR: [{ startedById: userId }, { members: { some: { userId, tenantId } } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function visibleWhere(v: Viewer, roomIds: string[]): Prisma.AiActionLogWhereInput {
  if (v.owner) return {};
  return { OR: [{ userId: v.userId }, { approverId: v.userId }, ...(roomIds.length > 0 ? [{ roomId: { in: roomIds } }] : [])] };
}

const NOT_FOUND = { ok: false as const, note: "ไม่พบรายการ" };

export async function undoAction(ctx: ConvCtx, logId: string, now: Date = new Date()): Promise<{ ok: true; note: string } | { ok: false; note: string }> {
  const v = viewerOf(ctx);
  const id = typeof logId === "string" ? logId.trim() : "";
  if (!v || !id) return NOT_FOUND;
  const db = tenantDb({ tenantId: ctx.tenantId });
  const row = await db.aiActionLog.findFirst({ where: { id } });
  if (!row) return NOT_FOUND;
  if (!v.owner && row.userId !== v.userId && row.approverId !== v.userId) {
    const rooms = row.roomId ? await visibleRoomIds(ctx.tenantId, v.userId) : [];
    if (!row.roomId || !rooms.includes(row.roomId)) return NOT_FOUND;
  }
  if (row.undoneAt) return { ok: false, note: "รายการนี้ย้อนไปแล้ว" };
  const reg = Object.prototype.hasOwnProperty.call(UNDOABLE_KINDS, row.kind) ? UNDOABLE_KINDS[row.kind] : null;
  if (!reg || !row.undoableUntil || !row.entityId) return { ok: false, note: "รายการนี้ย้อนไม่ได้" };
  if (now.getTime() > row.undoableUntil.getTime()) return { ok: false, note: "เกิน 24 ชั่วโมง ย้อนไม่ได้แล้ว" };
  const access = kindAccessOf(row.kind);
  if (!access) return { ok: false, note: "รายการนี้ย้อนไม่ได้" };
  try {
    assertCan(ctx.actor.kind === "member" ? ctx.actor.membership : ({ role: "STAFF", unitAccess: [], permissions: {} } as never), access);
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, note: "คุณยังไม่มีสิทธิ์ย้อนรายการนี้ ให้ผู้มีสิทธิ์ของระบบนั้นเป็นผู้กด" };
    throw e;
  }

  // claim อะตอมมิก — ผู้ชนะเท่านั้นลงมือ
  const claim = await db.aiActionLog.updateMany({
    where: { id, undoneAt: null, undoableUntil: { gte: now } },
    data: { undoneAt: now, undoneById: v.userId },
  });
  if (claim.count !== 1) return { ok: false, note: "รายการนี้ย้อนไปแล้ว" };

  let note: string;
  try {
    note = await runUndo(ctx, v.userId, row, now);
  } catch (e) {
    await db.aiActionLog.updateMany({ where: { id, undoneAt: now, undoneById: v.userId }, data: { undoneAt: null, undoneById: null } });
    return { ok: false, note: e instanceof Error && e.message ? e.message : "ย้อนรายการไม่สำเร็จ" };
  }
  try {
    await recordAction({
      tenantId: ctx.tenantId,
      conversationId: null,
      roomId: row.roomId,
      userId: v.userId,
      kind: `undo:${row.kind}`,
      summary: `ย้อน: ${row.summary}`.slice(0, 200),
      approverId: v.userId,
      proposalId: row.proposalId,
      entity: row.entityType && row.entityId ? { type: row.entityType, id: row.entityId } : null,
      undoable: false,
      executedAt: now,
      extraIds: { undoOf: row.id },
    });
  } catch {
    /* แถว undo: ล้ม ไม่ย้อนการย้อน — undoneAt ของแถวเดิมคือหลักฐานหลัก */
  }
  return { ok: true, note };
}

async function runUndo(ctx: ConvCtx, userId: string, row: AiActionLog, now: Date): Promise<string> {
  const tenantId = ctx.tenantId;
  const entityId = row.entityId!;
  const before = isRec(row.payload) && isRec(row.payload.before) ? row.payload.before : {};
  switch (row.kind) {
    case "kanban_create_card":
    case "kanban.cards.create": {
      const card = await prisma.kanbanCard.findFirst({ where: { tenantId, id: entityId }, select: { systemId: true, status: true } });
      if (!card) throw new Error("ไม่พบการ์ดนี้แล้ว");
      if (card.status !== "ACTIVE") throw new Error("การ์ดนี้ถูกเก็บไปแล้ว");
      await kanbanSvc.archiveCard(tenantId, card.systemId, entityId, userId);
      return "ย้อนแล้ว — เก็บการ์ดที่เลขาสร้างเรียบร้อย";
    }
    case "kanban.cards.move": {
      const columnId = typeof before.columnId === "string" ? before.columnId : "";
      const card = await prisma.kanbanCard.findFirst({ where: { tenantId, id: entityId }, select: { systemId: true } });
      if (!card || !columnId) throw new Error("ไม่พบตำแหน่งเดิมของการ์ด ย้อนไม่ได้");
      const r = await kanbanSvc.moveCard({ tenantId, systemId: card.systemId, cardId: entityId, toColumnId: columnId });
      if (!r.ok) throw new Error("ย้ายการ์ดกลับที่เดิมไม่สำเร็จ (คอลัมน์เดิมอาจถูกเก็บไปแล้ว)");
      return "ย้อนแล้ว — ย้ายการ์ดกลับคอลัมน์เดิมเรียบร้อย";
    }
    case "crm.deals.move": {
      const stageId = typeof before.stageId === "string" ? before.stageId : "";
      const systemId = typeof before.systemId === "string" ? before.systemId : "";
      if (!stageId || !systemId || ctx.actor.kind !== "member") throw new Error("ไม่พบขั้นเดิมของดีล ย้อนไม่ได้");
      const m = ctx.actor.membership;
      await crmSvc.deals.moveDeal({ tenantId, systemId, actorUserId: userId }, { userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, entityId, { stageId });
      return "ย้อนแล้ว — ย้ายดีลกลับขั้นเดิมเรียบร้อย";
    }
    case "booking_create_appointment": {
      const appt = await prisma.appointment.findFirst({ where: { tenantId, id: entityId }, select: { unitId: true, startAt: true } });
      if (!appt) throw new Error("ไม่พบนัดหมายนี้แล้ว");
      if (appt.startAt.getTime() <= now.getTime()) throw new Error("นัดเริ่มแล้ว ย้อนไม่ได้");
      const st = await bookingSvc.setAppointmentStatus(tenantId, appt.unitId, entityId, "CANCELLED", { actorUserId: userId });
      if (st && (st as { ok?: boolean }).ok === false) throw new Error((st as { reason?: string }).reason || "ยกเลิกนัดไม่สำเร็จ");
      return "ย้อนแล้ว — ยกเลิกนัดที่เลขาจองให้เรียบร้อย";
    }
    default:
      throw new Error("รายการนี้ย้อนไม่ได้");
  }
}

/** วัน YYYY-MM-DD (เวลาไทย) → ช่วงเวลา UTC [start, end) · รูปแบบผิด = null */
function bkkDayRange(day: string): { gte: Date; lt: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = new Date(`${day}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime())) return null;
  return { gte: start, lt: new Date(start.getTime() + DAY_MS) };
}

export async function listLog(
  ctx: ConvCtx,
  opts?: { day?: string; module?: string; roomId?: string; take?: number },
): Promise<AiActionLog[]> {
  const v = viewerOf(ctx);
  if (!v) return [];
  const take = Math.max(1, Math.min(200, Math.floor(Number(opts?.take ?? 50)) || 50));
  const and: Prisma.AiActionLogWhereInput[] = [];
  if (opts?.day !== undefined) {
    const r = bkkDayRange(String(opts.day));
    if (!r) return [];
    and.push({ createdAt: r });
  }
  if (typeof opts?.module === "string" && opts.module) and.push({ module: opts.module });
  if (typeof opts?.roomId === "string" && opts.roomId) and.push({ roomId: opts.roomId });
  if (!v.owner) and.push(visibleWhere(v, await visibleRoomIds(ctx.tenantId, v.userId)));
  return tenantDb({ tenantId: ctx.tenantId }).aiActionLog.findMany({
    where: and.length > 0 ? { AND: and } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}
