// ─────────────────────────────────────────────────────────────
// platform/sellables.ts — ทะเบียน "ของที่ขายได้" ต่อชนิด (CC §C ข้อ 1 · :44) · RUN TRIPS T0.4
// หน้าจอง · พอร์ทัล · API · แชท AI เรียกผ่าน `sellableFor(kind)` (หรือ basket.*) เท่านั้น
// TRIP → facade trips (โหลดตอนใช้ · ไม่ลากกราฟโมดูลตอนโหลดไฟล์นี้) · TICKET (K1.1) / HOTEL (เฟส 2) ⇒ KIND_NOT_SUPPORTED
// ─────────────────────────────────────────────────────────────
import type { Sellable, SellResult } from "@/lib/core/sellable";

// ── T0.4 capacity ──
const notSupported = (): SellResult<never> => ({ ok: false, code: "KIND_NOT_SUPPORTED", messageTh: "ยังไม่รองรับรายการชนิดนี้", retryable: false });

export async function sellableFor(kind: string): Promise<SellResult<Sellable>> {
  if (kind === "TRIP") return { ok: true, value: (await import("@/lib/modules/trips")).tripSellable };
  return notSupported();
}

/** requestHash ของคำขอถือ (canonical JSON → sha256) — เรียกตัวเดียวกับโมดูล trips (ใบสั่ง T0.4 §11 ข้อ 4 · CC :345) */
export async function requestHash(req: Record<string, unknown>): Promise<string> {
  return (await import("@/lib/modules/trips")).holdRequestHash(req);
}
// ── /T0.4 capacity ──
