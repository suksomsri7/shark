// settings.ts — ตัวอ่าน `AppSystem.settings.crm` แบบมีชนิด + ค่าเริ่มต้น (CRM v2 · สร้างในใบ C1.1 · ใบ C1.5 ต่อยอด)
//
// 🔴 ค่าเริ่มต้นอยู่ "ในตัวอ่าน" — ระบบ CRM ที่ settings ว่าง (ทุกระบบบน prod วันนี้) ต้องได้ค่าที่ปลอดภัย:
//    `uiVersion: 1` (มติ C23 · R-E ข้อ 14 — v2 ปิดจนเจ้าของร้านเปิดเอง) · `bridgesEnabled: true` (สะพานเชื่อมโมดูลอื่นเปิด)
// 🔴 ไฟล์นี้อ่านอย่างเดียวในใบ C1.1 · การเขียนต้องใช้ `jsonb_set` คำสั่งเดียว (แบบ `writeMemberSettingsKey`)
//    ห้าม read-modify-write ทั้งก้อน `AppSystem.settings` (ช่องว่างเขียนทับกัน) — ใบ C1.5 เป็นคนเพิ่มตัวเขียน
// 🔴 AUDIT-CLASS X1: หา `AppSystem` ด้วย id + tenantId + type CRM เสมอ — ระบบของร้านอื่น/ชนิดอื่น = ไม่พบ
import { tenantDb } from "@/lib/core/db";
// CRM C1.5 ▸ ตัวเขียน jsonb_set ใช้ client ของโมดูล (F5.1) ◂
import { prisma as crmDb } from "./db";

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

// CRM C1.5 ▸ ตัวเขียน `AppSystem.settings.crm.<key>` (RESOLUTIONS R-A — ใบอื่นเพิ่มหมวดของตัวเองผ่านบริการนี้เท่านั้น)
//   🔴 คำสั่งเดียว (`jsonb_set` แบบ `writeMemberSettingsKey`) — ไม่อ่านทั้งก้อนมาแก้แล้วเขียนทับ (ช่องว่างเขียนทับคีย์ของคนอื่น)
//   AUDIT-CLASS X1: เขียนเฉพาะแถว AppSystem ที่ id + tenantId + type CRM ตรงกัน · ไม่พบ = โยนข้อความไทย (ไม่เขียนอะไร)
export type CrmSettingsKey = keyof CrmSettings;

export async function setCrmSettingsKey<K extends CrmSettingsKey>(ctx: { tenantId: string; systemId: string }, key: K, value: CrmSettings[K]): Promise<CrmSettings> {
  if (key === "uiVersion" && value !== 1 && value !== 2) throw new Error("รุ่นหน้าจอ CRM ต้องเป็น 1 หรือ 2");
  if (key === "bridgesEnabled" && typeof value !== "boolean") throw new Error("สวิตช์สะพานเชื่อมต้องเป็นเปิดหรือปิด");
  const json = JSON.stringify(value);
  const n = await crmDb.$executeRaw`
    UPDATE "AppSystem"
    SET "settings" = jsonb_set(
      CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
      '{crm}',
      (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
        || jsonb_build_object(${key}::text, ${json}::jsonb),
      true)
    WHERE "id" = ${ctx.systemId} AND "tenantId" = ${ctx.tenantId} AND "type" = 'CRM'`;
  if (n === 0) throw new Error("ไม่พบระบบ CRM นี้ในร้าน");
  return getCrmSettings(ctx);
}
// ◂ CRM C1.5

// CRM C1.6 ▸ ทะเบียนผลลัพธ์ของกิจกรรม `settings.crm.activityOutcomes[type]` (พิมพ์เขียว §4.5 · มติผู้คุมงาน C1.6 S8)
//   ตัวอ่านแบบมีชนิด (อ่านอย่างเดียว — ตัวเขียนมากับหน้าตั้งค่ากิจกรรมในใบถัดไป ผ่าน jsonb_set คำสั่งเดียวแบบข้างบน)
//   🔴 `[]` ที่ตั้งไว้ชัด = "ชนิดนี้ไม่มีผลลัพธ์ให้เลือก" (ไม่ใช่กลับไปใช้ค่าตั้งต้น) · ไม่ได้ตั้ง = ค่าตั้งต้นพิมพ์เขียว · ค่าเพี้ยน = ค่าตั้งต้น
/** รายการผลลัพธ์ของชนิดกิจกรรม `type` — `null` = ชนิดนี้ไม่มีทะเบียน (ไม่รับผลลัพธ์) */
export function activityOutcomesOf(raw: Json, type: string, defaults: Readonly<Partial<Record<string, readonly string[]>>>): readonly string[] | null {
  const crm = isObj(raw) && isObj(raw.crm) ? raw.crm : null;
  const reg = crm && isObj(crm.activityOutcomes) ? crm.activityOutcomes : null;
  const own = reg ? reg[type] : undefined;
  if (Array.isArray(own)) {
    const list = [...new Set(own.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 60)))];
    return list;
  }
  return defaults[type] ?? null;
}
// ◂ CRM C1.6
