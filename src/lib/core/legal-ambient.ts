// legal-ambient.ts — "บริบทการยืนยันคำเตือนกฎหมาย" ของคำขอหนึ่ง (T1.7) · server เท่านั้น
//
// ทำไม: ด่านบางตัวอยู่ลึกในชั้นลงบัญชี (เช่น ลงรายการเข้าเดือนที่ยื่น ภ.พ.30 แล้ว · gl.ts commitEntry)
//   ซึ่งไม่มีพารามิเตอร์ ack ส่งลงไปถึง · และ service ชั้นกลางหลายตัวกลืน error เป็น `{ ok:false, reason }`
//   ⇒ ผู้เรียกชั้นนอก (REST runner · server action · เครื่องมือเลขา) เปิดบริบทนี้ไว้รอบงาน:
//      - ด่านอ่านรหัสที่ผู้ใช้ยืนยันจากบริบท
//      - ด่านที่ต้องการการยืนยันแต่ยังไม่ได้ ⇒ จดคำเตือนไว้ที่บริบท แล้วโยน LegalAckRequiredError (ในธุรกรรม — ยังไม่ได้เขียนอะไร)
//      - ชั้นนอกอ่าน `pending` หลังงานจบ ⇒ ตอบเป็นคำเตือนมาตรฐานได้เสมอ แม้ service จะกลืน error ไปแล้ว
//   ไม่มีบริบท (งานเบื้องหลัง) = ไม่มีใครให้ถาม → ด่านตัดสินเอง (T1.7: ไม่บล็อก)
import { AsyncLocalStorage } from "node:async_hooks";
import { LegalAckRequiredError, type LegalAck, type LegalWarning } from "./settings/legal/warnings";

export type LegalAmbient = {
  ack: LegalAck;
  /** คำเตือนที่ต้องยืนยันแต่ยังไม่ได้ยืนยัน (ด่านจดไว้ก่อนโยน) */
  pending: LegalWarning[];
};

const store = new AsyncLocalStorage<LegalAmbient>();

/** เปิดบริบทรอบงานหนึ่งชิ้น · คืนผลของงาน + คำเตือนที่ค้างยืนยัน */
export async function runWithLegalAck<T>(ack: LegalAck, fn: () => Promise<T>): Promise<{ result: T; pending: LegalWarning[] }> {
  const ctx: LegalAmbient = { ack, pending: [] };
  const result = await store.run(ctx, fn);
  return { result, pending: ctx.pending };
}

/** บริบทของคำขอปัจจุบัน · null = งานเบื้องหลัง (ไม่มีคนกด) */
export function legalAmbient(): LegalAmbient | null {
  return store.getStore() ?? null;
}

/**
 * ACC T2 step 0 (lane 2) ▸ รันงาน "เบื้องหลัง" นอกบริบทการยืนยันของคำขอ — ตัวระบายคิว (drainOutbox) เรียกผ่านตัวนี้
 *   เหตุ: AsyncLocalStorage ไหลตาม after()/setTimeout ⇒ drain ที่ถูกปลุกจากคำขอ REST/หน้าจอ (withLegalAck) จะพาบริบทของคำขอนั้น
 *   ไปถึง consumer ของทุกร้าน (เช่น POS ลงบัญชีขาย) ⇒ ด่านเดือนที่ยื่นแล้วจะโยนใส่งานที่ไม่มีใครกด (POS ต้องไม่ถูกบล็อก)
 */
export function outsideLegalAck<T>(fn: () => T): T {
  return store.exit(fn);
}

/** ด่านจดคำเตือนที่ค้างยืนยัน (ไม่ซ้ำรหัส+ข้อความ) */
export function notePendingLegal(ws: readonly LegalWarning[]): void {
  const c = store.getStore();
  if (!c) return;
  for (const w of ws) if (!c.pending.some((p) => p.code === w.code && p.messageTh === w.messageTh)) c.pending.push(w);
}

/**
 * ตัวห่อของชั้นนอก: งานจบแล้วมีคำเตือนค้างยืนยัน ⇒ โยน LegalAckRequiredError (ชั้นนอกแปลงเป็นผลมาตรฐานของช่องทางตัวเอง)
 * — ใช้แม้ service จะกลืน error เป็น `{ ok:false }` แล้ว (ด่านโยนในธุรกรรม ⇒ ยังไม่ได้เขียนอะไร)
 */
export async function withLegalAck<T>(ack: LegalAck, fn: () => Promise<T>): Promise<T> {
  const ctx: LegalAmbient = { ack, pending: [] };
  let result: T;
  try {
    result = await store.run(ctx, fn);
  } catch (e) {
    if (ctx.pending.length > 0) throw new LegalAckRequiredError(ctx.pending);
    throw e;
  }
  if (ctx.pending.length > 0) throw new LegalAckRequiredError(ctx.pending);
  return result;
}
