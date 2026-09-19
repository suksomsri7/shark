// เทมเพลตกิจการ #15 — ตัวแทน/ผู้ผลิต (B2B ทั่วไป) (พิมพ์เขียว §10 แถวที่ 15) · ข้อมูลล้วน (ไม่แตะ prisma/next)
// staleDays 7/14/21 ตามพิมพ์เขียว · วัตถุ: สัญญา (เทมเพลตวัตถุกลาง) + สินค้าที่จำหน่าย
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, choices, pipeline } from "./central";

export const B2B_TEMPLATE: BusinessTemplate = {
  key: "b2b",
  label: "ตัวแทน / ผู้ผลิต (B2B ทั่วไป)",
  description: "ผู้ผลิต ผู้จัดจำหน่าย บริษัทขายองค์กร — pipeline มาตรฐาน B2B",
  pipelines: [pipeline("ขายองค์กร", [["lead", 10, 7], ["qualify", 25, 7], ["เสนอ", 50, 14, ["valueSatang", "expectedCloseAt"]], ["เจรจา", 75, 21]], "ปิด")],
  lostReasons: [...CENTRAL_LOST_REASONS],
  scoreRules: [...CENTRAL_SCORE_RULES],
  sequences: [
    { key: "nurture", name: "ดูแล lead ใหม่", trigger: "crm.contact.created", steps: [{ day: 0, channel: "EMAIL", title: "แนะนำบริษัทและสินค้า" }, { day: 3, channel: "TASK", title: "โทรคัดกรองความต้องการ" }, { day: 10, channel: "EMAIL", title: "ส่งกรณีศึกษา" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    { templateKey: "contract" },
    {
      key: "product_line",
      label: "สินค้าที่จำหน่าย",
      labelPlural: "สินค้าที่จำหน่าย",
      parentType: "COMPANY",
      titleFieldKey: "productName",
      sections: [
        {
          key: "product",
          label: "ข้อมูลสินค้า",
          fields: [
            { key: "productName", label: "สินค้า", type: "TEXT", options: { maxLength: 120 } },
            { key: "territory", label: "พื้นที่จำหน่าย", type: "TEXT", options: { maxLength: 120 } },
            { key: "yearlyVolume", label: "ปริมาณต่อปี", type: "NUMBER", options: { decimals: 0, min: 0 } },
          ],
        },
      ],
    },
  ],
  fields: {
    contact: [],
    company: [
      { key: "companySize", label: "ขนาดกิจการ", type: "SELECT", options: { choices: choices([["s", "เล็ก"], ["m", "กลาง"], ["l", "ใหญ่"]]) } },
      { key: "sector", label: "อุตสาหกรรม", type: "TEXT", options: { maxLength: 80 } },
      { key: "creditLimit", label: "วงเงินเครดิต", type: "MONEY" },
    ],
    deal: [],
  },
};
