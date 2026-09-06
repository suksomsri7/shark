// errors.ts — ตัวกันข้อความเทคนิคหลุดถึงผู้ใช้ (ของกลางของแพลตฟอร์ม)
//
// ยกออกมาจาก `modules/account/errors.ts` ตอน K1.15 เพราะแกน REST ของกลาง (`src/lib/api/respond.ts`)
// ต้องใช้ตัวเดียวกัน และมันไม่ใช่ความรู้เรื่องบัญชีเลย (`modules/account/errors.ts` re-export ต่อ
// ที่ชื่อเดิม ⇒ ผู้เรียกเดิมทั้งหมดใช้ต่อได้โดยไม่ต้องแก้)
//
// ฮิวริสติก: ข้อความที่เราเขียนเอง **ทุกจุดในระบบนี้เป็นภาษาไทย** (กติกาโปรเจกต์) ⇒ ถ้าข้อความของ
// error ไม่มีอักษรไทยเลย แปลว่าเป็นข้อความดิบจากภายนอก (Prisma/HTTP/SDK) เกือบแน่นอน → ใช้ fallback

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

/** ข้อความไทยกลางเมื่อทำรายการไม่สำเร็จและไม่มีอะไรปลอดภัยพอจะบอก */
export const GENERIC_ACTION_FAILED = "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง";
