// registry.ts — ทะเบียนกลางของทุก endpoint บัญชี + ตัวจับคู่ path (WO A3)
//
// 🔴 "ทะเบียนเดียว หลายทางออก": op ที่ลงทะเบียนที่นี่คือแหล่งความจริงเดียวของ
//    (1) REST `/api/v1/account/*`  (2) OpenAPI + คู่มือ EN (WO A4)  (3) tool ของสกิล AI (WO E1)
//    ⇒ เพิ่ม endpoint = เพิ่ม op ที่ไฟล์ `ops/*.ts` แล้วต่อเข้าทะเบียนนี้ที่เดียว
//    (บทเรียน outbox: เพิ่ม event แล้วลืมลงทะเบียน consumer = คิวตันเงียบ ๆ)

import { API_METHODS, type ApiOp } from "./op";
import { CORE_OPS } from "./ops/core";
import { DOCUMENTS_READ_OPS } from "./ops/documents-read";
import { CONTACTS_READ_OPS } from "./ops/contacts-read";
import { PRODUCTS_READ_OPS } from "./ops/products-read";
import { FINANCE_READ_OPS } from "./ops/finance-read";

export * from "./op";

/** ทุก op ของ API บัญชี — เรียงตามไฟล์ที่มา */
export const ACCOUNT_OPS: ApiOp[] = [
  ...CORE_OPS,
  ...DOCUMENTS_READ_OPS,
  ...CONTACTS_READ_OPS,
  ...PRODUCTS_READ_OPS,
  ...FINANCE_READ_OPS,
];

// ── การจับคู่ path ──────────────────────────────────────────────────────────
type Template = { segments: string[]; paramCount: number };

const templateCache = new Map<string, Template>();

function templateOf(path: string): Template {
  const cached = templateCache.get(path);
  if (cached) return cached;
  const segments = path.split("/").filter(Boolean);
  const t = { segments, paramCount: segments.filter((s) => s.startsWith("{")).length };
  templateCache.set(path, t);
  return t;
}

/** ตัด segment ว่างทิ้ง ⇒ `/ping/` (trailing slash) จับคู่ `/ping` ได้ */
function normalize(segments: string[]): string[] {
  return segments.filter((s) => s.length > 0);
}

function matchSegments(tpl: string[], segs: string[]): Record<string, string> | null {
  if (tpl.length !== segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < tpl.length; i++) {
    const t = tpl[i]!;
    const v = segs[i]!;
    if (t.startsWith("{") && t.endsWith("}")) {
      params[t.slice(1, -1)] = decodeURIComponent(v);
      continue;
    }
    if (t !== v) return null;
  }
  return params;
}

/** หา op ที่ตรงทั้ง method และ path · เจอหลายตัว → เลือกตัวที่ "คงที่มากที่สุด" (param น้อยสุด) */
export function matchOp(method: string, segments: string[]): { op: ApiOp; params: Record<string, string> } | null {
  const segs = normalize(segments);
  let best: { op: ApiOp; params: Record<string, string>; paramCount: number } | null = null;
  for (const op of ACCOUNT_OPS) {
    if (op.method !== method) continue;
    const tpl = templateOf(op.path);
    const params = matchSegments(tpl.segments, segs);
    if (!params) continue;
    if (!best || tpl.paramCount < best.paramCount) best = { op, params, paramCount: tpl.paramCount };
  }
  return best ? { op: best.op, params: best.params } : null;
}

/** method ที่ path นี้รองรับ (ใช้ทำหัว `Allow` ของ 405) — [] = ไม่มี op ที่ path นี้เลย */
export function allowedMethods(segments: string[]): string[] {
  const segs = normalize(segments);
  const found = new Set<string>();
  for (const op of ACCOUNT_OPS) {
    if (matchSegments(templateOf(op.path).segments, segs)) found.add(op.method);
  }
  return API_METHODS.filter((m) => found.has(m));
}
