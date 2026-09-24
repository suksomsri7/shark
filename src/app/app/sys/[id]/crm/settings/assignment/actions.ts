"use server";

// actions.ts — server actions ของหน้า "มอบหมายอัตโนมัติ" `/app/sys/{id}/crm/settings/assignment` (ใบ C2.3 · §5.7 §11.5 · ภาพ 07 ขวา)
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิด/ค่าคงที่ส่งออกจากที่นี่ไม่ได้ — หน้า 500 ทั้งที่ build ผ่าน)
// 🔴 tenantId มาจาก session เสมอ · systemId ถูก resolve ใหม่ในบริการ (assignment.ts) — ไม่เชื่อ id จากหน้าจอ
// 🔴 AUDIT-CLASS X1: คีย์ `crm.assignment.manage` ตรวจที่ด่านหน้า (assertAssignmentAccess) และในบริการอีกชั้น
// 🔴 uiVersion: หน้านี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด = ปฏิเสธภาษาไทย (assertCrmV2 · CRM_V2_DISABLED)
// 🔴 ข้อความ error ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง (รายละเอียดไม่หลุดไปหน้าจอ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import {
  assertAssignmentAccess,
  AssignmentError,
  createRule,
  deleteRule,
  reorderRules,
  setFallbackUser,
  simulate,
  toggleRule,
  updateRule,
} from "@/lib/modules/crm/assignment";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";
import type { CrmAssignActionResult, CrmAssignRuleDraft, CrmAssignSimResult, CrmAssignSimRow } from "@/components/crm/assignment/types";

// ลำดับด่านเดียวกับบริการ: ระบบของร้าน (NOT_FOUND) → uiVersion 2 (CRM_V2_DISABLED) → คีย์ crm.assignment.manage (FORBIDDEN)
async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertAssignmentAccess(ctx, actor);
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof AssignmentError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.assignment] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (กฎมอบหมายไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/assignment`);

/** สร้างกฎมอบหมายใหม่ (ต่อท้ายลำดับ) */
export async function createCrmAssignRuleAction(systemId: string, input: CrmAssignRuleDraft): Promise<CrmAssignActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await createRule(ctx, actor, input);
    touch(systemId);
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e);
  }
}

/** แก้กฎมอบหมาย */
export async function updateCrmAssignRuleAction(systemId: string, ruleId: string, input: CrmAssignRuleDraft): Promise<CrmAssignActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await updateRule(ctx, actor, String(ruleId ?? ""), input);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** เปิด/ปิดกฎ (ปิดแล้วกฎยังอยู่ — เปิดกลับได้ทุกเมื่อ) */
export async function toggleCrmAssignRuleAction(systemId: string, ruleId: string, active: boolean): Promise<CrmAssignActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await toggleRule(ctx, actor, String(ruleId ?? ""), !!active);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ลบกฎ = การกระทำอันตราย (ยืนยัน + เหตุผลอย่างน้อย 5 ตัวอักษร) */
export async function deleteCrmAssignRuleAction(systemId: string, ruleId: string, reason: string): Promise<CrmAssignActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await deleteRule(ctx, actor, String(ruleId ?? ""), { confirm: true, reason: String(reason ?? "") });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** เรียงลำดับกฎใหม่ (กฎแรกที่เงื่อนไขตรงเป็นผู้ตัดสิน — ลำดับจึงสำคัญ) */
export async function reorderCrmAssignRulesAction(systemId: string, ids: string[]): Promise<CrmAssignActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await reorderRules(ctx, actor, Array.isArray(ids) ? ids.map((x) => String(x)) : []);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ตั้ง/ล้างผู้รับสำรอง (ใช้เมื่อไม่มีกฎไหนรับ) */
export async function setCrmAssignFallbackAction(systemId: string, userId: string | null): Promise<CrmAssignActionResult<{ fallbackUserId: string | null }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await setFallbackUser(ctx, actor, userId ? String(userId) : null);
    touch(systemId);
    return { ok: true, fallbackUserId: r.fallbackUserId };
  } catch (e) {
    return failOf(e);
  }
}

/**
 * ค่าฟิลด์กำหนดเองของ lead สมมุติ — คีย์ต้องเป็นรูปคีย์ฟิลด์ (ตัวอื่นถูกทิ้งเงียบ ๆ เพราะเป็นแค่การทดลอง ไม่มีอะไรถูกเขียน)
 * เพดาน 20 ช่อง · ค่าละ 200 ตัวอักษร (บริการตรวจซ้ำอีกชั้น)
 */
function simFields(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 20)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k)) continue;
    if (typeof val === "string" || typeof val === "number") {
      const s = String(val).trim();
      if (s) out[k] = s.slice(0, 200);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * ทดลองว่า lead แบบนี้จะเข้าใคร (ไม่เขียนอะไรเลย — คิวจริงไม่ขยับ)
 * 🔴 ส่งต่อทุกอย่างที่หน้าจอกรอกได้ครบ 6 ชนิดเงื่อนไข (ที่มา · ช่องทางย่อย · ภาษา · จังหวัดจากที่อยู่ · ขนาดบริษัท · ฟิลด์กำหนดเอง)
 *    — เวอร์ชันก่อนหน้าทิ้ง partyId/companyId/fields ทำให้กฎ "จังหวัด/ขนาดบริษัท/ฟิลด์" ตอบตรงข้ามกับของจริงโดยไม่มีใครรู้
 */
export async function simulateCrmAssignAction(systemId: string, rows: CrmAssignSimRow[]): Promise<CrmAssignActionResult<{ results: CrmAssignSimResult[] }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const clean = (Array.isArray(rows) ? rows : []).map((r) => ({
      sourceKind: r?.sourceKind ? String(r.sourceKind) : null,
      sourceChannel: r?.sourceChannel ? String(r.sourceChannel) : null,
      locale: r?.locale ? String(r.locale) : null,
      address: r?.address ? String(r.address).slice(0, 300) : null,
      companySize: r?.companySize ? String(r.companySize) : null,
      partyId: r?.partyId ? String(r.partyId) : null,
      companyId: r?.companyId ? String(r.companyId) : null,
      fields: simFields(r?.fields),
    }));
    const out = await simulate(ctx, actor, clean as Parameters<typeof simulate>[2]);
    return { ok: true, results: out.results };
  } catch (e) {
    return failOf(e);
  }
}
