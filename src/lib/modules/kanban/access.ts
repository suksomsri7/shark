// access.ts — สิทธิ์ 2 ชั้นของ "บอร์ดงาน" (K1.3 · พิมพ์เขียว 13-kanban-v2 §6 · D2)
//
// ชั้นที่ 1 = RBAC ของ SHARK (`src/lib/core/rbac.ts` evaluate) — มีสิทธิ์โมดูลไหม
// ชั้นที่ 2 = บทบาทในบอร์ดใบนั้น (ADMIN > EDITOR > VIEWER > null)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์**: ไม่แตะ prisma ไม่แตะ session — รับข้อมูลเข้ามาแล้วตัดสิน
//    (ทดสอบได้ตรง ๆ · เรียกซ้ำในลูปได้โดยไม่ยิง DB · `members.ts` เป็นตัวโหลดข้อมูลให้)
// 🔴 กติกา 404-not-403 (§6.3): "มองไม่เห็น" = `null` → ผู้เรียกต้องโยน `KanbanNotFoundError`
//    ห้ามตอบว่า "มีบอร์ดนี้อยู่แต่คุณไม่มีสิทธิ์" (นั่นคือการยืนยันว่าบอร์ดลับมีจริง)

import type { Prisma, Role } from "@prisma/client";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import type { KanbanActor } from "./types";

/** บทบาทในบอร์ด — `null` = มองไม่เห็นบอร์ดนี้ (404 ไม่ใช่ 403) */
export type BoardRole = "ADMIN" | "EDITOR" | "VIEWER" | null;

/** ข้อมูลของบอร์ดเท่าที่ใช้ตัดสินสิทธิ์ (รับ `KanbanBoard` เต็ม ๆ ได้เพราะครอบคลุมฟิลด์เหล่านี้) */
export type BoardAccessInfo = {
  unitId: string | null;
  visibility: "PRIVATE" | "TENANT";
};

/** แถวสมาชิกบอร์ดเท่าที่ใช้ตัดสิน (รับ `KanbanBoardMember` เต็ม ๆ ได้) */
export type BoardMemberRow = { userId: string; role: "VIEWER" | "EDITOR" | "ADMIN" };

const RANK: Record<"ADMIN" | "EDITOR" | "VIEWER", number> = { ADMIN: 3, EDITOR: 2, VIEWER: 1 };

/** บทบาทที่สูงที่สุดของหลายเส้นทาง (ไม่มีเลย = null) */
function highest(...roles: BoardRole[]): BoardRole {
  let best: BoardRole = null;
  for (const r of roles) if (r && (!best || RANK[r] > RANK[best])) best = r;
  return best;
}

/** `KanbanActor` ใช้แทน `MembershipCtx` ได้ตรง ๆ (มีครบ 3 ฟิลด์) — แยกฟังก์ชันไว้ให้อ่านง่าย */
function mc(actor: KanbanActor): MembershipCtx {
  return { role: actor.role, unitAccess: actor.unitAccess, permissions: actor.permissions };
}

/** ประกอบ actor จากแถว Membership (ที่ไหนก็ได้ที่มี membership อยู่แล้ว — หน้า/action/service) */
export function toActor(userId: string, membership: { role: Role; unitAccess: unknown; permissions: unknown }): KanbanActor {
  return {
    userId,
    role: membership.role,
    unitAccess: Array.isArray(membership.unitAccess) ? (membership.unitAccess as string[]) : [],
    permissions: (membership.permissions ?? {}) as Record<string, unknown>,
  };
}

/**
 * ชั้นที่ 1 — เข้าโมดูลบอร์ดงานได้ไหม (ขั้นต่ำ = `kanban.board.read`)
 *
 * 🔴 backward compat (§6.1): `kanban.board.read` เป็นคีย์ที่เพิ่งมีใน K1.3 ⇒ พนักงานที่เจ้าของเคยติ๊ก
 *    `kanban.card.create` (หรือคีย์ kanban ใด ๆ) ไว้ จะเข้าบอร์ดไม่ได้ทันทีที่ deploy ถ้าตรวจแบบตรงตัว
 *    ⇒ "มีคีย์ `kanban.*` ตัวใดตัวหนึ่ง = ได้ read โดยนัย" — เขียนเป็นตรรกะในโค้ด ไม่ backfill DB
 *    (คนที่ไม่มีคีย์ kanban เลย ยังคงไม่เห็นอะไรเลย — ด่านนี้ยัง fail-closed)
 */
