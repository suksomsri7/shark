// crm-source.ts — "ที่มาของคำตอบฟอร์ม" ฝั่ง CRM ของทางที่มีด่านกันสแปม (ใบ C2.6 · มติ C24)
//
// 🔴 ทำไมต้องเป็นไฟล์แยก (ไม่ใช่โค้ดใน `service.ts`): ด่านนิ่งของใบ C1.8 (`C1.8-S0.3`) บังคับว่า `forms/service.ts`
//    **ต้องไม่อ้างถึงโมดูล CRM เลย** — ใบนั้นย้าย "สร้าง lead" ออกไปเป็นผู้รับ event (`forms.submission.received`)
//    เพื่อไม่ให้ฟอร์มขึ้นกับ CRM ตอนบันทึกคำตอบ · ใบ C2.6 ต้องการของฝั่ง CRM แค่สามอย่างซึ่ง **ไม่ใช่การสร้าง lead**:
//      1) ตัวแทนของ IP (`ipHashFor`) — คอลัมน์ `FormSubmission.ip` เก็บค่าแฮช ไม่ใช่ IP ดิบ (AUDIT-CLASS X8)
//      2) ตัวล้าง url/referrer ชุดเดียวกับการติดตามเว็บ (เก็บเฉพาะ `utm_*` · ตัด query ของ referrer)
//      3) การเข้าชมล่าสุดที่ยังถือความยินยอมของผู้เข้าชมรายนั้น ในระบบ CRM ปลายทางของฟอร์ม (`webSessionId`)
//    ⇒ ทั้งสามอยู่ที่นี่ที่เดียว · `service.ts` เรียกผ่าน `./crm-source` ⇒ ด่านของ C1.8 และสัญญาของ C2.6 อยู่ด้วยกันได้
// 🔴 เส้น `forms→crm` เป็นขาที่ประกาศไว้แล้วใน ALLOWED_EDGES (WO-0054) และแตะได้ทางเดียวคือ facade `@/lib/modules/crm`
//    (ด่าน F2.3) · import แบบ dynamic เสมอ: หน้าฟอร์มสาธารณะต้องไม่ลากกราฟโมดูล CRM ทั้งก้อนมาตอนโหลดหน้า

/** ตัวแทนของ IP ที่เก็บลงคอลัมน์ได้ (HMAC + เกลือรายเดือนไทย — ตัวเดียวกับที่การติดตามเว็บใช้) */
export async function submissionIpHash(ip: string, now: Date): Promise<string> {
  const crm = await import("@/lib/modules/crm");
  return crm.tracking.ipHashFor(String(ip ?? ""), now);
}

/** url ของหน้าที่กรอก — เหลือเฉพาะ `utm_*` (token/อีเมลที่พ่วงมาใน query ไม่ถูกเก็บ) */
export async function submissionPageUrl(raw: unknown): Promise<string | null> {
  const crm = await import("@/lib/modules/crm");
  return crm.tracking.cleanTrackedUrl(raw);
}

/** ที่มาของผู้กรอก — ตัด query/fragment ทิ้ง (คำค้นของลูกค้าไม่ใช่ข้อมูลของร้าน) */
export async function submissionReferrer(raw: unknown): Promise<string | null> {
  const crm = await import("@/lib/modules/crm");
  return crm.tracking.cleanReferrer(raw);
}

/**
 * การเข้าชมล่าสุด **ที่ยังถือความยินยอม** ของผู้เข้าชมรายนี้ ในระบบ CRM ปลายทางของฟอร์ม — ไม่มี = null
 * 🔴 ผูกกับระบบปลายทางของฟอร์มเท่านั้น (ผู้เข้าชมรหัสเดียวกันบนคนละร้าน/คนละระบบ = คนละชุด · AUDIT-CLASS X1)
 */
