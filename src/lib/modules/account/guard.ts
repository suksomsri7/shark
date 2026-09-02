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
 *   - หน้าเอกสาร (list/detail/print ทั้งรายรับและรายจ่าย) → `account.doc.create`
 *   - หน้าอ่านรายงาน → `account.report.view` · สมุดรายวัน/แยกประเภท → `account.journal.view`
 *   - หน้าทะเบียน/ตั้งค่า → action `.manage` ของหมวดนั้น
 */
export const ACCOUNT_PAGE_PERMISSIONS: Record<string, string> = {
  "accounts/page.tsx": "account.chart.manage",
  "aging/page.tsx": "account.report.view",
  "asset-buy/[docId]/page.tsx": "account.doc.create",
  "asset-buy/page.tsx": "account.doc.create",
  "assets/page.tsx": "account.asset.manage",
  "cheque/page.tsx": "account.cheque.manage",
  "contacts/page.tsx": "account.contact.manage",
  "docs/[docType]/[docId]/page.tsx": "account.doc.create",
  "docs/[docType]/page.tsx": "account.doc.create",
  "documents/page.tsx": "account.document.manage",
  "expense/[docId]/page.tsx": "account.doc.create",
  "expense/page.tsx": "account.doc.create",
  "finance/[financeId]/statement/page.tsx": "account.finance.manage",
  "finance/page.tsx": "account.finance.manage",
  "goods-issue/page.tsx": "account.product.manage",
  "journal/[entryId]/page.tsx": "account.journal.view",
  "journal/new/page.tsx": "account.journal.adjust",
  "journal/page.tsx": "account.journal.view",
  "ledger/page.tsx": "account.journal.view",
  "periods/page.tsx": "account.period.close",
  "po/[docId]/page.tsx": "account.doc.create",
  "po/page.tsx": "account.doc.create",
  "print/[docId]/page.tsx": "account.doc.create",
  "products/page.tsx": "account.product.manage",
  "purchase/[docId]/page.tsx": "account.doc.create",
  "purchase/page.tsx": "account.doc.create",
  "reports/balance-sheet/page.tsx": "account.report.view",
  "reports/cash-flow/page.tsx": "account.report.view",
  "reports/page.tsx": "account.report.view",
  "reports/pp30/page.tsx": "account.report.view",
  "reports/profit-loss/page.tsx": "account.report.view",
  "reports/trial-balance/page.tsx": "account.report.view",
  "settings/page.tsx": "account.settings.manage",
  "tax/export/route.ts": "account.tax.view",
  "tax/page.tsx": "account.tax.view",
  "wht/[certId]/print/page.tsx": "account.wht.manage",
  "wht/page.tsx": "account.wht.manage",
};
