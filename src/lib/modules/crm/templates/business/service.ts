// เทมเพลตกิจการ #10 — บริการ/ช่าง/ติดตั้ง (พิมพ์เขียว §10 แถวที่ 10) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const SERVICE_TEMPLATE: BusinessTemplate = {
  key: "service",
  label: "บริการ / ช่าง / ติดตั้ง",
  description: "งานติดตั้ง แอร์ โซลาร์ ระบบความปลอดภัย — สำรวจหน้างาน เสนอราคา และต่อประกัน",
  pipelines: [pipeline("งานติดตั้ง", [["แจ้งความต้องการ", 10, 2], ["สำรวจหน้างาน", 30, 3, ["siteAddress"]], ["เสนอราคา", 50, 7, ["valueSatang"]], ["เจรจา", 75, 7]], "ติดตั้ง")],
  lostReasons: [...CENTRAL_LOST_REASONS],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "warranty_renew", name: "ประกันหมดใน 60 วัน: ดีลต่อประกัน", trigger: "custom.record.due", steps: [{ day: 0, channel: "TASK", title: "เปิดดีลต่อประกัน" }] },
    { key: "survey_no_quote", name: "สำรวจแล้วยังไม่เสนอ 3 วัน", trigger: "crm.deal.stage.changed", steps: [{ day: 3, channel: "TASK", title: "ส่งใบเสนอราคาหลังสำรวจ" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [{ templateKey: "asset" }],
  fields: {
    contact: [],
    company: [],
    deal: [
      { key: "siteAddress", label: "สถานที่ติดตั้ง", type: "TEXT", options: { maxLength: 200 } },
      { key: "surveyDate", label: "วันสำรวจ", type: "DATE" },
    ],
  },
};