export async function submissionWebSessionId(form: { id: string; tenantId: string }, visitorId: string): Promise<string | null> {
  const v = String(visitorId ?? "");
  if (!v) return null;
  const bridges = await import("@/lib/platform/crm-bridges");
  const systemId = await bridges.resolveFormCrmSystem({ id: form.id, tenantId: form.tenantId }).catch(() => null);
  if (!systemId) return null;
  const crm = await import("@/lib/modules/crm");
  return crm.tracking.latestConsentedSessionId(form.tenantId, systemId, v).catch(() => null);
}

// CRM C4.4-fix3 ▸ (J3) ฟอร์มที่ร้านฝังด้วย iframe บนเว็บของตัวเอง — คุกกี้ `sd_vid` ของร้านมาไม่ถึงคำขอของฟอร์ม (คนละโดเมน)
//   ⇒ ทางที่สองคือ "ตั๋วผู้เข้าชม" ที่สคริปต์ติดตามของร้านส่งให้ iframe ทาง postMessage (เซิร์ฟเวอร์ผนึก · ตรวจ · เผาเอง)

/**
 * การเข้าชมที่จะผูกกับคำตอบ **จากตั๋วผู้เข้าชม** — ใช้เมื่อคุกกี้ first-party ไม่ให้ผลเท่านั้น (ผู้เรียก: `service.ts`)
 * 🔴 ตั๋วต้องเป็นของร้าน + ระบบ CRM ปลายทางของฟอร์มนี้พอดี (ตรวจใน `tracking.redeemVisitorTicket`) · ตั๋วเสีย/หมดอายุ/ใช้ซ้ำ/ของที่อื่น
 *    = null (คำตอบยังบันทึกตามปกติ) · ไม่มีทางที่ "รหัสผู้เข้าชมดิบ" จากผู้เรียกจะผ่านทางนี้ได้ (ตั๋วที่ไม่ได้ผนึกโดยเซิร์ฟเวอร์ = null)
 */
export async function submissionWebSessionFromTicket(form: { id: string; tenantId: string }, ticket: string): Promise<string | null> {
  const t = String(ticket ?? "");
  if (!t) return null;
  const bridges = await import("@/lib/platform/crm-bridges");
  const systemId = await bridges.resolveFormCrmSystem({ id: form.id, tenantId: form.tenantId }).catch(() => null);
  if (!systemId) return null;
  const crm = await import("@/lib/modules/crm");
  return crm.tracking.redeemVisitorTicket({ tenantId: form.tenantId, systemId }, t).catch(() => null);
}

/**
 * หน้า `/f/<token>` เปิดตัวรับตั๋วจากหน้าเว็บที่ฝังไหม และรับจากเว็บโดเมนไหน — เฉพาะเมื่อระบบ CRM ปลายทางของฟอร์มเป็น uiVersion 2 และ
 *   เปิดติดตามเว็บอยู่ ⇒ คืนโดเมนติดตามของระบบนั้น (r2 · review N6: หน้าฟอร์มรับตั๋วเฉพาะจากหน้าที่ฝังซึ่งอยู่ในโดเมนเหล่านี้)
 * 🔴 ร้าน uiVersion 1 / ปิดการติดตาม / ไม่มี CRM = `[]` ⇒ หน้าฟอร์มทำงานเหมือนเดิมทุกอย่าง (ไม่ฟัง ไม่ส่งข้อความ ไม่แนบอะไรเพิ่ม)
 */
export async function formVisitorHandover(form: { id: string; tenantId: string }): Promise<string[]> {
  if (!form?.id || !form?.tenantId) return [];
  const bridges = await import("@/lib/platform/crm-bridges");
  const systemId = await bridges.resolveFormCrmSystem({ id: form.id, tenantId: form.tenantId }).catch(() => null);
  if (!systemId) return [];
  const crm = await import("@/lib/modules/crm");
  return crm.tracking.visitorHandoverHosts(form.tenantId, systemId).catch(() => [] as string[]);
}
// ◂ CRM C4.4-fix3
