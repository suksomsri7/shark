// qc-all-discovery.mts — POS P2.14 ▸ G3 (CD-8 · มติ 19): ตัวกรองไฟล์ข้อสอบของ qc-all แบบบริสุทธิ์ (ไม่มีผลข้างเคียง · import ได้)
//   qc-all.mts รันทุกอย่างตอน import (ด่าน prod · seed · ชุดข้อสอบ) ⇒ แยกกติกา "ไฟล์ไหนคือชุดของ qc-all" มาไว้ที่นี่ที่เดียว —
//   qc-all.mts ใช้ตัวนี้ (บล็อกที่มาร์ก) · scripts/pos-gates.json ตรวจด้วยตัวเดียวกัน (qc-pos-p2.14 G3)
/** ไฟล์ qc-*.mts ที่ qc-all ไม่รัน — qc-all เอง · qc-member-m1.1 = ตัว reseed ชุดข้อมูลสมาชิก (qc-all seed ให้เองผ่าน seed-member-qc.mts · รันกลางรอบจะล้างข้อมูลชุดอื่น) */
export const QC_ALL_EXCLUDE: readonly string[] = ["qc-all.mts", "qc-member-m1.1.mts"];
/** ชื่อไฟล์ (ไม่มีโฟลเดอร์) เป็นชุดข้อสอบที่ qc-all ค้นเจอไหม */
export function isQcAllSuite(file: string): boolean {
  return /^qc-.*\.mts$/.test(file) && !QC_ALL_EXCLUDE.includes(file);
}
