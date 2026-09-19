"use server";

// deals-actions.ts — server actions ของหน้าดีล (CRM v2 · ใบ C1.5)
// 🔴 "use server" = export ได้เฉพาะ async function (ชนิดข้อมูลอยู่ที่ deals-shared.ts)
// 🔴 tenantId มาจาก session เสมอ · systemId จากหน้าเป็นแค่ "ตัวเลือก" — บริการ resolve ใหม่ (ต้องเป็นระบบ CRM ของร้านนี้)
// 🔴 F6: ทุก action ตรวจสิทธิ์ด้วย assertCan ก่อนลงมือ (convention crm.deal.<verb> — OWNER/MANAGER ผ่าน · STAFF ตามสิทธิ์)
// 🔴 ไม่โยน error ดิบถึงหน้าจอ — คืน { ok:false, error } ภาษาไทยที่ไม่โทษผู้ใช้ (+ `missing` ของเงื่อนไขก่อนเข้าขั้น)

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { assertCanCrm } from "./access";
import { toMemberActor } from "@/lib/modules/member";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import {
  bulkMove,
  bulkReassign,
  bulkTag,
  changePipeline,
  contactCompanyOptions,
  createDeal,
  deleteDeal,
  exportDeals,
  issueInvoice,
  issueQuotation,
  moveDeal,
  reassignDeal,
  reopenDeal,
  setCollaborators,
  setForecastCategory,
  setLines,
  setNextStep,
  updateDeal,
  type CreateDealInput,
  type DealsCtx,
  type MoveDealInput,
  type UpdateDealInput,
} from "./deals";
import { contactOptions } from "./contacts";
import { DealsError, type DealDto, type DealLineInput, type DealListInput } from "./deals-shared";

type Fail = { ok: false; error: string; code?: string; missing?: string[] };

async function session(systemId: string, action: string) {
  const auth = await requireTenant();
  // CRM C1.7 ▸ มติผู้คุมงาน C1.7 ข้อ 3: ด่านคีย์ผ่าน `crm/access.ts` (MANAGER ปริยายไม่ได้ 5 คีย์ตั้งค่า · อ่านโดยนัยของคน) ◂
  const actor = toMemberActor(auth.user.id, auth.active);
  assertCanCrm(actor, action);
  const ctx: DealsCtx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  // CRM uiVersion gate ▸ action ของหน้า v2 ใช้ได้เฉพาะระบบที่เปิด CRM ใหม่ (settings.crm.uiVersion = 2) — action v1 (`actions.ts`) ไม่ผ่านที่นี่ ◂
  await assertCrmV2(ctx);
  return { ctx, actor };
}

