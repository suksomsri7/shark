// เทมเพลตกิจการ #6 — ร้านค้า/ค้าส่ง (พิมพ์เขียว §10 แถวที่ 6) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const RETAIL_TEMPLATE: BusinessTemplate = {
  key: "retail",
  label: "ร้านค้า / ค้าส่ง",
  description: "ร้านค้าส่ง ตัวแทนจำหน่าย — ส่งแคตตาล็อก เสนอราคา และติดตามการสั่งซ้ำ",
  pipelines: [pipeline("ขายส่ง", [["สอบถาม", 10, 3], ["ส่งแคตตาล็อก", 25, 5], ["เสนอราคา", 50, 7, ["valueSatang"]], ["เจรจา", 75, 7]], "สั่งซื้อ")],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "moq", label: "ยอดสั่งขั้นต่ำสูงไป" }],
  scoreRules: [...CENTRAL_SCORE_RULES, { key: "orders_3", label: "สั่งซื้อครบ 3 ครั้ง", event: "crm.deal.won", points: 15 }],
  sequences: [
    { key: "winback_60d", name: "ไม่สั่ง 60 วัน: ดึงกลับ", trigger: "crm.contact.inactive", steps: [{ day: 0, channel: "EMAIL", title: "สินค้าใหม่/โปรโมชันสำหรับลูกค้าประจำ" }, { day: 7, channel: "TASK", title: "โทรถามแผนสั่งซื้อรอบถัดไป" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    {
      key: "regular_item",
      label: "สินค้าที่ซื้อประจำ",
      labelPlural: "สินค้าที่ซื้อประจำ",
      parentType: "COMPANY",
      titleFieldKey: "itemName",
      sections: [
        {
          key: "item",
          label: "ข้อมูลสินค้า",
          fields: [
            { key: "itemName", label: "สินค้า", type: "TEXT", options: { maxLength: 120 } },
            { key: "qtyPerOrder", label: "จำนวนต่อครั้ง", type: "NUMBER", options: { decimals: 0, min: 0 } },
            { key: "lastOrderAt", label: "สั่งล่าสุด", type: "DATE" },
            { key: "agreedPrice", label: "ราคาที่ตกลง", type: "MONEY" },
          ],
        },
      ],
    },
  ],
  fields: {
    contact: [],
    company: [
      { key: "creditTermDays", label: "เครดิตเทอม", type: "NUMBER", options: { unit: "วัน", decimals: 0, min: 0 } },
      { key: "minOrder", label: "ยอดสั่งขั้นต่ำ", type: "MONEY" },
    ],
    deal: [],
  },
};
