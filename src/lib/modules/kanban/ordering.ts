// ordering.ts — แกนการเรียงลำดับของบอร์ดงาน (fractional indexing)
//
// 🔴 ไฟล์นี้ต้อง "บริสุทธิ์": ไม่แตะ prisma / ไม่แตะ request context
//    เหตุผล: ตรรกะการเรียงถูกเรียกทั้งจาก service, สคริปต์ backfill และข้อสอบ —
//    ถ้าผูกกับฐานข้อมูลจะทดสอบตรง ๆ ไม่ได้ และ backfill จะ import วนกลับมาที่ service
//
// 🔴 ห้าม implement อัลกอริทึมเอง (docs/modules/13-kanban.md §11.1) — ใช้แพ็กเกจ `fractional-indexing`
//    (แบบเดียวกับ Figma · base62 `0-9A-Za-z` · เทียบลำดับด้วย string compare ธรรมดา)
//    generateKeyBetween(null, null) = "a0" · แทรกหัว/ท้าย/ระหว่างได้เสมอโดยไม่ต้องเขียนแถวอื่นใหม่
//
// ช่วงเปลี่ยนผ่าน (D10): แถวเก่ายังมีแค่ `sortOrder` จนกว่า backfill จะรัน
//    ⇒ อ่านลำดับผ่าน positionOf() ซึ่ง fallback ไปที่ sortOrder แบบเติมศูนย์หน้า

import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/** ความยาว key ที่ถือว่า "ยาวเกิน" แล้วควร rebalance ทั้งคอลัมน์ (§11.1) */
export const MAX_KEY_LENGTH = 50;

/**
 * คีย์ตำแหน่งใหม่ที่อยู่ระหว่าง a กับ b
 * @param a คีย์ของเพื่อนบ้านด้านบน (null = แทรกหัวสุด)
 * @param b คีย์ของเพื่อนบ้านด้านล่าง (null = แทรกท้ายสุด)
 */
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

/** n คีย์เรียงขึ้นระหว่าง a กับ b (ใช้ตอน backfill / rebalance / สร้างหลายใบพร้อมกัน) */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return [];
  return generateNKeysBetween(a, b, n);
}

/**
 * ต้อง rebalance คอลัมน์นี้ไหม — จริงเมื่อมีคีย์ยาวเกิน max
 * (เกิดจากแทรกจุดเดิมซ้ำ ๆ: ทุกครั้งที่แทรกระหว่างคู่เดิม คีย์จะยาวขึ้นทีละตัวอักษร)
 */
export function needsRebalance(keys: readonly string[], max: number = MAX_KEY_LENGTH): boolean {
  return keys.some((k) => k.length > max);
}

/** ชุดคีย์สั้นสุด n ตัวสำหรับเขียนทับทั้งคอลัมน์ตอน rebalance (a0, a1, a2, …) */
export function rebalanceKeys(n: number): string[] {
  return keysBetween(null, null, n);
}

/** เทียบลำดับ 2 คีย์ (ใช้กับ Array#sort) — string compare ธรรมดาตามสเปค */
export function comparePosition(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** แถวที่มีลำดับได้ 2 ทาง — `position` (ใหม่) หรือ `sortOrder` (เดิม) */
export type OrderedRow = { position: string | null; sortOrder: number };

/**
 * ลำดับที่ใช้เรียงจริงในช่วงเปลี่ยนผ่าน: `position` ถ้ามี ไม่งั้นสร้างจาก `sortOrder`
 *
 * 🔴 ทำไมต้องเติมศูนย์หน้า: การเทียบเป็น string ⇒ "10" < "9" ถ้าไม่เติม
 *    ⇒ แถวเก่าที่ยังไม่ backfill จะสลับที่กันเอง · เติม 10 หลักครอบ sortOrder ที่เป็นไปได้ทั้งหมด
 * 🔴 ทำไมนำหน้าด้วย "0": คีย์จาก fractional-indexing เริ่มด้วยตัวอักษร (a…/Z…) ซึ่ง > "0"
 *    ⇒ แถวที่ backfill แล้วอยู่หลังแถวที่ยังไม่ backfill เสมอ (ไม่มีการสลับที่แบบสุ่ม)
 */
export function positionOf(row: OrderedRow): string {
  if (row.position) return row.position;
  return `0${String(Math.max(0, row.sortOrder)).padStart(10, "0")}`;
}

/** ชื่อเดิมในสเปค §K1.1 — คงไว้ให้เรียกได้ทั้ง 2 ชื่อ */
export const readPosition = positionOf;

/** เรียงแถวตามลำดับที่ควรแสดง (position ก่อน · fallback sortOrder · tie-break ด้วย id ตาม §11.1) */
export function sortByPosition<T extends OrderedRow & { id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => comparePosition(positionOf(a), positionOf(b)) || comparePosition(a.id, b.id));
}
