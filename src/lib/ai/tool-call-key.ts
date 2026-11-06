// tool-call-key.ts — กุญแจกันซ้ำของผลข้างเคียงจาก tool (ใบ SEC S3a.1-S1 · RESOLUTIONS R-Z7)
//
// เทิร์นของห้องเลขาที่รันซ้ำได้ (worker ลองใหม่หลังล้ม · สองรอบซ้อนเมื่อ lease หลุด) ส่ง `userMessageId` เดิมเข้า sendMessage
//   ⇒ ทุก tool call ของเทิร์นได้กุญแจ `tc:<messageId>:<toolCallIndex>` (ลำดับในเทิร์น) ผ่าน AsyncLocalStorage — ไม่ต้องร้อยผ่าน
//   tools.ts ทุกตัว · ผู้สร้างแถว (ข้อเสนอ `createProposal` · เรื่องแจ้งทีมงาน `openCaseFromAi`) ใช้กุญแจนี้ทำ **รหัสแถวแบบกำหนดได้**
//   (hash ของ ร้าน + บทสนทนา + กุญแจ + ชนิด) ⇒ รันซ้ำ = แถวเดิม (PK ชน = คืนแถวเดิม) · ความจำ (`remember`) กันซ้ำด้วยเนื้อความอยู่แล้ว
// ไม่มีกุญแจ (ทางเดิมทุกทาง — ไม่มี userMessageId) = รหัส cuid เดิมทุกไบต์
import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<string>();

/** รัน `fn` ภายใต้กุญแจของ tool call นี้ (null = ไม่มีกุญแจ — รันตรง) */
export function withToolCallKey<T>(key: string | null, fn: () => Promise<T>): Promise<T> {
  return key ? store.run(key, fn) : fn();
}

/** กุญแจของ tool call ที่กำลังรัน (นอก `withToolCallKey` = null) */
export function currentToolCallKey(): string | null {
  return store.getStore() ?? null;
}

/** รหัสแถวแบบกำหนดได้จากกุญแจ — `<prefix>_<sha256 24 ตัวแรก>` (ยาว ≤ 32 · ไม่ชนรูป cuid) */
export function toolCallRowId(prefix: string, parts: readonly string[]): string {
  return `${prefix}_${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`;
}
