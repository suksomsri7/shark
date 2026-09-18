// settings.ts — ตัวอ่าน `AppSystem.settings.crm` แบบมีชนิด + ค่าเริ่มต้น (CRM v2 · สร้างในใบ C1.1 · ใบ C1.5 ต่อยอด)
//
// 🔴 ค่าเริ่มต้นอยู่ "ในตัวอ่าน" — ระบบ CRM ที่ settings ว่าง (ทุกระบบบน prod วันนี้) ต้องได้ค่าที่ปลอดภัย:
//    `uiVersion: 1` (มติ C23 · R-E ข้อ 14 — v2 ปิดจนเจ้าของร้านเปิดเอง) · `bridgesEnabled: true` (สะพานเชื่อมโมดูลอื่นเปิด)
// 🔴 ไฟล์นี้อ่านอย่างเดียวในใบ C1.1 · การเขียนต้องใช้ `jsonb_set` คำสั่งเดียว (แบบ `writeMemberSettingsKey`)
//    ห้าม read-modify-write ทั้งก้อน `AppSystem.settings` (ช่องว่างเขียนทับกัน) — ใบ C1.5 เป็นคนเพิ่มตัวเขียน
// 🔴 AUDIT-CLASS X1: หา `AppSystem` ด้วย id + tenantId + type CRM เสมอ — ระบบของร้านอื่น/ชนิดอื่น = ไม่พบ
import { tenantDb } from "@/lib/core/db";

export type CrmUiVersion = 1 | 2;

export type CrmSettings = {
  /** 1 = หน้า v1 เดิม (ค่าเริ่มต้น) · 2 = เปิด CRM v2 (op/งานเบื้องหลัง/สะพาน ของ v2 ทำงาน) */
  uiVersion: CrmUiVersion;
  /** สวิตช์ปิดสะพานเชื่อมโมดูลอื่นบน prod (ทางถอย) — ค่าเริ่มต้นเปิด */
  bridgesEnabled: boolean;
};

export const CRM_SETTINGS_DEFAULTS: Readonly<CrmSettings> = Object.freeze({ uiVersion: 1, bridgesEnabled: true });

type Json = unknown;
const isObj = (v: Json): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** แปลงค่าดิบจาก JSON → ชนิดที่ถูก (ค่าเพี้ยน = ค่าเริ่มต้น ไม่ throw) */
export function parseCrmSettings(raw: Json): CrmSettings {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : {};
  return {
    uiVersion: crm.uiVersion === 2 ? 2 : CRM_SETTINGS_DEFAULTS.uiVersion,
    bridgesEnabled: typeof crm.bridgesEnabled === "boolean" ? crm.bridgesEnabled : CRM_SETTINGS_DEFAULTS.bridgesEnabled,
  };
}

export async function getCrmSettings(ctx: { tenantId: string; systemId: string }): Promise<CrmSettings> {
  const sys = await tenantDb({ tenantId: ctx.tenantId }).appSystem.findFirst({
    where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" },
    select: { settings: true },
  });
  if (!sys) throw new Error("ไม่พบระบบ CRM นี้ในร้าน");
  return parseCrmSettings(sys.settings);
}
