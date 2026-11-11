// actions.ts — บันทึกการกระทำของเลขา + ย้อนกลับภายใน 24 ชม. (S1.8 · มติ 6 · R-S1.8a · §B.3 · §B.5)
//
// - `recordAction` เขียน `AiActionLog` 1 แถวหลังข้อเสนอ/ขั้นของแผนทำสำเร็จ (hook ใน proposals.ts — ล้ม = log ไม่ทำให้ข้อเสนอล้ม)
//   payload = **id ล้วน** (entity · ค่าก่อนทำ · id ที่อยู่ใน payload ของข้อเสนอ) — ห้ามเก็บข้อความ/ชื่อ/เบอร์
// - `undoAction` ย้อนได้เฉพาะ kind ใน `UNDOABLE_KINDS` (ไม่มีของที่ส่งข้อความหรือเงินออก) · claim อะตอมมิกบน `undoneAt: null` ก่อนลงมือ
//   (ผู้ชนะเท่านั้นทำ · ลงมือไม่สำเร็จ = คืน claim) · สำเร็จ = แถวใหม่ kind `undo:<kind>`
//   รอบ 2 (RESOLUTIONS §K): สิทธิ์ย้อน = สิทธิ์ของ "การกลับทาง" (`undoPermission`) + ขอบเขต + ระดับต่อระบบ ·
//   แถวห้องเลขา = OWNER/MANAGER เท่านั้น · สภาพปัจจุบัน ≠ `payload.after` ⇒ ไม่ย้อน (ไม่ทับงานของคน) ·
//   การ์ด/ดีลย้อนผ่านทะเบียน op ด้วยตัวตนผู้ย้อน (completedAt/กิจกรรม/webhook ตรงของเดิม) · การ์ดย้อนไปท้ายคอลัมน์เดิม
// - `listLog` OWNER เห็นทุกแถว · คนอื่น = แถวของห้องที่ตัวเองเห็น (ผู้เปิด/สมาชิก) หรือที่ตัวเองเป็นผู้สั่ง/ผู้อนุมัติ
// 🔴 proposals.ts import ไฟล์นี้แบบ dynamic เท่านั้น (ไฟล์นี้ import proposals.ts)

