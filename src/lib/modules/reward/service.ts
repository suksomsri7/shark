import { prisma } from "@/lib/core/db";
import * as point from "@/lib/modules/point/service";

// Reward — แลกของด้วยแต้ม. scope ตาม systemId (ระบบรางวัล)
function redeemCode(): string {
  const A = "ACDEFGHJKLMNPQRSTUVWXY3456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export async function listRewards(tenantId: string, systemId: string, activeOnly = false) {
  return prisma.reward.findMany({
    where: { tenantId, systemId, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createReward(input: {
  tenantId: string;
  systemId: string;
  name: string;
  pointsCost: number;
  stock?: number | null;
}) {
  return prisma.reward.create({
    data: {
      tenantId: input.tenantId,
      systemId: input.systemId,
      name: input.name,
      pointsCost: input.pointsCost,
      stock: input.stock ?? null,
    },
  });
}

export async function removeReward(tenantId: string, rewardId: string) {
  await prisma.reward.updateMany({ where: { id: rewardId, tenantId }, data: { active: false } });
}

// แลกรางวัล: หักแต้ม (จาก pointSystem) + สร้าง redemption + ตัดสต็อก (atomic)
export async function redeem(input: {
  tenantId: string;
  rewardSystemId: string;
  pointSystemId: string;
  rewardId: string;
  customerId: string;
}): Promise<{ ok: true; code: string } | { ok: false; reason: string }> {
  try {
    const code = redeemCode();
    await prisma.$transaction(async (tx) => {
      const reward = await tx.reward.findFirst({
        where: { id: input.rewardId, tenantId: input.tenantId, systemId: input.rewardSystemId, active: true },
      });
      if (!reward) throw new Error("ไม่พบรางวัล");
      if (reward.stock !== null && reward.stock <= 0) throw new Error("รางวัลหมด");

      // หักแต้ม (burn) — throw ถ้าไม่พอ
      await point.burn(
        {
          tenantId: input.tenantId,
          systemId: input.pointSystemId,
          customerId: input.customerId,
          points: reward.pointsCost,
          refType: "RewardRedemption",
          refId: input.rewardId,
          idempotencyKey: `reward-${input.rewardId}-${input.customerId}-${code}`,
        },
        tx,
      );
      if (reward.stock !== null) {
        await tx.reward.update({ where: { id: reward.id }, data: { stock: { decrement: 1 } } });
      }
      await tx.rewardRedemption.create({
        data: {
          tenantId: input.tenantId,
          systemId: input.rewardSystemId,
          rewardId: input.rewardId,
          customerId: input.customerId,
          pointsCost: reward.pointsCost,
          code,
          status: "PENDING",
        },
      });
    });
    return { ok: true, code };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "แลกไม่สำเร็จ" };
  }
}

// ── หา systemId ของระบบแต้ม (POINT) ที่ผูก unit เดียวกับระบบรางวัล (คืน null ถ้าไม่มี) ──
// pattern เดียวกับ point.getCustomerPoints: resolve ข้ามระบบผ่าน unit ร่วม (appSystemUnit)
export async function resolvePointSystemId(
  tenantId: string,
  rewardSystemId: string,
): Promise<string | null> {
  const rewardUnits = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: rewardSystemId },
    select: { unitId: true },
  });
  if (rewardUnits.length === 0) return null;
  const pointLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "POINT", unitId: { in: rewardUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  return pointLinks[0]?.systemId ?? null;
}

// ── หา systemId ของระบบสมาชิก (MEMBER) ที่ผูก unit เดียวกับระบบรางวัล (สำหรับ dropdown เลือกสมาชิก) ──
export async function resolveMemberSystemIds(
  tenantId: string,
  rewardSystemId: string,
): Promise<string[]> {
  const rewardUnits = await prisma.appSystemUnit.findMany({
    where: { tenantId, systemId: rewardSystemId },
    select: { unitId: true },
  });
  if (rewardUnits.length === 0) return [];
  const memberLinks = await prisma.appSystemUnit.findMany({
    where: { tenantId, type: "MEMBER", unitId: { in: rewardUnits.map((u) => u.unitId) } },
    select: { systemId: true },
  });
  return [...new Set(memberLinks.map((m) => m.systemId))];
}

// ── ลูกค้า (สมาชิก) ที่แลกรางวัลในระบบนี้ได้ — จากระบบสมาชิกที่ผูก unit เดียวกัน ──
export async function listRewardCustomers(
  tenantId: string,
  rewardSystemId: string,
): Promise<{ id: string; name: string | null; memberCode: string; phone: string | null }[]> {
  const memberSystemIds = await resolveMemberSystemIds(tenantId, rewardSystemId);
  if (memberSystemIds.length === 0) return [];
  const rows = await prisma.customer.findMany({
    where: { tenantId, memberSystemId: { in: memberSystemIds } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, memberCode: true, phone: true },
  });
  // memberCode ใน DB เป็น nullable แต่จริง ๆ ถูก gen เสมอ — coerce null→"" ให้ type ปลายทางสะอาด
  return rows.map((c) => ({ ...c, memberCode: c.memberCode ?? "" }));
}

export type RedemptionRow = {
  id: string;
  code: string;
  status: "PENDING" | "FULFILLED" | "CANCELLED";
  pointsCost: number;
  createdAt: Date;
  rewardName: string;
  customerName: string;
};

// ── ประวัติการแลกล่าสุด + ชื่อรางวัล + ชื่อลูกค้า ──
export async function listRedemptions(
  tenantId: string,
  rewardSystemId: string,
  limit = 30,
): Promise<RedemptionRow[]> {
  const rows = await prisma.rewardRedemption.findMany({
    where: { tenantId, systemId: rewardSystemId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { reward: { select: { name: true } } },
  });
  const customerIds = [...new Set(rows.map((r) => r.customerId))];
  const customers = customerIds.length
    ? await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true, memberCode: true },
      })
    : [];
  const cmap = new Map(customers.map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = cmap.get(r.customerId);
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      pointsCost: r.pointsCost,
      createdAt: r.createdAt,
      rewardName: r.reward?.name ?? "รางวัล",
      customerName: c?.name ?? c?.memberCode ?? "ลูกค้า",
    };
  });
}

