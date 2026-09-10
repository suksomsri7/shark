// errors.ts — ชนิดข้อผิดพลาดของโมดูลสมาชิก v2 (M1.4 · พิมพ์เขียว §6.4)
//
// 🔴 ไฟล์นี้ **บริสุทธิ์** (ไม่แตะ prisma/next) — import ได้จากทุกชั้น
// 🔴 กติกา 404-not-403 (§6.4): "สมาชิกคนนี้อยู่นอกสาขาที่คุณดูแล" ต้องตอบว่า **ไม่พบ** เสมอ
//    ห้ามตอบว่า "มีอยู่แต่คุณไม่มีสิทธิ์" — นั่นคือการยืนยันว่าคนคนนี้เป็นสมาชิกของร้านนี้จริง
// 🔴 ข้อความทุกตัวเป็นภาษาไทยและ **ไม่โทษผู้ใช้** — บอกสิ่งที่เกิดขึ้น + ทางออกถัดไป

/** มองไม่เห็น (นอกขอบเขตสาขา/คนละร้าน/ไม่มีจริง) → 404 เสมอ */
export class MemberNotFoundError extends Error {
  readonly status = 404;
  readonly code = "NOT_FOUND";
  constructor(message = "ไม่พบสมาชิกคนนี้ในระบบสมาชิกที่เปิดอยู่") {
    super(message);
    this.name = "MemberNotFoundError";
  }
}

/** เห็นได้แต่ทำไม่ได้ (สิทธิ์ไม่ถึง) → 403 · UI ควรซ่อนปุ่มไปตั้งแต่แรก */
export class MemberForbiddenError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";
  constructor(message = "บัญชีของคุณยังไม่ได้รับสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้านก่อน") {
    super(message);
    this.name = "MemberForbiddenError";
  }
}

/** ข้อมูลที่ส่งมาใช้ไม่ได้ (รูปแบบ/ค่าที่ไม่อยู่ในทะเบียน) → 400 */
export class MemberInputError extends Error {
  readonly status = 400;
  readonly code = "BAD_INPUT";
  constructor(message: string) {
    super(message);
    this.name = "MemberInputError";
  }
}

/**
 * ตัวตนชนกัน (D18) → 409
 * ใช้ตอน `linkIdentity` เจอว่า id ช่องทางนี้ผูกกับสมาชิกคนหนึ่งอยู่ แต่เบอร์/อีเมลที่ส่งมาชี้ไปอีกคน
 * ⇒ ระบบ **ไม่เดา** ว่าใครถูก: โยนออกไปพร้อมสร้างคู่ "อาจเป็นคนเดียวกัน" ให้คนตัดสิน
 */
export class MemberConflictError extends Error {
  readonly status = 409;
  readonly code = "CONFLICT";
  constructor(message = "ข้อมูลนี้ซ้ำกับสมาชิกอีกคน — ตรวจว่าเป็นคนเดียวกันหรือไม่ก่อนผูก") {
    super(message);
    this.name = "MemberConflictError";
  }
}
