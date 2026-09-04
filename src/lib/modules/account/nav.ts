// เมนูโมดูลบัญชี V2 — แหล่งเดียว (single source of truth) ตาม DESIGN-SPEC-V2.md §2 (ผังเมนูฉบับสุดท้าย 9 หมวด)
// ใช้ทั้งใน:
//   - src/components/account-v2/AccountTabBar.tsx (แถบเมนู 9 หมวด + dropdown 2 ระดับ บนเดสก์ท็อป/มือถือ)
//   - src/components/account-v2/AccountBreadcrumb.tsx (breadcrumb ไล่จาก pathname)
//   - src/app/app/layout.tsx (ผ่าน accountNavChildren() → drawer ของแอป ☰)
//
// กติกาแมป status:
//   "ready" = มีหน้าจริงอยู่ใต้ src/app/app/sys/[id]/account/** วันนี้ (นับรวม route ที่ใช้ query param
//             สลับ docType/tab เดิมของ WO ก่อนหน้า เช่น po?docType=ASSET_PURCHASE_ORDER)
//   "soon"  = ยังไม่มีหน้า (จะทยอยแทนใน WO เฟส 1 เป็นต้นไป) → เมนูจาง + ป้าย "เร็ว ๆ นี้" + href:"#" aria-disabled
//             (รายการที่ยังไม่มีหน้าจริง ล่าสุดหลัง WO 2.3: ดูภาพรวม (การเงิน — WO 5.2)
//              · นำเข้า (เอกสาร/สินค้า) · กลุ่มผู้ติดต่อ · รวมผู้ติดต่อซ้ำ · การเชื่อมต่อคู่ค้า · หน่วย
//              · ใบปรับต้นทุนสินค้า (CA) · ไปที่คลังสินค้า ↗ (ต้อง lookup ระบบข้ามโมดูล — เลื่อนไป WO เชื่อมระบบ)
//              · สำรองรับ/จ่าย · โอนระหว่างช่องทาง · กระทบยอดธนาคาร · กล่องขาเข้า · AI ช่วยบันทึก (ถ่ายบิล — ยังไม่มีจุดเข้าในฟอร์ม)
//              · DBD e-Filing · ตั้งค่า/นโยบายบัญชี/สิทธิ์ผู้ใช้งาน/การเชื่อมต่อ (หน้าตั้งค่าวันนี้มีแผ่นเดียวรวมองค์กร+เอกสาร)
//              (WO 1.2 ทำ DP/CNR/DNR ให้ "ready" ไปแล้ว · WO 1.6 ทำ CN/DN/CNR/DNR สร้างตรงได้ผ่าน wizard + RPR "ready"
//               · WO 2.3 ทำ "ดูภาพรวม" รายรับ/รายจ่าย ให้ "ready" แล้ว)
//
// ไอคอน: ค่า `icon` เป็นคีย์ของ src/components/account-v2/AccountIcon.tsx (เส้นบาง stroke 1.7 ตาม mockup.html)
// **ไม่ใช่ emoji** — QC ของ WO 0.4 รอบ 2 (Fable) ตีกลับเพราะแถบเมนูใช้ emoji ซึ่ง UI_STANDARD ห้ามนอก nav/header
// ที่ไม่ใช่ icon ประจำระบบ และไม่ตรงแบบ (มาตรฐานคือเส้นเดียว currentColor)

export type AccountNavStatus = "ready" | "soon";
export type AccountNavKind = "doc" | "page";

export type AccountNavFlyoutItem = {
  label: string; // ปุ่มสร้างขึ้นต้นด้วย "+ " → AccountTabBar เรนเดอร์เป็นปุ่มดำ (ตาม SPEC §1: "+ สร้าง" ปุ่มดำ)
  href: string;
  /** คีย์ผลลัพธ์ของ accountFlyoutCounts() (service.ts) เช่น "INVOICE:awaiting" — มีก็ต่อเมื่อมีตัวนับจริงให้โชว์ (g18) */
  countKey?: string;
};

export type AccountNavItem = {
  label: string;
  href: string; // "#" เมื่อ status:"soon"
  kind: AccountNavKind;
  status: AccountNavStatus;
  /** คีย์ไอคอนเส้นบาง (AccountIcon) — แสดงในแถวระดับ 1 ของ dropdown/sheet ตาม f2/f4 */
  icon: string;
  /** ตัวชี้ QC/ทดสอบที่เสถียร — `data-testid="acc-item-<testId>"` (มักเป็นชื่อ AccountDocType จริงสำหรับ item ประเภทเอกสาร) */
  testId: string;
  /** ทางลัดสถานะ + สร้าง/ดูทั้งหมด/ล่าสุด ของเอกสารชนิดนี้ (ระดับ 2 · โชว์ก็ต่อเมื่อมีรายการ) */
  flyout?: AccountNavFlyoutItem[];
  /** เส้นคั่นเหนือรายการนี้ (จัดกลุ่มย่อยใน dropdown ระดับ 1 ตามมาตรฐาน f2/f4: เอกสาร → นำเข้า → ทางลัดอื่น) */
  sep?: boolean;
};

