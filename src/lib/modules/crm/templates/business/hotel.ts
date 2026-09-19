// เทมเพลตกิจการ #5 — โรงแรม (corporate/agent) (พิมพ์เขียว §10 แถวที่ 5) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, choices, pipeline } from "./central";

export const HOTEL_TEMPLATE: BusinessTemplate = {
  key: "hotel",
  label: "โรงแรม (องค์กร/เอเจนซี่)",
  description: "โรงแรมที่ขาย corporate rate และทำสัญญากับเอเจนซี่",
  pipelines: [pipeline("สัญญาห้องพัก", [["ติดต่อ", 15, 7], ["เสนอ rate", 40, 10, ["valueSatang"]], ["เจรจา", 70, 14]], "เซ็นสัญญา")],
  lostReasons: [...CENTRAL_LOST_REASONS],
  scoreRules: [...CENTRAL_SCORE_RULES, { key: "stays_10", label: "เข้าพัก 10 ครั้ง/ปี", event: "hotel.reservation.checked_out", points: 10 }],
  sequences: [
    { key: "contract_renewal", name: "สัญญาหมดใน 60 วัน: เปิดดีลต่ออายุ", trigger: "custom.record.due", steps: [{ day: 0, channel: "TASK", title: "เปิดดีลต่ออายุสัญญา corporate rate" }, { day: 7, channel: "EMAIL", title: "ส่ง rate ปีหน้า" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    {
      key: "corporate_rate",
      label: "สัญญา corporate rate",
      labelPlural: "สัญญา corporate rate",
      parentType: "COMPANY",
      titleFieldKey: "contractName",
      sections: [
        {
          key: "rate",
          label: "ข้อมูลสัญญา",
          fields: [
            { key: "contractName", label: "ชื่อสัญญา", type: "TEXT", options: { maxLength: 120 } },
            { key: "startAt", label: "เริ่ม", type: "DATE" },
            { key: "endAt", label: "สิ้นสุด", type: "DATE" },
            { key: "rate", label: "ราคาต่อคืน", type: "MONEY" },
            { key: "roomType", label: "ประเภทห้อง", type: "TEXT", options: { maxLength: 80 } },
          ],
        },
      ],
    },
  ],
  fields: {
    contact: [],
    company: [
      { key: "accountType", label: "ประเภทลูกค้า", type: "SELECT", options: { choices: choices([["corporate", "องค์กร"], ["agent", "เอเจนซี่"], ["ota", "OTA"]]) } },
      { key: "roomQuota", label: "โควตาห้อง", type: "NUMBER", options: { unit: "ห้อง", decimals: 0, min: 0 } },
    ],
    deal: [],
  },
};
