// SVC B.15 — คู่รัก/กลุ่ม: 1 การจอง = หลายงาน (Appointment N แถว · groupId เดียวกัน) · ใบสั่ง ledger/svc-briefs/svc-brief-b.15.md §3.1
//   bookGroup · findGroupSlots — ด่านเดียว (groupFit ใน service.ts: กติกาหมอ B.3 + ห้องเดียวของ planner-group.ts)
//   groupOf — มุมมองกลุ่ม (สมาชิก · หัวกลุ่ม · มัดจำรวม = Σ DepositInfo)
//   cancelGroup — ยกเลิกทั้งกลุ่มฝั่งร้านใน tx เดียว (queue-line.cancelGroupByShop) · rescheduleGroup — เลื่อนทั้งกลุ่ม (service.rescheduleGroupCore)
//
// 🔴 X1: ทุกทางผูก tenantId + unitId ของ ctx · ไม่พบ/ข้ามร้าน/ข้ามหน่วย ⇒ NOT_FOUND ข้อความเดียว ("ไม่พบการจองกลุ่มนี้") · groupOf ⇒ null
// 🔴 ไม่มีตัวกันในหน่วยความจำ — ล็อกฐานเท่านั้น (ลำดับ §5) · เวลาไทยผ่าน localToUtc/bkk* ใน service.ts
import { tenantDb } from "@/lib/core/db";
import { depositInfo, type DepositInfo } from "./deposit";
import { cancelGroupByShop, okCtx, type LineCtx } from "./queue-line";
import { resourceIdsOfRow } from "./resources";
import {
  bookGroupImpl,
  findGroupSlotsImpl,
  GROUP_NOT_FOUND_REASON,
  groupRowsOf,
  rescheduleGroupCore,
  type BookingChannel,
  type BookingCtx,
  type GroupBookInput,
  type GroupBookResult,
  type GroupMemberInput,
  type GroupOpFail,
  type GroupOpResult,
  type GroupSlot,
} from "./service";

export type { GroupBookInput, GroupBookResult, GroupFailCode, GroupMemberInput, GroupOpFail, GroupOpResult, GroupSlot } from "./service";

export type GroupMember = {
  appointmentId: string; staffId: string; serviceId: string; status: string; startAt: Date; resourceIds: string[]; leader: boolean; deposit: DepositInfo | null;
};
export type GroupDeposit = { requiredSatang: number; paidSatang: number; usedSatang: number; forfeitedSatang: number; refundedSatang: number; refundDueSatang: number };
export type GroupView = { groupId: string; unitId: string; members: GroupMember[]; deposit: GroupDeposit };

/** จองกลุ่ม 2–10 คน (ได้ครบทุกคน + ห้องพร้อมกัน หรือไม่ได้เลย) */
export async function bookGroup(ctx: BookingCtx, i: GroupBookInput): Promise<GroupBookResult> {
  return bookGroupImpl(ctx, i);
}

/** ช่องเวลาที่ bookGroup ณ ตอนนั้นจะผ่าน (สูตรเดียว) · excludeGroupId = ไม่นับแถวของกลุ่มนั้น (ใช้ตอนเลื่อน) */
export async function findGroupSlots(
  ctx: BookingCtx,
  q: { members: GroupMemberInput[]; dateStr: string; channel: BookingChannel },
  opts?: { now?: Date; excludeGroupId?: string },
): Promise<GroupSlot[]> {
  return findGroupSlotsImpl(ctx, q, opts);
}

/** groupId ของ id สมาชิกใดก็ได้ หรือ groupId ตรง ๆ (ในหน่วยของ ctx เท่านั้น) */
async function groupIdOf(ctx: { tenantId: string; unitId: string }, idOrGroupId: string): Promise<string | null> {
  if (typeof idOrGroupId !== "string" || !idOrGroupId || idOrGroupId.length > 200) return null;
  const db = tenantDb(ctx);
  const byGroup = await db.appointment.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, groupId: idOrGroupId }, select: { groupId: true } });
  if (byGroup?.groupId) return byGroup.groupId;
  const byId = await db.appointment.findFirst({ where: { tenantId: ctx.tenantId, unitId: ctx.unitId, id: idOrGroupId }, select: { groupId: true } });
  return byId?.groupId ?? null;
}

