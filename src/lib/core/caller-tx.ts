// core/caller-tx.ts — มุมมอง "ธุรกรรมของผู้เรียก" ของ client ใน interactive tx (HF-TX · 10 ต.ค. 2026)
// 🔴 บริสุทธิ์: ไม่มี import (ไม่แตะ prisma/โมดูลใด) — qc-hf-tx HT6 ตรวจ

/**
 * คืน client ตัวเดิมที่ **ซ่อน `$transaction`** (`"$transaction" in c` = false · `c.$transaction` = undefined) และ bind เมธอดทุกตัวกับ tx จริง
 *
 * ทำไม: Prisma 7 ให้ client ของ interactive tx มี `$transaction` (เรียกซ้อน = SAVEPOINT บน connection/xid เดียวกัน) ⇒ helper ที่ตัดสิน
 * "เราเป็นเจ้าของธุรกรรมไหม" ด้วย `"$transaction" in client` (เช่น `pos/service.ts createSale` · `withTx`) เข้าใจผิดว่าเป็นเจ้าของ:
 * เปิด savepoint ซ้อน (แถวได้ xid ย่อย ≠ แถวของผู้เรียก) และทำงาน "หลัง commit" (ตัดสต็อก · ระบายคิว) **ก่อน** ผู้เรียก commit
 * (อ่านบิลผ่าน prisma กลางไม่เจอ ⇒ ข้ามเงียบ) — สัญญา "createSale(input, tx) ทำงานในธุรกรรมของผู้เรียก ไม่ทำงานหลัง commit เอง" จึงไม่จริง
 *
 * กติกา: ทุก helper ที่ตัดสินความเป็นเจ้าของด้วย `$transaction` ต้องได้ `callerTx(tx)` เมื่อถูกเรียกภายในธุรกรรมของผู้เรียก —
 * แล้วผู้เรียกทำงานหลัง commit เอง (บิลขาย: `pos.afterSaleCommitted(input, saleId)` หลัง `$transaction` resolve)
 */
export function callerTx<T extends object>(tx: T): T {
  return new Proxy(tx, {
    has: (t, k) => (k === "$transaction" ? false : Reflect.has(t, k)),
    get: (t, k) => {
      if (k === "$transaction") return undefined;
      const v: unknown = Reflect.get(t, k);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
}
