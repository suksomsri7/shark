// registry.ts — ทะเบียนกลางของทุก endpoint ของ "ระบบสมาชิก" + ตัวจับคู่ path (M1.11)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": op ที่ลงทะเบียนที่นี่คือแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/member/*`  (2) OpenAPI + คู่มือ EN + สกิล Claude  (3) tool ของสกิล AI `members`
//    ⇒ เพิ่ม endpoint = เพิ่ม op ที่ไฟล์ `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว
//    (บทเรียน outbox: เพิ่ม event แล้วลืมลงทะเบียน consumer = คิวตันเงียบ ๆ)
//
// 🔴 ทุก WO ของ M2/M3 ที่เพิ่มฟีเจอร์ให้ระบบสมาชิก **ต้องเพิ่ม op ของตัวเองที่นี่** (ด่าน fitness F13.7)

import { allowedMethodsIn, matchOpIn } from "@/lib/api/dispatch";
import type { ApiOp } from "@/lib/api/op";
import { CORE_OPS } from "./ops/core";
import { FIELDS_OPS } from "./ops/fields";
import { ME_OPS } from "./ops/me";
import { MEMBERS_OPS } from "./ops/members";
import { PRIVACY_OPS } from "./ops/privacy";
import { SOURCES_OPS } from "./ops/sources";
import { TIERS_OPS } from "./ops/tiers";

export * from "./op";

/** ทุก op ของ API ระบบสมาชิก — เรียงตามหมวดของ `docs/api/MEMBER-API.md` §2 */
export const MEMBER_OPS: ApiOp[] = [
  ...CORE_OPS,
  ...MEMBERS_OPS,
  ...FIELDS_OPS,
  ...PRIVACY_OPS,
  ...SOURCES_OPS,
  ...TIERS_OPS,
  // ช่องทางของลูกค้าเอง (`/me/*`) — ประกาศไว้ในสัญญาแล้ว · ทางเข้าจริงมาใน M2.9
  ...ME_OPS,
];

/** หา op ที่ตรงทั้ง method และ path · เจอหลายตัว → เลือกตัวที่ "คงที่มากที่สุด" (param น้อยสุด) */
export function matchOp(method: string, segments: string[]): { op: ApiOp; params: Record<string, string> } | null {
  return matchOpIn(MEMBER_OPS, method, segments);
}

/** method ที่ path นี้รองรับ (ใช้ทำหัว `Allow` ของ 405) — [] = ไม่มี op ที่ path นี้เลย */
export function allowedMethods(segments: string[]): string[] {
  return allowedMethodsIn(MEMBER_OPS, segments);
}

/** op ที่เปิดเป็นเครื่องมือของผู้ช่วย AI (ทะเบียนเดียวกัน — ไม่มีรายชื่อชุดที่สอง) */
export function memberToolOps(): ApiOp[] {
  return MEMBER_OPS.filter((o) => o.tool);
}
