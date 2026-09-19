// lost-reasons.ts — บริการ "เหตุผลที่แพ้" ของดีล (CRM v2 · ใบ C1.5 · พิมพ์เขียว §5.4 §11.3)
//
// ย้ายดีลเข้าขั้น LOST ต้องเลือกเหตุผลที่ยังใช้งานของระบบนี้ (deals.moveDeal ตรวจ) — ไฟล์นี้ดูแลรายการเหตุผล
// 🔴 ไม่ลบแถว (ดีลเก่าชี้อยู่) — "ปิดใช้งาน" แทน (active = false) · รายการคืนทั้งที่ใช้/ปิดใช้ พร้อมธง
// 🔴 AUDIT-CLASS X1: หาแถวด้วย tenantId + systemId (ระบบ CRM ที่ resolve ใหม่) — ของระบบ/ร้านอื่น = ไม่พบ

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { CrmLostReason } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import { DealsError, LOST_REASON_LABEL_MAX } from "./deals-shared";

export type LostReasonsCtx = { tenantId: string; systemId: string; actorUserId: string | null };
export type LostReasonDto = { id: string; key: string; label: string; active: boolean; sortOrder: number; isSystem: boolean; usedBy: number };

const fail = (code: DealsError["code"], message: string) => new DealsError(code, message);
const scope = (ctx: LostReasonsCtx) => ({ tenantId: ctx.tenantId, systemId: ctx.systemId });
const NOT_FOUND_MSG = "ไม่พบเหตุผลนี้ในระบบ CRM ที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่";

async function enter(ctx: LostReasonsCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
  const sys =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!sys) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
  return actor;
}

// CRM C1.7 ▸ มติผู้คุมงาน C1.7 ข้อ 3: งานตั้งค่า (pipeline · ขั้น · เหตุผลที่แพ้) = คีย์ `crm.settings.manage` ผ่าน `crm/access.ts`
//   (OWNER · หรือได้รับชัดเจน — MANAGER ปริยายไม่ได้ §6.1) · AUDIT-CLASS X2 ◂
async function enterManage(ctx: LostReasonsCtx, actor: MemberActor | null | undefined): Promise<MemberActor> {
  const a = await enter(ctx, actor);
  if (!crmCan(a, "crm.settings.manage")) throw fail("FORBIDDEN", crmForbiddenMessage("crm.settings.manage"));
  return a;
}

function cleanLabel(v: unknown): string {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!t) throw fail("VALIDATION", "ใส่ข้อความเหตุผลก่อน — เช่น \"ราคาสูงไป\"");
  if (t.length > LOST_REASON_LABEL_MAX) throw fail("VALIDATION", `ข้อความเหตุผลยาวเกิน ${LOST_REASON_LABEL_MAX} ตัวอักษร — ย่อให้สั้นลง`);
  return t;
}

function toDto(r: CrmLostReason, usedBy = 0): LostReasonDto {
  return { id: r.id, key: r.key, label: r.label, active: r.active, sortOrder: r.sortOrder, isSystem: r.isSystem, usedBy };
}

async function load(ctx: LostReasonsCtx, id: unknown): Promise<CrmLostReason> {
  const rid = typeof id === "string" && id.trim() ? id.trim() : null;
  const row = rid ? await prisma.crmLostReason.findFirst({ where: { ...scope(ctx), id: rid } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  return row;
}

/** รายการเหตุผลทั้งหมดของระบบนี้ (ที่ใช้อยู่ก่อน) + จำนวนดีลที่ใช้เหตุผลนั้น */
export async function listLostReasons(ctx: LostReasonsCtx, actor: MemberActor): Promise<LostReasonDto[]> {
  await enter(ctx, actor);
  const rows = await prisma.crmLostReason.findMany({ where: scope(ctx), orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], take: 300 });
  const used = rows.length
    ? await prisma.crmDeal.groupBy({ by: ["lostReasonId"], where: { ...scope(ctx), lostReasonId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    : [];
  const n = new Map(used.map((u) => [u.lostReasonId ?? "", u._count._all]));
  return rows.map((r) => toDto(r, n.get(r.id) ?? 0));
}

/** เพิ่มเหตุผล (key สร้างให้อัตโนมัติ — ไม่ซ้ำในระบบ) */
export async function createLostReason(ctx: LostReasonsCtx, actor: MemberActor, input: { label: string }): Promise<LostReasonDto> {
  await enterManage(ctx, actor);
  const label = cleanLabel(input?.label);
  const dup = await prisma.crmLostReason.findFirst({ where: { ...scope(ctx), label } });
  if (dup) throw fail("CONFLICT", "มีเหตุผลนี้อยู่แล้ว — ถ้าถูกปิดใช้อยู่ เปิดใช้งานเหตุผลเดิมแทน");
  const max = await prisma.crmLostReason.aggregate({ where: scope(ctx), _max: { sortOrder: true } });
  try {
    const row = await prisma.crmLostReason.create({
      data: { tenantId: ctx.tenantId, systemId: ctx.systemId, key: `r-${randomUUID().replace(/-/g, "").slice(0, 12)}`, label, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? null, action: "crm.lost_reason.create", targetType: "CrmLostReason", targetId: row.id, after: { label } });
    return toDto(row);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw fail("CONFLICT", "เพิ่มเหตุผลไม่สำเร็จเพราะมีรายการซ้ำพร้อมกัน — ลองอีกครั้ง");
    throw e;
  }
}

/** แก้ข้อความ · เปิด/ปิดใช้งาน · ลำดับ */
export async function updateLostReason(ctx: LostReasonsCtx, actor: MemberActor, id: string, patch: { label?: string | null; active?: boolean | null; sortOrder?: number | null }): Promise<LostReasonDto> {
  await enterManage(ctx, actor);
  const cur = await load(ctx, id);
  const data: Prisma.CrmLostReasonUpdateInput = {};
  if (patch?.label !== undefined && patch.label !== null) data.label = cleanLabel(patch.label);
  if (patch?.active !== undefined && patch.active !== null) data.active = patch.active === true;
  if (patch?.sortOrder !== undefined && patch.sortOrder !== null) {
    if (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0 || patch.sortOrder > 10_000) throw fail("VALIDATION", "ลำดับต้องเป็นจำนวนเต็ม 0–10000");
    data.sortOrder = patch.sortOrder;
  }
  const row = await prisma.crmLostReason.update({ where: { id: cur.id }, data });
  await writeAudit({ tenantId: ctx.tenantId, actorId: ctx.actorUserId ?? null, action: "crm.lost_reason.update", targetType: "CrmLostReason", targetId: row.id, before: { label: cur.label, active: cur.active }, after: { label: row.label, active: row.active } });
  return toDto(row);
}
