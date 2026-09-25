"use server";

// actions.ts — server actions ของหน้า "คะแนนผู้ติดต่อ" `/app/sys/{id}/crm/settings/scoring` (ใบ C2.8 · §5.7 §11.5 · ภาพ 05)
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิด/ค่าคงที่ส่งออกจากที่นี่ไม่ได้ — หน้า 500 ทั้งที่ build ผ่าน)
// 🔴 tenantId มาจาก session เสมอ · systemId ถูก resolve ใหม่ในบริการ (scoring.ts) — ไม่เชื่อ id จากหน้าจอ
// 🔴 AUDIT-CLASS X1: คีย์ `crm.score.manage` ตรวจที่ด่านหน้า (assertScoringAccess) และในบริการอีกชั้น
// 🔴 uiVersion: หน้านี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด = ปฏิเสธภาษาไทย (assertCrmV2 · CRM_V2_DISABLED)
// 🔴 ข้อความ error ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง (รายละเอียดไม่หลุดไปหน้าจอ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import {
  assertScoringAccess,
  createRule,
  deleteRule,
  recompute,
  ScoringError,
  seedSystemRules,
  setScoringSettings,
  toggleRule,
  updateRule,
} from "@/lib/modules/crm/scoring";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";
import type { CrmScoreActionResult, CrmScoreBandsDraft, CrmScoreRecomputeRow, CrmScoreRuleDraft } from "@/components/crm/scoring/types";

// ลำดับด่านเดียวกับบริการ: ระบบของร้าน (NOT_FOUND) → uiVersion 2 (CRM_V2_DISABLED) → คีย์ crm.score.manage (FORBIDDEN)
async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertScoringAccess(ctx, actor);
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ScoringError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.scoring] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (กฎคะแนนไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/scoring`);

/** สร้างกฎเริ่มต้นที่ระบบมีให้ (ซ้ำได้ — กฎที่มีอยู่แล้วไม่ถูกสร้างใบที่สอง) */
export async function seedCrmScoreRulesAction(systemId: string): Promise<CrmScoreActionResult<{ created: number }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await seedSystemRules(ctx, actor);
    touch(systemId);
    return { ok: true, created: r.created };
  } catch (e) {
    return failOf(e);
  }
}

export async function createCrmScoreRuleAction(systemId: string, input: CrmScoreRuleDraft): Promise<CrmScoreActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await createRule(ctx, actor, input);
    touch(systemId);
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateCrmScoreRuleAction(systemId: string, ruleId: string, input: CrmScoreRuleDraft): Promise<CrmScoreActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await updateRule(ctx, actor, String(ruleId ?? ""), input);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function toggleCrmScoreRuleAction(systemId: string, ruleId: string, active: boolean): Promise<CrmScoreActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await toggleRule(ctx, actor, String(ruleId ?? ""), active === true);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ลบกฎ = การกระทำอันตราย: ต้องยืนยัน + เหตุผล (แต้มที่ให้ไปแล้วยังอยู่เป็นประวัติ) */
export async function deleteCrmScoreRuleAction(systemId: string, ruleId: string, reason: string): Promise<CrmScoreActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await deleteRule(ctx, actor, String(ruleId ?? ""), { confirm: true, reason: String(reason ?? "") });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function saveCrmScoreBandsAction(systemId: string, patch: CrmScoreBandsDraft): Promise<CrmScoreActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await setScoringSettings(ctx, actor, patch);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ดูผลก่อน (dry run — ไม่เขียนอะไรเลย) */
export async function previewCrmScoreRecomputeAction(systemId: string): Promise<CrmScoreActionResult<{ contacts: number; changed: number; rows: CrmScoreRecomputeRow[] }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await recompute(ctx, actor, { all: true }, { dryRun: true });
    return { ok: true, contacts: r.contacts, changed: r.changed, rows: (r.items ?? []).slice(0, 50).map((x) => ({ contactId: x.contactId, from: x.from, to: x.to, band: x.band })) };
  } catch (e) {
    return failOf(e);
  }
}

/** คำนวณใหม่ทั้งระบบจริง = การกระทำอันตราย (ยืนยัน + เหตุผล) */
export async function applyCrmScoreRecomputeAction(systemId: string, reason: string): Promise<CrmScoreActionResult<{ changed: number }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await recompute(ctx, actor, { all: true }, { confirm: true, reason: String(reason ?? "") });
    touch(systemId);
    return { ok: true, changed: r.changed };
  } catch (e) {
    return failOf(e);
  }
}
