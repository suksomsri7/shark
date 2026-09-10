"use server";

// reward-actions.ts — server action ของหน้า "รางวัล" v2 (M2.4 · ภาพ 05 · 18)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate()`: requireTenant → เข้าโมดูลสมาชิกได้ (read-โดยนัย) →
//    ระบบเป็น MEMBER ของร้านนี้จริง → resolve ระบบ REWARD/POINT ที่ผูกสาขาเดียวกัน →
//    แล้วแต่ละ action ตรวจคีย์ของตัวเองอีกชั้น (`member.loyalty.manage` / `.read` / `.fulfil` — §6.1)
// 🔴 เรียก `@/lib/modules/reward` (facade) เท่านั้น — ห้ามแตะตาราง Reward* ผ่าน prisma ตรงจากที่นี่
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ (ไม่ปล่อยรายละเอียดภายในหลุด)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { safeReason } from "@/lib/core/errors";
import { canReadMember, hasMemberPerm, toMemberActor, type MemberActor } from "@/lib/modules/member";
// 🔴 prisma ผ่าน `./service` (ไม่ใช่ `@/lib/core/db` ตรง) — กัน fitness F5 เพิ่มไฟล์ใหม่ที่แตะ prisma ดิบ
import { prisma } from "./service";
import {
  cancelV2,
  createRewardV2,
  fulfilV2,
  listRedemptionsV2,
  lookupRedemption,
  redeemV2,
  resolveRewardCtx,
  toggleReward,
  updateRewardV2,
  type CreateRewardV2Input,
  type LookupRedemptionResult,
  type RedeemV2Result,
  type RewardCtx,
  type RewardDto,
  type UpdateRewardV2Input,
} from "./index";

export type RewardActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/rewards`;

async function gate(systemId: string): Promise<{ ctx: RewardCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ stamp-actions.ts / fields-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");

  const ctx = await resolveRewardCtx(tenantId, systemId, auth.user.id);
  if (!ctx) throw new Error("ยังไม่ได้ตั้งค่าระบบรางวัลสำหรับร้านนี้ — ติดต่อผู้ดูแลระบบให้เพิ่มระบบรางวัลก่อน");

  return { ctx, actor };
}

export async function createRewardAction(input: { systemId: string } & CreateRewardV2Input): Promise<RewardActionResult<RewardDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    if (!hasMemberPerm(actor, "member.loyalty.manage")) throw new ForbiddenError({ module: "member", action: "member.loyalty.manage" });
    const { systemId: _systemId, ...rest } = input;
    const reward = await createRewardV2(ctx, actor, rest);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: reward };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกของรางวัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function updateRewardAction(
  input: { systemId: string; rewardId: string } & UpdateRewardV2Input,
): Promise<RewardActionResult<RewardDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    if (!hasMemberPerm(actor, "member.loyalty.manage")) throw new ForbiddenError({ module: "member", action: "member.loyalty.manage" });
    const { systemId: _systemId, rewardId, ...patch } = input;
    const reward = await updateRewardV2(ctx, actor, rewardId, patch);
    revalidatePath(PATH(input.systemId));
    revalidatePath(`${PATH(input.systemId)}/${rewardId}`);
    return { ok: true, data: reward };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกของรางวัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function toggleRewardAction(input: { systemId: string; rewardId: string; active: boolean }): Promise<RewardActionResult<RewardDto>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    if (!hasMemberPerm(actor, "member.loyalty.manage")) throw new ForbiddenError({ module: "member", action: "member.loyalty.manage" });
    const reward = await toggleReward(ctx, actor, input.rewardId, input.active);
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: reward };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เปลี่ยนสถานะของรางวัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function redeemRewardAction(input: {
  systemId: string;
  rewardId: string;
  customerId: string;
  unitId?: string | null;
  idempotencyKey: string;
}): Promise<RewardActionResult<RedeemV2Result>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    if (!hasMemberPerm(actor, "member.loyalty.read")) throw new ForbiddenError({ module: "member", action: "member.loyalty.read" });
    const res = await redeemV2(ctx, actor, {
      rewardId: input.rewardId,
      customerId: input.customerId,
      unitId: input.unitId ?? null,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(PATH(input.systemId));
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "แลกของรางวัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function lookupRedemptionAction(input: { systemId: string; code: string }): Promise<RewardActionResult<LookupRedemptionResult>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    if (!hasMemberPerm(actor, "member.loyalty.fulfil")) throw new ForbiddenError({ module: "member", action: "member.loyalty.fulfil" });
    const res = await lookupRedemption(ctx, { code: input.code });
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ค้นหารายการไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function fulfilRewardAction(input: { systemId: string; redemptionId: string; unitId: string }): Promise<RewardActionResult<{ ok: true }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    if (!hasMemberPerm(actor, "member.loyalty.fulfil")) throw new ForbiddenError({ module: "member", action: "member.loyalty.fulfil" });
    const res = await fulfilV2(ctx, actor, { redemptionId: input.redemptionId, unitId: input.unitId });
    revalidatePath(PATH(input.systemId));
    revalidatePath(`${PATH(input.systemId)}/redemptions`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่งมอบของรางวัลไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function cancelRewardAction(
  input: { systemId: string; redemptionId: string; reason: string },
): Promise<RewardActionResult<{ ok: true; refundedPoints: number; refundedStamps: number }>> {
  try {
    const { ctx, actor } = await gate(input.systemId);
    if (!hasMemberPerm(actor, "member.loyalty.fulfil")) throw new ForbiddenError({ module: "member", action: "member.loyalty.fulfil" });
    const res = await cancelV2(ctx, actor, { redemptionId: input.redemptionId, reason: input.reason });
    revalidatePath(PATH(input.systemId));
    revalidatePath(`${PATH(input.systemId)}/redemptions`);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ยกเลิกรายการไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function listRedemptionsAction(input: {
  systemId: string;
  status?: "PENDING" | "FULFILLED" | "CANCELLED";
  unitId?: string;
  take?: number;
}): Promise<RewardActionResult<Awaited<ReturnType<typeof listRedemptionsV2>>>> {
  try {
    const { ctx } = await gate(input.systemId);
    const rows = await listRedemptionsV2(ctx, { status: input.status, unitId: input.unitId, take: input.take });
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "โหลดประวัติการแลกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
