// outbox-wake.ts — ปลุกคิว outbox หลังงานเขียนของ CRM (CRM C5.4-D ▸ ผลตรวจ L3-M1 ส่วน CRM · ข้อสอบ C5.3-L3-M1b ◂)
//
// ทำไมต้องมี: CRM ยิง event ลง outbox ใน tx เดียวกับการเขียนทุกครั้ง แต่ไม่เคยปลุกตัวระบายเลย — event อย่าง `crm.deal.won`
//   (หยุดลำดับการติดตาม · ออกใบแจ้งหนี้อัตโนมัติ · ส่งอนุมัติคอมมิชชัน · เว็บฮุค/กฎของร้าน · ไทม์ไลน์สมาชิก) จึงรอจนกว่า
//   โมดูลอื่นจะบังเอิญระบาย หรือ cron รายชั่วโมง/รายวันมาเก็บ · ทางเขียนของ CRM (server action หน้า v2 + REST) เรียกตัวนี้หลังเขียนสำเร็จ
// 🔴 import `@/lib/outbox-consumers` แบบ lazy **ภายใน** งานที่ตั้งไว้เท่านั้น: outbox-consumers → … → crm facade = วงโหลดไฟล์
//    ถ้า import ที่หัวไฟล์ (เหตุผลเดียวกับ crm-bridges/index.ts) · และไม่เพิ่มเวลาตอบของผู้ใช้ (โหลดหลังตอบแล้ว)
// 🔴 `after()` = ทำหลังตอบคำขอแล้ว (บน Vercel ผูกกับ waitUntil — แลมบ์ดาไม่ถูกแช่แข็งกลางงาน) · นอกบริบทคำขอ (สคริปต์/ข้อสอบ/cron)
//    `after()` โยน ⇒ ระบายทันทีแบบไม่รอ — พฤติกรรมเดียวกับ `scheduleDrain()` ของ outbox-consumers ทุกประการ
// 🔴 ผู้เรียกต้องเรียก **หลัง** งานเขียน commit แล้ว (ไม่ใช่ตอนเริ่ม action): นอกบริบทคำขอ การระบายเริ่มทันที — เรียกก่อนเขียนคือระบายคิวว่าง
// 🔴 ไม่เคยทำให้งานเขียนล้ม: ระบายล้ม = เงียบ (event ยังอยู่ในคิว · ตัวระบายรอบถัดไปของใครก็ได้หยิบไป)
// ร้าน uiVersion 1: action หน้า v2 และ REST CRM ปฏิเสธระบบรุ่น 1 ก่อนเขียนเสมอ ⇒ ไม่มีทางมาถึงตัวนี้ (action v1 `actions.ts` ไม่เรียก)
import { after } from "next/server";
import { revalidatePath } from "next/cache";

async function drainNow(): Promise<void> {
  try {
    const { drainAll } = await import("@/lib/outbox-consumers");
    await drainAll();
  } catch {
    // best-effort — event ยังอยู่ในคิว (ดูหัวไฟล์)
  }
}

/** ตั้งให้ระบายคิว outbox หลังตอบคำขอ (นอกบริบทคำขอ = ระบายทันทีแบบไม่รอ) — เรียกหลังงานเขียน commit แล้วเท่านั้น */
export function wakeOutbox(): void {
  try {
    after(drainNow);
  } catch {
    void drainNow();
  }
}

/** `revalidatePath` ของหน้า CRM v2 + ปลุกคิว outbox — server action เรียกตัวนี้หลังเขียนสำเร็จ (จุดเดียวกับที่เคยรีเฟรชหน้า) */
export function revalidateAndWake(path: string, type?: "layout" | "page"): void {
  revalidatePath(path, type);
  wakeOutbox();
}
