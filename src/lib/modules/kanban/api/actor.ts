// actor.ts — "คีย์ API" กลายเป็นผู้ใช้ของบอร์ดงานได้อย่างไร (K1.15 · D18)
//
// ปัญหา: ทุก service ของโมดูลนี้ตัดสินสิทธิ์ 2 ชั้น — ชั้นที่ 1 คีย์สิทธิ์ RBAC · ชั้นที่ 2 "บทบาทในบอร์ด"
// ซึ่งมาจากแถว `KanbanBoardMember` / บทบาทในร้าน · แต่คีย์ API ไม่มี Membership และไม่ถูกเชิญเข้าบอร์ดไหนเลย
//
// ทางออก (D18 — เจ้าของเคาะ): คีย์ = การเชื่อมต่อ "ระดับร้าน" เหมือน automation ของเจ้าของ
//   บทบาทบนทุกบอร์ดของระบบที่ผูก มาจาก scope ของคีย์ล้วน ๆ:
//     มี `kanban.board.member.manage`                        → ADMIN
//     มี scope เขียนตัวใดตัวหนึ่ง (การ์ด/คอลัมน์/ป้าย/สร้างบอร์ด) → EDITOR
//     มีแค่สิทธิ์อ่าน                                          → VIEWER
//   และ **เห็นทุกบอร์ดของระบบที่ผูก** (รวมบอร์ด PRIVATE) — เจ้าของร้านเป็นคนออกคีย์และเลือกชุดสิทธิ์เอง
//
// 🔴 คีย์ยังทำได้ไม่เกิน scope ที่ติ๊กไว้: ด่านแรกคือ `op.action` ที่ `src/lib/api/require.ts`
//    (403 `scope_missing`) แล้วค่อยเจอด่านบทบาทบอร์ดในชั้น service อีกที (403/404 ตามกติกา §6.3)

import { evaluate } from "@/lib/core/rbac";
import { membershipFromScopes, type ApiActor } from "@/lib/api/actor";
import type { KanbanActor, KanbanCtx } from "../types";

/** ข้อความไทยเมื่อคีย์ไม่มีสิทธิ์ทำ op ของบอร์ดงาน */
export const KANBAN_DENY_TH = "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในบอร์ดงาน";

/**
 * scope ที่ถือว่า "เขียนได้" ⇒ EDITOR บนทุกบอร์ด (D18)
 * 🔴 รายการนี้คือ **คีย์สิทธิ์ของโมดูล** ที่เป็นการกระทำเชิงเขียน ไม่ใช่ชื่อ op
 *    เพิ่มคีย์สิทธิ์ใหม่ใน `core/permissions.ts` แล้วต้องมาต่อที่นี่ด้วย ไม่งั้นคีย์ที่ถือสิทธิ์นั้น
 *    จะยิง op ผ่านด่าน scope ได้ แต่ตกด่านบทบาทบอร์ด (VIEWER) แบบงง ๆ
 */
export const KANBAN_WRITE_SCOPES: readonly string[] = [
  "kanban.board.create",
  "kanban.board.rename",
  "kanban.board.delete",
  "kanban.column.create",
  "kanban.column.delete",
  "kanban.card.create",
  "kanban.card.update",
  "kanban.card.move",
  "kanban.card.delete",
  "kanban.card.comment",
  "kanban.card.attach",
  "kanban.label.manage",
  "kanban.template.manage",
  "kanban.automation.manage",
];

/** บทบาทบนบอร์ดของคีย์ใบนี้ (D18) */
export function boardRoleForScopes(scopes: readonly string[]): "ADMIN" | "EDITOR" | "VIEWER" {
  if (scopes.includes("kanban.board.member.manage")) return "ADMIN";
  if (scopes.some((s) => KANBAN_WRITE_SCOPES.includes(s))) return "EDITOR";
  return "VIEWER";
}

/**
 * คีย์ที่ถือ scope ชุดนี้ ทำ action ของบอร์ดงานได้ไหม
 * ความหมายเดียวกับหน้าจอ: ตรวจคีย์ตรงตัวผ่าน `evaluate` + กติกา §6.1 "มีคีย์ `kanban.*` ตัวใดก็ได้ = อ่านได้"
 */
