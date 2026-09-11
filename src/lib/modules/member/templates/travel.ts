// เทมเพลตกิจการ #12 — ทัวร์ / ทราเวล (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 12)

import type { MemberTemplate } from "./index";

export const TRAVEL_TEMPLATE: MemberTemplate = {
  key: "travel",
  name: "ทัวร์ / ทราเวล",
  description: "บริษัททัวร์ เอเจนซี่ท่องเที่ยว — พาสปอร์ต ประเทศที่เคยไป สไตล์ทริป งบต่อทริป และความต้องการบนเครื่อง",
  sections: [
    {
      key: "documents",
      label: "เอกสารสำคัญ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 2,
      sensitive: true,
      fields: [
        { key: "passportNo", label: "เลขพาสปอร์ต", type: "TEXT", sensitive: true, options: { maxLength: 40 } },
        { key: "passportExpiresAt", label: "พาสปอร์ตหมดอายุ", type: "DATE", sensitive: true, filterable: true },
        {
          key: "countriesVisited",
          label: "ประเทศที่เคยไป",
          type: "MULTI_SELECT",
          options: {
            choices: [
              { value: "JP", label: "ญี่ปุ่น" },
              { value: "KR", label: "เกาหลีใต้" },
              { value: "EU", label: "ยุโรป" },
              { value: "US", label: "อเมริกา" },
              { value: "OTHER", label: "อื่น ๆ" },
            ],
          },
        },
        {
          key: "tripStyle",
          label: "สไตล์ทริป",
          type: "SELECT",
          options: {
            choices: [
              { value: "ADVENTURE", label: "ผจญภัย" },
              { value: "RELAX", label: "พักผ่อน" },
              { value: "CULTURE", label: "วัฒนธรรม" },
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
              { value: "FRIENDS", label: "เพื่อน" },
              { value: "SOLO", label: "คนเดียว" },
            ],
          },
        },
        { key: "tripBudget", label: "งบต่อทริป", type: "MONEY", options: { unit: "บาท", decimals: 0, min: 0 } },
        { key: "seatMealPref", label: "ที่นั่ง / อาหารบนเครื่อง", type: "TEXT", options: { maxLength: 120 } },
      ],
    },
  ],
  tiers: [
    { key: "platinum", label: "Platinum", color: "PURPLE", description: "ทริปพิเศษเฉพาะสมาชิกระดับนี้" },
    { key: "gold", label: "Gold", color: "AMBER", description: "จองทริปยอดนิยมได้ก่อนคนทั่วไป", benefits: [{ kind: "PRIORITY_BOOKING", config: { daysAhead: 7 } }] },
  ],
  stamps: [
    {
      key: "trip5",
      name: "ทริปครบ 5 ครั้งลด 10%",
      slots: 5,
      ruleKind: "PER_VISIT",
      rewardKind: "DISCOUNT_NEXT",
      rewardConfig: { pct: 10 },
      description: "เดินทางกับเราครบ 5 ทริป รับส่วนลดทริปถัดไป 10%",
    },
  ],
  journeys: [
    {
      key: "post_trip_review",
      name: "หลังทริป — ขอรีวิว + แนะนำเพื่อน",
      presetKey: "review",
      description: "จบทริปแล้วรอสักพักค่อยขอรีวิวและชวนแนะนำเพื่อน (พาสปอร์ตหมด 6 เดือน→เตือน ยังไม่มีทริกเกอร์รอบเวลาของฟิลด์กำหนดเองในทะเบียน M3.3)",
    },
  ],
};
