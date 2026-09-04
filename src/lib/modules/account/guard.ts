import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { assertAccountCan } from "./access";

// โหลดระบบบัญชี (feature) + ตรวจว่าเป็นของ tenant + ชนิด ACCOUNT
// opts.can = action สิทธิ์ที่ต้องมี "ก่อนโหลดข้อมูลใด ๆ" (WO 0.2 — ด่านระดับ page)
//   ไม่ผ่าน → โยน ForbiddenError (รูปแบบเดียวกับที่ /journal, /ledger, /accounts, /periods, /reports/* ใช้อยู่เดิม)
export async function loadAccountSystem(systemId: string, opts?: { can?: string }) {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId } });
  if (!sys || sys.type !== "ACCOUNT") notFound();
  if (opts?.can) assertAccountCan(auth, opts.can);
  return { auth, tenantId, systemId, sys, userId: auth.user.id };
}

/**
 * ด่านหน้าเพจบัญชี — บรรทัดเดียวต่อหน้า: โหลดระบบ + ตรวจสิทธิ์ก่อนแตะข้อมูล
 * (เท่ากับ `loadAccountSystem(id, { can: action })` — มีชื่อแยกเพื่อ grep/ตรวจครบทุก route ได้)
 */
export async function requireAccountPage(systemId: string, action: string) {
  return loadAccountSystem(systemId, { can: action });
}

/**
 * ทะเบียนสิทธิ์ต่อ route ของโมดูลบัญชี — **แหล่งเดียว** ที่บอกว่าแต่ละหน้าต้องมีสิทธิ์อะไร
 * key = path ใต้ `src/app/app/sys/[id]/account/` (ตรงกับชื่อไฟล์จริง) · value = action ใน permissions.ts §account
 * ใช้โดย `scripts/qc-acc-v2-guard.mts` เป็นเฉลยตรวจว่าทุก route มีด่านจริงและตรงตัว
 *
 * หลักการแมป (ระบบยังไม่มี action ชนิด "read" แยก — ดู permissions.ts:432-461):
 *   - หน้าเอกสาร **อ่านอย่างเดียว** (list/detail/print ทั้งรายรับและรายจ่าย) → `account.doc.view` (WO 0.3)
 *     ⚠️ ไม่ใช่การลดความปลอดภัย: การสร้าง/แก้/ออกเอกสารยังตรวจ `account.doc.create`/`.issue` ที่ตัว
 *     server action เองทุกตัว (actions.ts / expense-actions.ts) · หน้าเป็นแค่ชั้นแรก
 *     และคนที่มี `account.doc.create` อยู่เดิม **ยังเข้าได้เหมือนเดิม** เพราะตาราง IMPLIES ใน access.ts
 *   - **หน้าฟอร์ม V2 (`…/new` · `…/[docId]/edit`, WO 1.3)** → `account.doc.create` (ไม่ใช่ `.view`)
 *     เพราะเปิดหน้าแล้ว autosave สร้างร่างได้ทันที ⇒ คนที่ดูได้อย่างเดียวต้องเข้าไม่ได้ตั้งแต่หน้า
 *   - หน้าอ่านรายงาน → `account.report.view` · สมุดรายวัน/แยกประเภท → `account.journal.view`
 *   - หน้าทะเบียน/ตั้งค่า → action `.manage` ของหมวดนั้น
 */
