// errors.ts — ชนิดข้อผิดพลาดของโมดูลบัตรกำนัล (M2.6)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์** (ไม่แตะ prisma/next) · ข้อความไทยทุกตัวและ **ไม่โทษผู้ใช้**
//    บอกสิ่งที่เกิดขึ้น + ทางออกถัดไปเสมอ (พนักงานหน้าร้านต้องอ่านแล้วรู้ว่าจะทำอะไรต่อ)

export class GiftCardNotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "ไม่พบบัตรกำนัลหมายเลขนี้ — ตรวจหมายเลขบนบัตรอีกครั้ง") {
    super(message);
    this.name = "GiftCardNotFoundError";
  }
}

export class GiftCardForbiddenError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "บัญชีของคุณยังไม่ได้รับสิทธิ์ทำรายการบัตรกำนัล — ขอสิทธิ์จากเจ้าของร้านก่อน") {
    super(message);
    this.name = "GiftCardForbiddenError";
  }
}

export class GiftCardInputError extends Error {
  readonly status = 400;
  readonly code = "BAD_INPUT";
  constructor(message: string) {
    super(message);
    this.name = "GiftCardInputError";
  }
}

/** สถานะบัตรไม่พร้อมใช้ (ระงับ/หมดอายุ/ยอดหมด/PIN ถูกล็อก) → 409 */
export class GiftCardStateError extends Error {
  readonly status = 409;
  readonly code = "CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "GiftCardStateError";
  }
}
