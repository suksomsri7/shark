// เทมเพลตกิจการ #2 — คลินิก/ความงาม (พิมพ์เขียว §10 แถวที่ 2) · ข้อมูลล้วน (ไม่แตะ prisma/next)
// 🔴 ไม่มีฟิลด์ข้อมูลการรักษา/อาการ (ข้อมูลสุขภาพอยู่ในระบบคลินิกที่มีสิทธิ์ของตัวเอง — หนี้ crm-C1.1)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, choices, pipeline } from "./central";

export const CLINIC_TEMPLATE: BusinessTemplate = {
  key: "clinic",
  label: "คลินิก / ความงาม",
  description: "คลินิกความงาม สปา ทันตกรรมเสริมความงาม — ขายคอร์ส/แพ็กเกจหลังปรึกษา",
  pipelines: [
    pipeline("ขายคอร์ส", [["สอบถาม", 10, 2], ["ปรึกษา", 30, 3], ["เสนอคอร์ส", 55, 5, ["valueSatang"]], ["ตัดสินใจ", 75, 7]], "ชนะ"),
    pipeline("ตรวจสุขภาพองค์กร", [["ติดต่อองค์กร", 15, 7], ["เสนอแพ็กเกจ", 45, 10, ["valueSatang"]], ["เจรจา", 70, 14]], "เซ็นสัญญา"),
  ],
  lostReasons: [...CENTRAL_LOST_REASONS],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "consult_no_buy", name: "ปรึกษาแล้วยังไม่ซื้อ 7 วัน", trigger: "crm.activity.completed", steps: [{ day: 7, channel: "LINE", title: "ถามว่ายังสนใจคอร์สที่ปรึกษาไว้ไหม" }, { day: 10, channel: "TASK", title: "โทรเสนอโปรโมชันคอร์ส" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    {
      key: "course_package",
      label: "คอร์ส/แพ็กเกจที่ซื้อ",
      labelPlural: "คอร์ส/แพ็กเกจที่ซื้อ",
      parentType: "CONTACT",
      titleFieldKey: "courseName",
      sections: [
        {
          key: "course",
          label: "ข้อมูลคอร์ส",
          fields: [
            { key: "courseName", label: "ชื่อคอร์ส/แพ็กเกจ", type: "TEXT", options: { maxLength: 120 } },
            { key: "sessions", label: "จำนวนครั้ง", type: "NUMBER", options: { unit: "ครั้ง", decimals: 0, min: 1 } },
            { key: "sessionsUsed", label: "ใช้ไปแล้ว", type: "NUMBER", options: { unit: "ครั้ง", decimals: 0, min: 0 } },
            { key: "boughtAt", label: "วันที่ซื้อ", type: "DATE" },
            { key: "expiresAt", label: "หมดอายุ", type: "DATE" },
          ],
        },
      ],
    },
  ],
  fields: {
    contact: [
      { key: "interest", label: "ความสนใจ", type: "SELECT", options: { choices: choices([["skin", "ผิวหน้า"], ["body", "รูปร่าง"], ["hair", "เส้นผม"], ["teeth", "ฟัน"], ["other", "อื่น ๆ"]]) } },
      { key: "budget", label: "งบประมาณ", type: "MONEY" },
    ],
    company: [],
    deal: [],
  },
};
