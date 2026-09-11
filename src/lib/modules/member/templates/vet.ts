// เทมเพลตกิจการ #10 — คลินิกสัตว์ (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 10)
//
// 🔴 ไม่มีระดับ (§10: "—") · "สัตว์เลี้ยง (ส่วนซ้ำได้ 1–n)" รอบนี้ทำเป็นฟิลด์เดี่ยวของสัตว์ตัวหลัก
//    (custom object ที่รองรับหลายตัวจริงเป็นงานรอบหน้าตามที่ §10 ระบุไว้)

import type { MemberTemplate } from "./index";

export const VET_TEMPLATE: MemberTemplate = {
  key: "vet",
  name: "คลินิกสัตว์",
  description: "คลินิกรักษาสัตว์ / อาบน้ำตัดขน — ชื่อ ชนิด/พันธุ์ วันเกิด น้ำหนัก วัคซีนล่าสุด และประวัติแพ้ยาของสัตว์เลี้ยง",
  sections: [
    {
      key: "pets",
      label: "สัตว์เลี้ยง",
      description: "ข้อมูลสัตว์เลี้ยงของสมาชิก",
      columns: 2,
      fields: [
        { key: "petName", label: "ชื่อสัตว์เลี้ยง", type: "TEXT", options: { maxLength: 60 } },
        {
          key: "petSpecies",
          label: "ชนิด / พันธุ์",
          type: "SELECT",
          options: {
            choices: [
              { value: "DOG", label: "สุนัข" },
              { value: "CAT", label: "แมว" },
              { value: "BIRD", label: "นก" },
              { value: "OTHER", label: "อื่น ๆ" },
            ],
          },
        },
        { key: "petBirthDate", label: "วันเกิดสัตว์เลี้ยง", type: "DATE" },
        { key: "petWeight", label: "น้ำหนัก", type: "NUMBER", options: { unit: "กก.", decimals: 1, min: 0 } },
        { key: "petVaccineAt", label: "วัคซีนล่าสุด", type: "DATE", filterable: true },
        { key: "petAllergyMeds", label: "แพ้ยา", type: "LONG_TEXT" },
        { key: "petRecordsFile", label: "ประวัติการรักษา", type: "FILE" },
      ],
    },
  ],
  tiers: [],
  stamps: [
    {
      key: "wash10",
      name: "อาบน้ำครบ 10 ครั้งฟรี 1",
      slots: 10,
      ruleKind: "PER_VISIT",
      rewardKind: "REWARD",
      rewardConfig: { note: "อาบน้ำ-ตัดขนฟรี 1 ครั้ง" },
      description: "พาสัตว์เลี้ยงมาอาบน้ำ/ตัดขนครบ 10 ครั้ง รับฟรี 1 ครั้ง",
    },
  ],
  journeys: [
    {
      key: "owner_birthday",
      name: "วันเกิดเจ้าของ — ชวนพาสัตว์มาดูแล",
      presetKey: "birthday",
      description: "ใกล้วันเกิดของเจ้าของสัตว์เลี้ยง → ส่งของขวัญ/ส่วนลดพาสัตว์มาตรวจ (วันเกิดของตัวสัตว์เองยังไม่มีทริกเกอร์รอบเวลาในทะเบียน M3.3 — trigger วันเกิดผูกกับ `Customer.birthDate` เท่านั้น · วัคซีนครบกำหนด→นัด ก็ยังไม่มีทริกเกอร์ตามฟิลด์กำหนดเอง)",
    },
  ],
};