export type AccountNavGroup = {
  key: string;
  label: string;
  /** คีย์ไอคอนเส้นบาง (AccountIcon) ของหมวด — 18px ในแถบ/22px ในหัว sheet มือถือ */
  icon: string;
  href: string; // ปลายทางเมื่อกดตัวหมวดตรง ๆ (ไม่เปิด dropdown) — ใช้รายการ "ready" แรกของหมวดเป็นค่าเริ่มต้น
  items: AccountNavItem[];
};

type ItemOpts = {
  label: string;
  href: string;
  status: AccountNavStatus;
  icon: string;
  testId: string;
  flyout?: AccountNavFlyoutItem[];
  sep?: boolean;
};

const doc = (o: ItemOpts): AccountNavItem => ({ kind: "doc", ...o });
const page = (o: ItemOpts): AccountNavItem => ({ kind: "page", ...o });
const soon = (label: string, icon: string, testId: string, sep?: boolean): AccountNavItem => ({
  label,
  href: "#",
  kind: "page",
  status: "soon",
  icon,
  testId,
  ...(sep ? { sep: true } : {}),
});

// ผังเมนูฉบับสุดท้าย — DESIGN-SPEC-V2.md §2 (9 หมวด · ระดับ 2 = flyout)
export function ACCOUNT_NAV(base: string, vatRegistered: boolean): AccountNavGroup[] {
  return [
    // 1. หน้าหลัก — ไม่มี dropdown (คลิกพาไปหน้า hub ตรง ๆ)
    { key: "home", label: "หน้าหลัก", icon: "home", href: base, items: [] },

    // 2. รายรับ
    {
      key: "revenue",
      label: "รายรับ",
      icon: "in",
      href: `${base}/docs/INVOICE`,
      items: [
        page({ // WO 2.3: ดูภาพรวมรายรับ (§6)
          label: "ดูภาพรวม",
          href: `${base}/overview/revenue`,
          status: "ready",
          icon: "chart",
          testId: "REVENUE_OVERVIEW",
        }),
        doc({
          label: "ใบเสนอราคา",
          href: `${base}/docs/QUOTATION`,
          status: "ready",
          icon: "doc",
          testId: "QUOTATION",
          flyout: [
            { label: "+ สร้างใบเสนอราคา", href: `${base}/docs/QUOTATION/new` },
            { label: "รอตอบรับ", href: `${base}/docs/QUOTATION?tab=awaiting`, countKey: "QUOTATION:awaiting" },
            { label: "ยอมรับแล้ว", href: `${base}/docs/QUOTATION?tab=accepted`, countKey: "QUOTATION:accepted" },
            { label: "พ้นกำหนด", href: `${base}/docs/QUOTATION?tab=overdue`, countKey: "QUOTATION:overdue" },
            { label: "ดูทั้งหมด", href: `${base}/docs/QUOTATION?tab=all`, countKey: "QUOTATION:all" },
            { label: "ล่าสุด", href: `${base}/docs/QUOTATION?tab=recent` },
          ],
        }),
        doc({
          label: "ใบรับเงินมัดจำ",
          href: `${base}/docs/DEPOSIT_RECEIPT`,
          status: "ready",
          icon: "cash",
          testId: "DEPOSIT_RECEIPT",
          flyout: [
            { label: "+ สร้างใบรับเงินมัดจำ", href: `${base}/docs/DEPOSIT_RECEIPT/new` },
            { label: "รอชำระ", href: `${base}/docs/DEPOSIT_RECEIPT?tab=awaiting`, countKey: "DEPOSIT_RECEIPT:awaiting" },
            { label: "พ้นกำหนด", href: `${base}/docs/DEPOSIT_RECEIPT?tab=overdue`, countKey: "DEPOSIT_RECEIPT:overdue" },
            { label: "รอหักมัดจำ", href: `${base}/docs/DEPOSIT_RECEIPT?tab=deduct`, countKey: "DEPOSIT_RECEIPT:deduct" },
            { label: "ดูทั้งหมด", href: `${base}/docs/DEPOSIT_RECEIPT?tab=all`, countKey: "DEPOSIT_RECEIPT:all" },
            { label: "ล่าสุด", href: `${base}/docs/DEPOSIT_RECEIPT?tab=recent` },
          ],
        }),
        doc({
          label: "ใบแจ้งหนี้ (ใบส่งของ)",
          href: `${base}/docs/INVOICE`,
          status: "ready",
          icon: "file",
          testId: "INVOICE",
          flyout: [
            { label: "+ สร้างใบแจ้งหนี้", href: `${base}/docs/INVOICE/new` },
            { label: "รอชำระ", href: `${base}/docs/INVOICE?tab=awaiting`, countKey: "INVOICE:awaiting" },
            { label: "ชำระแล้ว", href: `${base}/docs/INVOICE?tab=paid`, countKey: "INVOICE:paid" },
            { label: "พ้นกำหนด", href: `${base}/docs/INVOICE?tab=overdue`, countKey: "INVOICE:overdue" },
            { label: "ดูทั้งหมด", href: `${base}/docs/INVOICE?tab=all`, countKey: "INVOICE:all" },
            { label: "ล่าสุด", href: `${base}/docs/INVOICE?tab=recent` },
          ],
        }),
        doc({
          label: "ใบเสร็จรับเงิน",
          href: `${base}/docs/RECEIPT`,
          status: "ready",
          icon: "check",
          testId: "RECEIPT",
          flyout: [
            { label: "ชำระแล้ว", href: `${base}/docs/RECEIPT?tab=paid`, countKey: "RECEIPT:paid" },
            { label: "ดูทั้งหมด", href: `${base}/docs/RECEIPT?tab=all`, countKey: "RECEIPT:all" },
            { label: "ล่าสุด", href: `${base}/docs/RECEIPT?tab=recent` },
          ],
        }),
        ...(vatRegistered
          ? [
              doc({
                label: "ใบกำกับภาษีขาย",
                href: `${base}/docs/TAX_INVOICE`,
                status: "ready" as AccountNavStatus,
                icon: "pct",
                testId: "TAX_INVOICE",
                flyout: [
                  { label: "ออกแล้ว", href: `${base}/docs/TAX_INVOICE?tab=issued`, countKey: "TAX_INVOICE:issued" },
                  { label: "ดูทั้งหมด", href: `${base}/docs/TAX_INVOICE?tab=all`, countKey: "TAX_INVOICE:all" },
                  { label: "ล่าสุด", href: `${base}/docs/TAX_INVOICE?tab=recent` },
                ],
              }),
            ]
          : []),
        doc({
          label: "ใบวางบิล",
          href: `${base}/docs/BILLING_NOTE`,
          status: "ready",
          icon: "report",
          testId: "BILLING_NOTE",
          flyout: [
            // WO 1.7: "+ สร้างใบวางบิล" = ฟอร์มพิเศษ §5.2 K (เลือกลูกค้า → ติ๊กใบแจ้งหนี้ค้างชำระ)
            { label: "+ สร้างใบวางบิล", href: `${base}/docs/BILLING_NOTE/new` },
            { label: "รอรับชำระ", href: `${base}/docs/BILLING_NOTE?tab=awaiting`, countKey: "BILLING_NOTE:awaiting" },
            { label: "เกินเวลารับชำระ", href: `${base}/docs/BILLING_NOTE?tab=overdue`, countKey: "BILLING_NOTE:overdue" },
            { label: "รับชำระแล้ว", href: `${base}/docs/BILLING_NOTE?tab=paid`, countKey: "BILLING_NOTE:paid" },
            { label: "ดูทั้งหมด", href: `${base}/docs/BILLING_NOTE?tab=all`, countKey: "BILLING_NOTE:all" },
            { label: "ล่าสุด", href: `${base}/docs/BILLING_NOTE?tab=recent` },
          ],
        }),
        doc({
          label: "ใบลดหนี้",
          href: `${base}/docs/CREDIT_NOTE`,
          status: "ready",
          icon: "in",
          testId: "CREDIT_NOTE",
          flyout: [
            { label: "+ สร้างใบลดหนี้", href: `${base}/docs/CREDIT_NOTE/new` },
            { label: "ดูทั้งหมด", href: `${base}/docs/CREDIT_NOTE?tab=all`, countKey: "CREDIT_NOTE:all" },
            { label: "ล่าสุด", href: `${base}/docs/CREDIT_NOTE?tab=recent` },
          ],
        }),
        doc({
          label: "ใบเพิ่มหนี้",
          href: `${base}/docs/DEBIT_NOTE`,
          status: "ready",
          icon: "out",
          testId: "DEBIT_NOTE",
          flyout: [
            { label: "+ สร้างใบเพิ่มหนี้", href: `${base}/docs/DEBIT_NOTE/new` },
            { label: "ดูทั้งหมด", href: `${base}/docs/DEBIT_NOTE?tab=all`, countKey: "DEBIT_NOTE:all" },
            { label: "ล่าสุด", href: `${base}/docs/DEBIT_NOTE?tab=recent` },
          ],
        }),
        { // WO 1.9: เอกสารประจำ (§0.3 ข้อ 7) — หน้าเดียวใช้ร่วมทั้ง 2 หมวด (กรองชนิดในหน้า)
          ...page({
            label: "เอกสารประจำ",
            href: `${base}/recurring`,
            status: "ready",
            icon: "clock",
            testId: "REVENUE_RECURRING",
          }),
          sep: true,
        },
        { // WO 1.8: นำเข้าเอกสารรายรับจาก CSV (§8.5)
          ...page({
            label: "นำเข้าเอกสาร",
            href: `${base}/import/documents?side=revenue`,
            status: "ready",
            icon: "import",
            testId: "REVENUE_IMPORT",
          }),
        },
        { ...page({ label: "ลิงก์ให้ลูกค้าขอใบกำกับภาษี (QR)", href: `${base}/settings`, status: "ready", icon: "qr", testId: "REVENUE_QR_LINK" }), sep: true },
      ],
    },

    // 3. รายจ่าย
    {
      key: "expense",
      label: "รายจ่าย",
      icon: "out",
      href: `${base}/expense`,
      items: [
        page({ // WO 2.3: ดูภาพรวมรายจ่าย (§6)
          label: "ดูภาพรวม",
          href: `${base}/overview/expense`,
          status: "ready",
          icon: "chart",
          testId: "EXPENSE_OVERVIEW",
        }),
        doc({
          label: "ใบสั่งซื้อ",
          href: `${base}/po`,
          status: "ready",
          icon: "truck",
          testId: "PURCHASE_ORDER",
          flyout: [
            { label: "+ สร้างใบสั่งซื้อ", href: `${base}/po/new` },
            { label: "รออนุมัติ", href: `${base}/po?tab=awaiting_approval`, countKey: "PURCHASE_ORDER:awaiting_approval" },
            { label: "อนุมัติแล้ว", href: `${base}/po?tab=approved`, countKey: "PURCHASE_ORDER:approved" },
            { label: "ดูทั้งหมด", href: `${base}/po?tab=all`, countKey: "PURCHASE_ORDER:all" },
            { label: "ล่าสุด", href: `${base}/po?tab=recent` },
          ],
        }),
        doc({ // WO 1.2
          label: "ใบจ่ายเงินมัดจำ",
          href: `${base}/deposit-payment`,
          status: "ready",
          icon: "cash",
          testId: "DEPOSIT_PAYMENT",
          flyout: [{ label: "+ สร้างใบจ่ายเงินมัดจำ", href: `${base}/deposit-payment/new` }],
        }),
        doc({
          label: "บันทึกซื้อสินค้า",
          href: `${base}/purchase`,
          status: "ready",
          icon: "box",
          testId: "PURCHASE",
          flyout: [
            { label: "+ บันทึกซื้อสินค้า", href: `${base}/purchase/new` },
            { label: "รอชำระ", href: `${base}/purchase?tab=awaiting`, countKey: "PURCHASE:awaiting" },
            { label: "ชำระแล้ว", href: `${base}/purchase?tab=paid`, countKey: "PURCHASE:paid" },
            { label: "พ้นกำหนด", href: `${base}/purchase?tab=overdue`, countKey: "PURCHASE:overdue" },
            { label: "ดูทั้งหมด", href: `${base}/purchase?tab=all`, countKey: "PURCHASE:all" },
            { label: "ล่าสุด", href: `${base}/purchase?tab=recent` },
          ],
        }),
        doc({
          label: "บันทึกค่าใช้จ่าย",
          href: `${base}/expense`,
          status: "ready",
          icon: "doc",
          testId: "EXPENSE",
          flyout: [
            { label: "+ บันทึกค่าใช้จ่าย", href: `${base}/expense/new` },
            { label: "รอชำระ", href: `${base}/expense?tab=awaiting`, countKey: "EXPENSE:awaiting" },
            { label: "ชำระแล้ว", href: `${base}/expense?tab=paid`, countKey: "EXPENSE:paid" },
            { label: "พ้นกำหนด", href: `${base}/expense?tab=overdue`, countKey: "EXPENSE:overdue" },
            { label: "ดูทั้งหมด", href: `${base}/expense?tab=all`, countKey: "EXPENSE:all" },
            { label: "ล่าสุด", href: `${base}/expense?tab=recent` },
          ],
        }),
        doc({
          label: "ใบสั่งซื้อสินทรัพย์",
          href: `${base}/po?docType=ASSET_PURCHASE_ORDER`,
          status: "ready",
          icon: "asset",
          testId: "ASSET_PURCHASE_ORDER",
          flyout: [
            { label: "+ สร้างใบสั่งซื้อสินทรัพย์", href: `${base}/asset-po/new` },
            {
              label: "รออนุมัติ",
              href: `${base}/po?docType=ASSET_PURCHASE_ORDER&tab=awaiting_approval`,
              countKey: "ASSET_PURCHASE_ORDER:awaiting_approval",
            },
            {
              label: "อนุมัติแล้ว",
              href: `${base}/po?docType=ASSET_PURCHASE_ORDER&tab=approved`,
              countKey: "ASSET_PURCHASE_ORDER:approved",
            },
            {
              label: "ดูทั้งหมด",
              href: `${base}/po?docType=ASSET_PURCHASE_ORDER&tab=all`,
              countKey: "ASSET_PURCHASE_ORDER:all",
            },
          ],
        }),
        doc({
          label: "ซื้อสินทรัพย์",
          href: `${base}/asset-buy`,
          status: "ready",
          icon: "asset",
          testId: "ASSET_PURCHASE",
          flyout: [
            { label: "+ ซื้อสินทรัพย์", href: `${base}/asset-buy/new` },
            { label: "รอชำระ", href: `${base}/asset-buy?tab=awaiting`, countKey: "ASSET_PURCHASE:awaiting" },
            { label: "พ้นกำหนด", href: `${base}/asset-buy?tab=overdue`, countKey: "ASSET_PURCHASE:overdue" },
            { label: "รับใบเสร็จแล้ว", href: `${base}/asset-buy?tab=received`, countKey: "ASSET_PURCHASE:received" },
            { label: "ดูทั้งหมด", href: `${base}/asset-buy?tab=all`, countKey: "ASSET_PURCHASE:all" },
          ],
        }),
        doc({
          label: "ใบกำกับภาษีซื้อ",
          href: `${base}/asset-buy?docType=PURCHASE_TAX_INVOICE`,
          status: "ready",
          icon: "pct",
          testId: "PURCHASE_TAX_INVOICE",
          flyout: [
            {
              label: "รอรับ",
              href: `${base}/asset-buy?docType=PURCHASE_TAX_INVOICE&tab=awaiting_receive`,
              countKey: "PURCHASE_TAX_INVOICE:awaiting_receive",
            },
            {
              label: "รับแล้ว",
              href: `${base}/asset-buy?docType=PURCHASE_TAX_INVOICE&tab=received`,
              countKey: "PURCHASE_TAX_INVOICE:received",
            },
            {
              label: "ดูทั้งหมด",
              href: `${base}/asset-buy?docType=PURCHASE_TAX_INVOICE&tab=all`,
              countKey: "PURCHASE_TAX_INVOICE:all",
            },
          ],
        }),
        doc({ // WO 1.2
          label: "รับใบลดหนี้",
          href: `${base}/credit-note-received`,
          status: "ready",
          icon: "in",
          testId: "CREDIT_NOTE_RECEIVED",
          flyout: [{ label: "+ บันทึกรับใบลดหนี้", href: `${base}/credit-note-received/new` }],
        }),
        doc({ // WO 1.2
          label: "รับใบเพิ่มหนี้",
          href: `${base}/debit-note-received`,
          status: "ready",
          icon: "out",
          testId: "DEBIT_NOTE_RECEIVED",
          flyout: [{ label: "+ บันทึกรับใบเพิ่มหนี้", href: `${base}/debit-note-received/new` }],
        }),
        doc({ // WO 1.7 — ใบรวมจ่าย (§5.2 K): เลือกผู้ขาย → ติ๊กบิลค้างจ่าย → จ่ายครั้งเดียวกระจายให้ใบลูก
          label: "ใบรวมจ่าย",
          href: `${base}/combined-payment`,
          status: "ready",
          icon: "report",
          testId: "COMBINED_PAYMENT",
          flyout: [
            { label: "+ สร้างใบรวมจ่าย", href: `${base}/combined-payment/new` },
            { label: "รอชำระ", href: `${base}/combined-payment?tab=awaiting`, countKey: "COMBINED_PAYMENT:awaiting" },
            { label: "เกินเวลาชำระ", href: `${base}/combined-payment?tab=overdue`, countKey: "COMBINED_PAYMENT:overdue" },
            { label: "ชำระแล้ว", href: `${base}/combined-payment?tab=paid`, countKey: "COMBINED_PAYMENT:paid" },
            { label: "ดูทั้งหมด", href: `${base}/combined-payment?tab=all`, countKey: "COMBINED_PAYMENT:all" },
          ],
        }),
        { // WO 1.9: เอกสารประจำ (§0.3 ข้อ 7) — หน้าเดียวกับฝั่งรายรับ
          ...page({
            label: "เอกสารประจำ",
            href: `${base}/recurring`,
            status: "ready",
            icon: "clock",
            testId: "EXPENSE_RECURRING",
          }),
          sep: true,
        },
        { // WO 1.8: นำเข้าเอกสารรายจ่ายจาก CSV (§8.5)
          ...page({
            label: "นำเข้าเอกสาร",
            href: `${base}/import/documents?side=expense`,
            status: "ready",
            icon: "import",
            testId: "EXPENSE_IMPORT",
          }),
        },
        soon("AI ช่วยบันทึก (ถ่ายบิล)", "spark", "EXPENSE_AI_SCAN"),
      ],
    },

    // 4. ผู้ติดต่อ
    {
      key: "contacts",
      label: "ผู้ติดต่อ",
      icon: "users",
      href: `${base}/contacts`,
      items: [
        page({ label: "ผู้ติดต่อ", href: `${base}/contacts`, status: "ready", icon: "users", testId: "CONTACTS" }),
        page({ // WO 3.2: ดูภาพรวมผู้ติดต่อ (§7.4)
          label: "ดูภาพรวม",
          href: `${base}/contacts/overview`,
          status: "ready",
          icon: "chart",
          testId: "CONTACTS_OVERVIEW",
        }),
        soon("กลุ่มผู้ติดต่อ", "tag", "CONTACT_GROUPS"),
        page({ // WO 3.4: รวมผู้ติดต่อซ้ำ (§7.3 · ภาพ g7)
          label: "รวมผู้ติดต่อซ้ำ",
          href: `${base}/contacts/merge`,
          status: "ready",
          icon: "copy",
          testId: "CONTACT_MERGE",
        }),
        soon("การเชื่อมต่อคู่ค้า", "link", "CONTACT_LINK"),
      ],
    },

    // 5. สินค้า
    {
      key: "products",
      label: "สินค้า",
      icon: "box",
      href: `${base}/products`,
      items: [
        page({ label: "สินค้า/บริการ", href: `${base}/products`, status: "ready", icon: "box", testId: "PRODUCTS" }),
        // WO 4.3 §8.3 — หน่วยนับ (f6-products-menu.png เรียกว่า "หน่วยนับ")
        page({ label: "หน่วยนับ", href: `${base}/units`, status: "ready", icon: "tag", testId: "UNITS" }),
        doc({
          label: "ใบเบิกสินค้า",
          href: `${base}/goods-issue`,
          status: "ready",
          icon: "truck",
          testId: "GOODS_ISSUE",
          flyout: [
            { label: "+ สร้างใบเบิกสินค้า", href: `${base}/goods-issue/new` },
            { label: "ดูทั้งหมด", href: `${base}/goods-issue` },
          ],
        }),
        doc({ // WO 1.6 — RPR wizard 2 ขั้น (§5.2 J): เลือก PRR → กรอกจำนวนที่คืน (ยังไม่มีหน้ารายการแยก — ลิงก์ตรงไป wizard)
          label: "ใบส่งคืนเบิกสินค้า",
          href: `${base}/goods-issue/return/new`,
          status: "ready",
          icon: "upload",
          testId: "GOODS_ISSUE_RETURN",
          flyout: [{ label: "+ สร้างใบส่งคืนเบิกสินค้า", href: `${base}/goods-issue/return/new` }],
        }),
        // WO 4.3 §8.4 — ใบปรับต้นทุนสินค้า (CA)
        doc({
          label: "ใบปรับต้นทุนสินค้า",
          href: `${base}/cost-adjustment`,
          status: "ready",
          icon: "pct",
          testId: "COST_ADJUSTMENT",
          flyout: [
            { label: "+ สร้างใบปรับต้นทุนสินค้า", href: `${base}/cost-adjustment/new` },
            { label: "ดูทั้งหมด", href: `${base}/cost-adjustment` },
          ],
        }),
        { // WO 1.8: นำเข้าสินค้า/บริการจาก CSV (§8.5)
          ...page({
            label: "นำเข้าสินค้า",
            href: `${base}/import/products`,
            status: "ready",
            icon: "import",
            testId: "PRODUCTS_IMPORT",
          }),
          sep: true,
        },
        soon("ไปที่คลังสินค้า ↗", "box", "INVENTORY_LINK"),
      ],
    },

    // 6. การเงิน
    {
      key: "finance",
      label: "การเงิน",
      icon: "wallet",
      href: `${base}/finance`,
      items: [
        // WO 5.2: ทำแล้ว (หน้าแยก /finance/overview + /finance/petty-cash) → เปลี่ยนจาก soon เป็น ready
        page({ label: "ดูภาพรวม", href: `${base}/finance/overview`, status: "ready", icon: "chart", testId: "FINANCE_OVERVIEW" }),
        page({ label: "เงินสด/ธนาคาร/e-Wallet", href: `${base}/finance`, status: "ready", icon: "bank", testId: "FINANCE" }),
        page({ label: "สำรองรับ/จ่าย", href: `${base}/finance/petty-cash`, status: "ready", icon: "pig", testId: "PETTY_CASH" }),
        page({ label: "เช็ครับ", href: `${base}/cheque?dir=IN`, status: "ready", icon: "cheque", testId: "CHEQUE_IN" }),
        page({ label: "เช็คจ่าย", href: `${base}/cheque?dir=OUT`, status: "ready", icon: "cheque", testId: "CHEQUE_OUT" }),
        page({ label: "ภาษีถูกหัก ณ ที่จ่าย", href: `${base}/wht?tab=credit`, status: "ready", icon: "pct", testId: "WHT_CREDIT" }),
        page({ label: "ภาษีหัก ณ ที่จ่าย", href: `${base}/wht?tab=deduct`, status: "ready", icon: "pct", testId: "WHT_DEDUCT" }),
        // WO 5.1: ทำแล้ว (modal บนหน้าเงินสด/ธนาคาร/e-Wallet — ไม่ใช่หน้าแยก) → เปลี่ยนจาก soon เป็น ready
        page({ label: "โอนระหว่างช่องทาง", href: `${base}/finance?transfer=1`, status: "ready", icon: "swap", testId: "FINANCE_TRANSFER", sep: true }),
        // WO 5.3: หน้าจริงพร้อมใช้แล้ว (§10.2 · g10)
        page({ label: "กระทบยอดธนาคาร", href: `${base}/finance/reconcile`, status: "ready", icon: "bank", testId: "BANK_RECONCILE" }),
      ],
    },

    // 7. บัญชี
    {
      key: "accounting",
      label: "บัญชี",
      icon: "book",
      href: `${base}/journal`,
      items: [
        page({ label: "ผังบัญชี", href: `${base}/accounts`, status: "ready", icon: "tree", testId: "CHART_OF_ACCOUNTS" }),
        page({
          label: "สมุดรายวัน", // WO 6.1: เดิม "บัญชีรายวัน" — เฟรม f8-chart-of-accounts-menu.png เขียน "สมุดรายวัน"
          href: `${base}/journal`,
          status: "ready",
          icon: "book",
          testId: "JOURNAL",
          flyout: [
            { label: "+ สร้างสมุดรายวัน", href: `${base}/journal/new` },
            { label: "ทั้งหมด", href: `${base}/journal?book=ALL` },
            { label: "ซื้อ", href: `${base}/journal?book=PURCHASES` },
            { label: "ขาย", href: `${base}/journal?book=SALES` },
            { label: "จ่าย", href: `${base}/journal?book=PAYMENTS` },
            { label: "รับ", href: `${base}/journal?book=RECEIPTS` },
            { label: "ทั่วไป", href: `${base}/journal?book=GENERAL` },
            { label: "ล่าสุด", href: `${base}/journal?book=recent` },
          ],
        }),
        page({ label: "บัญชีแยกประเภท", href: `${base}/ledger`, status: "ready", icon: "list", testId: "LEDGER" }),
        page({ label: "งบทดลอง", href: `${base}/reports/trial-balance`, status: "ready", icon: "report", testId: "TRIAL_BALANCE" }),
        page({ label: "งบแสดงฐานะการเงิน", href: `${base}/reports/balance-sheet`, status: "ready", icon: "report", testId: "BALANCE_SHEET" }),
        page({ label: "งบกำไรขาดทุน", href: `${base}/reports/profit-loss`, status: "ready", icon: "chart", testId: "PROFIT_LOSS" }),
        page({ label: "งบกระแสเงินสด", href: `${base}/reports/cash-flow`, status: "ready", icon: "chart", testId: "CASH_FLOW" }),
        { ...page({ label: "ภ.พ.30", href: `${base}/reports/pp30`, status: "ready", icon: "pct", testId: "PP30" }), sep: true },
        page({ label: "ภ.ง.ด.3/53", href: `${base}/tax`, status: "ready", icon: "pct", testId: "WHT_FILING" }),
        // WO 6.1: ลำดับ/ป้าย 3 รายการท้ายให้ตรง f8-chart-of-accounts-menu.png (ปิดงวด → ทะเบียนสินทรัพย์ → อายุหนี้)
        { ...page({ label: "ปิดงวดบัญชี", href: `${base}/periods`, status: "ready", icon: "lock", testId: "PERIOD_CLOSE" }), sep: true },
        page({ label: "ทะเบียนสินทรัพย์", href: `${base}/assets`, status: "ready", icon: "asset", testId: "ASSETS" }),
        page({ label: "อายุหนี้ (ลูกหนี้-เจ้าหนี้)", href: `${base}/aging`, status: "ready", icon: "clock", testId: "AGING" }),
        soon("DBD e-Filing", "upload", "DBD_EFILING") // f8-menu เขียน "ยื่นงบ DBD e-Filing" แต่ SPEC §2 (แหล่งจริงที่ qc-acc-v2-nav ตรวจ) เขียน "DBD e-Filing",
      ],
    },

    // 8. คลังเอกสาร
    {
      key: "documents",
      label: "คลังเอกสาร",
      icon: "folder",
      href: `${base}/documents`,
      items: [
        soon("กล่องขาเข้า", "mail", "INBOX"),
        page({ label: "คลังเอกสาร", href: `${base}/documents`, status: "ready", icon: "folder", testId: "DOCUMENTS" }),
      ],
    },

    // 9. ตั้งค่า
    {
      key: "settings",
      label: "ตั้งค่า",
      icon: "gear",
      href: `${base}/settings`,
      items: [
        page({ label: "องค์กร", href: `${base}/settings`, status: "ready", icon: "shop", testId: "SETTINGS_ORG" }),
        page({ label: "เอกสาร", href: `${base}/settings`, status: "ready", icon: "doc", testId: "SETTINGS_DOC" }),
        soon("นโยบายบัญชี", "lock", "SETTINGS_POLICY"),
        soon("สิทธิ์ผู้ใช้งาน", "users", "SETTINGS_PERMISSIONS"),
        soon("การเชื่อมต่อ", "link", "SETTINGS_CONNECTIONS"),
      ],
    },
  ];
}

