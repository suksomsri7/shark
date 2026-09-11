// เทมเพลตกิจการ #14 — ร้านซ่อม / บริการ (มือถือ/คอม/แอร์) (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 14)
//
// 🔴 ไม่มีระดับ (§10: "—") · §10 ระบุฟิลด์ไว้ 3 อย่าง — เติม `deviceType` เป็นฟิลด์ที่ 4 ให้ครบเกณฑ์ ≥ 4
//    (สอดคล้องกับชื่อกิจการเองที่ระบุ 3 ประเภทงานซ่อม: มือถือ/คอมพิวเตอร์/แอร์)

import type { MemberTemplate } from "./index";

export const REPAIR_TEMPLATE: MemberTemplate = {
  key: "repair",
  name: "ร้านซ่อม / บริการ",
  description: "ร้านซ่อมมือถือ คอมพิวเตอร์ แอร์ — ประเภทงาน รุ่น/ซีเรียลอุปกรณ์ วันประกันหมดอายุ และงานซ่อมล่าสุด",
  sections: [
    {
      key: "assets",
      label: "ทรัพย์สิน / อุปกรณ์",
      description: "ข้อมูลอุปกรณ์ของลูกค้า",
      columns: 2,
      fields: [
        {
          key: "deviceType",
          label: "ประเภทงานซ่อม",
          type: "SELECT",
          options: {
            choices: [
              { value: "PHONE", label: "มือถือ" },
              { value: "COMPUTER", label: "คอมพิวเตอร์" },
              { value: "AIRCON", label: "แอร์" },
            ],
          },
        },
        { key: "deviceModel", label: "อุปกรณ์ (รุ่น / ซีเรียล)", type: "LONG_TEXT" },
        { key: "warrantyExpiresAt", label: "ประกันหมดอายุ", type: "DATE", filterable: true },
        { key: "lastRepairNote", label: "งานซ่อมล่าสุด", type: "TEXT", options: { maxLength: 300 } },
      ],
    },
  ],
  tiers: [],
  stamps: [
    {
      key: "aircare4",
      name: "ล้างแอร์ครบ 4 ครั้งฟรี 1",
      slots: 4,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "ล้างแอร์ฟรี 1 ครั้ง" },
      description: "ล้างแอร์/บำรุงรักษาครบ 4 ครั้ง รับฟรี 1 ครั้ง",
    },
  ],
  journeys: [
    {
      key: "post_repair_review",
      name: "ซ่อมเสร็จ — ขอรีวิว",
      presetKey: "review",
      description: "ปิดบิลค่าซ่อมแล้วรอสักพักค่อยขอรีวิว (ล้างแอร์ครบ 6 เดือน→นัด ยังไม่มีทริกเกอร์รอบเวลาของฟิลด์กำหนดเองในทะเบียน M3.3)",
    },
  ],
};
