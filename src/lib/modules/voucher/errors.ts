// errors.ts — ชนิดข้อผิดพลาดของโมดูล voucher (M2.5)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์** (ไม่แตะ prisma/next) · ข้อความไทยทุกตัวและ **ไม่โทษผู้ใช้**
//    บอกสิ่งที่เกิดขึ้น + ทางออกถัดไปเสมอ (พนักงานหน้าร้านต้องอ่านแล้วรู้ว่าจะทำอะไรต่อ)

export class VoucherNotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "ไม่พบ voucher ใบนี้ — ตรวจรหัสบนใบอีกครั้ง") {
    super(message);
    this.name = "VoucherNotFoundError";
  }
}

export class VoucherForbiddenError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "บัญชีของคุณยังไม่ได้รับสิทธิ์ทำรายการ voucher — ขอสิทธิ์จากเจ้าของร้านก่อน") {
    super(message);
    this.name = "VoucherForbiddenError";
  }
}

export class VoucherInputError extends Error {
  readonly status = 400;
  readonly code = "BAD_INPUT";
  constructor(message: string) {
    super(message);
    this.name = "VoucherInputError";
  }
}

/** สถานะของใบไม่พร้อมทำรายการ (ถูกใช้ไปแล้ว/ยกเลิก/หมดอายุ) → 409 */
export class VoucherStateError extends Error {
  readonly status = 409;
  readonly code = "CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "VoucherStateError";
  }
}
