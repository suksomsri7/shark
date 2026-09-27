"use server";

// actions.ts — server actions ของหน้า "คอมมิชชัน" `/app/sys/{id}/crm/settings/commissions` (ใบ C3.3 · ภาพ 10 ขวา)
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ชนิด/ค่าคงที่ส่งออกจากที่นี่ไม่ได้ — หน้า 500 ทั้งที่ build ผ่าน)
// 🔴 tenantId มาจาก session เสมอ · systemId ถูก resolve ใหม่ในบริการ (commissions.ts) — ไม่เชื่อ id จากหน้าจอ
// 🔴 uiVersion: หน้านี้มีเฉพาะ CRM v2 — ระบบที่ยังไม่เปิด = ปฏิเสธภาษาไทย (assertCrmV2 · CRM_V2_DISABLED)
// 🔴 คีย์ตรวจในบริการทุกคำสั่ง (crm.settings.manage · crm.commission.approve + เพดานวงเงินของผู้กด) · ข้อความ error ไม่โทษผู้ใช้

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { approveMany, CommissionsError, createRule, reject, setCommissionSettings, syncPayroll, updateRule } from "@/lib/modules/crm/commissions";
import type { RuleInput } from "@/lib/modules/crm/commissions";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";
import { crmCan } from "@/lib/modules/crm/access";
import type { CrmCommissionActionResult, CrmCommissionRuleDraft, CrmCommissionSettingsDraft } from "@/components/crm/commissions/types";

async function session(systemId: string) {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof CommissionsError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.commissions] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลคอมมิชชันไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => {
  revalidatePath(`/app/sys/${systemId}/crm/settings/commissions`);
  revalidatePath(`/app/sys/${systemId}/crm/commissions`);
};

function ruleInputOf(d: CrmCommissionRuleDraft): RuleInput {
  return {
    name: String(d?.name ?? ""),
    basis: d?.basis === "WON" ? "WON" : "PAID",
    kind: (d?.kind === "FIXED" || d?.kind === "TIERED" ? d.kind : "PCT") as RuleInput["kind"],
    config: d?.config ?? {},
    pipelineId: d?.pipelineId || null,
    minDealSatang: d?.minDealSatang ?? null,
    splitCollaboratorsBp: Number(d?.splitCollaboratorsBp ?? 0),
    payoutDelayDays: Number(d?.payoutDelayDays ?? 0),
    active: d?.active !== false,
  };
}

export async function createCrmCommissionRuleAction(systemId: string, draft: CrmCommissionRuleDraft): Promise<CrmCommissionActionResult<{ id: string }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await createRule(ctx, actor, ruleInputOf(draft));
    touch(systemId);
    return { ok: true, id: r.id };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateCrmCommissionRuleAction(systemId: string, ruleId: string, draft: CrmCommissionRuleDraft): Promise<CrmCommissionActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await updateRule(ctx, actor, String(ruleId ?? ""), ruleInputOf(draft));
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** "อนุมัติที่เลือก" — แต่ละแถวผ่านเพดานวงเงินของผู้กดเอง · แถวที่ไม่ผ่านบอกเหตุผล (ไม่ล้มทั้งชุด) */
export async function approveCrmCommissionsAction(systemId: string, ids: string[]): Promise<CrmCommissionActionResult<{ done: number; failed: { id: string; message: string }[] }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const r = await approveMany(ctx, actor, { ids: Array.isArray(ids) ? ids.map(String) : [], reason: "อนุมัติจากรายการรออนุมัติ" });
    touch(systemId);
    return { ok: true, done: r.done, failed: r.failed.map((f) => ({ id: f.id, message: f.message })) };
  } catch (e) {
    return failOf(e);
  }
}

export async function rejectCrmCommissionAction(systemId: string, id: string, reason: string): Promise<CrmCommissionActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await reject(ctx, actor, { id: String(id ?? ""), reason: String(reason ?? "") });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

/** "ส่ง payroll" — ส่งแถวที่อนุมัติแล้วเข้างวดเงินเดือนของพนักงานที่ผูกไว้ (แถวที่ยังรอผูกพนักงานถูกข้าม) */
export async function sendCrmCommissionsToPayrollAction(systemId: string): Promise<CrmCommissionActionResult<{ requested: number }>> {
  try {
    const { ctx, actor } = await session(systemId);
    if (!crmCan(actor, "crm.commission.approve")) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ \"อนุมัติค่าคอมมิชชัน\" — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
    const r = await syncPayroll(ctx, {});
    touch(systemId);
    return { ok: true, requested: r.requested };
  } catch (e) {
    return failOf(e);
  }
}

// CRM C3.3 ▸ ค่าตั้งของร้าน `settings.crm.commission` (ต้องอนุมัติ · ส่งเงินเดือน · ฐานปริยายของกฎใหม่) — คีย์ crm.settings.manage + zod ในบริการ ◂
export async function saveCrmCommissionSettingsAction(systemId: string, draft: CrmCommissionSettingsDraft): Promise<CrmCommissionActionResult> {
  try {
    const { ctx, actor } = await session(systemId);
    await setCommissionSettings(ctx, actor, { approvalRequired: draft?.approvalRequired, payrollLink: draft?.payrollLink, basis: draft?.basis });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