export const ACCOUNT_PAGE_PERMISSIONS: Record<string, string> = {
  // WO 0.4: หน้า hub ราก /account (เดิม 404 เพราะไม่มี page.tsx — ledger/wo-notes/0.1.md ข้อ 8)
  "asset-buy/[docId]/edit/page.tsx": "account.doc.create",
  "asset-buy/new/page.tsx": "account.doc.create",
  "asset-po/[docId]/edit/page.tsx": "account.doc.create",
  "asset-po/new/page.tsx": "account.doc.create",
  // WO 1.7: ฟอร์มพิเศษเอกสารกลุ่ม (§5.2 K) — เปิดหน้าแล้วสร้างเอกสารได้ทันที ⇒ ต้องมี doc.create ตั้งแต่หน้า
  "combined-payment/new/page.tsx": "account.doc.create",
  "credit-note-received/[docId]/edit/page.tsx": "account.doc.create",
  "credit-note-received/new/page.tsx": "account.doc.create",
  "debit-note-received/[docId]/edit/page.tsx": "account.doc.create",
  "debit-note-received/new/page.tsx": "account.doc.create",
  "deposit-payment/[docId]/edit/page.tsx": "account.doc.create",
  "deposit-payment/new/page.tsx": "account.doc.create",
  "docs/[docType]/[docId]/edit/page.tsx": "account.doc.create",
  "docs/[docType]/new/page.tsx": "account.doc.create",
  // WO 7.2 — กล่องขาเข้า: หน้าอ่านไฟล์ที่ยังไม่ผูกเอกสาร (การสร้างเอกสารตรวจ account.doc.create ที่ action)
  "documents/inbox/page.tsx": "account.document.manage",
  "expense/[docId]/edit/page.tsx": "account.doc.create",
  "expense/new/page.tsx": "account.doc.create",
  "page.tsx": "account.doc.view",
  // WO 0.5: storybook-lite ส่วนประกอบกลาง V2 — ปิดเองบน production ผ่าน notFound() ในไฟล์ (APP_ENV check)
  // (เดิมชื่อ _dev/components — Next App Router ถือโฟลเดอร์ที่ขึ้นต้น _ เป็น private route ไม่ผูก URL เลย ⇒ 404 ย้ายมาที่นี่)
  "dev-components/page.tsx": "account.doc.view",
  "accounts/page.tsx": "account.chart.manage",
  "accounts/mapping/page.tsx": "account.mapping.manage", // WO 6.1 — ย้ายบล็อกผูกบัญชีอัตโนมัติออกจากหน้าผังบัญชี
  "accounts/print/page.tsx": "account.chart.manage", // WO 6.1 §11.1 — หน้าพิมพ์ผังบัญชี
  "aging/page.tsx": "account.report.view",
  "asset-buy/[docId]/page.tsx": "account.doc.view",
  "asset-buy/page.tsx": "account.doc.view",
  "asset-po/[docId]/page.tsx": "account.doc.view", // WO 1.2 (ASSET_PURCHASE_ORDER)
  "asset-po/page.tsx": "account.doc.view",
  "assets/[assetId]/page.tsx": "account.asset.manage", // WO 6.2 §11.5 — หน้าสินทรัพย์ + ตารางค่าเสื่อมรายงวด
  "assets/page.tsx": "account.asset.manage",
  "cheque/page.tsx": "account.cheque.manage",
  "combined-payment/[docId]/page.tsx": "account.doc.view", // WO 1.7 (COMBINED_PAYMENT)
  "combined-payment/page.tsx": "account.doc.view",
  "contacts/[contactId]/page.tsx": "account.contact.manage", // WO 3.4 — โปรไฟล์ 360° เต็มหน้าจอ (§7.1 · g6/g19)
  "contacts/merge/page.tsx": "account.contact.merge", // WO 3.4 — รวมผู้ติดต่อซ้ำ (§7.3 · สิทธิ์แยกจาก manage)
  "contacts/overview/page.tsx": "account.contact.manage", // WO 3.2 — ดูภาพรวมผู้ติดต่อ (§7.4)
  "contacts/page.tsx": "account.contact.manage",
  "credit-note-received/[docId]/page.tsx": "account.doc.view", // WO 1.2 (CREDIT_NOTE_RECEIVED)
  "credit-note-received/page.tsx": "account.doc.view",
  "debit-note-received/[docId]/page.tsx": "account.doc.view", // WO 1.2 (DEBIT_NOTE_RECEIVED)
  "debit-note-received/page.tsx": "account.doc.view",
  "deposit-payment/[docId]/page.tsx": "account.doc.view", // WO 1.2 (DEPOSIT_PAYMENT)
  "deposit-payment/page.tsx": "account.doc.view",
  "docs/[docType]/[docId]/page.tsx": "account.doc.view",
  "docs/[docType]/page.tsx": "account.doc.view",
  "documents/page.tsx": "account.document.manage",
  "expense/[docId]/page.tsx": "account.doc.view",
  "expense/page.tsx": "account.doc.view",
  "finance/[financeId]/statement/page.tsx": "account.finance.manage",
  "finance/page.tsx": "account.finance.manage",
  // WO 5.2 (§10.2–§10.3) — ภาพรวมการเงิน · สำรองรับ/จ่าย · placeholder กระทบยอดธนาคาร (WO 5.3 ทำจริง) — สิทธิ์เดียวกับหน้าการเงินเดิม
  "finance/overview/page.tsx": "account.finance.manage",
  "finance/petty-cash/page.tsx": "account.finance.manage",
  "finance/reconcile/page.tsx": "account.finance.manage",
  "goods-issue/page.tsx": "account.product.manage",
  // WO 4.3 (§8.3–8.4) — หน่วยนับ · ฟอร์มใบเบิก · ใบปรับต้นทุนสินค้า (ทุกหน้าใช้สิทธิ์เดียวกับทะเบียนสินค้า)
  "goods-issue/new/page.tsx": "account.product.manage",
  "units/page.tsx": "account.product.manage",
  "cost-adjustment/page.tsx": "account.product.manage",
  "cost-adjustment/new/page.tsx": "account.product.manage",
  // WO 1.6: RPR wizard — เรียก requireAccountPage(id, "account.product.manage") ตรงกับ goods-issue/page.tsx (สิทธิ์เดียวกัน)
  "goods-issue/return/new/page.tsx": "account.product.manage",
  // WO 1.8: นำเข้า CSV (§8.5) — action เดียว account.import ครอบทั้งเอกสาร/ผู้ติดต่อ/สินค้า
  "import/chart-of-accounts/page.tsx": "account.import", // WO 6.1 §11.1 — นำเข้าผังบัญชี
  "import/contacts/page.tsx": "account.import",
  "import/documents/page.tsx": "account.import",
  "import/products/page.tsx": "account.import",
  "import/template/route.ts": "account.import",
  "journal/[entryId]/page.tsx": "account.journal.view",
  "journal/new/page.tsx": "account.journal.adjust",
  "journal/print/page.tsx": "account.journal.view", // WO 6.2 §11.2 — หน้าพิมพ์สมุดรายวัน
  "journal/page.tsx": "account.journal.view",
  "ledger/page.tsx": "account.journal.view",
  // WO 2.3: "ดูภาพรวม" รายรับ/รายจ่าย (§6) — อ่านอย่างเดียว เหมือน page.tsx หลัก
  "overview/expense/page.tsx": "account.doc.view",
  "overview/revenue/page.tsx": "account.doc.view",
  "periods/page.tsx": "account.period.close",
  "po/[docId]/edit/page.tsx": "account.doc.create",
  "po/[docId]/page.tsx": "account.doc.view",
  "po/new/page.tsx": "account.doc.create",
  "po/page.tsx": "account.doc.view",
  "print/[docId]/page.tsx": "account.doc.view",
  "products/page.tsx": "account.product.manage",
  "purchase-tax-invoice/[docId]/edit/page.tsx": "account.doc.create",
  "purchase-tax-invoice/[docId]/page.tsx": "account.doc.view", // WO 1.2 (PURCHASE_TAX_INVOICE)
  "purchase-tax-invoice/new/page.tsx": "account.doc.create",
  "purchase-tax-invoice/page.tsx": "account.doc.view",
  // WO 1.9: เอกสารประจำ (§0.3 ข้อ 7) — ดูรายการ = doc.view · สร้าง/แก้กฎ = doc.create
  //   (ไม่เพิ่ม permission key ใหม่: กฎเอกสารประจำ = "เครื่องออกเอกสารแทนคน" ⇒ คุมด้วยสิทธิ์สร้างเอกสาร
  //    ถ้าเพิ่ม key ใหม่ เจ้าของร้านทุกรายต้องไปติ๊กเพิ่มเอง = สิทธิ์หายเงียบ ๆ แบบเดียวกับบทเรียน IMPLIES ของ WO 0.3)
  "recurring/[ruleId]/edit/page.tsx": "account.doc.create",
  "recurring/new/page.tsx": "account.doc.create",
  "recurring/page.tsx": "account.doc.view",
  "purchase/[docId]/edit/page.tsx": "account.doc.create",
  "purchase/[docId]/page.tsx": "account.doc.view",
  "purchase/new/page.tsx": "account.doc.create",
  "purchase/page.tsx": "account.doc.view",
  "reports/balance-sheet/page.tsx": "account.report.view",
  "reports/cash-flow/page.tsx": "account.report.view",
  "reports/page.tsx": "account.report.view",
  "reports/pp30/page.tsx": "account.report.view",
  "reports/profit-loss/page.tsx": "account.report.view",
  "reports/trial-balance/page.tsx": "account.report.view",
  "settings/page.tsx": "account.settings.manage",
  // WO 8.1 (§9.2): หน้า "ตั้งค่า › เอกสารและเลขที่" — แก้เลขรัน/นโยบายเอกสาร ⇒ ต้องมีสิทธิ์ตั้งค่าเต็ม
  "settings/documents/page.tsx": "account.settings.manage",
  "settings/policy/page.tsx": "account.settings.manage", // WO 8.2 §9.3
  "tax/export/route.ts": "account.tax.view",
  "tax/page.tsx": "account.tax.view",
  "wht/[certId]/print/page.tsx": "account.wht.manage",
  "wht/page.tsx": "account.wht.manage",
};
