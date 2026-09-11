// เทมเพลตกิจการ #7 — ร้านค้าปลีก / แฟชั่น (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 7)

import type { MemberTemplate } from "./index";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const SHOE_SIZES = ["36", "37", "38", "39", "40", "41", "42", "43", "44"];

export const RETAIL_TEMPLATE: MemberTemplate = {
  key: "retail",
  name: "ร้านค้าปลีก / แฟชั่น",
  description: "ร้านค้าปลีก แฟชั่น — ไซซ์เสื้อ/กางเกง/รองเท้า แบรนด์/สีที่ชอบ และที่อยู่จัดส่ง",
  sections: [
    {
      key: "preferences",
      label: "ความชอบ",
      description: "ใช้ทำแคมเปญ/แจ้งเตือนให้ตรงคน",
      columns: 2,
      fields: [
        { key: "shirtSize", label: "ไซซ์เสื้อ", type: "SELECT", options: { choices: SIZES.map((s) => ({ value: s, label: s })) } },
        { key: "pantsSize", label: "ไซซ์กางเกง", type: "SELECT", options: { choices: SIZES.map((s) => ({ value: s, label: s })) } },
        { key: "shoeSize", label: "ไซซ์รองเท้า", type: "SELECT", options: { choices: SHOE_SIZES.map((s) => ({ value: s, label: s })) } },
        {
          key: "favoriteBrands",
          label: "แบรนด์ที่ชอบ",
          type: "MULTI_SELECT",
          options: {
            choices: [
              { value: "LOCAL", label: "แบรนด์ไทย" },
              { value: "STREET", label: "สตรีทแวร์" },
              { value: "LUXURY", label: "หรู" },
              { value: "SPORT", label: "กีฬา" },
            ],
          },
        },
        { key: "favoriteColor", label: "สีที่ชอบ", type: "TEXT", options: { maxLength: 40 } },
        { key: "shippingAddresses", label: "ที่อยู่จัดส่ง (หลายที่อยู่)", type: "LONG_TEXT" },
      ],
    },
  ],
  tiers: [
    { key: "silver", label: "Silver", color: "BLUE", description: "ตัวคูณแต้ม ×1.5", benefits: [{ kind: "POINT_MULTIPLIER", config: { x: 1.5 } }] },
    { key: "platinum", label: "Platinum", color: "PURPLE", description: "ซื้อสินค้ารุ่นเฉพาะสมาชิกระดับนี้ได้ก่อนใคร" },
  ],
  stamps: [
    {
      key: "buy10_15off",
      name: "ซื้อครบ 10 ครั้งลด 15%",
      slots: 10,
      ruleKind: "PER_SALE_MIN",
      rewardKind: "DISCOUNT_NEXT",
      rewardConfig: { pct: 15 },
      description: "ซื้อครบ 10 ครั้ง รับส่วนลดครั้งถัดไป 15%",
    },
  ],
  journeys: [
    {
      key: "welcome",
      name: "สมาชิกใหม่ — แนะนำร้าน",
      presetKey: "new_member",
      description: "ต้อนรับสมาชิกใหม่ + ตามอีก 7/30 วัน (สินค้าใหม่ตรงไซซ์→แจ้ง · ตะกร้าค้าง(ออนไลน์)→เตือน ยังไม่มีทริกเกอร์ในทะเบียน M3.3 — ต้องเพิ่ม event ใหม่จากอีคอมเมิร์ซ/แคตตาล็อกก่อน)",
    },
  ],
};
