// templates/business/central.ts — "ค่ากลาง" ของเทมเพลตกิจการ (พิมพ์เขียว §10 ย่อหน้าแรก): เหตุผลแพ้ 5 · กฎคะแนน 8 ·
//   sequence "ติดตามใบเสนอราคา" · ตัวช่วยสร้างตัวเลือก — ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessLostReason, BusinessPipeline, BusinessScoreRule, BusinessSequence } from "./types";

export const choices = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

/** เหตุผลที่แพ้ 5 ข้อกลาง (key คงที่ — ร้านแก้ป้ายเองได้หลัง apply) */
export const CENTRAL_LOST_REASONS: readonly BusinessLostReason[] = [
  { key: "price", label: "ราคาสูงเกินงบ" },
  { key: "competitor", label: "เลือกเจ้าอื่น" },
  { key: "timing", label: "ยังไม่พร้อม / เลื่อนออกไป" },
  { key: "no_response", label: "ติดต่อไม่ได้" },
  { key: "other", label: "เหตุผลอื่น" },
];

/** กฎคะแนน 8 ข้อกลาง (เก็บไว้ให้ C2.8 สร้างเป็น CrmScoreRule) */
export const CENTRAL_SCORE_RULES: readonly BusinessScoreRule[] = [
  { key: "form_submitted", label: "กรอกฟอร์มบนเว็บ", event: "forms.submission.received", points: 15 },
  { key: "chat_in", label: "ทักแชทเข้ามา", event: "chat.message.received", points: 5, maxPerDay: 1 },
  { key: "email_opened", label: "เปิดอีเมล", event: "crm.email.opened", points: 2, maxPerDay: 3 },
  { key: "email_clicked", label: "กดลิงก์ในอีเมล", event: "crm.email.clicked", points: 5, maxPerDay: 3 },
  { key: "email_replied", label: "ตอบอีเมลกลับ", event: "crm.email.received", points: 10 },
  { key: "meeting_done", label: "นัดพบ/โทรคุยเสร็จ", event: "crm.activity.completed", points: 10 },
  { key: "quotation_sent", label: "ได้รับใบเสนอราคา", event: "crm.deal.quotation.issued", points: 8 },
  { key: "inactive_30d", label: "เงียบไป 30 วัน", event: "crm.contact.inactive", points: -10, expiresDays: 90 },
];

/** sequence กลาง "ติดตามใบเสนอราคา" (เก็บไว้ให้ C2.2) */
export const CENTRAL_QUOTE_SEQUENCE: BusinessSequence = {
  key: "quote_follow_up",
  name: "ติดตามใบเสนอราคา",
  trigger: "crm.deal.quotation.issued",
  steps: [
    { day: 2, channel: "EMAIL", title: "สอบถามว่าได้รับใบเสนอราคาแล้วหรือยัง" },
    { day: 5, channel: "TASK", title: "โทรตามใบเสนอราคา" },
    { day: 10, channel: "LINE", title: "ถามว่ามีข้อสงสัยเรื่องราคาไหม" },
  ],
};

/**
 * pipeline จากรายการขั้นเปิด [ชื่อ, โอกาสปิด %, staleDays, requireFields?] + ขั้นชนะ (100) + ขั้น "ไม่สำเร็จ" (แพ้ 0) ท้ายสุด
 * — ตัวช่วยเขียนข้อมูลเท่านั้น (ผลลัพธ์เป็นข้อมูลธรรมดา)
 */
export function pipeline(
  name: string,
  open: [string, number, number, string[]?][],
  wonName: string,
  kind: BusinessPipeline["kind"] = "SALES",
): BusinessPipeline {
  return {
    name,
    kind,
    stages: [
      ...open.map(([n, probability, staleDays, requireFields]) => ({ name: n, kind: "OPEN" as const, probability, staleDays, ...(requireFields ? { requireFields } : {}) })),
      { name: wonName, kind: "WON" as const, probability: 100 },
      { name: "ไม่สำเร็จ", kind: "LOST" as const, probability: 0 },
    ],
  };
}
