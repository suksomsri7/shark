// เทมเพลตกิจการ #9 — กวดวิชา / สอนพิเศษ (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 9)

import type { MemberTemplate } from "./index";

export const TUTORING_TEMPLATE: MemberTemplate = {
  key: "tutoring",
  name: "กวดวิชา / สอนพิเศษ",
  description: "โรงเรียนกวดวิชา ติวเตอร์ — ข้อมูลผู้ปกครอง โรงเรียน/ชั้น วิชาที่เรียน ครูประจำ เป้าหมายสอบ และผลสอบล่าสุด",
  sections: [
    {
      key: "family",
      label: "ผู้ปกครอง / นักเรียน",
      description: "ข้อมูลผู้ปกครองและผลการเรียน — ผลสอบเป็นข้อมูลอ่อนไหว",
      columns: 2,
      sensitive: true,
      fields: [
        { key: "guardianContact", label: "ผู้ปกครอง: ชื่อ / เบอร์ติดต่อ", type: "TEXT", options: { maxLength: 120 } },
        {
          key: "schoolGrade",
          label: "โรงเรียน / ชั้น",
          type: "SELECT",
          options: {
            choices: [
              { value: "P1_P3", label: "ประถมต้น" },
              { value: "P4_P6", label: "ประถมปลาย" },
              { value: "M1_M3", label: "มัธยมต้น" },
              { value: "M4_M6", label: "มัธยมปลาย" },
            ],
          },
        },
        {
          key: "subjects",
          label: "วิชาที่เรียน",
          type: "MULTI_SELECT",
          options: {
            choices: [
              { value: "MATH", label: "คณิตศาสตร์" },
              { value: "SCIENCE", label: "วิทยาศาสตร์" },
              { value: "ENGLISH", label: "ภาษาอังกฤษ" },
              { value: "THAI", label: "ภาษาไทย" },
            ],
          },
        },
        { key: "tutorId", label: "ครูประจำ", type: "LOOKUP", options: { target: "EMPLOYEE" } },
        {
          key: "examGoal",
          label: "เป้าหมายสอบ",
          type: "SELECT",
          options: {
            choices: [
              { value: "ONET", label: "O-NET" },
              { value: "GAT_PAT", label: "GAT/PAT" },
              { value: "TCAS", label: "TCAS" },
              { value: "ENTRANCE", label: "สอบเข้าโรงเรียน" },
            ],
          },
        },
        { key: "lastExamScore", label: "ผลสอบล่าสุด", type: "NUMBER", sensitive: true, trackHistory: true, options: { unit: "คะแนน", decimals: 0, min: 0, max: 100 } },
      ],
    },
  ],
  tiers: [
    {
      key: "family",
      label: "ครอบครัว",
      color: "GREEN",
      description: "พี่น้องที่เรียนพร้อมกันลด 10%",
      benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 10 } }],
    },
    { key: "silver", label: "Silver", color: "BLUE", description: "ส่วนลดค่าเรียนคอร์สถัดไป 5%", benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 5 } }] },
  ],
  stamps: [
    {
      key: "class20",
      name: "เข้าเรียนครบ 20 ครั้ง ได้ชั่วโมงฟรี",
      slots: 20,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "เรียนฟรี 1 ชั่วโมง" },
      description: "เข้าเรียนครบ 20 ครั้ง รับชั่วโมงเรียนฟรี",
    },
  ],
  journeys: [
    {
      key: "attendance_risk",
      name: "ขาดเรียนต่อเนื่อง — แจ้งผู้ปกครอง",
      presetKey: "at_risk",
      description: "ขาดเรียนหลายครั้ง → แจ้งทีมให้ติดต่อผู้ปกครอง (ก่อนเปิดเทอม→แพ็กเกจ และนับจำนวนขาดเรียนยังไม่มีทริกเกอร์ตรงในทะเบียน M3.3)",
    },
  ],
};
