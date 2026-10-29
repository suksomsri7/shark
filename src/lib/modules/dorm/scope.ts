// SVC D.13 ▸ ผู้ดูแลเห็นเฉพาะอาคาร (#64) — สัญญา ledger/svc-briefs/svc-brief-d.13.md §3
//   • ผู้ดู = Membership สดของ (ร้าน, userId) ที่ตอบรับแล้ว — ไม่เชื่อ role/permissions ที่ผู้เรียกส่งมา
//   • OWNER ⇒ ทั้งหน่วย · ค่าตั้ง rooms.access.managerScope (refs {unitId}) ≠ BUILDING ⇒ ทั้งหน่วย
//   • BUILDING ⇒ rooms.access.buildingAssignments[membership.id] ∩ อาคารของหน่วย (ใช้กับทุกบทบาทที่ไม่ใช่ OWNER รวม MANAGER)
//     ไม่มีรายการ ⇒ ไม่เห็นห้องใด (fail closed) · ห้องที่ไม่มีอาคาร ⇒ ซ่อนเมื่อถูกจำกัด
//   • อ่านผ่าน tenantDb เท่านั้น (ไม่ import prisma) · ไม่เปิด tx (ห้ามเรียกระหว่างถือ tx ของผู้เรียก)
import { tenantDb } from "@/lib/core/db";
import type { MembershipCtx } from "@/lib/core/rbac";
import { resolveSettings } from "@/lib/core/settings";

export type DormBuildingScope = { all: true; buildingIds: null } | { all: false; buildingIds: string[] };
export type DormLiveMember = { id: string; ctx: MembershipCtx };

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const NONE: DormBuildingScope = { all: false, buildingIds: [] };

/** Membership สด (acceptedAt ไม่ null) ของ (ร้าน, ผู้ใช้) → รูป MembershipCtx · ไม่มี ⇒ null */
export async function dormLiveMember(tenantId: unknown, userId: unknown): Promise<DormLiveMember | null> {
  if (!isStr(tenantId) || !isStr(userId)) return null;
  const mem = await tenantDb({ tenantId }).membership.findFirst({
    where: { tenantId, userId, acceptedAt: { not: null } },
    select: { id: true, role: true, unitAccess: true, permissions: true },
  });
  if (!mem) return null;
  return {
    id: mem.id,
    ctx: {
      role: mem.role,
      unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
      permissions: isRec(mem.permissions) ? mem.permissions : {},
    },
  };
}

/** หน่วย DORM ของร้าน (ไม่ใช่/ต่างร้าน ⇒ null) */
export async function dormUnitOf(tenantId: unknown, unitId: unknown): Promise<{ id: string; name: string; slug: string } | null> {
  if (!isStr(tenantId) || !isStr(unitId)) return null;
  return tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "DORM" }, select: { id: true, name: true, slug: true } });
}

/** ขอบเขตอาคารของสมาชิกภาพที่โหลดแล้ว (ผู้เรียกตรวจหน่วยแล้ว) */
export async function dormScopeFor(tenantId: string, unitId: string, mem: DormLiveMember): Promise<DormBuildingScope> {
  if (mem.ctx.role === "OWNER") return { all: true, buildingIds: null };
  const r = await resolveSettings({ tenantId }, ["rooms.access.managerScope", "rooms.access.buildingAssignments"], { unitId });
  if (r["rooms.access.managerScope"]?.value !== "BUILDING") return { all: true, buildingIds: null };
  const table = r["rooms.access.buildingAssignments"]?.value;
  const mine = isRec(table) && Array.isArray(table[mem.id]) ? (table[mem.id] as unknown[]).filter(isStr) : [];
  if (!mine.length) return NONE;
  const rows = await tenantDb({ tenantId, unitId }).roomBuilding.findMany({ where: { id: { in: [...new Set(mine)] } }, select: { id: true } });
  return { all: false, buildingIds: rows.map((b) => b.id).sort() };
}

export async function dormBuildingScope(ctx: { tenantId: string }, input: { unitId: string; userId: string }): Promise<DormBuildingScope> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isRec(input)) return NONE;
  const unit = await dormUnitOf(tenantId, input.unitId);
  if (!unit || !isStr(tenantId)) return NONE;
  const mem = await dormLiveMember(tenantId, input.userId);
  if (!mem) return NONE;
  return dormScopeFor(tenantId, unit.id, mem);
}

/** id ห้อง (ทุกสถานะ active/ไม่ active) ที่ขอบเขตนี้เห็น · all ⇒ null (= ไม่จำกัด) */
export async function dormVisibleRoomIds(tenantId: string, unitId: string, scope: DormBuildingScope): Promise<Set<string> | null> {
  if (scope.all) return null;
  if (!scope.buildingIds.length) return new Set();
  const rows = await tenantDb({ tenantId, unitId }).hotelRoom.findMany({ where: { buildingId: { in: scope.buildingIds } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/** id ห้องที่ผู้ใช้คนนี้เห็นในหน่วย (Membership สด) · null = ทั้งหน่วย · ไม่ใช่ DORM/ไม่มีสมาชิกภาพ ⇒ เซตว่าง (fail closed) */
export async function dormVisibleRoomsFor(ctx: { tenantId: string }, input: { unitId: string; userId: string }): Promise<Set<string> | null> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isStr(tenantId) || !isRec(input)) return new Set();
  const unit = await dormUnitOf(tenantId, input.unitId);
  if (!unit) return new Set();
  return dormVisibleRoomIds(tenantId, unit.id, await dormBuildingScope({ tenantId }, { unitId: unit.id, userId: input.userId }));
}