/** มุมมองกลุ่ม (หัวกลุ่มก่อน) · ข้ามร้าน/หน่วย/ไม่ใช่กลุ่ม ⇒ null */
export async function groupOf(ctx: { tenantId: string; unitId: string }, idOrGroupId: string): Promise<GroupView | null> {
  if (!okCtx(ctx)) return null;
  const groupId = await groupIdOf(ctx, idOrGroupId);
  if (!groupId) return null;
  const rows = await groupRowsOf(ctx, groupId);
  if (!rows.length) return null;
  const infos = await Promise.all(rows.map((r) => depositInfo(ctx, r.id)));
  const members: GroupMember[] = rows.map((r, k) => ({
    appointmentId: r.id, staffId: r.staffId, serviceId: r.serviceId, status: String(r.status), startAt: r.startAt,
    resourceIds: resourceIdsOfRow(r.resourceId, r.policySnapshot), leader: k === 0, deposit: infos[k],
  }));
  const sum = (f: (d: DepositInfo) => number) => infos.reduce((t, d) => t + (d ? f(d) : 0), 0);
  return {
    groupId,
    unitId: ctx.unitId,
    members,
    deposit: {
      requiredSatang: sum((d) => d.requiredSatang), paidSatang: sum((d) => d.paidSatang), usedSatang: sum((d) => d.usedSatang),
      forfeitedSatang: sum((d) => d.forfeitedSatang), refundedSatang: sum((d) => d.refundedSatang), refundDueSatang: sum((d) => d.refundDueSatang),
    },
  };
}

const nf = (): GroupOpResult => ({ ok: false, code: "NOT_FOUND", reason: GROUP_NOT_FOUND_REASON });

/** ยกเลิกทั้งกลุ่ม (ร้าน · cancelReason SHOP) — สมาชิกกำลังทำ/เสร็จแล้ว ⇒ BAD_STATE ไม่แตะใคร · ยกเลิกแล้วทั้งกลุ่ม ⇒ ok */
export async function cancelGroup(ctx: LineCtx, groupId: string, opts?: { now?: Date; note?: string }): Promise<GroupOpResult> {
  if (!okCtx(ctx) || typeof groupId !== "string" || !groupId) return nf();
  const rows = await groupRowsOf(ctx, groupId);
  if (!rows.length) return nf();
  const ids = rows.map((r) => r.id);
  const r = await cancelGroupByShop(ctx, groupId, ids, opts);
  if (r.ok) return { ok: true, ids };
  const code: GroupOpFail = r.code === "NOT_FOUND" || r.code === "BAD_STATE" || r.code === "LOST_RACE" || r.code === "BUSY" ? r.code : "BAD_STATE";
  return { ok: false, code, reason: code === "NOT_FOUND" ? GROUP_NOT_FOUND_REASON : r.reason };
}

/** เลื่อนทั้งกลุ่มฝั่งร้าน (กติการ้านจองให้ของ B.3) — ล้ม ⇒ ไม่มีแถวใดขยับ */
export async function rescheduleGroup(ctx: LineCtx, groupId: string, to: { dateStr: string; startMin: number }, opts?: { now?: Date }): Promise<GroupOpResult> {
  if (!okCtx(ctx) || typeof groupId !== "string" || !groupId) return nf();
  const r = await rescheduleGroupCore(ctx, groupId, to, { now: opts?.now, mode: "SHOP" });
  if (r.ok) return r;
  const code: GroupOpFail = r.code === "LEAD_TIME" || r.code === "BEYOND_HORIZON" || r.code === "OFF_GRID" || r.code === "OUTSIDE_HOURS" ? "BAD_INPUT" : r.code;
  return { ok: false, code, reason: r.reason };
}
