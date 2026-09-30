// after-drain.ts — จุดเดียวของ "ตั้งให้ระบายคิว outbox หลังตอบคำขอ" (CRM C5.4-D r3 ▸ มติผู้คุมงาน R2-N6 · ใช้โดย `scheduleDrain` ของ
//   `outbox-consumers.ts` (ทุกโมดูล) และ `wakeOutbox` ของ CRM) — ไฟล์นี้ไม่ import อะไรนอกจาก `next/server` (ไม่มีวงโหลด)
//
// 🔴 รวมการตั้งซ้อน (coalesce): มีการระบายที่ "ตั้งไว้แล้วแต่ยังไม่เริ่ม" อยู่ = ไม่ตั้งเพิ่ม — ทั้งภายในคำขอเดียว (action ที่รีเฟรชหลายหน้า)
//    และข้ามคำขอ/ข้ามโมดูลในอินสแตนซ์เดียวกัน (Fluid) · เดิมแต่ละการเรียกตั้ง `after()` ของตัวเอง ⇒ ระบายทั้งคิว (ทุกร้าน ทุกโมดูล) ต่อกัน
//    หลายรอบ และ waitUntil ของทุกคำขอรอคิวระบายที่ต่อกันอยู่ (`drainOutbox` ต่อสายในโพรเซส) — กินเวลาฟังก์ชัน/connection ฐาน
// 🔴 ทำไมถูกต้อง: ผู้เรียกทุกราย (booking · approval-effects · branding · chat · forms · kanban · pos · CRM) เรียก **หลัง** งานเขียน commit
//    แล้ว (ตรวจทุกจุดใน C5.4-D r3) ⇒ การระบายที่ตั้งไว้และยังไม่เริ่มจะเริ่มทีหลังและเห็นแถวนั้นแน่นอน · เริ่มไปแล้ว (ธงถูกล้างตอนเริ่ม) =
//    ตั้งใหม่ของตัวเอง · ⚠️ ผู้เรียกใหม่ต้องรักษากติกา "เรียกหลัง commit" นี้
// 🔴 N9: งานของ `after()` **คืน promise ของการระบาย** — waitUntil ของแพลตฟอร์มผูกกับ promise นี้ (ไม่ใช่ `void` ลอย ๆ ที่ถูกแช่แข็งกลางงาน)
// ธงที่ค้างเพราะงานที่ตั้งไว้ไม่เคยได้เริ่ม (คำขอถูกฆ่า/หมดเวลาขณะ instance ยังอยู่) หมดอายุเองใน PENDING_STALE_MS
//   CRM C5.4-D ▸ (review R3-S1 · มติผู้คุมงาน) 15 วินาที ไม่ใช่ 6 นาที: ธงเดียวแทนการระบายของ **ทุกโมดูล** ใน instance — ค้าง 6 นาที = คิวของ
//   แชท/POS/จองคิว/ฟอร์มเงียบทั้ง instance (ชั้นเดียวกับเหตุ 1 ก.ย.) · ระบายเกิน 1 รอบไม่เสียหาย (ระบายต่อคิวกัน + lease กันหยิบซ้ำ) ◂
// นอกบริบทคำขอ (สคริปต์/ข้อสอบ/cron) `after()` โยน ⇒ ระบายทันทีแบบไม่รอ (ธงถูกล้างทันทีที่เริ่ม)
// PROD-EXPOSED (ทุกโมดูลที่เรียก scheduleDrain) — หลัง deploy ผู้คุมงานดูระยะเวลาฟังก์ชัน + จำนวน connection ฐาน
import { after } from "next/server";

const PENDING_STALE_MS = 15_000;
const PENDING_KEY = Symbol.for("shark.core.after-drain.pendingSince");
const holder = globalThis as unknown as Record<symbol, number | undefined>;

/** ตั้งให้ `run` (ตัวระบายคิว) ทำหลังตอบคำขอ — รวมกับที่ตั้งไว้แล้วแต่ยังไม่เริ่ม · `run` ห้ามโยน (ถูกกลืนอยู่แล้วก็ได้) */
export function scheduleCoalescedDrain(run: () => Promise<unknown>): void {
  const since = holder[PENDING_KEY];
  if (since !== undefined && Date.now() - since < PENDING_STALE_MS) return;
  holder[PENDING_KEY] = Date.now();
  const task = (): Promise<void> => {
    holder[PENDING_KEY] = undefined;
    return run().then(
      () => undefined,
      () => undefined,
    );
  };
  try {
    after(task);
  } catch {
    void task();
  }
}