/**
 * เมนูเดียวกันในรูปแบบ "ลิสต์แบน" สำหรับ drawer ของแอป (☰ ด้านบน)
 *
 * เฉพาะรายการ "ready" เท่านั้น (drawer ของแอปไม่มีกลไกแสดงป้าย "เร็ว ๆ นี้" แบบ AccountTabBar
 * — ใส่ลิงก์ที่ยังไม่มีหน้าเข้าไปจะกลายเป็นลิงก์ตาย) · `group` ใส่เฉพาะรายการแรกของแต่ละหมวด
 * เพื่อให้ drawer ขึ้นหัวข้อคั่นได้ (เหมือนพฤติกรรมเดิม)
 */
export function accountNavChildren(
  base: string,
  vatRegistered: boolean,
): { href: string; label: string; group?: string }[] {
  return ACCOUNT_NAV(base, vatRegistered).flatMap((g) => {
    const ready = g.items.filter((it) => it.status === "ready");
    return ready.map((it, i) => (i === 0 ? { href: it.href, label: it.label, group: g.label } : { href: it.href, label: it.label }));
  });
}

// ตัดส่วน query/hash ออกจาก href — ใช้จับคู่กับ pathname (usePathname ไม่มี query/hash ติดมา)
function stripQueryHash(href: string): string {
  const cut = Math.min(
    ...[href.indexOf("?"), href.indexOf("#")].filter((n) => n >= 0),
    href.length,
  );
  return href.slice(0, cut);
}

