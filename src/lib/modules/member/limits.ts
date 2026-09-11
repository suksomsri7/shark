// limits.ts — เพดานอ่อนของ "ระบบสมาชิก v2" (พิมพ์เขียว docs/modules/06-member-v2.md §11.9)
// ค่าเริ่มต้นเมื่อ `Tenant.limits.member.*` ไม่ระบุ · ไฟล์นี้ไม่แตะ prisma
// service ที่ต้องบังคับเพดานอ่านค่าจากที่นี่ที่เดียว (แบบเดียวกับ kanban/limits.ts)
//
// 🔴 ข้อความ error ของทุกเพดานต้องมีคำว่า `LIMIT_REACHED` — หน้าจอ/REST ใช้คำนี้แยก
//    "ถึงเพดานแพ็กเกจ" (บอกทางออกให้ผู้ใช้) ออกจาก "ข้อมูลผิด" (ให้แก้ค่าที่กรอก)

export const MEMBER_LIMITS = Object.freeze({
  /** สมาชิกต่อร้าน (แจ้งเตือนก่อนถึง) */
  members: 50_000,
  /** ฟิลด์ต่อระบบสมาชิก (นับเฉพาะที่ยังไม่เก็บเข้าคลัง) */
  fields: 60,
  /** ส่วน (กล่องบนหน้าโปรไฟล์) ต่อระบบสมาชิก */
  sections: 12,
  /** ฟิลด์ที่เปิด "ใช้กรองได้" พร้อมกัน — เหตุผลคือ index ของฐานข้อมูล ไม่ใช่การขายของ */
  filterable: 20,
  /** ตัวเลือกต่อฟิลด์ SELECT/MULTI_SELECT */
  choices: 50,
  /** ความยาวข้อความยาว (LONG_TEXT) */
  longText: 4_000,
  /** ความยาวข้อความสั้น (TEXT) เมื่อฟิลด์ไม่ได้กำหนด options.maxLength เอง */
  textLength: 500,
  /** ความยาว key ของส่วน/ฟิลด์ */
  keyLength: 40,
  /** ขนาดไฟล์ต่อ 1 ไฟล์ของฟิลด์ชนิด FILE */
  fileBytes: 10 * 1024 * 1024,
  /** ระดับสมาชิกต่อระบบ (M1.9) */
  tiers: 10,
  /** กฎแต้มต่อระบบ (M2.1) */
  pointRules: 30,
  /** สแตมป์การ์ดต่อระบบ (M2.3) */
  stampCards: 20,
  /** รางวัลต่อระบบ (M2.4) */
  rewards: 200,
  /** เทมเพลต voucher ต่อระบบ (M2.5) */
  voucherTemplates: 100,
  /** journey ต่อระบบ (M3.3) */
  journeys: 50,
  /**
   * แถว AutomationRun ของ journey ต่อระบบสมาชิกต่อเดือนไทย (M3.3 · §11.6) — นับทุกแถว (เข้า/ข้าม/กลุ่มเทียบ/ขั้นที่รอ)
   * เกินแล้ว = event ถัดไปถูกบันทึกเป็น "ข้าม (quota)" ไม่ทำการกระทำ (ไม่ throw · คิวไม่ตัน)
   */
  automationRunsPerMonth: 5_000,
  /** segment ต่อระบบ (M3.1) */
  segments: 100,
  /** แคมเปญต่อเดือนไทย (M3.2) */
  campaignsPerMonth: 50,
  /** ข้อความถึงลูกค้าต่อวัน (M3.6) */
  messagesPerDay: 5_000,
  /** voucher ที่ออกให้ลูกค้า 1 คนต่อวัน (M2.5 · §11.6 — นับเฉพาะ origin JOURNEY เพื่อกันกฎอัตโนมัติวนซ้ำ) */
  vouchersPerCustomerPerDay: 3,
  /** มูลค่ารวมต่อการออก voucher 1 ครั้ง ที่เกินแล้วต้องเข้าสายอนุมัติ (M2.5 · §11.6 · สตางค์ = ฿10,000) */
  voucherIssueApprovalOverSatang: 1_000_000,
  /** มูลค่าสูงสุดต่อใบที่ **พนักงาน (STAFF)** ออกเองได้ (M2.5 · §6.2 · สตางค์ = ฿500/ใบ) */
  voucherStaffMaxSatang: 50_000,
  /**
   * voucher ที่ใช้ได้ในบิลเดียว (M2.7 · §9.1 §11.5)
   * 🔴 ไม่ใช่ "เพดานแพ็กเกจ" แต่เป็น **กติกาการขาย**: ใบเกินโควตาไม่ทำให้ทั้งบิลล้ม —
   *    quoteApply ใช้ใบแรกเท่าที่โควตาให้ แล้วคืนใบที่เหลือเป็น `conflicts` ให้พนักงานเห็นเหตุผล
   */
  vouchersPerSale: 1,
  /** แถวต่อการนำเข้า 1 ครั้ง (M1.6) */
  importRows: 10_000,
  /** แถวต่อการส่งออก 1 ครั้ง (M1.5) */
  exportRows: 50_000,
  /** คำขอ REST ต่อนาทีต่อคีย์ (M1.11) */
  apiRequestsPerMinute: 600,
} as const);

export type MemberLimits = typeof MEMBER_LIMITS;

/**
 * error ของเพดาน — message ภาษาไทย + คำว่า `LIMIT_REACHED` เสมอ (สัญญากับ UI/REST)
 * ไม่โทษผู้ใช้: บอกว่าเต็มเพราะอะไร และทางออกคืออะไร
 */
export function memberLimitError(message: string): Error {
  const err = new Error(`${message} (LIMIT_REACHED)`);
  (err as Error & { code?: string }).code = "LIMIT_REACHED";
  return err;
}
