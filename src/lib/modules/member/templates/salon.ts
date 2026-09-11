// เทมเพลตกิจการ #8 — ซาลอน / สปา (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 8)

import type { MemberTemplate } from "./index";

export const SALON_TEMPLATE: MemberTemplate = {
  key: "salon",
  name: "ซาลอน / สปา",
  description: "ร้านทำผม สปา นวด — ช่างประจำ สูตรสี/ทรีตเมนต์ล่าสุด แพ้สารเคมี แรงกดที่ชอบ และครั้งล่าสุด",
  sections: [
    {
      key: "health",
      label: "สุขภาพ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 2,
      sensitive: true,
      fields: [
        { key: "stylistId", label: "ช่างประจำ", type: "LOOKUP", options: { target: "EMPLOYEE" } },
        { key: "lastFormula", label: "สูตรสี / ทรีตเมนต์ล่าสุด", type: "LONG_TEXT" },
        { key: "chemicalAllergy", label: "แพ้สารเคมี", type: "LONG_TEXT", sensitive: true, trackHistory: true },
        {
          key: "pressurePref",
          label: "แรงกดที่ชอบ",
          type: "SELECT",
          options: {
            choices: [
              { value: "LIGHT", label: "เบา" },
              { value: "MEDIUM", label: "ปานกลาง" },
              { value: "FIRM", label: "แน่น" },
            ],
          },
        },
        { key: "lastServiceAt", label: "ครั้งล่าสุด", type: "DATE", filterable: true },
      ],
    },
  ],
  tiers: [
    {
      key: "gold",
      label: "Gold",
      color: "AMBER",
      description: "จองคิวช่างประจำได้ก่อนคนทั่วไป",
      benefits: [{ kind: "PRIORITY_BOOKING", config: { daysAhead: 3 } }],
    },
    { key: "silver", label: "Silver", color: "BLUE", description: "ส่วนลดทรีตเมนต์ 5%", benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 5 } }] },
  ],
  stamps: [
    {
      key: "massage10",
      name: "นวดครบ 10 ครั้งฟรี 1",
      slots: 10,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "นวดฟรี 1 ครั้ง" },
      description: "ใช้บริการนวด/ทรีตเมนต์ครบ 10 ครั้ง รับฟรี 1 ครั้ง",
    },
  ],
  journeys: [
    {
      key: "rebook_5weeks",
      name: "5 สัปดาห์หลังตัดผม — นัดรอบใหม่",
      trigger: { event: "member.inactive", params: { days: 35 } },
      conditions: { groups: [] },
      actions: [{ type: "SEND_LINE", params: { template: "คุณ {ชื่อ} คะ ได้เวลานัดรอบใหม่แล้วนะคะ สะดวกวันไหนบอกได้เลยค่ะ" } }],
      description: "5 สัปดาห์หลังใช้บริการ → ชวนนัดรอบใหม่",
    },
  ],
};
