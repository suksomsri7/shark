// ui-version.ts — ประตู "หน้าจอ CRM v2" ต่อระบบ (มติ C23 · RESOLUTIONS R-E.14 · MASTER-PLAN C1.11/C6)
//
// 🔴 `settings.crm.uiVersion` = 1 (ค่าเริ่มต้นของทุกร้านบน prod) ⇒ หน้า v1 เดิมทุกตัวอักษร: หน้า/เมนู/action ของ v2 ต้องมองไม่เห็นและใช้ไม่ได้
//    = 2 (เจ้าของร้านเปิดเอง · ร้าน QC) ⇒ หน้าจอ v2 ทั้งหมด
// 🔴 ตัวตัดสินที่เดียว: หน้า v1/v2 ที่แยกทาง (`pickCrmPage`) · route ที่มีเฉพาะ v2 (`requireCrmV2Page` → notFound) ·
//    server action ของหน้า v2 (`assertCrmV2` → FORBIDDEN ข้อความไทย) — อ่านค่าผ่าน `getCrmSettings` (settings.ts) เท่านั้น
// 🔴 อ่านค่าไม่ได้ (ระบบไม่ใช่ CRM ของร้านนี้/อ่านล้ม) = ถือเป็น 1 (ปิด v2 ไว้ก่อน — fail closed)
import { notFound } from "next/navigation";
import { getCrmSettings, type CrmUiVersion } from "./settings";

export const CRM_V2_DISABLED_MSG = "ระบบ CRM ใหม่ยังไม่เปิดให้ร้านนี้ — ใช้หน้าจอ CRM เดิมไปก่อน หรือให้เจ้าของร้านเปิดใช้ CRM ใหม่";

/** error ของ server action v2 เมื่อระบบนี้ยังอยู่ uiVersion 1 — ผู้เรียก (failOf) แปลงเป็น `{ ok:false, code:"FORBIDDEN" }` */
export class CrmV2DisabledError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor() {
    super(CRM_V2_DISABLED_MSG);
    this.name = "CrmV2DisabledError";
  }
}

/** uiVersion ของระบบ CRM นี้ (อ่านไม่ได้ = 1) */
export async function crmUiVersion(ctx: { tenantId: string; systemId: string }): Promise<CrmUiVersion> {
  try {
    return (await getCrmSettings(ctx)).uiVersion;
  } catch {
    return 1;
  }
}

/** หน้าที่มีทั้งรุ่น v1 และ v2 (ผู้ติดต่อ · ดีล): เลือกรุ่นจาก uiVersion — 2 เท่านั้นที่ได้ v2 */
export function pickCrmPage(uiVersion: unknown): "v1" | "v2" {
  return uiVersion === 2 ? "v2" : "v1";
}

/** route ที่มีเฉพาะ v2: ระบบที่ยังไม่เปิด v2 = 404 (ไม่บอกว่ามีหน้านี้อยู่) */
export async function requireCrmV2Page(ctx: { tenantId: string; systemId: string }): Promise<void> {
  if ((await crmUiVersion(ctx)) !== 2) notFound();
}

/** server action ของหน้า v2: ระบบที่ยังไม่เปิด v2 = ปฏิเสธ (action v1 ใน `actions.ts` ไม่เรียกตัวนี้) */
export async function assertCrmV2(ctx: { tenantId: string; systemId: string }): Promise<void> {
  if ((await crmUiVersion(ctx)) !== 2) throw new CrmV2DisabledError();
}

// CRM C1.11 ▸ สวิตช์ v1↔v2 (มติ C23 · addendum ผู้คุมงาน C1.11 ข้อ 1) — ซ่อนจากร้านจริงโดยปริยาย
//   ร้านจะเห็นหน้า/ลิงก์/ปุ่มสลับได้ก็ต่อเมื่อ env `CRM_V2_SWITCH=all` หรือ tenantId อยู่ใน `CRM_V2_SWITCH_TENANTS` (คั่นด้วย ,)
//   ไม่ได้ตั้ง = หน้าสลับ 404 · action FORBIDDEN · ไม่มีลิงก์ (MASTER-PLAN: uiVersion คงเป็น 1 จนเจ้าของเลือกร้านนำร่อง · C6.3)
//   อ่าน env ตรง ๆ ทุกครั้ง (ไม่ผ่าน @/lib/env — ไฟล์นี้ถูก import จากทะเบียนที่ต้องรันได้ในโหมดไร้ env)
export function isCrmV2SwitchAllowed(tenantId: string | null | undefined): boolean {
  if (!tenantId) return false;
  if ((process.env.CRM_V2_SWITCH ?? "").trim().toLowerCase() === "all") return true;
  const list = (process.env.CRM_V2_SWITCH_TENANTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(tenantId);
}
// ◂ CRM C1.11
