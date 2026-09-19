// เทมเพลตกิจการ #8 — รถ/อู่/เช่ารถ (พิมพ์เขียว §10 แถวที่ 8) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const AUTO_TEMPLATE: BusinessTemplate = {
  key: "auto",
  label: "รถ / อู่ / เช่ารถ",
  description: "ขายรถ อู่ซ่อม เช่ารถ — ดูแลรถของลูกค้าและเตือนเช็กระยะ",
  pipelines: [pipeline("ขาย/บริการรถ", [["สอบถาม", 10, 2], ["เสนอ", 35, 5, ["valueSatang"]], ["ทดลอง", 55, 5], ["เจรจา", 75, 7]], "ปิดการขาย")],
  lostReasons: [...CENTRAL_LOST_REASONS],
  scoreRules: [...CENTRAL_SCORE_RULES, { key: "rent_3", label: "เช่าครบ 3 ครั้ง", event: "crm.deal.won", points: 10 }],
  sequences: [
    { key: "service_due", name: "เช็กระยะถึงกำหนดใน 30 วัน", trigger: "custom.record.due", steps: [{ day: 0, channel: "LINE", title: "แจ้งเตือนเช็กระยะ" }, { day: 3, channel: "TASK", title: "โทรนัดเข้าเช็กระยะ" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [{ templateKey: "vehicle" }],
  fields: { contact: [], company: [], deal: [] },
};
