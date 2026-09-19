// เทมเพลตกิจการ #1 — ดำน้ำ/ทัวร์ (B2B กลุ่ม) (พิมพ์เขียว docs/modules/20-crm-v2.md §10 แถวที่ 1) · ข้อมูลล้วน (ไม่แตะ prisma/next)
// 🔴 เฉลยของ oracle C1.11 S3.2: ขั้น ผู้สนใจ → คุยความต้องการ → เสนอราคา → เจรจา → มัดจำ → ชนะ (โอกาสปิดเพิ่มขึ้นทุกขั้น · ชนะ 100)
//    วัตถุ "ทริป/กรุ๊ปที่จอง" ผูกบริษัท · ฟิลด์ดีล จำนวนคน · วันที่เดินทาง · ระดับใบรับรอง · กฎคะแนนกลาง 8 · sequence ขอรีวิว+ทริปถัดไป
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, choices } from "./central";

export const DIVE_TEMPLATE: BusinessTemplate = {
  key: "dive",
  label: "ดำน้ำ / ทัวร์ (กลุ่ม B2B)",
  description: "ศูนย์ดำน้ำ เรือทริป บริษัททัวร์ที่ขายเป็นกรุ๊ป — ติดตามกรุ๊ปตั้งแต่สอบถามจนมัดจำ",
  pipelines: [
    {
      name: "ขายทริปกรุ๊ป",
      kind: "SALES",
      stages: [
        { name: "ผู้สนใจ", kind: "OPEN", probability: 10, staleDays: 3 },
        { name: "คุยความต้องการ", kind: "OPEN", probability: 25, staleDays: 5 },
        { name: "เสนอราคา", kind: "OPEN", probability: 45, staleDays: 7, requireFields: ["valueSatang"] },
        { name: "เจรจา", kind: "OPEN", probability: 65, staleDays: 7 },
        { name: "มัดจำ", kind: "OPEN", probability: 85, staleDays: 14, requireFields: ["paxCount", "travelDate"] },
        { name: "ชนะ", kind: "WON", probability: 100 },
        { name: "ไม่สำเร็จ", kind: "LOST", probability: 0 },
      ],
    },
  ],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "weather", label: "สภาพอากาศ/ทะเลไม่เอื้อ" }],
  scoreRules: [...CENTRAL_SCORE_RULES, { key: "certified", label: "มีใบรับรองดำน้ำแล้ว", event: "crm.deal.updated", points: 5 }],
  sequences: [
    {
      key: "trip_review_next",
      name: "หลังทริป: ขอรีวิว + ชวนทริปถัดไป",
      trigger: "crm.deal.won",
      steps: [
        { day: 1, channel: "LINE", title: "ขอบคุณที่ร่วมทริป ขอรีวิวสั้น ๆ" },
        { day: 14, channel: "EMAIL", title: "ชวนทริปถัดไปของฤดูกาล" },
        { day: 30, channel: "TASK", title: "โทรถามแผนทริปครั้งหน้า" },
      ],
    },
    { key: "deposit_reminder", name: "ก่อนเดินทาง 30 วัน: เตือนมัดจำ", trigger: "crm.deal.stage.changed", steps: [{ day: 0, channel: "TASK", title: "ตามมัดจำก่อนเดินทาง 30 วัน" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    {
      key: "trip_group",
      label: "ทริป/กรุ๊ปที่จอง",
      labelPlural: "ทริป/กรุ๊ปที่จอง",
      parentType: "COMPANY",
      titleFieldKey: "tripName",
      sections: [
        {
          key: "trip",
          label: "ข้อมูลทริป",
          fields: [
            { key: "tripName", label: "ชื่อทริป/กรุ๊ป", type: "TEXT", options: { maxLength: 120 } },
            { key: "destination", label: "จุดหมาย", type: "TEXT", options: { maxLength: 120 } },
            { key: "departDate", label: "วันออกเดินทาง", type: "DATE" },
            { key: "returnDate", label: "วันกลับ", type: "DATE" },
            { key: "pax", label: "จำนวนคน", type: "NUMBER", options: { unit: "คน", decimals: 0, min: 1 } },
            { key: "depositPaid", label: "จ่ายมัดจำแล้ว", type: "BOOLEAN" },
          ],
        },
      ],
    },
  ],
  fields: {
    contact: [{ key: "diveCert", label: "ระดับใบรับรองดำน้ำ", type: "SELECT", options: { choices: choices([["none", "ยังไม่มี"], ["ow", "Open Water"], ["aow", "Advanced"], ["rescue", "Rescue"], ["dm", "Divemaster ขึ้นไป"]]) } }],
    company: [{ key: "groupType", label: "ประเภทกรุ๊ป", type: "SELECT", options: { choices: choices([["agent", "เอเจนซี่ทัวร์"], ["corporate", "บริษัท/องค์กร"], ["club", "ชมรม/สโมสร"], ["school", "โรงเรียน/มหาวิทยาลัย"]]) } }],
    deal: [
      { key: "paxCount", label: "จำนวนคน", type: "NUMBER", options: { unit: "คน", decimals: 0, min: 1 } },
      { key: "travelDate", label: "วันที่เดินทาง", type: "DATE" },
      { key: "certLevel", label: "ระดับใบรับรองของกรุ๊ป", type: "SELECT", options: { choices: choices([["none", "ยังไม่มี/สนอร์เกิล"], ["ow", "Open Water"], ["aow", "Advanced"], ["mixed", "หลายระดับ"]]) } },
    ],
  },
};
