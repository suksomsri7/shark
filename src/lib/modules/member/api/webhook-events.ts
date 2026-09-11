// webhook-events.ts — รายชื่อ "เหตุการณ์ของระบบสมาชิก" ที่ร้านสมัคร webhook ได้ (M1.11 → แยกไฟล์ที่ M3.10)
//
// ทำไมแยกจาก `openapi.ts`: ตั้งแต่ M3.10 op ของ `webhooks.*` (ในทะเบียน) ต้องใช้รายชื่อนี้ตรวจ `events[]`
// และ `openapi.ts` ต้องอ่านทะเบียน (`MEMBER_OPS`) เพื่อสร้างเอกสาร ⇒ ถ้าอยู่ไฟล์เดียวกันจะเป็นวงกลม
// registry → ops/webhooks → openapi → registry · ไฟล์นี้จึงอ่านแค่ทะเบียนเหตุการณ์กลาง ไม่รู้จักทะเบียน op
//
// 🔴 ดึงจากทะเบียนเดียวกับหน้าตั้งค่า (`WEBHOOK_EVENTS`) — ห้ามพิมพ์รายชื่อมือ (ตกหล่นแน่)

import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";

/**
 * คำนำหน้าของ event ที่ "ระบบสมาชิก" เป็นเจ้าของ
 * 🔴 M2.10: ไม่ใช่แค่ `member.*` — ความภักดีทั้งหมด (แต้ม · ตราสะสม · ของรางวัล · voucher · บัตรกำนัล)
 *    เกิดในโมดูลของตัวเองแต่พูดถึง "สมาชิกคนหนึ่ง" เสมอ ⇒ ร้านที่ต่อฮุคของระบบสมาชิกต้องเห็นครบ
 * 🔴 M3.10: + รีวิว (M3.4) · แนะนำเพื่อน (M3.5) · แคมเปญ (M3.2) — ทั้งสามลงทะเบียน 3 ทะเบียนครบแล้วในใบของมัน
 */
export const MEMBER_EVENT_PREFIXES = [
  "member.",
  "point.",
  "stamp.",
  "reward.",
  "voucher.",
  "giftcard.",
  "review.",
  "referral.",
  "campaign.",
] as const;

/** event ของระบบสมาชิกในทะเบียนฮุค — ตัดตัวซ้ำ (บางตัวมาทาง `AUTOMATION_EVENTS` ที่ spread ไว้) */
export function memberWebhookEvents(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of WEBHOOK_EVENTS) {
    if (!MEMBER_EVENT_PREFIXES.some((p) => e.value.startsWith(p)) || seen.has(e.value)) continue;
    seen.add(e.value);
    out.push(e.value);
  }
  return out;
}

/**
 * ปลายทาง webhook นี้เป็น "ของระบบสมาชิก" ไหม (M3.10) — มีเหตุการณ์อย่างน้อย 1 ตัว และทุกตัวเป็นของระบบสมาชิก
 * 🔴 ปลายทางที่รับ "ทุกเหตุการณ์" (รายการว่าง) หรือมีเหตุการณ์ของบัญชี/บอร์ดงานปน = ของร้านทั้งร้าน
 *    ⇒ REST/หน้าตั้งค่าของระบบสมาชิกไม่แตะ (แก้ได้ที่ ตั้งค่าร้าน › แอปภายนอก เท่านั้น)
 */
export function isMemberWebhookEndpoint(eventsJson: unknown, allowed: ReadonlySet<string> = new Set(memberWebhookEvents())): boolean {
  const ev = Array.isArray(eventsJson) ? eventsJson.filter((x): x is string => typeof x === "string") : [];
  return ev.length > 0 && ev.every((e) => allowed.has(e));
}

/** ปัญหาของที่อยู่ปลายทาง (ไทย · ไม่โทษผู้ใช้) — null = ใช้ได้ · https เท่านั้น */
export function memberWebhookUrlProblem(raw: string): string | null {
  let parsed: URL | null = null;
  try {
    parsed = new URL(String(raw ?? "").trim());
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== "https:") {
    return "ที่อยู่ปลายทางต้องขึ้นต้นด้วย https:// — ข้อมูลอ้างอิงสมาชิกส่งผ่านช่องทางที่ไม่เข้ารหัสไม่ได้";
  }
  return null;
}

/** เหตุการณ์ที่ส่งมา → รายการที่สะอาด หรือปัญหาเป็นข้อความไทย (ต้องไม่ว่าง · ทุกตัวต้องเป็นของระบบสมาชิก) */
export function memberWebhookEventsCheck(events: readonly string[]): { ok: true; events: string[] } | { ok: false; reason: string; bad: string[] } {
  const allowed = new Set(memberWebhookEvents());
  const clean = [...new Set(events.map((e) => String(e ?? "").trim()).filter(Boolean))];
  if (clean.length === 0) return { ok: false, reason: "เลือกเหตุการณ์ที่จะรับอย่างน้อย 1 รายการ", bad: [] };
  const bad = clean.filter((e) => !allowed.has(e));
  if (bad.length > 0) {
    return {
      ok: false,
      reason: `เหตุการณ์ ${bad.map((b) => `"${b}"`).join(", ")} ไม่ใช่เหตุการณ์ของระบบสมาชิก — ดูรายชื่อที่สมัครได้ในคู่มือหัวข้อ Webhooks`,
      bad,
    };
  }
  return { ok: true, events: clean };
}