export function kanbanScopesCan(scopes: readonly string[], action: string): boolean {
  const membership = membershipFromScopes([...scopes]);
  if (evaluate(membership, { module: "kanban", action })) return true;
  if (action === "kanban.board.read") return scopes.some((s) => s.startsWith("kanban."));
  return false;
}

/** actor ของโมดูลบอร์ดงานที่แทน "คีย์ API" (ใช้แทน actor ที่มาจาก Membership ได้ทุกจุด) */
export function kanbanActorForKey(input: {
  keyId: string;
  scopes: readonly string[];
  createdById?: string | null;
}): KanbanActor {
  return {
    // ไม่มีคนจริง → ใช้ผู้สร้างคีย์ถ้ารู้ (ดาว/“งานของฉัน” จะได้ตรงคน) ไม่งั้นใช้ id ของคีย์ (ไม่ตรงกับใครเลย)
    userId: input.createdById ?? input.keyId,
    role: "STAFF",
    unitAccess: [],
    permissions: Object.fromEntries(input.scopes.map((s) => [s, true])),
    apiRole: boardRoleForScopes(input.scopes),
  };
}

/** `ApiActor` ของแกน REST ที่ผูกวิธีตรวจสิทธิ์ของบอร์ดงานเข้าไป (`ApiModuleConfig.makeActor`) */
export function kanbanApiKeyActor(input: {
  tenantId: string;
  systemId: string;
  keyId: string;
  keyName: string;
  scopes: string[];
  createdById?: string | null;
}): ApiActor {
  return {
    kind: "apikey",
    module: "kanban",
    tenantId: input.tenantId,
    systemId: input.systemId,
    keyId: input.keyId,
    keyName: input.keyName,
    userId: input.createdById ?? null,
    scopes: input.scopes,
    membership: membershipFromScopes(input.scopes),
    can: (action) => kanbanScopesCan(input.scopes, action),
    denyMessageTh: KANBAN_DENY_TH,
  };
}

/**
 * `ApiActor` (แกน REST) → `KanbanCtx` ที่ service ทุกตัวรับได้
 * `actorUserId` = ผู้สร้างคีย์ (ประวัติ/ผู้มอบหมายจะได้ชี้ไปที่คนจริง) · `actor` = actor ของ D18
 */
export function kanbanCtxOf(actor: ApiActor): KanbanCtx {
  // 🔴 K3.5: "คนกดยืนยันข้อเสนอของผู้ช่วย AI" (kind `user`) ไม่มี scope ของคีย์ — สิทธิ์ของเขาคือ
  //    Membership จริง ⇒ ต้องประกอบ actor จาก membership ไม่ใช่จาก `scopes` (ซึ่งเป็น [] เสมอ)
  //    ของเดิมตกไปทาง `kanbanActorForKey([])` = `apiRole: "VIEWER"` บนทุกบอร์ด ⇒ เจ้าของร้านกดยืนยัน
  //    "ย้ายการ์ด/ตั้งกำหนดส่ง" แล้วโดนปฏิเสธเพราะไม่ใช่ EDITOR ทั้งที่เป็น OWNER (ไม่มีข้อสอบชุดไหน
  //    เคยเดินเส้นนี้มาก่อน K3.5 — `dispatchKanbanKind` ถูกเรียกจาก proposals.ts ทางเดียว)
  if (actor.kind === "user") {
    return {
      tenantId: actor.tenantId,
      systemId: actor.systemId,
      actorUserId: actor.userId ?? null,
      actor: {
        userId: actor.userId ?? "",
        role: actor.membership.role,
        unitAccess: actor.membership.unitAccess,
        permissions: actor.membership.permissions,
      },
    };
  }
  return {
    tenantId: actor.tenantId,
    systemId: actor.systemId,
    actorUserId: actor.userId ?? null,
    actor: kanbanActorForKey({
      keyId: actor.keyId ?? "apikey",
      scopes: actor.scopes,
      createdById: actor.userId ?? null,
    }),
  };
}

/** actor ของโมดูล (ตัวที่ service ซึ่งรับ `actor` แยกต่างหากต้องการ) */
export function kanbanActorOf(actor: ApiActor): KanbanActor {
  return kanbanCtxOf(actor).actor!;
}
