"use server";

// tiers-actions.ts — server action ของหน้า "ระบบสมาชิก › ระดับสมาชิก" (M1.10 · ภาพ 04 · 15)
//
// 🔴 ทุก action ผ่านด่านเดียว `gate(systemId, key)`: requireTenant → มีคีย์สิทธิ์ที่กำหนด
//    (ปกติ `member.tier.manage` · ตั้งระดับด้วยมือใช้ `member.tier.setManual` แทน — §6.1) →
//    ระบบเป็น MEMBER ของร้านนี้จริง (404-not-403 ที่ตัวหน้าจอ ส่วนที่นี่คือชั้น mutation จึงโยน error ธรรมดา)
// 🔴 เรียก `./tiers` เท่านั้น — ห้ามแตะตาราง MemberTierDef/MemberTierBenefit/MemberTierHistory/AutomationRule
//    ผ่าน prisma ตรงจากที่นี่ (ยกเว้นอ่าน AppSystem เพื่อยืนยันขอบเขตร้าน และอ่านรายชื่อสมาชิก ACTIVE
//    ของระบบเพื่อป้อนให้ `runTierReview` ตอนทดลองรัน/ประเมินทั้งร้าน — ไม่ใช่ตาราง memberTier*)
// 🔴 ข้อความ error ที่ส่งกลับหน้าจอผ่าน `safeReason` เสมอ (ไม่ปล่อยรายละเอียดภายในหลุดออกไป)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { safeReason } from "@/lib/core/errors";
import { assertCan } from "@/lib/core/rbac";
import { prisma } from "./db";
import { canReadMember, hasMemberPerm, toMemberActor, type MemberActor } from "./access";
import {
  archiveTierDef,
  createTierDef,
  reorderTierDefs,
  runTierReview,
  setBenefits,
  setManualTier,
  setTierRules,
  updateTierDef,
  type MemberCtx,
  type ManualTierResult,
  type ReviewResult,
  type RuleInput,
  type TierBenefitDto,
  type TierDefDto,
  type TierRulesDto,
} from "./tiers";

export type TierActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const PATH = (systemId: string) => `/app/sys/${systemId}/member/tiers`;
const DETAIL_PATH = (systemId: string, tierDefId: string) => `/app/sys/${systemId}/member/tiers/${tierDefId}`;

