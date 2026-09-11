// เทมเพลตกิจการ #3 — ทันตกรรม (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 3)

import type { MemberTemplate } from "./index";

export const DENTAL_TEMPLATE: MemberTemplate = {
  key: "dental",
  name: "ทันตกรรม",
  description: "คลินิกทันตกรรม — ประวัติแพ้ยา โรคประจำตัว ประกัน/สิทธิ์ ทันตแพทย์ประจำ และรอบขูดหินปูน",
  sections: [
    {
      key: "health",
      label: "สุขภาพ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 2,
      sensitive: true,
      fields: [
        { key: "allergyHistory", label: "ประวัติแพ้ยา", type: "LONG_TEXT", sensitive: true, trackHistory: true },
        { key: "conditions", label: "โรคประจำตัว", type: "LONG_TEXT", sensitive: true, trackHistory: true },
        {
          key: "insuranceType",
          label: "ประกัน / สิทธิ์การรักษา",
          type: "SELECT",
          options: {
            choices: [
              { value: "SOCIAL_SECURITY", label: "ประกันสังคม" },
              { value: "PRIVATE_INSURANCE", label: "ประกันเอกชน" },
              { value: "CASH", label: "จ่ายเอง" },
              { value: "OTHER", label: "อื่น ๆ" },
            ],
          },
        },
        { key: "dentistId", label: "ทันตแพทย์ประจำ", type: "LOOKUP", options: { target: "EMPLOYEE" } },
        { key: "lastScalingAt", label: "ขูดหินปูนล่าสุด", type: "DATE", filterable: true },
      ],
    },
  ],
  tiers: [
    {
      key: "family",
      label: "ครอบครัว",
      color: "GREEN",
      description: "แพ็กเกจครอบครัว — พี่น้อง/สมาชิกครอบครัวลดค่ารักษา 10%",
      benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 10 } }],
    },
    { key: "silver", label: "Silver", color: "BLUE", description: "ส่วนลดค่าตรวจ 5%", benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 5 } }] },
  ],
  stamps: [
    {
      key: "checkup",
      name: "ตรวจฟันประจำครบ 6 ครั้ง",
      slots: 6,
      ruleKind: "PER_VISIT",
      rewardKind: "DISCOUNT_NEXT",
      rewardConfig: { pct: 20 },
      description: "ตรวจ/ทำฟันตามนัดครบ 6 ครั้ง (≈ ตรวจประจำ 2 ครั้ง/ปี เป็นเวลา 3 ปี) รับส่วนลดครั้งถัดไป 20%",
    },
  ],
  journeys: [
    {
      key: "scaling_due",
      name: "ครบ 6 เดือน — นัดขูดหินปูน",
      presetKey: "inactive",
      description: "ไม่ได้มาตรวจนาน → ชวนกลับมาตรวจ/ขูดหินปูน (ทะเบียน journey ของ M3.3 ยังไม่มีทริกเกอร์ตามฟิลด์ lastScalingAt โดยตรง จึงใช้ทริกเกอร์ 'ไม่ซื้อ/ไม่จองมานาน' แทน)",
    },
  ],
};
