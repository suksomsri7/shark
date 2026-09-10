// เทมเพลต "ทั่วไป" — ใช้ได้ทุกกิจการ (พิมพ์เขียว docs/modules/06-member-v2.md §10 ท้ายตาราง)
// ใส่ให้ทุกร้านได้โดยไม่ชนกับเทมเพลตกิจการ (คนละ section key)

import type { MemberTemplate } from "./index";

export const GENERAL_TEMPLATE: MemberTemplate = {
  key: "general",
  name: "ทั่วไป (ใช้ได้ทุกกิจการ)",
  description: "ส่วน “ความชอบ” ที่ร้านไหนก็ใช้ได้ — สาขาที่ไปบ่อย เรื่องที่อยากได้ข่าว วันครบรอบ",
  sections: [
    {
      key: "preferences",
      label: "ความชอบ",
      description: "ใช้ทำแคมเปญ/แจ้งเตือนให้ตรงคน",
      columns: 2,
      fields: [
        { key: "favoriteBranch", label: "สาขาที่ไปบ่อย", type: "LOOKUP", options: { target: "UNIT" }, filterable: true },
        {
          key: "newsletterTopics",
          label: "เรื่องที่อยากได้ข่าว",
          type: "MULTI_SELECT",
          customerEditable: true,
          options: {
            choices: [
              { value: "PROMOTION", label: "โปรโมชั่น/ส่วนลด" },
              { value: "NEW_ITEM", label: "สินค้า/บริการใหม่" },
              { value: "EVENT", label: "กิจกรรม/อีเวนต์" },
              { value: "TIPS", label: "เกร็ดความรู้" },
            ],
          },
        },
        { key: "anniversaryDate", label: "วันครบรอบ", type: "DATE", customerEditable: true },
        {
          key: "contactTime",
          label: "เวลาที่สะดวกให้ติดต่อ",
          type: "SELECT",
          customerEditable: true,
          options: {
            choices: [
              { value: "MORNING", label: "ช่วงเช้า (9:00–12:00)" },
              { value: "AFTERNOON", label: "ช่วงบ่าย (12:00–17:00)" },
              { value: "EVENING", label: "ช่วงเย็น (17:00–20:00)" },
            ],
          },
        },
      ],
    },
  ],
  // M3.9 เติมของจริง (ระดับ 4 ขั้น · สแตมป์ "ซื้อครบ 10 ครั้ง" · journey วันเกิด/สมาชิกใหม่/หายไป 60 วัน)
  tiers: [],
  stamps: [],
  journeys: [],
};
