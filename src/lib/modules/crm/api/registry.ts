// registry.ts — ทะเบียนกลางของทุก endpoint ของ REST CRM + ตัวจับคู่ path (ใบ C1.10)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": op ที่ลงทะเบียนที่นี่คือแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/crm/*` และ `/api/v1/teams/*`  (2) OpenAPI + คู่มือ `docs/api/CRM-API.md`  (3) tool ของสกิล AI `crm`
//    ⇒ เพิ่ม endpoint = เพิ่ม op ใน `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว (ด่าน fitness F13.10–F13.12)
// 🔴 ใบถัดไป (C2.11 · C3.8) เพิ่ม op ของตัวเองที่นี่ในบล็อก `// CRM <WO>` ของตัวเอง

import { API_SCOPE_BUNDLES } from "@/lib/api-keys/scopes";
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
// CRM C2.11 ▸ ชุดที่สอง (อีเมล · ลำดับการติดตาม · แจกลีด · คะแนน · ลิงก์ติดตาม · กฎอัตโนมัติ + op ของ tool ผู้ช่วย) ◂
import { ASSIGNMENT_OPS } from "./ops/assignment";
import { AUTOMATION_OPS } from "./ops/automation";
import { EMAILS_OPS } from "./ops/emails";
import { INSIGHTS_OPS } from "./ops/insights";
import { NOTIFICATIONS_OPS } from "./ops/notifications";
import { SCORING_OPS } from "./ops/scoring";
import { SEQUENCES_OPS } from "./ops/sequences";
import { TRACKING_OPS } from "./ops/tracking";

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
  // CRM C2.11 ▸ ชุดที่สอง — 32 op ตามตาราง MUST ของ `scripts/qc-crm-c2.11.mts` + op ที่แนะนำ (แม่แบบจดหมาย · ร่างจดหมาย ·
  //   ดีลที่นิ่ง · งานที่ถึงกำหนด · ขั้นถัดไปของดีล) · ทุกตัวเรียกบริการของ C2.1–C2.10 เท่านั้น
  //   ✅ รอบ 2 (25 ก.ย.): `notifications.prefs.get/set` ต่อกับ `getMyPrefs`/`setMyPrefs` จริงของใบ C2.10 แล้ว (ไม่มี stub)
  ...EMAILS_OPS,
  ...SEQUENCES_OPS,
  ...ASSIGNMENT_OPS,
  ...SCORING_OPS,
  ...TRACKING_OPS,
  ...NOTIFICATIONS_OPS,
  ...AUTOMATION_OPS,
  ...INSIGHTS_OPS,
  // ◂ CRM C2.11
];

// CRM C2.11 ▸ MINOR 12 (ผู้ตรวจอิสระ 25 ก.ย. 2569) — "POST ที่เป็น kind read" ปลอดภัยเพราะอะไร ◂
//
// 🔴 `assignment.simulate` และ `automation.dryRun` เป็น **POST แต่ประกาศ `kind: "read"`** (มติผู้คุมงาน 24 ก.ย. ข้อ 6:
//    มันรับ body แต่ไม่เขียนอะไรเลย · ถ้าประกาศเป็น write มันจะกินงบการเขียนและบังคับ scope ที่เขียนได้ทั้งที่ไม่ได้เขียน)
//    ผลข้างเคียงที่ต้องรู้: `defineCrmOp` ห้ามคีย์ชุด "อ่านอย่างเดียว" เฉพาะ op ที่ `kind !== "read"` ⇒ สอง op นี้
//    **ไม่ถูกด่านนั้นห้าม** · สิ่งเดียวที่กันคีย์ readonly ออกไปคือ "scope ของมันไม่อยู่ในชุด `crm.readonly`"
//    (`crm.assignment.manage` / `crm.automation.manage` อยู่แค่ในชุด `crm.admin`)
//    ⇒ วันไหนมีคนเติมคีย์สิทธิ์เหล่านี้เข้าไปในชุด readonly (หรือประกาศ POST kind read ด้วย scope ของชุดอ่าน)
//      คีย์อ่านอย่างเดียวจะ "ยิง POST" ได้เงียบ ๆ ⇒ ยืนยันด้วยด่านสถิตข้างล่างนี้ ไม่ใช่ด้วยความตั้งใจของคนอ่านโค้ด
const CRM_READONLY_BUNDLE_SCOPES = new Set<string>(API_SCOPE_BUNDLES.find((b) => b.id === "crm.readonly")?.scopes ?? []);

/** op ที่ประกาศ `kind: "read"` แต่ไม่ใช่ GET — รายชื่อที่ยอมรับไว้ (คนอ่าน/ข้อสอบเห็นครบในที่เดียว) */
export const CRM_READ_KIND_NON_GET_OPS = ["assignment.simulate", "automation.dryRun"] as const satisfies readonly string[];

/**
 * ด่านสถิต: op ที่เป็น `kind: "read"` + ไม่ใช่ GET ต้องไม่มี action ที่อยู่ในชุด `crm.readonly`
 * คืนรายชื่อที่ผิด (ว่าง = ปลอดภัย) — ข้อสอบ/fitness เรียกได้ และ dev/QC สะดุดทันทีตอน import
 */
export function crmReadKindDoorsReachableByReadonlyBundle(): string[] {
  return CRM_OPS.filter((o) => o.kind === "read" && o.method !== "GET" && CRM_READONLY_BUNDLE_SCOPES.has(o.action)).map((o) => o.id);
}

if (process.env.NODE_ENV !== "production") {
  const bad = crmReadKindDoorsReachableByReadonlyBundle();
  if (bad.length > 0) {
    throw new Error(
      `CRM registry: op ที่เป็น kind "read" แต่เป็น POST/PUT (${bad.join(", ")}) มี action อยู่ในชุดสิทธิ์ crm.readonly ` +
        `⇒ คีย์ชุดอ่านอย่างเดียวจะเรียกมันได้ (ด่าน READONLY ของ defineCrmOp ห้ามเฉพาะ kind ที่ไม่ใช่ read) — ` +
        `ให้ย้าย action ออกจากชุด readonly หรือเปลี่ยน kind ของ op เป็น write`,
    );
  }
}

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
