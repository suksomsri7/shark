// registry.ts — ทะเบียนกลางของ op ระบบงานบุคคล (ใบ H4.8 · brief §4 · แบบ pos/api/registry.ts)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": op ที่ลงทะเบียนที่นี่คือแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/hr/*`  (2) OpenAPI + คู่มือ docs/api/HR-API.md + สกิล `shark-hr-api` (references/endpoints.md)
//    ⇒ เพิ่ม endpoint = เพิ่ม op ที่ `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว
// รอบแรก 14 op = อ่าน 13 · เขียน 1 (POST /leaves — รออนุมัติเสมอ) · ไม่มี op ไหนประกาศ `tool` (เครื่องมือ AI ของ HR = H4.3)
// ตั้งใจไม่เปิด: อนุมัติ/ตัดสินทุกชนิด · ลงเวลา · แก้ทะเบียน/PIN/เอกสาร · รอบเงินเดือน · ไฟล์โอน · แบบยื่น · หนังสือรับรอง · PDF · CSV/XLSX · ทะเบียนลูกจ้าง
import { allowedMethodsIn, matchOpIn } from "@/lib/api/dispatch";
import type { ApiOp } from "./op";
import { EMPLOYEES_OPS } from "./ops/employees";
import { LEAVE_OPS } from "./ops/leave";
import { PAYSLIPS_OPS } from "./ops/payslips";
import { REPORTS_OPS } from "./ops/reports";
import { ROSTER_OPS } from "./ops/roster";

export * from "./op";

/** ทุก op ของ API ระบบงานบุคคล — เรียงตามตาราง brief §4 */
export const HR_OPS: ApiOp[] = [...EMPLOYEES_OPS, ...ROSTER_OPS, ...LEAVE_OPS, ...REPORTS_OPS, ...PAYSLIPS_OPS];

/** หา op ที่ตรงทั้ง method และ path */
export function matchOp(method: string, segments: string[]): { op: ApiOp; params: Record<string, string> } | null {
  return matchOpIn(HR_OPS, method, segments);
}

/** method ที่ path นี้รองรับ (หัว `Allow` ของ 405) */
export function allowedMethods(segments: string[]): string[] {
  return allowedMethodsIn(HR_OPS, segments);
}
