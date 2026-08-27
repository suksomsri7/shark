import type { SubNavGroup } from "@/components/ui/SubNav";

// เมนูรองของโมดูลบัญชี — 8 หมวดตาม UI_STANDARD §4
// ใช้ทั้งใน account/layout.tsx (SubNav sidebar) และการ์ดหมวดในหน้า hub
export function ACCOUNT_NAV(base: string, vatRegistered: boolean): SubNavGroup[] {
  return [
    {
      title: "รายรับ",
      items: [
        { href: `${base}/docs/QUOTATION`, label: "ใบเสนอราคา" },
        { href: `${base}/docs/INVOICE`, label: "ใบแจ้งหนี้" },
        { href: `${base}/docs/RECEIPT`, label: "ใบเสร็จรับเงิน" },
        ...(vatRegistered
          ? [{ href: `${base}/docs/TAX_INVOICE`, label: "ใบกำกับภาษีขาย" }]
          : []),
        { href: `${base}/docs/BILLING_NOTE`, label: "ใบวางบิล" },
        { href: `${base}/docs/DEPOSIT_RECEIPT`, label: "รับเงินมัดจำ" },
        { href: `${base}/docs/CREDIT_NOTE`, label: "ใบลดหนี้" },
        { href: `${base}/docs/DEBIT_NOTE`, label: "ใบเพิ่มหนี้" },
      ],
    },
    {
      title: "รายจ่าย",
      items: [
        { href: `${base}/expense`, label: "บันทึกค่าใช้จ่าย" },
        { href: `${base}/purchase`, label: "บันทึกซื้อสินค้า" },
        { href: `${base}/po`, label: "ใบสั่งซื้อ" },
        { href: `${base}/asset-buy`, label: "ซื้อสินทรัพย์" },
      ],
    },
    {
      title: "ผู้ติดต่อ",
      items: [{ href: `${base}/contacts`, label: "ลูกค้าและผู้ขาย" }],
    },
    {
      title: "สินค้า",
      items: [
        { href: `${base}/products`, label: "สินค้า/บริการ" },
        { href: `${base}/goods-issue`, label: "เบิกสินค้า" },
        { href: `${base}/assets`, label: "ทะเบียนสินทรัพย์" },
      ],
    },
    {
      title: "การเงิน",
      items: [
        { href: `${base}/finance`, label: "บัญชีเงิน (เงินสด/ธนาคาร)" },
        { href: `${base}/cheque`, label: "ทะเบียนเช็ค (รับ/จ่าย)" },
        { href: `${base}/wht`, label: "หัก ณ ที่จ่าย (50 ทวิ)" },
        { href: `${base}/tax`, label: "ภาษี (ภ.พ.30 / ภ.ง.ด.)" },
      ],
    },
    {
      title: "บัญชี",
      items: [
        { href: `${base}/journal`, label: "สมุดรายวัน" },
        { href: `${base}/ledger`, label: "บัญชีแยกประเภท" },
        { href: `${base}/accounts`, label: "ผังบัญชี" },
        { href: `${base}/periods`, label: "ปิดงวดบัญชี" },
      ],
    },
    {
      title: "เอกสาร",
      items: [
        { href: `${base}/reports`, label: "งบการเงิน" },
        { href: `${base}/aging`, label: "ลูกหนี้-เจ้าหนี้ค้างชำระ (Aging)" },
        { href: `${base}/documents`, label: "คลังเอกสาร" },
      ],
    },
    {
      title: "ตั้งค่า",
      items: [{ href: `${base}/settings`, label: "ข้อมูลกิจการและเอกสาร" }],
    },
  ];
}

/**
 * เมนูเดียวกันในรูปแบบ "ลิสต์แบน" สำหรับ drawer ของแอป (☰ ด้านบน)
 *
 * ทำไมต้องแปลงจากตัวเดิม ไม่พิมพ์ใหม่: เดิม drawer มีลิสต์บัญชีที่พิมพ์มือไว้ 11 รายการ
 * ซึ่ง **เพี้ยนจากเมนูจริงไปแล้ว** (ไม่มีใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ ทั้งที่เป็นของที่ใช้บ่อยสุด)
 * — บทเรียนเดียวกับลิสต์ระบบบน landing ที่เคยพิมพ์มือแล้วเพี้ยน
 * `group` ใส่เฉพาะรายการแรกของแต่ละหมวด เพื่อให้ drawer ขึ้นหัวข้อคั่นได้
 */
export function accountNavChildren(
  base: string,
  vatRegistered: boolean,
): { href: string; label: string; group?: string }[] {
  return ACCOUNT_NAV(base, vatRegistered).flatMap((g) =>
    g.items.map((it, i) => (i === 0 ? { ...it, group: g.title } : { ...it })),
  );
}

export default ACCOUNT_NAV;
