// schema.ts — ชิ้นส่วน zod ที่ op ทุกตัวของ REST CRM ใช้ร่วมกัน (ใบ C1.10)
//
// 🔴 AUDIT-CLASS X6: ทุกสตริงมีเพดาน (maxLength/enum/pattern) · ทุกอาร์เรย์มี maxItems · ทุกอ็อบเจกต์ `.strict()`
//    (กัน tenantId/systemId ปลอมจาก body) · รายการหน้าละไม่เกิน 100 (`take`) — ข้อสอบ X6.3 เดินสคีมาของทุก op ตรวจเอง
// 🔴 GET อ่านจาก query string ⇒ ค่าเป็นสตริงเสมอ: ตัวเลขใช้ `z.coerce` · ค่าจริง/เท็จใช้ `flag`

import { z } from "zod";

/** id ของแถวใด ๆ (cuid/uuid) */
export const idStr = z.string().min(1).max(64);
/** ข้อความสั้นที่มีเพดาน */
export const text = (max: number) => z.string().max(max);
/** ค่าว่างได้ */
export const optText = (max: number) => z.string().max(max).nullable().optional();
export const optId = idStr.nullable().optional();

/** จำนวนแถวต่อหน้า — ไม่เกิน 100 (X6 · เกิน = 422 validation) */
export const API_TAKE_MAX = 100;
export const take = z.coerce.number().int().min(1).max(API_TAKE_MAX).optional();
/** ตัวชี้หน้าถัดไป (ค่าทึบ — ผู้เรียกส่งคืนตามที่ได้รับ) */
export const cursor = z.string().min(1).max(200).optional();

/** ค่าจริง/เท็จใน query string */
export const flag = z.enum(["true", "false", "1", "0"]).optional();
export const isOn = (v: string | undefined): boolean => v === "true" || v === "1";

/** เหตุผลของคำสั่งอันตราย (dispatch ของแกนตรวจ ≥ 5 ตัวอักษรก่อนถึงสคีมา — ที่นี่แค่เพดาน) */
export const reason = z.string().min(5).max(500);

/** วันที่/เวลาแบบ ISO-8601 หรือ YYYY-MM-DD */
export const isoDate = z.string().max(40).regex(/^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/);

/** ค่าของฟิลด์กำหนดเอง 1 ช่อง (ชนิดตาม engine ฟิลด์ — engine เป็นคนตรวจชนิดจริงต่อฟิลด์) */
export const fieldValue = z.union([z.string().max(5000), z.number(), z.boolean(), z.array(z.string().max(500)).max(100), z.null()]);
/** `fields: { "<field key>": value }` — สูงสุด 100 ฟิลด์ต่อคำขอ */
export const fieldsBag = z.record(z.string().max(80), fieldValue).refine((o) => Object.keys(o).length <= 100, { message: "ส่งฟิลด์ได้ไม่เกิน 100 ช่องต่อครั้ง" });

/** แท็ก (บริการตรวจซ้ำอีกชั้น) */
export const tags = z.array(z.string().min(1).max(64)).max(50);

/** URL ที่เปิดได้เฉพาะ http/https (X6 — กัน javascript: / data:) · "" = ล้างค่า */
export const httpUrl = z.string().max(500).regex(/^(https?:\/\/[^\s]+)?$/i);

/** เงิน (สตางค์) — เพดานจริงอยู่ที่บริการ (ข้อความไทยของบริการชัดกว่า) */
export const satang = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** ตัวชี้หน้าของรายการที่บริการแบ่งหน้าเป็นเลขหน้า (บริษัท · รายการวัตถุ) — ค่าทึบสำหรับผู้เรียก */
export function pageCursor(page: number): string {
  return Buffer.from(`page:${page}`, "utf8").toString("base64url");
}
/** อ่านเลขหน้าจากตัวชี้ (เพี้ยน/ไม่มี = หน้า 1) */
export function pageOfCursor(c: string | undefined): number {
  if (!c) return 1;
  const m = /^page:(\d{1,6})$/.exec(Buffer.from(c, "base64url").toString("utf8"));
  return m ? Math.max(1, Number(m[1])) : 1;
}

// CRM C3.8 ▸ คีย์งวดของโควตา/คอมมิชชัน — บริการเก็บเป็นปี ค.ศ. ("2026-09" · "2026-Q3" · "2026") · REST รับปี พ.ศ. ได้ด้วย
//   ("2569-09" → "2026-09") เพราะร้านไทยพิมพ์ พ.ศ. เป็นปกติ · ปี ≥ 2400 เท่านั้นที่ถูกแปลง (ปี ค.ศ. ที่บริการรับได้สูงสุด 2199 — ไม่มีทางกำกวม)
//   รูปอื่นส่งต่อให้บริการตัดสินตามเดิม (ผิดรูป = 422 ข้อความไทยของบริการ) ◂
export const periodKeyText = z.string().min(4).max(10);
export function periodKeyIn(v: string | null | undefined): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return undefined;
  const m = /^(\d{4})(-(?:\d{2}|Q[1-4]))?$/.exec(s);
  if (m && Number(m[1]) >= 2400) return `${Number(m[1]) - 543}${m[2] ?? ""}`;
  return s;
}
