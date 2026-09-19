// registry.ts — ทะเบียนกลางของทุก endpoint ของ REST CRM + ตัวจับคู่ path (ใบ C1.10)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": op ที่ลงทะเบียนที่นี่คือแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/crm/*` และ `/api/v1/teams/*`  (2) OpenAPI + คู่มือ `docs/api/CRM-API.md`  (3) tool ของสกิล AI `crm`
//    ⇒ เพิ่ม endpoint = เพิ่ม op ใน `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว (ด่าน fitness F13.10–F13.12)
// 🔴 ใบถัดไป (C2.11 · C3.8) เพิ่ม op ของตัวเองที่นี่ในบล็อก `// CRM <WO>` ของตัวเอง

import { allowedMethodsIn, matchOpIn } from "@/lib/api/dispatch";
import type { ApiOp } from "@/lib/api/op";
import { ACTIVITIES_OPS } from "./ops/activities";
import { COMPANIES_OPS } from "./ops/companies";
import { CONTACTS_OPS } from "./ops/contacts";
import { CORE_OPS } from "./ops/core";
import { DEALS_OPS } from "./ops/deals";
import { OBJECTS_OPS } from "./ops/objects";
import { SETTINGS_OPS } from "./ops/settings";
import { TEAMS_OPS } from "./ops/teams";

export * from "./op";

/** ทุก op ของ REST CRM — เรียงตามหมวดของ `docs/api/CRM-API.md` */
export const CRM_OPS: ApiOp[] = [
  // CRM C1.10 ▸ ชุดแรก (ผู้ติดต่อ · บริษัท · ดีล · กิจกรรม · วัตถุ · ทีม · ตั้งค่า)
  ...CORE_OPS,
  ...CONTACTS_OPS,
  ...COMPANIES_OPS,
  ...DEALS_OPS,
  ...ACTIVITIES_OPS,
  ...OBJECTS_OPS,
  ...TEAMS_OPS,
  ...SETTINGS_OPS,
  // ◂ CRM C1.10
];

/** หา op ที่ตรงทั้ง method และ path · เจอหลายตัว → ตัวที่ "คงที่มากที่สุด" (param น้อยสุด) */
export function matchOp(method: string, segments: string[]): { op: ApiOp; params: Record<string, string> } | null {
  return matchOpIn(CRM_OPS, method, segments);
}

/** method ที่ path นี้รองรับ (หัว `Allow` ของ 405) */
export function allowedMethods(segments: string[]): string[] {
  return allowedMethodsIn(CRM_OPS, segments);
}

/** op ที่เปิดเป็นเครื่องมือของผู้ช่วย AI (ทะเบียนเดียวกัน — ไม่มีรายชื่อชุดที่สอง) */
export function crmToolOps(): ApiOp[] {
  return CRM_OPS.filter((o) => o.tool);
}
