"use server";

// actions.ts — ทางเข้า server action ของ **คอมโพเนนต์ใน `src/components/crm/tracking/**`** (ใบ C2.6)
//
// 🔴 ทำไมต้องมีไฟล์นี้ทั้งที่ตรรกะอยู่ครบใน `@/lib/modules/crm/tracking-actions` แล้ว: ด่าน fitness **F2.3**
//    ห้ามโค้ดนอกโฟลเดอร์ CRM (รวม `src/components/**`) import `@/lib/modules/crm/<ไฟล์ใน>`
//    ⇒ คอมโพเนนต์ 'use client' ต้อง import จาก path ของหน้า (โฟลเดอร์นี้อยู่ใน self-dir ของ CRM) — แบบเดียวกับใบ C2.5
// 🔴 ห่อบาง ๆ เท่านั้น (ไม่มีตรรกะซ้ำ): ด่านสิทธิ์ · uiVersion · การแปลง error เป็นข้อความไทย อยู่ที่ไฟล์เดียว
// 🔴 R-E.14 (กติกาถาวร): ไฟล์ server action ของ CRM ทุกไฟล์อ่านประตู uiVersion เอง ⇒ กันที่ปากทางก่อน แล้วตัวจริงกันซ้ำ

import { requireTenant } from "@/lib/core/context";
import { assertCrmV2, CrmV2DisabledError } from "@/lib/modules/crm/ui-version";
import {
  createCrmTrackedLinkAction as createLinkImpl,
  crmTrackedLinkQrAction as qrImpl,
  deleteCrmTrackedLinkAction as deleteLinkImpl,
  saveCrmFormTargetAction as saveFormTargetImpl,
  saveCrmTrackingWebAction as saveWebImpl,
  updateCrmTrackedLinkAction as updateLinkImpl,
} from "@/lib/modules/crm/tracking-actions";

/**
 * ประตู uiVersion ของทางเข้านี้ (R-E.14) — ปฏิเสธก่อนแตะตัวจริง · ตัวจริงยังกันซ้ำอีกชั้นเสมอ
 * C4.3-fix ▸ เดิม "โยน" CrmV2DisabledError ออกนอก action ⇒ หน้าจอได้ error ดิบของ Next แทนข้อความไทย · ตอนนี้คืน
 *   `{ ok:false, error, code }` รูปเดียวกับที่ตัวจริงคืน (แบบเดียวกับ `_actions/calls.ts`) · redirect ของ requireTenant ยังโยนต่อ
 */
async function gate(systemId: string): Promise<{ ok: false; error: string; code: string } | null> {
  try {
    const auth = await requireTenant();
    await assertCrmV2({ tenantId: auth.active.tenantId, systemId: String(systemId ?? "") });
    return null;
  } catch (e) {
    if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
    throw e;
  }
}

export async function saveTrackingWeb(systemId: string, patch: Parameters<typeof saveWebImpl>[1]) {
  return (await gate(systemId)) ?? saveWebImpl(systemId, patch);
}

export async function createTrackedLink(systemId: string, input: Parameters<typeof createLinkImpl>[1]) {
  return (await gate(systemId)) ?? createLinkImpl(systemId, input);
}

export async function updateTrackedLink(systemId: string, id: string, patch: Parameters<typeof updateLinkImpl>[2]) {
  return (await gate(systemId)) ?? updateLinkImpl(systemId, id, patch);
}

export async function deleteTrackedLink(systemId: string, id: string, opts: Parameters<typeof deleteLinkImpl>[2]) {
  return (await gate(systemId)) ?? deleteLinkImpl(systemId, id, opts);
}

export async function trackedLinkQr(systemId: string, id: string) {
  return (await gate(systemId)) ?? qrImpl(systemId, id);
}

export async function saveFormTarget(systemId: string, formId: string, patch: Parameters<typeof saveFormTargetImpl>[2]) {
  return (await gate(systemId)) ?? saveFormTargetImpl(systemId, formId, patch);
}
