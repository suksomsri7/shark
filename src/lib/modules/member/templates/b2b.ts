// เทมเพลตกิจการ #16 — B2B / ขายส่ง (พิมพ์เขียว docs/modules/06-member-v2.md §10 แถวที่ 16)
//
// 🔴 ไม่มีสแตมป์ (§10: "—") · "บริษัท/เลขภาษี (ผ่าน Party)" รอบนี้เก็บเป็นฟิลด์ข้อความ (การผูก Party
//    เต็มรูปเป็นงานนอกขอบเขต M3.9) · ระดับ "Bronze/Silver/Gold ดีลเลอร์" ใช้รหัสเฉพาะกิจการนี้ (ไม่ reuse
//    รหัส gold/silver ของทั่วไป) เพื่อให้ป้าย/สิทธิประโยชน์ระดับ "ดีลเลอร์" ไม่ถูกกลืนกับระดับสมาชิกทั่วไป

import type { MemberTemplate } from "./index";

export const B2B_TEMPLATE: MemberTemplate = {
  key: "b2b",
  name: "B2B / ขายส่ง",
  description: "ลูกค้าองค์กร ตัวแทนจำหน่าย — บริษัท/เลขภาษี ผู้ติดต่อหลายคน วงเงินเครดิต เงื่อนไขชำระ พนักงานขาย และประเภทธุรกิจ",
  sections: [
    {
      key: "documents",
      label: "เอกสารสำคัญ",
      description: "ข้อมูลอ่อนไหว — เห็นได้เฉพาะผู้มีสิทธิ์",
      columns: 2,
      sensitive: true,
      fields: [
        { key: "companyTaxId", label: "บริษัท / เลขประจำตัวผู้เสียภาษี", type: "TEXT", options: { maxLength: 120 } },
        { key: "contacts", label: "ผู้ติดต่อหลายคน", type: "LONG_TEXT" },
        { key: "creditLimit", label: "วงเงินเครดิต", type: "MONEY", sensitive: true, options: { unit: "บาท", decimals: 0, min: 0 } },
        {
          key: "paymentTerms",
          label: "เงื่อนไขชำระ",
          type: "SELECT",
          options: {
            choices: [
              { value: "COD", label: "เก็บเงินปลายทาง" },
              { value: "NET30", label: "เครดิต 30 วัน" },
              { value: "NET60", label: "เครดิต 60 วัน" },
              { value: "PREPAID", label: "ชำระล่วงหน้า" },
            ],
          },
        },
        { key: "salesRepId", label: "พนักงานขาย", type: "LOOKUP", options: { target: "EMPLOYEE" } },
        { key: "businessType", label: "ประเภทธุรกิจ", type: "TEXT", options: { maxLength: 80 } },
      ],
    },
  ],
  tiers: [
    { key: "bronze_dealer", label: "ตัวแทนจำหน่าย Bronze", color: "SLATE", description: "ราคาขั้นตัวแทนระดับเริ่มต้น — ยอดสั่งซื้อสะสม 12 เดือน ตั้งแต่ 50,000 บาทขึ้นไป", rule: { spentSatang: 5_000_000 } },
    {
      key: "silver_dealer",
      label: "ตัวแทนจำหน่าย Silver",
      color: "BLUE",
      description: "ราคาขั้นตัวแทนระดับกลาง — ยอดสั่งซื้อสะสม 12 เดือน ตั้งแต่ 200,000 บาทขึ้นไป",
      rule: { spentSatang: 20_000_000 },
      benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 5 } }],
    },
    {
      key: "gold_dealer",
      label: "ตัวแทนจำหน่าย Gold",
      color: "AMBER",
      description: "ราคาขั้นตัวแทนระดับสูงสุด — ยอดสั่งซื้อสะสม 12 เดือน ตั้งแต่ 500,000 บาทขึ้นไป",
      rule: { spentSatang: 50_000_000 },
      benefits: [{ kind: "DISCOUNT_PCT", config: { pct: 10 } }],
    },
  ],
  stamps: [],
  journeys: [
    {
      key: "no_order_30",
      name: "ไม่สั่งซื้อ 30 วัน — เซลส์โทร",
      trigger: { event: "member.inactive", params: { days: 30 } },
      conditions: { groups: [] },
      actions: [{ type: "NOTIFY_STAFF", params: { title: "ลูกค้า {ชื่อ} ไม่สั่งซื้อ 30 วันแล้ว — โทรติดตาม" } }],
      description: "ไม่มีคำสั่งซื้อ 30 วัน → แจ้งพนักงานขายให้โทรติดตาม",
    },
    {
      key: "near_next_tier",
      name: "ยอดสะสมใกล้ระดับถัดไป — แจ้งเซลส์",
      presetKey: "at_risk",
      description: "ใกล้เกณฑ์ระดับดีลเลอร์ถัดไป → แจ้งพนักงานขายให้ติดตาม",
    },
  ],
};