async function gate(systemId: string, key: "member.tier.manage" | "member.tier.setManual"): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  const mc = { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions };

  // ชั้นที่ 1 — เข้าโมดูลสมาชิกได้ไหม (read-โดยนัย แบบเดียวกับ privacy-actions.ts/fields-actions.ts)
  if (!canReadMember(actor)) {
    assertCan(mc, { module: "member", action: "member.customer.read" });
  }
  // ชั้นที่ 2 — สิทธิ์เจาะจงของระดับสมาชิก (§6.1: manage/setManual ไม่ใช่ "MANAGER ผ่านทุกอย่าง" ของ rbac ทั่วไป)
  // ข้อความไทยที่ผู้ใช้เห็นจริง (safeReason ผ่านได้เพราะมีอักษรไทย) มาจาก error นี้ ไม่ใช่ ForbiddenError เดิม
  if (!hasMemberPerm(actor, key)) {
    throw new Error(
      key === "member.tier.setManual"
        ? "บัญชีของคุณยังไม่ได้รับสิทธิ์ตั้งระดับสมาชิกด้วยมือ — ขอสิทธิ์จากเจ้าของร้านก่อน"
        : "บัญชีของคุณยังไม่ได้รับสิทธิ์จัดการระดับสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน",
    );
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

// ───────────────────────── ระดับ (defs) ─────────────────────────

export async function createTierDefAction(
  systemId: string,
  input: Parameters<typeof createTierDef>[2],
): Promise<TierActionResult<TierDefDto>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.tier.manage");
    const data = await createTierDef(ctx, actor, input);
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เพิ่มระดับสมาชิกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function updateTierDefAction(
  systemId: string,
  tierDefId: string,
  patch: Parameters<typeof updateTierDef>[3],
): Promise<TierActionResult<TierDefDto>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.tier.manage");
    const data = await updateTierDef(ctx, actor, tierDefId, patch);
    revalidatePath(PATH(systemId));
    revalidatePath(DETAIL_PATH(systemId, tierDefId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกระดับสมาชิกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function reorderTierDefsAction(systemId: string, ids: string[]): Promise<TierActionResult<TierDefDto[]>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.tier.manage");
    const data = await reorderTierDefs(ctx, actor, ids);
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เรียงลำดับระดับสมาชิกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function archiveTierDefAction(
  systemId: string,
  tierDefId: string,
  moveToTierId: string,
): Promise<TierActionResult<{ archived: true; moved: number }>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.tier.manage");
    const data = await archiveTierDef(ctx, actor, tierDefId, { moveToTierId });
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "เก็บระดับสมาชิกเข้าคลังไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── สิทธิประโยชน์ + กฎ ─────────────────────────

export async function setBenefitsAction(
  systemId: string,
  tierDefId: string,
  benefits: { type: string; config?: unknown; active?: boolean }[],
): Promise<TierActionResult<TierBenefitDto[]>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.tier.manage");
    const data = await setBenefits(ctx, actor, tierDefId, benefits);
    revalidatePath(DETAIL_PATH(systemId, tierDefId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกสิทธิประโยชน์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

export async function setTierRulesAction(
  systemId: string,
  tierDefId: string,
  input: {
    upgrade?: RuleInput | null;
    keep?: RuleInput | null;
    reviewCron?: string | null;
    graceDays?: number;
    notifyBeforeDays?: number;
  },
): Promise<TierActionResult<TierRulesDto>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.tier.manage");
    const data = await setTierRules(ctx, actor, tierDefId, input);
    revalidatePath(PATH(systemId));
    revalidatePath(DETAIL_PATH(systemId, tierDefId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกกฎระดับสมาชิกไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ทดลองรัน / ประเมินทั้งร้าน ─────────────────────────

/** สมาชิก ACTIVE ทั้งหมดของระบบนี้ — ให้ `runTierReview` ประเมินทุกคนไม่ว่าจะถึงรอบทบทวนหรือยัง */
async function activeCustomerIds(ctx: MemberCtx): Promise<string[]> {
  const rows = await prisma.customer.findMany({
    where: { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: "ACTIVE" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function namesOf(ctx: MemberCtx, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await prisma.customer.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids } }, select: { id: true, name: true, memberCode: true } });
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.name?.trim() || r.memberCode || "(ไม่มีชื่อ)";
  return out;
}

export async function dryRunAction(systemId: string): Promise<TierActionResult<{ result: ReviewResult; names: Record<string, string> }>> {
  try {
    const { ctx } = await gate(systemId, "member.tier.manage");
    const ids = await activeCustomerIds(ctx);
    const result = await runTierReview(ctx, systemId, new Date(), { dryRun: true, customerIds: ids });
    const involved = [...result.upgraded, ...result.downgraded, ...result.atRisk, ...result.kept].slice(0, 20).map((r) => r.customerId);
    const names = await namesOf(ctx, involved);
    return { ok: true, data: { result, names } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ทดลองรันไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** "ประเมินทั้งร้านตอนนี้" — บังคับรอบทบทวนของสมาชิก ACTIVE ทุกคนทันที (ไม่รอถึงกำหนด) แล้วใช้ผลจริง */
export async function reviewNowAction(systemId: string): Promise<TierActionResult<{ result: ReviewResult; names: Record<string, string> }>> {
  try {
    const { ctx } = await gate(systemId, "member.tier.manage");
    const ids = await activeCustomerIds(ctx);
    const result = await runTierReview(ctx, systemId, new Date(), { dryRun: false, customerIds: ids });
    const involved = [...result.upgraded, ...result.downgraded, ...result.atRisk].slice(0, 20).map((r) => r.customerId);
    const names = await namesOf(ctx, involved);
    revalidatePath(PATH(systemId));
    return { ok: true, data: { result, names } };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ประเมินทั้งร้านไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

// ───────────────────────── ตั้งระดับด้วยมือ ─────────────────────────

export async function setManualTierAction(
  systemId: string,
  customerId: string,
  input: { tierDefId: string; reason: string; until?: string | null },
): Promise<TierActionResult<ManualTierResult>> {
  try {
    const { ctx, actor } = await gate(systemId, "member.tier.setManual");
    const data = await setManualTier(ctx, actor, customerId, {
      tierDefId: input.tierDefId,
      reason: input.reason,
      until: input.until ? new Date(input.until) : null,
    });
    revalidatePath(PATH(systemId));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ตั้งระดับสมาชิกด้วยมือไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

