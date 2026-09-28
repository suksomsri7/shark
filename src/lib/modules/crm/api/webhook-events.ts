// webhook-events.ts — เหตุการณ์ของ CRM ที่ร้านสมัคร webhook ได้ (ใบ C1.10 · แบบเดียวกับ member/api/webhook-events.ts)
//
// 🔴 ดึงจากทะเบียนเดียวกับหน้าตั้งค่า (`WEBHOOK_EVENTS` — spread `AUTOMATION_EVENTS`) · ห้ามพิมพ์รายชื่อมือ (ตกหล่นแน่)
// 🔴 payload ของทุกเหตุการณ์เป็น id ล้วน (R-C.8 · AUDIT-CLASS X8) — ไม่มีเบอร์/อีเมล/ชื่อ/ชื่อดีล · ผู้รับเอา id ไปอ่านผ่าน REST
// 🔴 การส่งทุกครั้งลงลายเซ็น 2 แบบของบริการฮุคกลาง (`X-Shark-Signature` = HMAC(body) · `X-Shark-Signature-V2` = HMAC(`ts.body`))
// ไฟล์นี้ไม่ import ทะเบียน op (กันวงกลม registry → ops → openapi → registry)

import { WEBHOOK_EVENTS } from "@/lib/webhooks/labels";
import { isLoopbackHostname, privateTargetsAllowed } from "@/lib/webhooks/private-targets"; // C4.4-fix I3 ◂

/** คำนำหน้าของเหตุการณ์ที่ CRM เป็นเจ้าของ: ของ CRM · รายการวัตถุกำหนดเอง (C1.2b) · ทีมขาย (core · C1.1) */
export const CRM_EVENT_PREFIXES = ["crm.", "custom.record.", "team."] as const;

// CRM C3.8 ▸ event ของ CRM ที่ "มี consumer แต่ไม่เปิดให้ร้านสมัครเว็บฮุค" โดยเจตนา (ธงภายในล้วน — ไม่มีความหมายต่อระบบภายนอก)
//   กติกา (ข้อสอบ C3.8-S6.1): consumer ทุกตัวที่ขึ้นต้นด้วย CRM_EVENT_PREFIXES ต้อง **อยู่ในรายการเว็บฮุค หรืออยู่ในรายการนี้** — ไม่มีทางที่สาม
//   ⇒ event ใหม่ที่ลืมป้ายเว็บฮุคจะถูกจับทันที · ตอนนี้ว่าง: ธงกันซ้ำตัวเดียวของ CRM (`crm.teamroom.posted` · C3.4) ถูกตั้งใจเปิดให้เว็บฮุค
//   (ร้านเอาไปต่อห้องแชทภายนอกได้ — payload id ล้วน) · ใส่ชื่อที่นี่ = ตัดออกจาก crmWebhookEvents() / คู่มือ / manifest / x-shark-webhooks พร้อมกัน ◂
export const CRM_INTERNAL_EVENTS: readonly string[] = [];

/** เหตุการณ์ของ CRM ในทะเบียนฮุค — ตัดตัวซ้ำ · ตัด CRM_INTERNAL_EVENTS */
export function crmWebhookEvents(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const internal = new Set(CRM_INTERNAL_EVENTS);
  for (const e of WEBHOOK_EVENTS) {
    if (!CRM_EVENT_PREFIXES.some((p) => e.value.startsWith(p)) || seen.has(e.value) || internal.has(e.value)) continue;
    seen.add(e.value);
    out.push(e.value);
  }
  return out;
}

/**
 * ปลายทางนี้เป็น "ของ CRM" ไหม — มีเหตุการณ์อย่างน้อย 1 ตัว และทุกตัวเป็นของ CRM
 * 🔴 ปลายทางที่รับทุกเหตุการณ์ (รายการว่าง) หรือปนเหตุการณ์ของโมดูลอื่น = ของทั้งร้าน ⇒ หน้าตั้งค่าของ CRM ไม่แตะ
 */
export function isCrmWebhookEndpoint(eventsJson: unknown, allowed: ReadonlySet<string> = new Set(crmWebhookEvents())): boolean {
  const ev = Array.isArray(eventsJson) ? eventsJson.filter((x): x is string => typeof x === "string") : [];
  return ev.length > 0 && ev.every((e) => allowed.has(e));
}

/**
 * ปัญหาของที่อยู่ปลายทาง (ไทย · ไม่โทษผู้ใช้) — null = ใช้ได้ · https เท่านั้น (ด่าน SSRF เต็มรูปอยู่ที่บริการฮุคกลาง)
 * C4.4-fix I3 ▸ ข้อยกเว้นเดียว: http:// ถึง **เครื่องนี้ตรงตัว** (localhost · 127.x · [::1]) เมื่อสวิตช์ช่องทดสอบของด่าน SSRF เปิดอยู่
 *   (`privateTargetsAllowed()` — WEBHOOK_ALLOW_PRIVATE=1 และไม่ใช่ production) ⇒ QC รับ webhook ด้วยเซิร์ฟเวอร์ในเครื่องได้ ·
 *   production = https เท่านั้นเหมือนเดิม · `allowLoopbackHttp` ส่งมาได้เพื่อให้ฟอร์มฝั่งหน้าจอใช้ค่าที่เซิร์ฟเวอร์ตัดสินแล้ว ◂
 */
export function crmWebhookUrlProblem(raw: string, allowLoopbackHttp: boolean = privateTargetsAllowed()): string | null {
  let parsed: URL | null = null;
  try {
    parsed = new URL(String(raw ?? "").trim());
  } catch {
    parsed = null;
  }
  if (parsed && parsed.protocol === "http:" && allowLoopbackHttp && isLoopbackHostname(parsed.hostname)) return null;
  if (!parsed || parsed.protocol !== "https:") return "ที่อยู่ปลายทางต้องขึ้นต้นด้วย https:// — รหัสอ้างอิงลูกค้าส่งผ่านช่องทางที่ไม่เข้ารหัสไม่ได้";
  return null;
}

/** เหตุการณ์ที่ส่งมา → รายการที่สะอาด หรือเหตุผลภาษาไทย (ต้องไม่ว่าง · ทุกตัวต้องเป็นของ CRM) */
export function crmWebhookEventsCheck(events: readonly string[]): { ok: true; events: string[] } | { ok: false; reason: string } {
  const allowed = new Set(crmWebhookEvents());
  const clean = [...new Set(events.map((e) => String(e ?? "").trim()).filter(Boolean))];
  if (clean.length === 0) return { ok: false, reason: "เลือกเหตุการณ์ที่จะรับอย่างน้อย 1 รายการ" };
  const bad = clean.filter((e) => !allowed.has(e));
  if (bad.length > 0) return { ok: false, reason: `เหตุการณ์ ${bad.map((b) => `"${b}"`).join(", ")} ไม่ใช่เหตุการณ์ของ CRM — เลือกจากรายการบนหน้านี้` };
  return { ok: true, events: clean };
}
