// เทมเพลตกิจการ #1 — ดำน้ำ / กีฬาทางน้ำ (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 1)
//
// 🔴 เทมเพลตเป็น "ข้อมูล" ไม่ใช่โค้ด: ร้านที่ apply แล้วแก้ป้าย/ตัวเลือกต่อได้เอง
//    และ `applyTemplate` จะไม่ทับของที่ร้านแก้ไว้ (เทียบด้วย key เท่านั้น)
// 🔴 key/label/type ของ 7 ฟิลด์แรก (dive 5 + health 2) ตรงกับชุดข้อมูล QC ของ RUN นี้
//    (`scripts/seed-member-qc.mts`) — เปลี่ยนแล้วเฉลย `member-expected.json` เพี้ยนทันที

import type { MemberTemplate } from "./index";

const choice = (value: string, label = value) => ({ value, label });

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
/** ไซซ์รองเท้าบูทดำน้ำ (ยุโรป) — ร้านแก้เป็นชุดของตัวเองได้หลัง apply */
const BOOT_SIZES = ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];

export const DIVE_TEMPLATE: MemberTemplate = {
  key: "dive",
  name: "ดำน้ำ / กีฬาทางน้ำ",
  description: "ร้านดำน้ำ ศูนย์สอน เรือทริป — เก็บใบรับรอง ประสบการณ์ ไซซ์อุปกรณ์ และข้อมูลสุขภาพที่ต้องรู้ก่อนลงน้ำ",
  sections: [
    {
      key: "dive",
      label: "ข้อมูลดำน้ำ",
      description: "ใบรับรอง ประสบการณ์",
      columns: 2,
      fields: [
        {
          key: "certLevel",
          label: "ระดับใบรับรอง",
          type: "SELECT",
          filterable: true,
          showInList: true,
          options: { choices: [choice("Open Water"), choice("Advanced"), choice("Rescue"), choice("Divemaster")] },
        },
        {
          key: "certAgency",
          label: "หน่วยงานที่ออกใบรับรอง",
          type: "SELECT",
          options: { choices: [choice("PADI"), choice("SSI"), choice("NAUI"), choice("OTHER", "อื่น ๆ")] },
        },
        { key: "certNo", label: "เลขที่ใบรับรอง", type: "TEXT", options: { maxLength: 40 } },
        { key: "diveCount", label: "จำนวนไดฟ์สะสม", type: "NUMBER", options: { unit: "ไดฟ์", decimals: 0, min: 0 } },
        { key: "lastDiveAt", label: "ไดฟ์ล่าสุด", type: "DATE", filterable: true },
        { key: "wetsuitSize", label: "ไซซ์เว็ทสูท", type: "SELECT", options: { choices: SIZES.map((s) => choice(s)) } },
        { key: "bootSize", label: "ไซซ์รองเท้าบูท", type: "SELECT", options: { choices: BOOT_SIZES.map((s) => choice(s)) } },
        { key: "insuranceNo", label: "เลขกรมธรรม์ประกันดำน้ำ", type: "TEXT", options: { maxLength: 40 } },
        { key: "insuranceExpiresAt", label: "ประกันดำน้ำหมดอายุ", type: "DATE", filterable: true },
        { key: "instructorId", label: "ครูประจำ", type: "LOOKUP", options: { target: "EMPLOYEE" } },
        { key: "medicalCertFile", label: "ใบรับรองแพทย์", type: "FILE" },
      ],
    },
    {
      key: "health",
      label: "สุขภาพ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 1,
      sensitive: true,
      fields: [
        { key: "conditions", label: "โรคประจำตัว", type: "LONG_TEXT", sensitive: true, trackHistory: true },
        { key: "emergencyContact", label: "ผู้ติดต่อฉุกเฉิน", type: "TEXT", sensitive: true },
      ],
    },
  ],
  // M3.9 เติมของจริง (ระดับ/สแตมป์/journey ของกิจการดำน้ำ) — รอบนี้ว่างไว้ตามสัญญาใบ M1.2
  tiers: [],
  stamps: [],
  journeys: [],
};
