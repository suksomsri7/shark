// ai-settings.ts — สวิตช์ "AI แนะนำคำตอบ" · "การแปลข้อความ" · ภาษาที่ทีมอ่าน ของระบบแชท (ChatSetting · 17 พ.ย. 2026)
//
// 🔴 ตัวอ่าน/ตัวเขียนเดียวของ 3 ค่านี้ — ใช้ร่วม
//    · เว็บ `setChatAiSettingsAction` (inbox-actions.ts · ฟอร์มหน้าเชื่อมช่องทาง)
//    · แอป `GET/PUT /api/mobile/inbox/ai-settings` (หน้าตั้งค่า "คุยกับลูกค้า")
//    ด่านสิทธิ์อยู่ที่ผู้เรียก (คีย์ `CHAT_SETTING_ACTION` เดียวกันทั้งสองทาง) — ไฟล์นี้ไม่ตรวจสิทธิ์
// 🔴 ค่าเริ่มต้น = ปิดทั้งคู่ + ภาษาไทย (สคีมา) เพราะ **คิดเงินต่อครั้งที่กด** — เจ้าของต้องเปิดเอง
// 🔴 ไม่มีแถว ChatSetting (ร้านยังไม่เคยเปิดหน้าตั้งค่าบนเว็บ) ⇒ สร้างให้ แต่ต้องยืนยันก่อนว่าระบบแชทเป็นของร้านนี้
//    (บทเรียนเดียวกับ setBusinessHours/setRetentionDays · B1: รู้ systemId ของร้านอื่นต้องเขียนไม่ได้)
import { tenantDb } from "@/lib/core/db";

/** ภาษาที่ทีมอ่านที่ให้เลือก — ชุดเดียวกับ <select name="staffLang"> ของฟอร์มเว็บ (ui.tsx) · `cn` = จีน (รหัสของระบบ · lang.ts) */
export const STAFF_LANGS = ["th", "en", "cn", "ja", "ko", "de", "fr", "ru"] as const;
export type StaffLang = (typeof STAFF_LANGS)[number];

export type ChatAiSettings = { aiSuggestEnabled: boolean; translateEnabled: boolean; staffLang: string };

/** ค่าเมื่อยังไม่มีแถว (ตรงกับ @default ในสคีมา) */
export const CHAT_AI_DEFAULTS: ChatAiSettings = { aiSuggestEnabled: false, translateEnabled: false, staffLang: "th" };

/**
 * ค่าภาษาจากฟอร์มเว็บ — กติกาเดิมของ `setChatAiSettingsAction` (a-z 2 ตัว · อย่างอื่น = "th")
 *   เส้นของแอปตรวจเข้มกว่า (ต้องอยู่ใน STAFF_LANGS · ไม่ผ่าน = 422) ที่ route
 */
export function staffLangFromForm(raw: unknown): string {
  const v = String(raw ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(v) ? v : "th";
}

export async function readChatAiSettings(tenantId: string, systemId: string): Promise<ChatAiSettings> {
  const row = await tenantDb({ tenantId, systemId }).chatSetting.findFirst({
    where: { tenantId, systemId },
    select: { aiSuggestEnabled: true, translateEnabled: true, staffLang: true },
  });
  return row ? { aiSuggestEnabled: row.aiSuggestEnabled, translateEnabled: row.translateEnabled, staffLang: row.staffLang } : { ...CHAT_AI_DEFAULTS };
}

/**
 * เขียน 3 ค่าทั้งชุด (แทนที่ · ไม่ใช่ merge — ฟอร์มเว็บส่งครบเสมอ · แอปส่งครบเสมอ)
 * คืน null = ระบบแชทนี้ไม่ใช่ของร้านนี้ (ไม่แตะอะไร)
 */
export async function writeChatAiSettings(tenantId: string, systemId: string, v: ChatAiSettings): Promise<ChatAiSettings | null> {
  const data = { aiSuggestEnabled: v.aiSuggestEnabled, translateEnabled: v.translateEnabled, staffLang: v.staffLang };
  // ยามชั้น 2 ยัด tenantId/systemId เข้า where ให้เอง ⇒ ของร้านอื่น = 0 แถว
  const r = await tenantDb({ tenantId, systemId }).chatSetting.updateMany({ where: {}, data });
  if (r.count === 0) {
    const sys = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, tenantId, type: "CHAT" }, select: { id: true } });
    if (!sys) return null;
    // ยามชั้น 2 ยัด tenantId+systemId ให้ · กดพร้อมกัน 2 เครื่อง (แถวเพิ่งเกิด = ชน unique systemId) ⇒ เขียนทับแถวนั้นแทน
    try {
      await tenantDb({ tenantId, systemId }).chatSetting.create({ data: { tenantId, systemId, ...data } });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      await tenantDb({ tenantId, systemId }).chatSetting.updateMany({ where: {}, data });
    }
  }
  return readChatAiSettings(tenantId, systemId);
}
