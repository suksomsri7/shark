// เทมเพลตกิจการ #6 — โรงแรม / รีสอร์ต (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 6)

import type { MemberTemplate } from "./index";

export const HOTEL_TEMPLATE: MemberTemplate = {
  key: "hotel",
  name: "โรงแรม / รีสอร์ต",
  description: "โรงแรม รีสอร์ต — เอกสารประจำตัว สัญชาติ ห้อง/หมอนที่ชอบ เดินทางกับใคร และบริษัทต้นสังกัด",
  sections: [
    {
      key: "documents",
      label: "เอกสารสำคัญ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 2,
      sensitive: true,
      fields: [
        { key: "passportNo", label: "เลขพาสปอร์ต / บัตรประชาชน", type: "TEXT", sensitive: true, options: { maxLength: 40 } },
        { key: "nationality", label: "สัญชาติ", type: "TEXT", sensitive: true, options: { maxLength: 60 } },
        {
          key: "roomPref",
          label: "ห้องที่ชอบ",
          type: "SELECT",
          options: {
            choices: [
              { value: "SEA_VIEW", label: "วิวทะเล" },
              { value: "POOL_VIEW", label: "วิวสระ" },
              { value: "GARDEN_VIEW", label: "วิวสวน" },
              { value: "HIGH_FLOOR", label: "ชั้นสูง" },
            ],
          },
        },
        {
          key: "pillowAllergy",
          label: "หมอน / อาการแพ้",
          type: "MULTI_SELECT",
          sensitive: true,
          options: {
            choices: [
              { value: "FEATHER", label: "แพ้ขนนก" },
              { value: "DUST", label: "แพ้ไรฝุ่น" },
              { value: "MEMORY_FOAM", label: "ขอหมอนเมมโมรี่โฟม" },
            ],
          },
        },
        {
          key: "travelWith",
          label: "เดินทางกับ",
          type: "SELECT",
          options: {
            choices: [
              { value: "FAMILY", label: "ครอบครัว" },
              { value: "COUPLE", label: "คู่รัก" },
              { value: "BUSINESS", label: "ธุรกิจ" },
              { value: "SOLO", label: "เดินทางคนเดียว" },
            ],
          },
        },
        { key: "companyName", label: "บริษัทต้นสังกัด", type: "TEXT", options: { maxLength: 120 } },
      ],
    },
  ],
  tiers: [
    { key: "gold", label: "Gold", color: "AMBER", description: "อัปเกรดห้องเมื่อมีห้องว่าง · เช็กเอาต์ช้าฟรี" },
    {
      key: "platinum",
      label: "Platinum",
      color: "PURPLE",
      description: "อัปเกรดห้องระดับสูงสุดเมื่อมีห้องว่าง · ยกเลิกฟรีไม่มีค่าปรับ",
      benefits: [{ kind: "CANCEL_FEE_DISCOUNT", config: { pct: 100 } }],
    },
  ],
  stamps: [
    {
      key: "stay5",
      name: "พักครบ 5 คืนฟรี 1 คืน",
      slots: 5,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "ห้องพักฟรี 1 คืน" },
      description: "พักครบ 5 คืน (นับต่อการเข้าพัก 1 ครั้ง) รับห้องพักฟรี 1 คืน",
    },
  ],
  journeys: [
    {
      key: "post_checkout_review",
      name: "หลังเช็กเอาต์ — ขอรีวิว",
      presetKey: "review",
      description: "เช็กเอาต์ (ปิดบิลโฟลิโอ) แล้วรอสักพักค่อยขอรีวิว",
    },
    {
      key: "yearly_return",
      name: "ครบปี — ชวนกลับมาพัก",
      trigger: { event: "member.inactive", params: { days: 365 } },
      conditions: { groups: [] },
      actions: [{ type: "SEND_LINE", params: { template: "คุณ {ชื่อ} คะ ครบปีแล้วนะคะ กลับมาพักกับเราอีกครั้งไหมคะ" } }],
      description: "ไม่ได้มาพักครบ 1 ปี → ชวนกลับมาพัก (ก่อนเข้าพัก 3 วัน→ข้อมูลเตรียมตัว ยังไม่มีทริกเกอร์ 'จองล่วงหน้า' ในทะเบียน M3.3)",
    },
  ],
};
