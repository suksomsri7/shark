// เทมเพลตกิจการ #12 — สัตว์เลี้ยง/โรงพยาบาลสัตว์ (พิมพ์เขียว §10 แถวที่ 12) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const PET_TEMPLATE: BusinessTemplate = {
  key: "pet",
  label: "สัตว์เลี้ยง / โรงพยาบาลสัตว์",
  description: "คลินิกสัตว์ ร้านอาบน้ำตัดขน โรงแรมสัตว์เลี้ยง — เตือนวัคซีนและแพ็กเกจดูแล",
  pipelines: [pipeline("แพ็กเกจดูแล", [["สอบถาม", 15, 2], ["นัด", 40, 3], ["เสนอแพ็กเกจ", 65, 5, ["valueSatang"]]], "ซื้อ")],
  lostReasons: [...CENTRAL_LOST_REASONS],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "vaccine_due", name: "วัคซีนถึงกำหนดใน 14 วัน", trigger: "custom.record.due", steps: [{ day: 0, channel: "LINE", title: "เตือนนัดฉีดวัคซีน" }, { day: 2, channel: "TASK", title: "โทรยืนยันนัดวัคซีน" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [{ templateKey: "pet" }],
  fields: { contact: [], company: [], deal: [] },
};
