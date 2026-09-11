// เทมเพลตกิจการ #4 — ร้านอาหาร / คาเฟ่ (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 4)

import type { MemberTemplate } from "./index";

export const RESTAURANT_TEMPLATE: MemberTemplate = {
  key: "restaurant",
  name: "ร้านอาหาร / คาเฟ่",
  description: "ร้านอาหาร คาเฟ่ — แพ้อาหาร ข้อจำกัดการกิน โต๊ะ/เมนูโปรด และวันครบรอบ สำหรับต้อนรับลูกค้าประจำให้ถูกใจ",
  sections: [
    {
      key: "preferences",
      label: "ความชอบ",
      description: "ใช้ทำแคมเปญ/แจ้งเตือนให้ตรงคน",
      columns: 2,
      fields: [
        {
          key: "allergyFoods",
          label: "แพ้อาหาร",
          type: "MULTI_SELECT",
          options: {
            choices: [
              { value: "NUTS", label: "ถั่ว" },
              { value: "SEAFOOD", label: "อาหารทะเล" },
              { value: "GLUTEN", label: "กลูเตน" },
              { value: "DAIRY", label: "นม" },
            ],
          },
        },
        {
          key: "dietaryPref",
          label: "มังสวิรัติ / ฮาลาล",
          type: "SELECT",
          options: {
            choices: [
              { value: "NONE", label: "ไม่มีข้อจำกัด" },
              { value: "VEGETARIAN", label: "มังสวิรัติ" },
              { value: "VEGAN", label: "วีแกน" },
              { value: "HALAL", label: "ฮาลาล" },
            ],
          },
        },
        { key: "favoriteTable", label: "โต๊ะโปรด", type: "TEXT", options: { maxLength: 40 } },
        { key: "favoriteMenuId", label: "เมนูโปรด", type: "LOOKUP", options: { target: "PRODUCT" } },
        { key: "anniversaryDate", label: "วันครบรอบ", type: "DATE", customerEditable: true },
      ],
    },
  ],
  tiers: [
    {
      key: "gold",
      label: "Gold",
      color: "AMBER",
      description: "ของหวานฟรีในวันเกิด · จองโต๊ะก่อนคนทั่วไป",
      benefits: [{ kind: "BIRTHDAY_GIFT", config: { note: "ของหวานฟรี 1 จาน" } }, { kind: "PRIORITY_BOOKING", config: { daysAhead: 3 } }],
    },
    { key: "silver", label: "Silver", color: "BLUE", description: "ส่วนลดเครื่องดื่ม 5%", benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 5 } }] },
  ],
  stamps: [
    {
      key: "coffee9",
      name: "กาแฟ 9 แถม 1",
      slots: 9,
      ruleKind: "PER_ITEM",
      rewardKind: "REWARD",
      rewardConfig: { note: "กาแฟฟรี 1 แก้ว" },
      description: "ซื้อกาแฟครบ 9 แก้ว รับฟรี 1 แก้ว",
    },
    {
      key: "meal10",
      name: "มื้อ 10 ลด 20%",
      slots: 10,
      ruleKind: "PER_VISIT",
      rewardKind: "DISCOUNT_NEXT",
      rewardConfig: { pct: 20 },
      description: "มาทานครบ 10 มื้อ รับส่วนลดมื้อถัดไป 20%",
    },
  ],
  journeys: [
    {
      key: "post_bill_review",
      name: "เช็กบิลแล้ว — ขอรีวิว",
      presetKey: "review",
      description: "ปิดบิลแล้วรอสักพักค่อยขอรีวิว",
    },
    {
      key: "no_visit_45",
      name: "ไม่มา 45 วัน — ดึงกลับ",
      trigger: { event: "member.inactive", params: { days: 45 } },
      conditions: { groups: [] },
      actions: [{ type: "SEND_LINE", params: { template: "คิดถึงคุณ {ชื่อ} นะคะ แวะมาทานที่ร้านกันอีกครั้งนะคะ" } }],
      description: "ไม่มาซื้อ/ทานนาน 45 วัน → ส่งข้อความชวนกลับ (วันครบรอบยังไม่มีทริกเกอร์รอบเวลาสำหรับฟิลด์กำหนดเองในทะเบียน M3.3 — ทำได้เมื่อมี trigger ใหม่)",
    },
  ],
};
