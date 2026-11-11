// keys.ts — คีย์กันซ้ำของชั้นบริการ POS ที่ REST `/api/v1/pos` ส่งลงไป (ใบ P2.13 · brief §3 · มติ 5)
//
// สองชั้นกันซ้ำ:
//   1) ชั้น REST: `withIdempotency` ของแกน (`ApiIdempotency` · (keyId, Idempotency-Key) · TTL 24 ชม. · เทียบ hash ของ body)
//   2) ชั้นบริการ: คีย์ที่ส่งเข้า submitRegisterSale / refundSale / ingestOrder / payOrder / cancelOrder — ยังกันซ้ำได้หลังแถวชั้น 1 หมดอายุ
// 🔴 ทำไมต้องแฮช: หน้าขาย (register) รับคีย์เฉพาะ [A-Za-z0-9_-]{8,100} (`regIsIdemKey` · ไม่มี ":") ⇒ คีย์ P0.2 รูป
//    `api:<actor>:<Idempotency-Key>` ใช้ไม่ได้ · ผูกกับ keyId เสมอ ⇒ สองแอป (คนละคีย์) ที่บังเอิญใช้ Idempotency-Key เดียวกันได้คนละบิล (⚠️6)
// ไม่ import อะไรของโมดูล — register.ts / refund.ts ไม่ต้องรู้จักไฟล์นี้ (ใช้ได้ทั้งฝั่ง op และข้อสอบ)

import { createHash } from "node:crypto";

/** คำนำหน้าคีย์ชั้นบริการของคำขอจากคีย์ API */
export const POS_API_SERVICE_KEY_PREFIX = "api_";

/**
 * คีย์กันซ้ำชั้นบริการของคำขอหนึ่ง = "api_" + sha256hex(keyId + "\n" + Idempotency-Key)[0..63]
 * (68 ตัวอักษร · ผ่าน regIsIdemKey ของหน้าขาย และ ORDER_KEY_RE ของออเดอร์)
 */
export function posApiServiceKey(keyId: string, idempotencyKey: string): string {
  return POS_API_SERVICE_KEY_PREFIX + createHash("sha256").update(`${keyId}\n${idempotencyKey}`).digest("hex").slice(0, 64);
}
