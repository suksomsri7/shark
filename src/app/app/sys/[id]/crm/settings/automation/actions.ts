"use server";

// actions.ts — server actions ของหน้า "กฎอัตโนมัติ CRM" `/app/sys/{id}/crm/settings/automation` (ใบ C2.1 · §7.3 · ภาพ 07 บน)
// 🔴 "use server" = export ได้เฉพาะ async function · tenantId จาก session · systemId ถูก resolve ใหม่ในบริการ (automation.ts)
// 🔴 AUDIT-CLASS X2: คีย์ `crm.automation.manage` ตรวจที่นี่ (ด่านหน้า) และในบริการอีกชั้น
// 🔴 uiVersion: หน้านี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด = FORBIDDEN ภาษาไทย (assertCrmV2)
// 🔴 ข้อความ error ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลางภาษาไทย (รายละเอียดไม่หลุดไปหน้าจอ)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import {
  applyStarterRules,
  assertAutomationAccess,
  createRule,
  CrmAutomationError,
  deleteRule,
  dryRun,
  toggleRule,
  updateRule,
} from "@/lib/modules/crm/automation";
import type { CrmRuleInput } from "@/lib/modules/crm/automation-shared";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";

// N6: ลำดับเดียวกับบริการ — ระบบของร้าน (NOT_FOUND) → uiVersion 2 (assertCrmV2 · FORBIDDEN ไทย) → คีย์ crm.automation.manage
async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertAutomationAccess(ctx, actor); // ระบบ → uiVersion 2 → crmCan (ข้อความไทยทุกด่าน)
  await assertCrmV2(ctx); // รูปมาตรฐานของ session() ในหน้า v2 (ผ่านแล้วในบรรทัดบน — อ่านซ้ำราคาถูก)
  return { ctx, actor };
}

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof CrmAutomationError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.automation] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (กฎไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => revalidatePath(`/app/sys/${systemId}/crm/settings/automation`);

/** สร้างกฎใหม่ */
export async function createCrmRuleAction(systemId: string, input: CrmRuleInput): Promise<{ ok: true; id: string } | { ok: false; error: string; code?: string }> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await createRule(ctx, actor, input);
    touch(systemId);
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e);
  }
}

/** แก้กฎ */
export async function updateCrmRuleAction(systemId: string, ruleId: string, input: CrmRuleInput): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  try {
    const { ctx, actor } = await session(systemId);
    await updateRule(ctx, actor, String(ruleId ?? ""), input);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** เปิด/ปิดกฎ (ปิด = ยกเลิกขั้นที่รออยู่) */
export async function toggleCrmRuleAction(systemId: string, ruleId: string, enabled: boolean): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  try {
    const { ctx, actor } = await session(systemId);
    await toggleRule(ctx, actor, String(ruleId ?? ""), !!enabled);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ลบกฎ (ยืนยัน + เหตุผล ≥ 5 ตัวอักษร) */
export async function deleteCrmRuleAction(systemId: string, ruleId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  try {
    const { ctx, actor } = await session(systemId);
    await deleteRule(ctx, actor, String(ruleId ?? ""), { confirm: true, reason: String(reason ?? "") });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** ทดลองรันร่างกฎ (ไม่เขียนอะไร) */
export async function dryRunCrmRuleAction(
  systemId: string,
  input: CrmRuleInput,
): Promise<{ ok: true; total: number; days: number; labels: string[] } | { ok: false; error: string; code?: string }> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await dryRun(ctx, actor, input, { days: 30 });
    return { ok: true, total: r.total, days: r.days, labels: r.matched.slice(0, 8).map((m) => m.label) };
  } catch (e) {
    return failOf(e);
  }
}

/** สร้างกฎเริ่มต้น (6 ใบ + กฎวันที่ของข้อมูลกำหนดเองจากเทมเพลต · ปิดไว้ทุกใบ · กดซ้ำไม่เกิดซ้ำ) */
export async function applyCrmStarterRulesAction(systemId: string): Promise<{ ok: true; created: number } | { ok: false; error: string; code?: string }> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await applyStarterRules(ctx, actor);
    touch(systemId);
    return { ok: true, created: r.created };
  } catch (e) {
    return failOf(e);
  }
}