// ── ทำเครื่องหมาย "รับของแล้ว" (PENDING → FULFILLED) — idempotent, CANCELLED ห้าม fulfill ──
export async function fulfillRedemption(
  tenantId: string,
  rewardSystemId: string,
  redemptionId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const r = await prisma.rewardRedemption.findFirst({
    where: { id: redemptionId, tenantId, systemId: rewardSystemId },
  });
  if (!r) return { ok: false, reason: "ไม่พบรายการแลก" };
  if (r.status === "FULFILLED") return { ok: true }; // idempotent
  if (r.status === "CANCELLED") return { ok: false, reason: "รายการนี้ถูกยกเลิกแล้ว" };
  // guard PENDING → FULFILLED แบบอะตอมมิก (กันแข่งกันกด)
  await prisma.rewardRedemption.updateMany({
    where: { id: redemptionId, tenantId, systemId: rewardSystemId, status: "PENDING" },
    data: { status: "FULFILLED" },
  });
  return { ok: true };
}

// ── ยกเลิก + คืนแต้ม + คืนสต็อก (atomic) — idempotent (CANCELLED แล้วไม่ error) ──
// คืนแต้มเป๊ะตาม pointsCost ผ่าน point.credit (refType/refId ตรงกับตอน burn) · คืน stock +1 ถ้ามีจำกัด
export async function cancelRedemption(
  tenantId: string,
  rewardSystemId: string,
  redemptionId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const pointSystemId = await resolvePointSystemId(tenantId, rewardSystemId);
  try {
    await prisma.$transaction(async (tx) => {
      const r = await tx.rewardRedemption.findFirst({
        where: { id: redemptionId, tenantId, systemId: rewardSystemId },
      });
      if (!r) throw new Error("ไม่พบรายการแลก");
      if (r.status === "CANCELLED") return; // idempotent — ยกเลิกไปแล้ว ไม่ทำซ้ำ (กันคืนแต้ม/สต็อกซ้ำ)
      // claim อะตอมมิก: PENDING/FULFILLED → CANCELLED (ผู้ชนะเท่านั้นได้คืนแต้ม)
      const claimed = await tx.rewardRedemption.updateMany({
        where: {
          id: redemptionId,
          tenantId,
          systemId: rewardSystemId,
          status: { in: ["PENDING", "FULFILLED"] },
        },
        data: { status: "CANCELLED" },
      });
      if (claimed.count === 0) return; // แข่งแพ้ — คนอื่นยกเลิกไปก่อน
      // คืนแต้มเป๊ะตามที่เคยหัก (idempotencyKey ผูก redemptionId → กันคืนซ้ำ)
      if (pointSystemId) {
        await point.credit(
          {
            tenantId,
            systemId: pointSystemId,
            customerId: r.customerId,
            points: r.pointsCost,
            reason: "คืนแต้มจากการยกเลิกแลกรางวัล",
            refType: "RewardRedemption",
            refId: r.rewardId,
            idempotencyKey: `reward-cancel-${r.id}`,
          },
          tx,
        );
      }
      // คืนสต็อก +1 ถ้ารางวัลมีจำกัดจำนวน
      const reward = await tx.reward.findFirst({ where: { id: r.rewardId, tenantId } });
      if (reward && reward.stock !== null) {
        await tx.reward.update({ where: { id: reward.id }, data: { stock: { increment: 1 } } });
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ" };
  }
}