function failOf(e: unknown, multiStep = false): Fail {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof DealsError) return { ok: false, error: e.message, code: e.code, ...(e.missing ? { missing: e.missing } : {}) };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ทำรายการนี้ในระบบ CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  // 🔴 ไม่ส่งรายละเอียดทางเทคนิค/ข้อมูลลูกค้าออกไป (log แค่ชนิด error)
  console.error(`[crm.deals] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return multiStep
    ? { ok: false, error: "ทำรายการไม่สำเร็จครบทุกดีล — บางดีลอาจบันทึกไปแล้ว รีเฟรชหน้าเพื่อดูสถานะล่าสุดก่อนลองใหม่" }
    : { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const base = (systemId: string) => `/app/sys/${systemId}/crm/deals`;
const touch = (systemId: string, dealId?: string) => {
  revalidatePath(base(systemId));
  if (dealId) revalidatePath(`${base(systemId)}/${dealId}`);
};

export async function createDealAction(systemId: string, input: CreateDealInput): Promise<{ ok: true; id: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.create");
    const d = await createDeal(ctx, actor, input);
    touch(systemId);
    return { ok: true, id: d.id };
  } catch (e) {
    return failOf(e);
  }
}

export async function moveDealAction(systemId: string, dealId: string, input: MoveDealInput): Promise<{ ok: true; deal: DealDto } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.move");
    const deal = await moveDeal(ctx, actor, dealId, input);
    touch(systemId, dealId);
    return { ok: true, deal };
  } catch (e) {
    return failOf(e);
  }
}

export async function reopenDealAction(systemId: string, dealId: string, input: { stageId?: string | null; confirm: boolean; reason: string }): Promise<{ ok: true; deal: DealDto } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.move");
    const deal = await reopenDeal(ctx, actor, dealId, input);
    touch(systemId, dealId);
    return { ok: true, deal };
  } catch (e) {
    return failOf(e);
  }
}

export async function changePipelineAction(systemId: string, dealId: string, pipelineId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.move");
    await changePipeline(ctx, actor, dealId, { pipelineId });
    touch(systemId, dealId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateDealAction(systemId: string, dealId: string, input: UpdateDealInput): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.update");
    await updateDeal(ctx, actor, dealId, input);
    touch(systemId, dealId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setLinesAction(systemId: string, dealId: string, input: { lines: DealLineInput[]; discountBp: number }): Promise<{ ok: true; status: "APPLIED" | "APPROVAL_REQUIRED" } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.lines");
    const r = await setLines(ctx, actor, dealId, input);
    touch(systemId, dealId);
    return { ok: true, status: r.status };
  } catch (e) {
    return failOf(e);
  }
}

export async function issueQuotationAction(systemId: string, dealId: string, input: { validDays?: number | null; note?: string | null }): Promise<{ ok: true; docId: string; created: boolean } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.quote");
    const r = await issueQuotation(ctx, actor, dealId, input);
    touch(systemId, dealId);
    return { ok: true, ...r };
  } catch (e) {
    return failOf(e);
  }
}

export async function issueInvoiceAction(systemId: string, dealId: string): Promise<{ ok: true; docId: string; created: boolean } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.quote");
    const r = await issueInvoice(ctx, actor, dealId);
    touch(systemId, dealId);
    return { ok: true, ...r };
  } catch (e) {
    return failOf(e);
  }
}

export async function reassignDealAction(systemId: string, dealId: string, ownerUserId: string | null): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.reassign");
    await reassignDeal(ctx, actor, dealId, { ownerUserId });
    touch(systemId, dealId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setForecastCategoryAction(systemId: string, dealId: string, category: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.update");
    await setForecastCategory(ctx, actor, dealId, category);
    touch(systemId, dealId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setNextStepAction(systemId: string, dealId: string, text: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.update");
    await setNextStep(ctx, actor, dealId, text);
    touch(systemId, dealId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function setCollaboratorsAction(systemId: string, dealId: string, userIds: string[]): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.update");
    await setCollaborators(ctx, actor, dealId, userIds);
    touch(systemId, dealId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function deleteDealAction(systemId: string, dealId: string, confirm: boolean, reason: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.delete");
    await deleteDeal(ctx, actor, dealId, { confirm, reason });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function bulkMoveAction(systemId: string, input: { ids: string[]; stageId: string; confirm: boolean; reason: string }): Promise<{ ok: true; done: number; failed: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.move");
    const r = await bulkMove(ctx, actor, input);
    touch(systemId);
    return { ok: true, done: r.ok, failed: r.failed.length };
  } catch (e) {
    return failOf(e, true);
  }
}

export async function bulkReassignAction(systemId: string, input: { ids: string[]; ownerUserId: string | null; confirm: boolean; reason: string }): Promise<{ ok: true; done: number; failed: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.reassign");
    const r = await bulkReassign(ctx, actor, input);
    touch(systemId);
    return { ok: true, done: r.ok, failed: r.failed.length };
  } catch (e) {
    return failOf(e, true);
  }
}

export async function bulkTagAction(systemId: string, input: { ids: string[]; tag: string }): Promise<{ ok: true; done: number; failed: number } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.update");
    const r = await bulkTag(ctx, actor, input);
    touch(systemId);
    return { ok: true, done: r.ok, failed: r.failed.length };
  } catch (e) {
    return failOf(e, true);
  }
}

export async function exportDealsAction(systemId: string, filters: DealListInput): Promise<{ ok: true; csv: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.export");
    return { ok: true, csv: await exportDeals(ctx, actor, filters) };
  } catch (e) {
    return failOf(e);
  }
}

/** ช่องเลือกผู้ติดต่อของฟอร์มเพิ่มดีล — ค้นฝั่งเซิร์ฟเวอร์ (บทเรียน C1.3 SF11) */
export async function searchDealContactsAction(systemId: string, q: string): Promise<{ ok: true; items: { id: string; name: string }[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.create");
    return { ok: true, items: await contactOptions(ctx, actor, { q: String(q ?? "").slice(0, 100) }) };
  } catch (e) {
    return failOf(e);
  }
}

/** บริษัทที่ผู้ติดต่อคนนี้อยู่ (ลิงก์ที่ยังใช้งาน) */
export async function contactCompaniesAction(systemId: string, contactId: string): Promise<{ ok: true; items: { id: string; name: string; primary: boolean }[] } | Fail> {
  try {
    const { ctx, actor } = await session(systemId, "crm.deal.create");
    return { ok: true, items: await contactCompanyOptions(ctx, actor, contactId) };
  } catch (e) {
    return failOf(e);
  }
}
