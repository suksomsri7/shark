"use server";

// actions.ts — ทางเข้า server action ของ **คอมโพเนนต์ใน `src/components/crm/emails/**`** (ใบ C2.5b)
//
// 🔴 ทำไมต้องมีไฟล์นี้ทั้งที่ตรรกะอยู่ครบใน `@/lib/modules/crm/emails-actions` แล้ว:
//    ด่าน fitness **F2.3** ห้ามโค้ดนอกโฟลเดอร์ CRM (รวม `src/components/**`) import `@/lib/modules/crm/<ไฟล์ใน>`
//    ⇒ คอมโพเนนต์ 'use client' ต้อง import จาก path ของหน้า (โฟลเดอร์นี้อยู่ใน self-dir ของ CRM)
//    แบบเดียวกับที่ `src/components/crm/assignment/CrmAssignmentManager.tsx` import
//    `@/app/app/sys/[id]/crm/settings/assignment/actions`
// 🔴 ห่อบาง ๆ เท่านั้น — ไม่มีตรรกะซ้ำ: ด่านสิทธิ์ · uiVersion · การแปลง error เป็นข้อความไทย อยู่ที่ไฟล์เดียว
//    (`crm/emails-actions.ts`) ที่ข้อสอบ `C2.5-S8.3` ตรวจ ⇒ ไม่มีทางที่สองทางเข้าจะตรวจไม่เท่ากัน
// 🔴 "use server" = ส่งออกได้เฉพาะ async function (ห้าม export type/const — หน้า 500 ทั้งที่ build ผ่าน)
// 🔴 R-E.14 (กติกาถาวร · ข้อสอบ C1.11-S6.10): ไฟล์ server action ของ CRM **ทุกไฟล์** อ่านประตู uiVersion เอง
//    ⇒ ที่นี่กัน "ที่ปากทาง" ก่อน แล้วตัวจริงยังกันซ้ำอีกชั้น — ไม่มีทางที่ทางเข้าที่สองจะหลุดประตูไปได้

import { requireTenant } from "@/lib/core/context";
import { assertCrmV2 } from "@/lib/modules/crm/ui-version";
import {
  addCrmEmailDomainAction as addDomainImpl,
  attachCrmEmailToContactAction as attachImpl,
  crmEmailAttachmentUrlAction as attachmentUrlImpl,
  deleteCrmEmailTemplateAction as deleteTemplateImpl,
  getCrmEmailTemplateAction as getTemplateImpl,
  refreshCrmEmailDomainAction as refreshDomainImpl,
  rotateCrmInboundKeyAction as rotateKeyImpl,
  saveCrmEmailSettingsAction as saveSettingsImpl,
  saveCrmEmailTemplateAction as saveTemplateImpl,
  saveCrmEmailUserSettingAction as saveUserSettingImpl,
  searchCrmEmailContactsAction as searchContactsImpl,
  sendCrmEmailAction as sendImpl,
  sendCrmEmailTestAction as sendTestImpl,
} from "@/lib/modules/crm/emails-actions";

/** ประตู uiVersion ของทางเข้านี้ (R-E.14) — ปฏิเสธก่อนแตะตัวจริง · ตัวจริงยังกันซ้ำอีกชั้นเสมอ */
async function gate(systemId: string): Promise<void> {
  const auth = await requireTenant();
  await assertCrmV2({ tenantId: auth.active.tenantId, systemId: String(systemId ?? "") });
}

export async function sendCrmEmailAction(...a: Parameters<typeof sendImpl>) {
  await gate(String(a[0] ?? ""));
  return sendImpl(...a);
}
export async function crmEmailAttachmentUrlAction(...a: Parameters<typeof attachmentUrlImpl>) {
  await gate(String(a[0] ?? ""));
  return attachmentUrlImpl(...a);
}
export async function searchCrmEmailContactsAction(...a: Parameters<typeof searchContactsImpl>) {
  await gate(String(a[0] ?? ""));
  return searchContactsImpl(...a);
}
export async function attachCrmEmailToContactAction(...a: Parameters<typeof attachImpl>) {
  await gate(String(a[0] ?? ""));
  return attachImpl(...a);
}
export async function saveCrmEmailSettingsAction(...a: Parameters<typeof saveSettingsImpl>) {
  await gate(String(a[0] ?? ""));
  return saveSettingsImpl(...a);
}
export async function rotateCrmInboundKeyAction(...a: Parameters<typeof rotateKeyImpl>) {
  await gate(String(a[0] ?? ""));
  return rotateKeyImpl(...a);
}
export async function saveCrmEmailUserSettingAction(...a: Parameters<typeof saveUserSettingImpl>) {
  await gate(String(a[0] ?? ""));
  return saveUserSettingImpl(...a);
}
export async function addCrmEmailDomainAction(...a: Parameters<typeof addDomainImpl>) {
  await gate(String(a[0] ?? ""));
  return addDomainImpl(...a);
}
export async function refreshCrmEmailDomainAction(...a: Parameters<typeof refreshDomainImpl>) {
  await gate(String(a[0] ?? ""));
  return refreshDomainImpl(...a);
}
export async function sendCrmEmailTestAction(...a: Parameters<typeof sendTestImpl>) {
  await gate(String(a[0] ?? ""));
  return sendTestImpl(...a);
}
export async function saveCrmEmailTemplateAction(...a: Parameters<typeof saveTemplateImpl>) {
  await gate(String(a[0] ?? ""));
  return saveTemplateImpl(...a);
}
export async function deleteCrmEmailTemplateAction(...a: Parameters<typeof deleteTemplateImpl>) {
  await gate(String(a[0] ?? ""));
  return deleteTemplateImpl(...a);
}
export async function getCrmEmailTemplateAction(...a: Parameters<typeof getTemplateImpl>) {
  await gate(String(a[0] ?? ""));
  return getTemplateImpl(...a);
}
