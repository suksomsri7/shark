// errors.ts — คลังข้อความ error ที่ใช้ซ้ำบ่อยที่สุด + ตัวกันข้อความเทคนิคหลุดถึงผู้ใช้ (WO 9.4 §0.3 ข้อ 9)
//
// ปัญหาที่พบตอนสำรวจ (grep `throw new Error(...)` / `{ok:false,reason}` ~140 จุดในโมดูลนี้):
//   ข้อความที่ตั้งใจเขียนเองแทบทั้งหมด "เป็นภาษาไทยล้วนอยู่แล้ว" (ของเดิมดีมาก จาก WO 9.2/9.3) —
//   จุดเสี่ยงจริงมี 2 แบบ:
//     (1) ที่ซ้ำคำ/สะกดต่างกันเล็กน้อยข้ามไฟล์ (เช่น "ไม่พบเอกสาร" พิมพ์แยกกัน 29 ที่) → ใช้ค่าคงที่จากที่นี่แทน
//     (2) `catch (e) { reason: e instanceof Error ? e.message : "…" }` — ปลอดภัยเฉพาะตอน `e` เป็นข้อผิดพลาด
//         ที่เราโยนเองด้วยข้อความไทย แต่ถ้าเป็นข้อผิดพลาดที่ "ไม่คาดคิด" จริง ๆ (Prisma P2002/P2025 ดิบ ·
//         TypeError จาก SDK ภายนอก · error ภาษาอังกฤษจาก API) ⇒ ข้อความเทคนิคจะหลุดไปโชว์ผู้ใช้ตรง ๆ
//         → ห่อด้วย `safeReason()` เสมอที่จุดเหล่านี้
//
// ฮิวริสติกของ `safeReason`: ข้อความที่เราเขียนเอง **ทุกจุดในระบบนี้เป็นภาษาไทย** (กติกาโปรเจกต์) ⇒ ถ้า
// ข้อความของ error ไม่มีอักษรไทยเลย แปลว่าเป็นข้อความดิบจากภายนอกเกือบแน่นอน → ใช้ fallback แทน
const THAI_RE = /[฀-๿]/;

/** ข้อความจาก error นี้ปลอดภัยพอจะโชว์ผู้ใช้ไหม (มีอักษรไทยอย่างน้อย 1 ตัว + ไม่ยาวเกินไป) */
export function isSafeUserMessage(message: string | undefined | null): boolean {
  if (!message) return false;
  if (message.length > 300) return false;
  return THAI_RE.test(message);
}

/**
 * ดึงข้อความจาก error ให้ปลอดภัยเสมอ — ใช้แทน `e instanceof Error ? e.message : fallback` ทุกจุดที่ error
 * อาจมาจากภายนอกระบบ (Prisma/HTTP/SDK) ข้อความของเราเอง (ไทย) ผ่านได้ตรง ๆ · ข้อความดิบอื่น ๆ → fallback
 */
export function safeReason(err: unknown, fallback: string): string {
  if (err instanceof Error && isSafeUserMessage(err.message)) return err.message;
  return fallback;
}

// ─────────────────── ข้อความที่ใช้ซ้ำบ่อยที่สุดในโมดูลนี้ (สำรวจจริงด้วย grep ความถี่) ───────────────────
// ใช้ค่าคงที่เหล่านี้แทนพิมพ์ข้อความตรง ๆ ซ้ำในไฟล์ใหม่ — กันสะกด/คำไม่ตรงกันข้ามไฟล์ไปตามกาลเวลา
// (ของเดิมที่มีอยู่แล้วในไฟล์อื่นยังไม่ต้องรื้อทั้งหมด แต่ไฟล์ใหม่/แก้ใหม่ควรอ้างจากที่นี่)
export const ERR = {
  DOC_NOT_FOUND: "ไม่พบเอกสาร",
  ATTACHMENT_NOT_FOUND: "ไม่พบไฟล์",
  CONTACT_NOT_FOUND: "ไม่พบผู้ติดต่อรายนี้ในระบบบัญชีนี้",
  PRODUCT_NOT_FOUND: "ไม่พบสินค้า",
  CHEQUE_NOT_FOUND: "ไม่พบเช็ค",
  PAYMENT_NOT_FOUND: "ไม่พบรายการชำระ",
  FINANCE_ACCOUNT_NOT_FOUND: "ไม่พบบัญชีเงิน",
  LEDGER_NOT_FOUND: "ไม่พบบัญชีในผังบัญชี",
  MEMBER_NOT_FOUND: "ไม่พบผู้ใช้งานคนนี้ในกิจการนี้",
  RECURRING_RULE_NOT_FOUND: "ไม่พบเอกสารประจำนี้",
  WHT_CERT_NOT_FOUND: "ไม่พบเอกสารภาษีหัก ณ ที่จ่าย",
  NEED_AT_LEAST_ONE_LINE: "ต้องมีรายการอย่างน้อย 1 รายการ",
  ALREADY_ISSUED_CANNOT_EDIT: "เอกสารที่ออกแล้วแก้ไขไม่ได้ — ใช้ยกเลิก/ออกใบใหม่",
  ALREADY_CANCELLED: "เอกสารถูกยกเลิกแล้ว",
  AMOUNT_EXCEEDS_OUTSTANDING: "ยอดชำระเกินยอดคงเหลือ",
  VAT_NOT_REGISTERED: "กิจการยังไม่จดทะเบียน VAT — ออกใบกำกับภาษีไม่ได้",
  REASON_REQUIRED: "กรุณาระบุเหตุผลในการทำรายการนี้",
  INVALID_LINK_OR_EXPIRED: "ลิงก์ไม่ถูกต้องหรือหมดอายุ",
  SKU_DUPLICATE: "รหัสสินค้า (SKU) ซ้ำกับที่มีอยู่",
  DEPOSIT_ALREADY_APPLIED_ELSEWHERE: "ใบมัดจำนี้ถูกหักในเอกสารอื่นแล้ว — ยกเลิกการหักที่เอกสารนั้นก่อน",
  DEPOSIT_NOT_AVAILABLE: "ใบมัดจำที่เลือกไม่พร้อมใช้ (ต้องอยู่สถานะรอหักมัดจำ)",
  PERIOD_KEY_INVALID: "รูปแบบงวดไม่ถูกต้อง (ต้องเป็น YYYY-MM)",
  GENERIC_SAVE_FAILED: "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ",
  GENERIC_ACTION_FAILED: "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง",
  UNDO_EXPIRED: "หมดเวลาเลิกทำแล้ว (5 นาที) — แก้ไขรายการนี้ด้วยมือแทน",
  UNDO_ALREADY_USED: "รายการนี้ถูกเลิกทำไปแล้ว",
  UNDO_NOT_ALLOWED: "เลิกทำได้เฉพาะคนที่ทำรายการนี้เท่านั้น",
  UNDO_INVALID_TOKEN: "ลิงก์เลิกทำนี้ไม่ถูกต้องหรือถูกใช้ไปแล้ว",
} as const;

export type ErrKey = keyof typeof ERR;
