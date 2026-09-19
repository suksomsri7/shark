// เทมเพลตกิจการ #14 — อีเวนต์/สถานที่จัดงาน (พิมพ์เขียว §10 แถวที่ 14) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const EVENT_TEMPLATE: BusinessTemplate = {
  key: "event",
  label: "อีเวนต์ / สถานที่จัดงาน",
  description: "ฮอลล์ สถานที่จัดงาน ผู้จัดอีเวนต์ — ดูสถานที่ มัดจำ และจองปีหน้า",
  pipelines: [pipeline("จองงาน", [["สอบถาม", 10, 2], ["ดูสถานที่", 30, 3], ["เสนอ", 55, 7, ["valueSatang"]], ["มัดจำ", 85, 14, ["eventDate"]]], "จัดงาน")],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "date_full", label: "วันที่ต้องการเต็มแล้ว" }],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "after_event", name: "หลังงาน: ขอรีวิว + จองปีหน้า", trigger: "crm.deal.won", steps: [{ day: 2, channel: "EMAIL", title: "ขอบคุณ + ขอรีวิว" }, { day: 30, channel: "TASK", title: "ชวนจองวันสำหรับปีหน้า" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    {
      key: "event_booth",
      label: "งาน/บูธ",
      labelPlural: "งาน/บูธ",
      parentType: "DEAL",
      titleFieldKey: "eventName",
      sections: [
        {
          key: "event",
          label: "รายละเอียดงาน",
          fields: [
            { key: "eventName", label: "ชื่องาน/บูธ", type: "TEXT", options: { maxLength: 120 } },
            { key: "eventDay", label: "วันที่", type: "DATE" },
            { key: "area", label: "พื้นที่", type: "TEXT", options: { maxLength: 80 } },
            { key: "sponsor", label: "สปอนเซอร์", type: "TEXT", options: { maxLength: 120 } },
          ],
        },
      ],
    },
  ],
  fields: {
    contact: [],
    company: [],
    deal: [
      { key: "eventDate", label: "วันงาน", type: "DATE" },
      { key: "attendees", label: "จำนวนคน", type: "NUMBER", options: { unit: "คน", decimals: 0, min: 1 } },
    ],
  },
};