/**
 * หา group/item ที่ตรงกับ pathname ปัจจุบัน — ใช้ทั้งใน AccountTabBar (ตัวหนา+ขีดล่างของหมวด active)
 * และ AccountBreadcrumb (ไล่ บัญชี › หมวด › รายการ)
 * กติกา: จับคู่แบบ "prefix ยาวสุดชนะ" (กันเคสหน้า detail เช่น docs/INVOICE/<id> ที่ href ของเมนูชี้แค่ list)
 */
export function findActiveNav(
  pathname: string,
  base: string,
  groups: AccountNavGroup[],
): { group: AccountNavGroup; item?: AccountNavItem } | null {
  if (pathname === base) {
    const home = groups.find((g) => g.key === "home");
    return home ? { group: home } : null;
  }
  let best: { group: AccountNavGroup; item: AccountNavItem; len: number } | null = null;
  for (const g of groups) {
    for (const it of g.items) {
      if (it.status !== "ready") continue;
      const p = stripQueryHash(it.href);
      if (!p || p === base) continue;
      if ((pathname === p || pathname.startsWith(p + "/")) && p.length > (best?.len ?? -1)) {
        best = { group: g, item: it, len: p.length };
      }
    }
  }
  if (best) return { group: best.group, item: best.item };
  // ไม่เจอ item เจาะจง — ลองจับคู่แค่ระดับ group.href (กันหน้าที่ไม่อยู่ใน items แต่ยังอยู่ในหมวด)
  for (const g of groups) {
    const p = stripQueryHash(g.href);
    if (pathname === p || pathname.startsWith(p + "/")) return { group: g };
  }
  return null;
}

export default ACCOUNT_NAV;