import type { AiActionLog, Prisma } from "@prisma/client";
import { prisma, tenantDb } from "@/lib/core/db";
import { assertCan, ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { errDetail, logOps } from "@/lib/core/ops";
import * as kanbanSvc from "@/lib/modules/kanban/service";
import { boardRoleOf } from "@/lib/modules/kanban/members";
import * as bookingSvc from "@/lib/modules/booking/service";
import * as crmSvc from "@/lib/modules/crm";
import { actorProblem } from "../actor";
import { conversationCreatorOf, type ConvCtx } from "../conversation-owner";
import { dispatchKanbanKind } from "../kanban-ops";
import { kindAccessOf } from "../proposals";
import { getAccess, kindAllowedByAccess } from "./access";

const HOURS_24 = 24 as const;
const DAY_MS = 24 * 60 * 60 * 1000;

type UndoSpec = {
  entityType: string;
  hours: 24;
  /** R-S1.8b — สิทธิ์ของ "การกลับทาง" (ไม่ใช่สิทธิ์ของการกระทำเดิม): ย้อนสร้าง = ลบ/เก็บ · ย้อนย้าย = ย้าย · ย้อนจองนัด = เปลี่ยนสถานะนัด */
  undoPermission: { module: string; action: string };
};

/** kind ที่ย้อนได้ (รุ่นแรก · R-S1.8a) — ห้ามใส่ kind ที่ส่งข้อความถึงลูกค้าหรือมีเงินออก */
export const UNDOABLE_KINDS: Record<string, UndoSpec> = {
  kanban_create_card: { entityType: "kanban.card", hours: HOURS_24, undoPermission: { module: "kanban", action: "kanban.card.delete" } },
  "kanban.cards.create": { entityType: "kanban.card", hours: HOURS_24, undoPermission: { module: "kanban", action: "kanban.card.delete" } },
  "kanban.cards.move": { entityType: "kanban.card", hours: HOURS_24, undoPermission: { module: "kanban", action: "kanban.card.move" } },
  "crm.deals.move": { entityType: "crm.deal", hours: HOURS_24, undoPermission: { module: "crm", action: "crm.deal.move" } },
  booking_create_appointment: { entityType: "booking.appointment", hours: HOURS_24, undoPermission: { module: "booking", action: "booking.appointment.setStatus" } },
};

export type ActionEntity = { type: string; id: string; unitId?: string | null };
/** ช่องรับผลของ dispatch (out-param · R-S1.8a) — handler ตั้ง `entity` เมื่อรู้ id ของของที่สร้าง/แตะ */
export type DispatchOut = { entity?: ActionEntity | null };

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const ID_RE = /^[A-Za-z0-9_~:.-]{1,80}$/;
const isIdKey = (k: string) => k === "id" || k.endsWith("Id");
/** R-S1.8e — คีย์ที่เป็นข้อมูลส่วนบุคคลแม้ลงท้าย Id (เลขผู้เสียภาษี · LINE · พร้อมเพย์ · เบอร์ · อีเมล · บัตรประชาชน · พาสปอร์ต) */
const PII_KEY_RE = /taxId|lineId|lineUserId|promptpayId|phone|mobile|email|citizen|passport/i;
export function isPiiKey(k: string): boolean {
  return typeof k === "string" && PII_KEY_RE.test(k);
}
/** R-S1.8e — ค่าที่หน้าตาเป็นข้อมูลส่วนบุคคล: ตัวเลขล้วน ≥ 9 หลัก (เบอร์/เลขบัตร/เลขภาษี) หรือมี `@` */
const looksPii = (v: string | number): boolean => {
  const t = String(v);
  return t.includes("@") || /^\+?\d{9,}$/.test(t.replace(/[\s-]/g, ""));
};
const safeIdValue = (k: string, v: unknown): v is string => typeof v === "string" && !isPiiKey(k) && ID_RE.test(v) && !looksPii(v);
const paramId = (payload: unknown): string | null => {
  const p = isRec(payload) && isRec(payload.params) ? payload.params : null;
  const id = p && typeof p.id === "string" ? p.id : null;
  return id && ID_RE.test(id) ? id : null;
};

/** ค่า string ที่ key ลงท้าย Id/`id` ของ payload (ชั้นบน + params + input) — id ล้วน ไม่มีข้อความอิสระ · ไม่เก็บคีย์/ค่าที่เป็น PII (R-S1.8e) */
export function payloadIdsOf(payload: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRec(payload)) return out;
  const scan = (src: unknown, prefix: string) => {
    if (!isRec(src)) return;
    for (const [k, v] of Object.entries(src)) {
      if (isIdKey(k) && safeIdValue(k, v)) out[`${prefix}${k}`] = v;
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

/**
 * R-S1.8c — สภาพหลังทำ (id/สถานะล้วน) ของสิ่งที่ย้อนได้ · ใช้ตรวจตอนย้อนว่า "ยังเป็นอย่างที่เลขาทิ้งไว้" ไหม
 *   การ์ด ⇒ `{ columnId }` · ดีล ⇒ `{ stageId, stage }` (stage = OPEN/WON/LOST) · นัด ⇒ `{ status }` · อื่น/อ่านไม่ได้ = null
 */
export async function snapshotAfter(tenantId: string, kind: string, entity: ActionEntity | null): Promise<Record<string, string> | null> {
  if (!entity || !Object.prototype.hasOwnProperty.call(UNDOABLE_KINDS, kind)) return null;
  const id = entity.id;
  if (entity.type === "kanban.card") {
    const c = await prisma.kanbanCard.findFirst({ where: { tenantId, id }, select: { columnId: true } });
    return c ? { columnId: c.columnId } : null;
  }
  if (entity.type === "crm.deal") {
    const d = await prisma.crmDeal.findFirst({ where: { tenantId, id }, select: { stageId: true, kind: true } });
    return d ? { stageId: d.stageId, stage: String(d.kind) } : null;
  }
  if (entity.type === "booking.appointment") {
    const a = await prisma.appointment.findFirst({ where: { tenantId, id }, select: { status: true } });
    return a ? { status: String(a.status) } : null;
  }
  return null;
}

/** ค่าก่อนทำที่ปลอดภัยต่อการเก็บ (id/ตัวเลข/boolean/null เท่านั้น) */
function idsOnly(v: unknown): Record<string, string | number | boolean | null> | null {
  if (!isRec(v)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, x] of Object.entries(v)) {
    if (isPiiKey(k)) continue; // R-S1.8e
    if (x === null || typeof x === "boolean") out[k] = x;
    else if (typeof x === "number") { if (Number.isFinite(x) && !looksPii(x)) out[k] = x; }
    else if (safeIdValue(k, x)) out[k] = x;
  }
  return out;
}

/** R-S1.8f — สรุปผ่านตัวปิดรูปแบบเบอร์/อีเมลของ CRM (`maskPiiPatterns` ผ่าน facade `crmApi.maskPiiDeep` — ด่าน fitness ห้าม import ลึก) */
function maskSummary(summary: unknown): string {
  const raw = String(summary ?? "");
  let masked = raw;
  try {
    const m = crmSvc.crmApi.maskPiiDeep(raw);
    masked = typeof m === "string" ? m : raw;
  } catch {
    masked = raw.replace(/\S+@\S+/g, "***").replace(/\+?\d[\d\s.-]{7,}\d/g, "***"); // ปิดไว้ก่อนถ้าตัวปิดล้ม
  }
  return masked.slice(0, 200);
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
  /** R-S1.8c — สภาพหลังทำ (ids ล้วน) */
  after?: unknown;
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
    after: idsOnly(input.after),
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
      summary: maskSummary(input.summary),
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
  const after = await snapshotAfter(input.tenantId, input.kind, entity).catch(() => null); // R-S1.8c ◂
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
    after,
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

/**
 * ห้องเลขาที่ผู้ดูเห็น (ผู้เปิด ∪ สมาชิก — ความหมายเดียวกับ roomSightFor) + ขอบล่างเวลา
 *   SEC S3a.1-S2 ▸ R-Z16 (L1 m-1): สมาชิกที่ seeHistory=false เห็นบันทึกของห้องตั้งแต่ addedAt เท่านั้น (แบบ listMessages) ◂
 */
type RoomSight = { id: string; since: Date | null };
async function visibleRoomSights(tenantId: string, userId: string): Promise<RoomSight[]> {
  const rows = await tenantDb({ tenantId }).aiRoom.findMany({
    where: { OR: [{ startedById: userId }, { members: { some: { userId, tenantId } } }] },
    select: { id: true, startedById: true, members: { where: { userId }, select: { addedAt: true, seeHistory: true }, take: 1 } },
  });
  return rows.map((r) => {
    const mem = r.startedById === userId ? null : r.members[0];
    return { id: r.id, since: mem && !mem.seeHistory ? mem.addedAt : null };
  });
}

function visibleWhere(v: Viewer, rooms: RoomSight[]): Prisma.AiActionLogWhereInput {
  if (v.owner) return {};
  const full = rooms.filter((r) => r.since === null).map((r) => r.id);
  const partial = rooms.filter((r): r is { id: string; since: Date } => r.since !== null).map((r) => ({ roomId: r.id, createdAt: { gte: r.since } }));
  return { OR: [{ userId: v.userId }, { approverId: v.userId }, ...(full.length > 0 ? [{ roomId: { in: full } }] : []), ...partial] };
}

const NOT_FOUND = { ok: false as const, note: "ไม่พบรายการ" };
const APPROVER_ROLES = new Set(["OWNER", "MANAGER"]);
const ROOM_UNDO_NOTE = "รายการจากห้องเลขาต้องให้เจ้าของหรือผู้จัดการเป็นผู้ย้อน";
const NO_UNDO_PERM_NOTE = "คุณยังไม่มีสิทธิ์ย้อนรายการนี้ ให้ผู้มีสิทธิ์ของระบบนั้นเป็นผู้กด";
const UNDO_REASON = "ย้อนการกระทำของเลขา AI";
/** ป้ายผู้กระทำใน AuditLog.after ของการย้อน (ผู้กระทำจริง = ผู้ย้อน · actorId ของ audit = userId ของเขา) */
const UNDO_AUDIT_ACTOR = "ai-undo";

/** ด่านระดับต่อระบบของเลขา (S1.3) สำหรับการย้อน — ระบบที่ปิด/ดูอย่างเดียว = ย้อนไม่ได้ · อ่านฐานไม่ได้ = ปฏิเสธไทย (ปิดไว้ก่อน) */
async function undoLevelGate(tenantId: string, kind: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const access = await getAccess(tenantId);
    return kindAllowedByAccess(access, kind);
  } catch {
    return { ok: false, reason: "ตรวจสิทธิ์ของเลขาไม่ได้ชั่วคราว ลองใหม่อีกครั้ง" };
  }
}

/**
 * ย้อนรายการในบันทึก (≤ 24 ชม.) ด้วยสิทธิ์ของคนกด
 * ลำดับ: มองเห็น → ย้อนแล้ว → ย้อนได้ไหม → เกิน 24 ชม. → ห้องเลขา = OWNER/MANAGER → สิทธิ์กลับทาง (`undoPermission`) →
 *   ระดับต่อระบบ → claim อะตอมมิก → ตรวจสภาพปัจจุบัน + ลงมือ (ล้ม = คืน claim) → แถว `undo:<kind>`
 * 🔴 `now` ใช้เฉพาะทดสอบ — route/แอป (S1.14) ห้ามรับค่านี้จากไคลเอนต์
 */
export async function undoAction(ctx: ConvCtx, logId: string, now: Date = new Date()): Promise<{ ok: true; note: string } | { ok: false; note: string }> {
  const v = viewerOf(ctx);
  const id = typeof logId === "string" ? logId.trim() : "";
  if (!v || !id || ctx.actor.kind !== "member") return NOT_FOUND;
  const m = ctx.actor.membership;
  const db = tenantDb({ tenantId: ctx.tenantId });
  const row = await db.aiActionLog.findFirst({ where: { id } });
  if (!row) return NOT_FOUND;
  if (!v.owner && row.userId !== v.userId && row.approverId !== v.userId) {
    const sight = row.roomId ? (await visibleRoomSights(ctx.tenantId, v.userId)).find((r) => r.id === row.roomId) : undefined;
    if (!sight || (sight.since && row.createdAt.getTime() < sight.since.getTime())) return NOT_FOUND; // R-Z16 ◂
  }
  if (row.undoneAt) return { ok: false, note: "รายการนี้ย้อนไปแล้ว" };
  const reg = Object.prototype.hasOwnProperty.call(UNDOABLE_KINDS, row.kind) ? UNDOABLE_KINDS[row.kind]! : null;
  if (!reg || !row.undoableUntil || !row.entityId) return { ok: false, note: "รายการนี้ย้อนไม่ได้" };
  if (now.getTime() > row.undoableUntil.getTime()) return { ok: false, note: "เกิน 24 ชั่วโมง ย้อนไม่ได้แล้ว" };
  // R-S1.8b · R-K4: รายการของห้องเลขา ย้อนได้เฉพาะเจ้าของ/ผู้จัดการ (เหมือนการอนุมัติ)
  if (row.roomId && !APPROVER_ROLES.has(String(m?.role ?? ""))) return { ok: false, note: ROOM_UNDO_NOTE };
  // R-S1.8b: สิทธิ์ของ "การกลับทาง" ของคนกด (ไม่ใช่สิทธิ์ของการกระทำเดิม)
  try {
    assertCan(m, reg.undoPermission);
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, note: NO_UNDO_PERM_NOTE };
    throw e;
  }
  const level = await undoLevelGate(ctx.tenantId, row.kind);
  if (!level.ok) return { ok: false, note: level.reason };

  // claim อะตอมมิก — ผู้ชนะเท่านั้นลงมือ
  const claim = await db.aiActionLog.updateMany({
    where: { id, undoneAt: null, undoableUntil: { gte: now } },
    data: { undoneAt: now, undoneById: v.userId },
  });
  if (claim.count !== 1) return { ok: false, note: "รายการนี้ย้อนไปแล้ว" };

  let note: string;
  try {
    note = await runUndo(ctx.tenantId, m, v.userId, row, now);
  } catch (e) {
    await db.aiActionLog.updateMany({ where: { id, undoneAt: now, undoneById: v.userId }, data: { undoneAt: null, undoneById: null } });
    // SEC S3a.1-S2 ▸ R-Z26: ข้อความไทยของ service เท่านั้น — ข้อความของฐาน/ระบบ (อังกฤษ · Prisma) ไม่ออกไปถึงผู้ใช้ ◂
    const thai = e instanceof Error && /[ก-๙]/.test(e.message) && !/prisma|invocation|invalid `/i.test(e.message);
    if (!thai) await logOps("WARN", "ai", `secretary.undo: ย้อนไม่สำเร็จ (${row.kind})`, { tenantId: ctx.tenantId, detail: errDetail(e) }).catch(() => {});
    return { ok: false, note: thai ? (e as Error).message.split("\n")[0]!.slice(0, 300) : "ย้อนรายการไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  try {
    await recordAction({
      tenantId: ctx.tenantId,
      conversationId: null,
      roomId: row.roomId,
      userId: v.userId,
      kind: `undo:${row.kind}`,
      summary: `ย้อน: ${row.summary}`,
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

const strOf = (rec: Record<string, unknown>, k: string): string => (typeof rec[k] === "string" ? (rec[k] as string) : "");

async function runUndo(tenantId: string, m: MembershipCtx, userId: string, row: AiActionLog, now: Date): Promise<string> {
  const entityId = row.entityId!;
  const payload = isRec(row.payload) ? row.payload : {};
  const before = isRec(payload.before) ? payload.before : {};
  const after = isRec(payload.after) ? payload.after : null;
  const reqId = `undo-${row.id}`;
  switch (row.kind) {
    case "kanban_create_card": {
      // การ์ดของ kind มือ (proposals.ts) สร้างผ่าน service ไม่ผ่านบทบาทบอร์ด ⇒ ย้อนทางเดียวกัน (service) + ผู้ย้อนต้องเห็นบอร์ด (R-S1.8b)
      const card = await prisma.kanbanCard.findFirst({ where: { tenantId, id: entityId }, select: { systemId: true, boardId: true, status: true } });
      if (!card) throw new Error("ไม่พบการ์ดนี้แล้ว");
      if (card.status !== "ACTIVE") throw new Error("การ์ดนี้ถูกเก็บไปแล้ว");
      const role = await boardRoleOf(
        { tenantId, systemId: card.systemId, actorUserId: userId, actor: { userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } },
        card.boardId,
      );
      if (role === null) throw new Error("คุณมองไม่เห็นบอร์ดของการ์ดนี้ จึงย้อนไม่ได้");
      await kanbanSvc.archiveCard(tenantId, card.systemId, entityId, userId);
      return "ย้อนแล้ว — เก็บการ์ดที่เลขาสร้างเรียบร้อย";
    }
    case "kanban.cards.create": {
      const card = await prisma.kanbanCard.findFirst({ where: { tenantId, id: entityId }, select: { systemId: true, status: true } });
      if (!card) throw new Error("ไม่พบการ์ดนี้แล้ว");
      if (card.status !== "ACTIVE") throw new Error("การ์ดนี้ถูกเก็บไปแล้ว");
      // R-S1.8c: ผ่านทะเบียน op ด้วยตัวตนผู้ย้อน (บทบาทบอร์ด · กิจกรรม · webhook `kanban.card.archived` ตรงของเดิม)
      await dispatchKanbanKind(m, tenantId, reqId, "kanban.cards.archive", { systemId: card.systemId, params: { id: entityId }, input: { reason: UNDO_REASON } }, userId, undefined, UNDO_AUDIT_ACTOR);
      return "ย้อนแล้ว — เก็บการ์ดที่เลขาสร้างเรียบร้อย";
    }
    case "kanban.cards.move": {
      const fromColumnId = strOf(before, "columnId");
      const afterColumnId = after ? strOf(after, "columnId") : "";
      const card = await prisma.kanbanCard.findFirst({ where: { tenantId, id: entityId }, select: { systemId: true, columnId: true, status: true } });
      if (!card || !fromColumnId) throw new Error("ไม่พบตำแหน่งเดิมของการ์ด ย้อนไม่ได้");
      if (card.status !== "ACTIVE") throw new Error("การ์ดนี้ถูกเก็บไปแล้ว ย้อนไม่ได้");
      if (!afterColumnId) throw new Error("ไม่พบสภาพหลังเลขาย้าย ย้อนไม่ได้");
      if (card.columnId !== afterColumnId) throw new Error("การ์ดถูกย้ายไปแล้วหลังจากเลขาย้าย — ย้อนไม่ได้ (กันทับงานของคน)");
      // R-S1.8c: ผ่านทะเบียน op · ไปท้ายคอลัมน์เดิม (ไม่คืนตำแหน่งเดิมตรง) · ออกจากคอลัมน์ "เสร็จ" = completedAt ว่าง
      await dispatchKanbanKind(m, tenantId, reqId, "kanban.cards.move", { systemId: card.systemId, params: { id: entityId }, input: { toColumnId: fromColumnId } }, userId, undefined, UNDO_AUDIT_ACTOR);
      return "ย้อนแล้ว — ย้ายการ์ดกลับคอลัมน์เดิมเรียบร้อย";
    }
    case "crm.deals.move": {
      const fromStageId = strOf(before, "stageId");
      const deal = await prisma.crmDeal.findFirst({ where: { tenantId, id: entityId }, select: { systemId: true, stageId: true, kind: true } });
      if (!deal || !fromStageId) throw new Error("ไม่พบขั้นเดิมของดีล ย้อนไม่ได้");
      if (!after || !strOf(after, "stageId")) throw new Error("ไม่พบสภาพหลังเลขาย้าย ย้อนไม่ได้");
      const afterStage = strOf(after, "stage");
      if (afterStage === "WON" || afterStage === "LOST" || String(deal.kind) === "WON" || String(deal.kind) === "LOST") {
        throw new Error("ดีลนี้ปิดการขายแล้ว ย้อนไม่ได้ — เปิดดีลใหม่จากหน้า CRM ถ้าต้องการ");
      }
      if (deal.stageId !== strOf(after, "stageId")) throw new Error("ดีลถูกย้ายไปขั้นอื่นแล้วหลังจากเลขาย้าย — ย้อนไม่ได้ (กันทับงานของคน)");
      const systemId = strOf(before, "systemId") || deal.systemId;
      // R-S1.8c: ผ่านทะเบียน op ของ CRM ด้วยตัวตนผู้ย้อน (การมองเห็นดีล · กิจกรรม · webhook ตรงของเดิม)
      await crmSvc.crmApi.dispatchCrmKind(
        { tenantId, systemId, userId, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions, proposalId: reqId, auditActor: UNDO_AUDIT_ACTOR },
        "crm.deals.move",
        { systemId, params: { id: entityId }, input: { stageId: fromStageId } },
      );
      return "ย้อนแล้ว — ย้ายดีลกลับขั้นเดิมเรียบร้อย";
    }
    case "booking_create_appointment": {
      const appt = await prisma.appointment.findFirst({ where: { tenantId, id: entityId }, select: { unitId: true, startAt: true, status: true } });
      if (!appt) throw new Error("ไม่พบนัดหมายนี้แล้ว");
      // R-S1.8b: ขอบเขตสาขา — นัดต้องอยู่ในสาขาที่ผู้ย้อนดูแล
      try {
        assertCan(m, { ...UNDOABLE_KINDS.booking_create_appointment!.undoPermission, unitId: appt.unitId });
      } catch (e) {
        if (e instanceof ForbiddenError) throw new Error(NO_UNDO_PERM_NOTE);
        throw e;
      }
      const status = String(appt.status);
      const afterStatus = after ? strOf(after, "status") : "";
      if (afterStatus && afterStatus !== status) throw new Error("สถานะของนัดเปลี่ยนไปแล้วหลังจากเลขาจอง — ย้อนไม่ได้");
      // R-S1.8d: ย้อนได้เฉพาะนัดที่ยังรอ/ยืนยัน และยังไม่ถึงเวลาเริ่ม
      if (status !== "PENDING" && status !== "CONFIRMED") throw new Error("สถานะของนัดตอนนี้ย้อนไม่ได้แล้ว");
      if (appt.startAt.getTime() <= now.getTime()) throw new Error("นัดเริ่มไปแล้ว ย้อนไม่ได้");
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
  if (!v.owner) and.push(visibleWhere(v, await visibleRoomSights(ctx.tenantId, v.userId)));
  return tenantDb({ tenantId: ctx.tenantId }).aiActionLog.findMany({
    where: and.length > 0 ? { AND: and } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}