export function canReadKanban(actor: KanbanActor): boolean {
  if (evaluate(mc(actor), { module: "kanban", action: "kanban.board.read" })) return true;
  return Object.entries(actor.permissions).some(([k, v]) => k.startsWith("kanban.") && v === true);
}

/**
 * ชั้นที่ 2 — บทบาทของ actor ในบอร์ดใบนี้ (§6.2)
 *
 * @param memberships แถวสมาชิกของบอร์ดใบนี้ (ส่งเฉพาะแถวของ actor ก็พอ) — ไม่ส่ง = ถือว่าไม่ได้ถูกเชิญ
 */
export function boardRole(
  actor: KanbanActor,
  board: BoardAccessInfo,
  memberships?: readonly BoardMemberRow[] | null,
): BoardRole {
  // 0) ไม่ผ่านชั้นที่ 1 = มองไม่เห็นอะไรเลย (แม้บอร์ด TENANT)
  if (!canReadKanban(actor)) return null;

  // 1) OWNER = ADMIN ทุกบอร์ด ไม่ต้องเชิญ (D2)
  if (actor.role === "OWNER") return "ADMIN";

  // 2) ถูกเชิญไว้ชัด ๆ = บทบาทที่ระบุ
  const explicit: BoardRole = memberships?.find((m) => m.userId === actor.userId)?.role ?? null;

  // 3) MANAGER ที่คุมสาขาของบอร์ดนี้ = EDITOR โดยปริยาย (บอร์ดกลางองค์กร unitId = null ไม่ให้)
  const byUnit: BoardRole =
    actor.role === "MANAGER" && board.unitId !== null && canAccessUnit(mc(actor), board.unitId) ? "EDITOR" : null;

  // 4) บอร์ด TENANT = ทุกคนที่ผ่านข้อ 0 อ่านได้
  const byVisibility: BoardRole = board.visibility === "TENANT" ? "VIEWER" : null;

  return highest(explicit, byUnit, byVisibility);
}

/** ทำสิ่งที่ต้องการบทบาท `need` ได้ไหม (null = มองไม่เห็น → ไม่ได้เสมอ) */
export function hasBoardRole(role: BoardRole, need: "VIEWER" | "EDITOR" | "ADMIN"): boolean {
  return role !== null && RANK[role] >= RANK[need];
}

/**
 * `where` ของบอร์ดที่ actor "มองเห็น" — ใช้กับทุก list/search/รายงาน (§6.2)
 * 🔴 ต้องเป็น where เดียวส่งให้ DB ไม่ใช่กรองใน JS: ไม่งั้น pagination/นับจำนวนจะเพี้ยน
 *    และมีวันที่ใครสักคนลืมกรอง แล้วบอร์ดลับหลุดไปทั้งหน้า
 */
export function visibleBoardsWhere(actor: KanbanActor): Prisma.KanbanBoardWhereInput {
  // ไม่มีสิทธิ์โมดูลเลย → ไม่เห็นอะไรเลย (where ที่จริงไม่ได้ ปลอดภัยกว่าคืน {} = เห็นหมด)
  if (!canReadKanban(actor)) return { id: "__none__" };
  if (actor.role === "OWNER") return {};

  const or: Prisma.KanbanBoardWhereInput[] = [
    { visibility: "TENANT" },
    { members: { some: { userId: actor.userId } } },
  ];
  if (actor.role === "MANAGER") {
    // unitAccess = ["*"] → ทุกบอร์ดที่ผูกสาขา (บอร์ดกลาง unitId = null ยังต้องมาทางอื่น)
    or.push(actor.unitAccess.includes("*") ? { unitId: { not: null } } : { unitId: { in: actor.unitAccess } });
  }
  return { OR: or };
}

// ───────────────────────── error ─────────────────────────

/** มองไม่เห็น → 404 เสมอ (ห้ามบอกว่ามีอยู่จริง · §6.3) */
export class KanbanNotFoundError extends Error {
  readonly status = 404;
  constructor(message = "ไม่พบบอร์ดนี้") {
    super(message);
    this.name = "KanbanNotFoundError";
  }
}

/** เห็นได้แต่ทำไม่ได้ → 403 (UI ควรซ่อนปุ่มไปแล้วตั้งแต่แรก) */
export class KanbanForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "คุณดูบอร์ดนี้ได้อย่างเดียว") {
    super(message);
    this.name = "KanbanForbiddenError";
  }
}
