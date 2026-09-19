// เทมเพลตกิจการ #3 — ร้านอาหาร/จัดเลี้ยง (พิมพ์เขียว §10 แถวที่ 3) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const RESTAURANT_TEMPLATE: BusinessTemplate = {
  key: "restaurant",
  label: "ร้านอาหาร / จัดเลี้ยง",
  description: "ร้านอาหารที่รับจัดเลี้ยง งานบริษัท งานแต่ง — ตั้งแต่สอบถามจนวันจัดงาน",
  pipelines: [pipeline("งานจัดเลี้ยง", [["สอบถาม", 10, 2], ["เสนอเมนู", 35, 5, ["valueSatang"]], ["ชิม/เจรจา", 60, 7], ["มัดจำ", 85, 14, ["eventDate"]]], "จัดงาน")],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "date_full", label: "วันที่ต้องการเต็มแล้ว" }],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "after_event_review", name: "หลังงาน: ขอรีวิว", trigger: "crm.deal.won", steps: [{ day: 1, channel: "LINE", title: "ขอบคุณที่ใช้บริการ ขอรีวิวงานเลี้ยง" }] },
    { key: "confirm_before_event", name: "ก่อนงาน 7 วัน: ยืนยันรายละเอียด", trigger: "crm.deal.stage.changed", steps: [{ day: 0, channel: "TASK", title: "ยืนยันเมนูและจำนวนแขกก่อนงาน 7 วัน" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    {
      key: "catering_event",
      label: "งานจัดเลี้ยง",
      labelPlural: "งานจัดเลี้ยง",
      parentType: "DEAL",
      titleFieldKey: "eventName",
      sections: [
        {
          key: "event",
          label: "รายละเอียดงาน",
          fields: [
            { key: "eventName", label: "ชื่องาน", type: "TEXT", options: { maxLength: 120 } },
            { key: "eventDay", label: "วันงาน", type: "DATE" },
            { key: "guests", label: "จำนวนแขก", type: "NUMBER", options: { unit: "คน", decimals: 0, min: 1 } },
            { key: "venue", label: "สถานที่", type: "TEXT", options: { maxLength: 200 } },
            { key: "menuNote", label: "เมนูที่เลือก", type: "LONG_TEXT" },
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
      { key: "tableCount", label: "จำนวนโต๊ะ", type: "NUMBER", options: { unit: "โต๊ะ", decimals: 0, min: 1 } },
    ],
  },
};
