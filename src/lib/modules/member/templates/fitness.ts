// เทมเพลตกิจการ #5 — ฟิตเนส / โยคะ (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 5)

import type { MemberTemplate } from "./index";

export const FITNESS_TEMPLATE: MemberTemplate = {
  key: "fitness",
  name: "ฟิตเนส / โยคะ",
  description: "สตูดิโอฟิตเนส/โยคะ — เป้าหมาย น้ำหนัก/ส่วนสูง เทรนเนอร์ประจำ แพ็กเกจ/วันหมดอายุ และใบรับรองแพทย์",
  sections: [
    {
      key: "health",
      label: "สุขภาพ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 2,
      sensitive: true,
      fields: [
        {
          key: "fitnessGoal",
          label: "เป้าหมาย",
          type: "SELECT",
          options: {
            choices: [
              { value: "WEIGHT_LOSS", label: "ลดน้ำหนัก" },
              { value: "MUSCLE", label: "เพิ่มกล้ามเนื้อ" },
              { value: "ENDURANCE", label: "เพิ่มความอึด" },
            ],
          },
        },
        { key: "bodyMetrics", label: "น้ำหนัก / ส่วนสูง (กก./ซม.)", type: "TEXT", sensitive: true, trackHistory: true, options: { maxLength: 40 } },
        { key: "trainerId", label: "เทรนเนอร์ประจำ", type: "LOOKUP", options: { target: "EMPLOYEE" } },
        { key: "packageId", label: "แพ็กเกจที่ซื้อ", type: "LOOKUP", options: { target: "SERVICE" } },
        { key: "packageExpiresAt", label: "แพ็กเกจหมดอายุ", type: "DATE", filterable: true },
        {
          key: "frequentTime",
          label: "เวลาที่มาบ่อย",
          type: "SELECT",
          options: {
            choices: [
              { value: "MORNING", label: "เช้า" },
              { value: "AFTERNOON", label: "บ่าย" },
              { value: "EVENING", label: "เย็น" },
            ],
          },
        },
        { key: "medicalCertFile", label: "ใบรับรองแพทย์", type: "FILE" },
      ],
    },
  ],
  tiers: [
    { key: "paid_plan", label: "สมาชิกแบบเสียเงิน", color: "GREEN", description: "แบบเสียเงินรายเดือน/รายปี (MemberPlan)" },
    {
      key: "platinum",
      label: "Platinum",
      color: "PURPLE",
      description: "เชิญเพื่อนเข้าคลาสฟรี 2 ครั้ง/เดือน",
    },
  ],
  stamps: [
    {
      key: "class20",
      name: "เข้าคลาสครบ 20 ครั้ง ได้ PT ฟรี 1",
      slots: 20,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "เทรนเนอร์ส่วนตัวฟรี 1 ครั้ง" },
      description: "เข้าคลาสครบ 20 ครั้ง รับเทรนเนอร์ส่วนตัวฟรี 1 ครั้ง",
    },
  ],
  journeys: [
    {
      key: "no_visit_14",
      name: "ไม่เข้ายิม 14 วัน — ทักทายชวนกลับ",
      trigger: { event: "member.inactive", params: { days: 14 } },
      conditions: { groups: [] },
      actions: [{ type: "SEND_LINE", params: { template: "คุณ {ชื่อ} คะ ไม่ได้เจอกันนานเลย แวะมาออกกำลังกายกันนะคะ" } }],
      description: "ไม่ได้เข้ามาออกกำลังกาย 14 วัน → ทักทายชวนกลับ (แพ็กเกจหมดใน 7 วัน→ต่ออายุ ยังไม่มีทริกเกอร์รอบเวลาของฟิลด์กำหนดเอง `packageExpiresAt` ในทะเบียน M3.3)",
    },
  ],
};
