// เทมเพลตกิจการ #13 — ซอฟต์แวร์/บริการรายเดือน (พิมพ์เขียว §10 แถวที่ 13) · ข้อมูลล้วน (ไม่แตะ prisma/next)
import type { BusinessTemplate } from "./types";
import { CENTRAL_LOST_REASONS, CENTRAL_QUOTE_SEQUENCE, CENTRAL_SCORE_RULES, pipeline } from "./central";

export const SAAS_TEMPLATE: BusinessTemplate = {
  key: "saas",
  label: "ซอฟต์แวร์ / บริการรายเดือน",
  description: "ซอฟต์แวร์ บริการสมัครสมาชิกรายเดือน — demo ทดลองใช้ และต่ออายุ",
  pipelines: [
    pipeline("ขายใหม่", [["lead", 10, 3], ["demo", 25, 5], ["trial", 45, 14], ["เสนอ", 70, 7, ["valueSatang"]]], "ปิดการขาย"),
    pipeline("ต่ออายุ", [["ใกล้ครบกำหนด", 50, 14], ["คุยต่ออายุ", 75, 7]], "ต่ออายุแล้ว", "RENEWAL"),
  ],
  lostReasons: [...CENTRAL_LOST_REASONS, { key: "missing_feature", label: "ฟีเจอร์ไม่ครบตามที่ต้องการ" }],
  scoreRules: [...CENTRAL_SCORE_RULES, { key: "trial_active", label: "ใช้งานช่วงทดลองต่อเนื่อง", event: "crm.web.visit", points: 3, maxPerDay: 1 }],
  sequences: [
    { key: "trial_ending", name: "trial หมดใน 3 วัน", trigger: "custom.record.due", steps: [{ day: 0, channel: "EMAIL", title: "สรุปสิ่งที่ทำได้ระหว่างทดลอง + ราคา" }, { day: 2, channel: "TASK", title: "โทรช่วยตัดสินใจก่อน trial หมด" }] },
    { key: "renewal_30d", name: "ต่ออายุใน 30 วัน", trigger: "custom.record.due", steps: [{ day: 0, channel: "TASK", title: "เปิดดีลต่ออายุ" }] },
    CENTRAL_QUOTE_SEQUENCE,
  ],
  objects: [
    {
      key: "subscription",
      label: "สัญญา/แผนที่ใช้",
      labelPlural: "สัญญา/แผนที่ใช้",
      parentType: "COMPANY",
      titleFieldKey: "planName",
      sections: [
        {
          key: "plan",
          label: "ข้อมูลแผน",
          fields: [
            { key: "planName", label: "แผน", type: "TEXT", options: { maxLength: 120 } },
            { key: "startAt", label: "เริ่มใช้", type: "DATE" },
            { key: "renewAt", label: "ต่ออายุ", type: "DATE" },
            { key: "mrr", label: "รายได้ต่อเดือน (MRR)", type: "MONEY" },
          ],
        },
      ],
    },
  ],
  fields: {
    contact: [],
    company: [
      { key: "userCount", label: "จำนวนผู้ใช้", type: "NUMBER", options: { unit: "คน", decimals: 0, min: 0 } },
      { key: "mrr", label: "MRR", type: "MONEY" },
    ],
    deal: [],
  },
};
