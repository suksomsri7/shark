// เทมเพลตกิจการ #13 — สโมสรกีฬา / กอล์ฟ (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 13)

import type { MemberTemplate } from "./index";

export const SPORTSCLUB_TEMPLATE: MemberTemplate = {
  key: "sportsclub",
  name: "สโมสรกีฬา / กอล์ฟ",
  description: "สนามกอล์ฟ สโมสรกีฬา — แฮนดิแคป ทีม/กลุ่ม เวลาออกรอบที่ชอบ และล็อกเกอร์ประจำ",
  sections: [
    {
      key: "club",
      label: "ข้อมูลสโมสร",
      description: "ข้อมูลการเล่น/สมาชิกภาพของสโมสร",
      columns: 2,
      fields: [
        { key: "handicap", label: "แฮนดิแคป", type: "NUMBER", filterable: true, options: { decimals: 1 } },
        {
          key: "teamGroup",
          label: "ทีม / กลุ่ม",
          type: "SELECT",
          options: {
            choices: [
              { value: "A", label: "กลุ่ม A" },
              { value: "B", label: "กลุ่ม B" },
              { value: "C", label: "กลุ่ม C" },
            ],
          },
        },
        {
          key: "preferredTeeTime",
          label: "เวลาออกรอบที่ชอบ",
          type: "SELECT",
          options: {
            choices: [
              { value: "EARLY_MORNING", label: "เช้าตรู่" },
              { value: "MORNING", label: "เช้า" },
              { value: "AFTERNOON", label: "บ่าย" },
            ],
          },
        },
        { key: "lockerNo", label: "ล็อกเกอร์", type: "TEXT", options: { maxLength: 20 } },
      ],
    },
  ],
  tiers: [
    { key: "annual_plan", label: "สมาชิกรายปี", color: "GREEN", description: "แบบเสียเงินรายปี (MemberPlan) — จองรอบก่อนคนทั่วไป" },
    { key: "gold", label: "Gold", color: "AMBER", description: "จองรอบ/สนามได้ก่อนคนทั่วไป", benefits: [{ kind: "PRIORITY_BOOKING", config: { daysAhead: 5 } }] },
  ],
  stamps: [
    {
      key: "round10",
      name: "ออกรอบครบ 10 ครั้งฟรี 1",
      slots: 10,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "ออกรอบฟรี 1 ครั้ง" },
      description: "ออกรอบครบ 10 ครั้ง รับฟรี 1 รอบ",
    },
  ],
  journeys: [
    {
      key: "welcome",
      name: "สมาชิกใหม่ — แนะนำสโมสร",
      presetKey: "new_member",
      description: "ต้อนรับสมาชิกใหม่ + ตามอีก 7/30 วัน (แข่งขันเปิดรับ→แจ้งตามแฮนดิแคป ยังไม่มีทริกเกอร์ในทะเบียน M3.3 — ต้องมี event ประกาศแข่งขันก่อน)",
    },
  ],
};
