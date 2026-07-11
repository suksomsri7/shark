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
