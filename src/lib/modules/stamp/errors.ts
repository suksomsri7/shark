// errors.ts — ชนิดข้อผิดพลาดของโมดูลสแตมป์การ์ด (M2.3)
//
// ไฟล์นี้ **บริสุทธิ์** (ไม่แตะ prisma/next) · ข้อความไทยทุกตัวและ **ไม่โทษผู้ใช้**
// คนที่อ่านข้อความพวกนี้คือพนักงานหน้าร้านที่กำลังยืนคุยกับลูกค้า ⇒ ต้องบอก
// "เกิดอะไรขึ้น + ทำอะไรต่อ" ในประโยคเดียว ไม่ใช่รหัสข้อผิดพลาด

export class StampNotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "ไม่พบสแตมป์การ์ดใบนี้ — รีเฟรชหน้าแล้วเลือกใหม่อีกครั้ง") {
    super(message);
    this.name = "StampNotFoundError";
  }
}

export class StampForbiddenError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "บัญชีของคุณยังไม่ได้รับสิทธิ์ทำรายการสแตมป์ — ขอสิทธิ์จากเจ้าของร้านก่อน") {
    super(message);
    this.name = "StampForbiddenError";
  }
}

export class StampInputError extends Error {
  readonly status = 400;
  readonly code = "BAD_INPUT";
  constructor(message: string) {
    super(message);
    this.name = "StampInputError";
  }
}

/** สถานะไม่พร้อมทำรายการ (ใบปิดอยู่ · ครบแล้ว · เกินโควตาวันนี้ · PIN ไม่ตรง) → 409 */
export class StampStateError extends Error {
  readonly status = 409;
  readonly code = "CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "StampStateError";
  }
}
