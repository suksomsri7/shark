// registry.ts — ทะเบียนกลางของทุก endpoint บัญชี + ตัวจับคู่ path (WO A3)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": op ที่ลงทะเบียนที่นี่คือแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/account/*`  (2) OpenAPI + คู่มือ EN (WO A4)  (3) tool ของสกิล AI (WO E1)
//    ⇒ เพิ่ม endpoint = เพิ่ม op ที่ไฟล์ `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว
//    (บทเรียน outbox: เพิ่ม event แล้วลืมลงทะเบียน consumer = คิวตันเงียบ ๆ)

import { allowedMethodsIn, matchOpIn } from "@/lib/api/dispatch";
import type { ApiOp } from "./op";
import { CORE_OPS } from "./ops/core";
import { DOCUMENTS_READ_OPS } from "./ops/documents-read";
import { DOCUMENTS_WRITE_OPS } from "./ops/documents-write";
import { PAYMENTS_WRITE_OPS } from "./ops/payments-write";
import { CONTACTS_READ_OPS } from "./ops/contacts-read";
import { CONTACTS_WRITE_OPS } from "./ops/contacts-write";
import { PRODUCTS_READ_OPS } from "./ops/products-read";
import { PRODUCTS_WRITE_OPS } from "./ops/products-write";
import { FINANCE_READ_OPS } from "./ops/finance-read";
import { FINANCE_WRITE_OPS } from "./ops/finance-write";
import { GL_READ_OPS } from "./ops/gl-read";
import { GL_WRITE_OPS } from "./ops/gl-write";
import { SETTINGS_READ_OPS } from "./ops/settings-read";
import { RECONCILE_WRITE_OPS } from "./ops/reconcile-write";
import { FILES_WRITE_OPS } from "./ops/files-write";
import { IMPORT_OPS } from "./ops/import";
import { SETTINGS_WRITE_OPS } from "./ops/settings-write";
import { WEBHOOKS_OPS } from "./ops/webhooks";

export * from "./op";

/** ทุก op ของ API บัญชี — เรียงตามไฟล์ที่มา */
export const ACCOUNT_OPS: ApiOp[] = [
  ...CORE_OPS,
  ...DOCUMENTS_READ_OPS,
  ...DOCUMENTS_WRITE_OPS,
  ...PAYMENTS_WRITE_OPS,
  ...CONTACTS_READ_OPS,
  ...CONTACTS_WRITE_OPS,
  ...PRODUCTS_READ_OPS,
  ...PRODUCTS_WRITE_OPS,
  ...FINANCE_READ_OPS,
  ...FINANCE_WRITE_OPS,
  ...GL_READ_OPS,
  ...GL_WRITE_OPS,
  ...SETTINGS_READ_OPS,
  ...RECONCILE_WRITE_OPS,
  ...FILES_WRITE_OPS,
  ...IMPORT_OPS,
  ...SETTINGS_WRITE_OPS,
  ...WEBHOOKS_OPS,
];

// ── การจับคู่ path (ตรรกะจริงอยู่แกนกลาง `src/lib/api/dispatch.ts` ตั้งแต่ K1.15) ──────────

/** หา op ที่ตรงทั้ง method และ path · เจอหลายตัว → เลือกตัวที่ "คงที่มากที่สุด" (param น้อยสุด) */
export function matchOp(method: string, segments: string[]): { op: ApiOp; params: Record<string, string> } | null {
  return matchOpIn(ACCOUNT_OPS, method, segments);
}

/** method ที่ path นี้รองรับ (ใช้ทำหัว `Allow` ของ 405) — [] = ไม่มี op ที่ path นี้เลย */
export function allowedMethods(segments: string[]): string[] {
  return allowedMethodsIn(ACCOUNT_OPS, segments);
}
