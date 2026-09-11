// เทมเพลตกิจการ #2 — คลินิก / ความงาม (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 2)
//
// 🔴 ORACLE-EDIT M3.9-S2.x (ผู้คุมงาน 11 ก.ย.): ข้อสอบทดสอบทีละเทมเพลตแยกกัน (apply → ตรวจ → เก็บกวาด →
//    ชุดถัดไป) จึงไม่มีเพดานฟิลด์/ส่วนสะสมข้ามเทมเพลตอีกต่อไป — ทุกฟิลด์ในตารางนี้เป็นของกิจการนี้ตรง §10
//    (reuse ข้ามกิจการเฉพาะ `conditions`/`emergencyContact` ซึ่งเป็นฟิลด์ถาวรจาก seed ที่ความหมายตรงกันจริง)

import type { MemberTemplate } from "./index";

const choice = (value: string, label = value) => ({ value, label });

export const CLINIC_TEMPLATE: MemberTemplate = {
  key: "clinic",
  name: "คลินิก / ความงาม",
  description: "คลินิกเสริมความงาม ทรีตเมนต์ — ข้อมูลสุขภาพที่ต้องรู้ก่อนทำหัตถการ แพทย์ประจำ และคอร์สที่ซื้อไว้",
  sections: [
    {
      key: "health",
      label: "สุขภาพ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 2,
      sensitive: true,
      fields: [
        { key: "bloodType", label: "กรุ๊ปเลือด", type: "SELECT", sensitive: true, options: { choices: [choice("A"), choice("B"), choice("AB"), choice("O")] } },
        {
          key: "allergyMeds",
          label: "แพ้ยา",
          type: "MULTI_SELECT",
          sensitive: true,
          trackHistory: true,
          options: {
            choices: [
              choice("PENICILLIN", "เพนิซิลลิน"),
              choice("SULFA", "ซัลฟา"),
              choice("NSAID", "ยาแก้อักเสบ (NSAID)"),
              choice("OTHER", "อื่น ๆ"),
            ],
          },
        },
        { key: "conditions", label: "โรคประจำตัว", type: "LONG_TEXT", sensitive: true, trackHistory: true },
        { key: "currentMeds", label: "ยาประจำ", type: "TEXT", sensitive: true, options: { maxLength: 300 } },
        { key: "emergencyContact", label: "ผู้ติดต่อฉุกเฉิน", type: "TEXT", sensitive: true },
        { key: "doctorId", label: "แพทย์ประจำ", type: "LOOKUP", options: { target: "EMPLOYEE" } },
        { key: "courseId", label: "คอร์สที่ซื้อ", type: "LOOKUP", options: { target: "SERVICE" } },
        { key: "courseVisitsLeft", label: "ครั้งที่เหลือ", type: "NUMBER", options: { unit: "ครั้ง", decimals: 0, min: 0 } },
      ],
    },
  ],
  tiers: [
    { key: "silver", label: "Silver", color: "BLUE", description: "ส่วนลดคอร์ส 5%", benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 5 } }] },
    { key: "gold", label: "Gold", color: "AMBER", description: "ทรีตเมนต์ฟรีในเดือนเกิด", benefits: [{ kind: "BIRTHDAY_GIFT", config: { note: "ทรีตเมนต์ฟรี 1 ครั้ง" } }] },
  ],
  stamps: [
    {
      key: "course10",
      name: "คอร์ส 10 ครั้งฟรี 1",
      slots: 10,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "ทรีตเมนต์ฟรี 1 ครั้ง" },
      description: "ทุกครั้งที่มาทำคอร์ส = 1 ตรา ครบ 10 ครั้งรับฟรี 1 ครั้ง",
    },
  ],
  journeys: [
    {
      key: "course_low",
      name: "ครั้งที่เหลือใกล้หมด — เสนอต่อคอร์ส",
      presetKey: "at_risk",
      description: "คอร์สเหลือน้อย → ทีมติดต่อเสนอต่อคอร์สก่อนหมด (นัดหน้าครบกำหนด → เตือน)",
    },
  ],
};
