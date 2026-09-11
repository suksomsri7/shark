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
  // M3.9 (§10 ท้ายตาราง) — ระดับ 4 ขั้นมาตรฐาน · สแตมป์ "ซื้อครบ 10 ครั้ง" · journey หลัก 6 เส้น
  // 🔴 4 ระดับนี้คือระดับมาตรฐานที่ทุกร้านมีอยู่แล้ว (`member-backfill-tiers.mts`) — apply แล้วไม่สร้างซ้ำ
  tiers: [
    { key: "member", label: "สมาชิก", color: "SLATE", description: "ระดับเริ่มต้นของทุกคนที่สมัคร" },
    { key: "silver", label: "Silver", color: "BLUE", description: "ระดับถัดจากสมาชิกทั่วไป" },
    { key: "gold", label: "Gold", color: "AMBER", description: "ลูกค้าประจำที่ใช้จ่าย/มาบ่อย" },
    { key: "platinum", label: "Platinum", color: "PURPLE", description: "ลูกค้าชั้นสูงสุด" },
  ],
  stamps: [
    {
      key: "buy10",
      name: "ซื้อครบ 10 ครั้ง",
      slots: 10,
      ruleKind: "PER_SALE_MIN",
      rewardKind: "DISCOUNT_NEXT",
      rewardConfig: { pct: 10 },
      description: "ซื้อ/ใช้บริการครบ 10 ครั้ง รับส่วนลดครั้งถัดไป",
    },
  ],
  // 🔴 อ้าง presetKey จริงของ JOURNEY_PRESETS (M3.3): birthday · new_member · inactive · at_risk · review
  //    "แต้มใกล้หมด" ไม่มี preset สำเร็จรูป (M3.3 ไม่มี preset ชื่อนี้) ⇒ นิยามเองผ่าน trigger `point.expiring`
  //    (ดู wo-notes/member-M3.9.md §ข้อแย้ง — ชื่อ preset ในหัวข้อสอบ inactive_60/tier_at_risk/review_request/
  //    points_expiring ไม่ตรงกับ key จริงของ M3.3 ⇒ แม็ปเข้ากับ key จริงแทน ไม่แก้ preset ของ M3.3)
  journeys: [
    { key: "birthday", name: "วันเกิดสมาชิก", presetKey: "birthday", description: "ส่งของขวัญก่อนวันเกิด 7 วัน" },
    { key: "new_member", name: "ต้อนรับสมาชิกใหม่", presetKey: "new_member", description: "ทักทาย + ตามอีก 7/30 วัน" },
    { key: "inactive_60", name: "หายไป 60 วัน — ดึงกลับ", presetKey: "inactive", description: "ไม่ซื้อ/ไม่จอง 60 วัน" },
    { key: "tier_at_risk", name: "ใกล้หลุดระดับ — เตือนล่วงหน้า", presetKey: "at_risk", description: "ยอดยังไม่ถึงเกณฑ์คงระดับ" },
    { key: "review_request", name: "หลังใช้บริการ — ขอรีวิว", presetKey: "review", description: "ปิดบิลแล้วรอ 1 วันค่อยขอรีวิว" },
    {
      key: "points_expiring",
      name: "แต้มใกล้หมดอายุ — เตือนให้ใช้",
      trigger: { event: "point.expiring" },
      conditions: { groups: [] },
      actions: [{ type: "SEND_LINE", params: { template: "แต้มของคุณ {ชื่อ} ใกล้หมดอายุแล้ว รีบใช้ก่อนหมดนะคะ" } }],
      description: "แต้มใกล้หมดอายุ → เตือนทาง LINE ให้รีบใช้",
    },
  ],
};
