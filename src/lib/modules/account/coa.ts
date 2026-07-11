import { prisma } from "@/lib/core/db";
import type { Prisma, AccountLedgerType, AccountCashflowActivity } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// coa.ts — ผังบัญชี (Chart of Accounts) + posting mapping seed
// อ้าง §4.14 (ผัง SME ไทย) + QC5-A2 (เพิ่ม 2205 ภาษีขายรอออกใบกำกับ)
// isSystem=true (ลบไม่ได้) · idempotent ต่อ systemId (createMany skipDuplicates)
// เจ้าของไฟล์ = GL-Core agent
// ─────────────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
type CoaCtx = { tenantId: string; systemId: string };

const OP: AccountCashflowActivity = "OPERATING";

// cashflowActivity: 16xx = INVESTING · 3xxx = FINANCING · ที่เหลือ OPERATING (§4.14)
function activityFor(code: string): AccountCashflowActivity {
  if (code.startsWith("16")) return "INVESTING";
  if (code.startsWith("3")) return "FINANCING";
  return OP;
}

// ผังบัญชี template SME ไทย — [code, type, ชื่อไทย, ชื่ออังกฤษ]
const CHART: [string, AccountLedgerType, string, string][] = [
  // 1000-1049 เงินสด/ธนาคาร/e-Wallet/สำรอง/เช็ครับ
  ["1000", "ASSET", "เงินสด", "Cash"],
  ["1010", "ASSET", "เงินฝากธนาคาร", "Bank"],
  ["1020", "ASSET", "เงินอิเล็กทรอนิกส์ (e-Wallet)", "E-Wallet"],
  ["1030", "ASSET", "เงินสำรองรับจ่าย", "Petty Cash"],
  ["1040", "ASSET", "เช็ครับรอนำฝาก", "Cheques in Transit"],
  // 1100-1199 ลูกหนี้ + ภาษีฝั่งสินทรัพย์
  ["1100", "ASSET", "ลูกหนี้การค้า", "Accounts Receivable"],
  ["1130", "ASSET", "เงินมัดจำจ่าย", "Deposits Paid"],
  ["1150", "ASSET", "ภาษีซื้อ", "Input VAT"],
  ["1155", "ASSET", "ภาษีซื้อยังไม่ถึงกำหนด (รอใบกำกับ)", "Input VAT (Undue)"],
  ["1160", "ASSET", "ภาษีถูกหัก ณ ที่จ่าย", "Withholding Tax Asset"],
  // 1200 สินค้าคงเหลือ
  ["1200", "ASSET", "สินค้าคงเหลือ", "Inventory"],
  // 1600-1699 สินทรัพย์ถาวร (INVESTING)
  ["1610", "ASSET", "อุปกรณ์", "Equipment"],
  ["1619", "ASSET", "ค่าเสื่อมราคาสะสม-อุปกรณ์", "Accum. Depreciation - Equipment"],
  ["1620", "ASSET", "เครื่องตกแต่งและติดตั้ง", "Furniture & Fixtures"],
  ["1629", "ASSET", "ค่าเสื่อมราคาสะสม-เครื่องตกแต่ง", "Accum. Depreciation - Furniture"],
  ["1630", "ASSET", "ยานพาหนะ", "Vehicles"],
  ["1639", "ASSET", "ค่าเสื่อมราคาสะสม-ยานพาหนะ", "Accum. Depreciation - Vehicles"],
  // 2100-2299 หนี้สิน
  ["2100", "LIABILITY", "เจ้าหนี้การค้า", "Accounts Payable"],
  ["2110", "LIABILITY", "เงินมัดจำรับ/เงินรับล่วงหน้า", "Deposits Received / Unearned"],
  ["2130", "LIABILITY", "ภาษีหัก ณ ที่จ่ายค้างนำส่ง", "Withholding Tax Payable"],
  ["2200", "LIABILITY", "ภาษีขาย", "Output VAT"],
  ["2205", "LIABILITY", "ภาษีขายรอออกใบกำกับ", "Output VAT (Pending Invoice)"], // QC5-A2
  ["2210", "LIABILITY", "ภาษีขายยังไม่ถึงกำหนด (บริการรอรับเงิน)", "Output VAT (Undue)"],
  ["2300", "LIABILITY", "เช็คจ่ายรอเรียกเก็บ", "Cheques Payable"],
  // 3000-3999 ส่วนของเจ้าของ (FINANCING)
  ["3000", "EQUITY", "ทุนเจ้าของ/ทุนจดทะเบียน", "Owner's Capital"],
  ["3800", "EQUITY", "กำไรสะสม", "Retained Earnings"],
  // 4000-4999 รายได้
  ["4000", "INCOME", "รายได้จากการขายสินค้า", "Sales Revenue - Goods"],
  ["4030", "INCOME", "รายได้ค่าบริการ", "Service Revenue"],
  ["4800", "INCOME", "ส่วนลดจ่าย (contra)", "Discounts Given"],
  ["4900", "INCOME", "รายได้อื่น / กำไรจากการจำหน่ายสินทรัพย์", "Other Income / Disposal Gain"],
  // 5000-5999 ต้นทุน
  ["5000", "COGS", "ซื้อสินค้า/ต้นทุนขาย", "Purchases / COGS"],
  ["5800", "COGS", "ส่วนลดรับ (contra)", "Discounts Received"],
  // 6000-6999 ค่าใช้จ่าย
  ["6000", "EXPENSE", "เงินเดือนและค่าแรง", "Salaries & Wages"],
  ["6100", "EXPENSE", "ค่าเช่า", "Rent"],
  ["6200", "EXPENSE", "ค่าสาธารณูปโภค (น้ำ/ไฟ/เน็ต)", "Utilities"],
  ["6300", "EXPENSE", "ค่าการตลาดและโฆษณา", "Marketing"],
  ["6500", "EXPENSE", "ค่าธรรมเนียมชำระเงิน", "Payment Fees"],
  ["6800", "EXPENSE", "ค่าเสื่อมราคา", "Depreciation"],
  ["6900", "EXPENSE", "ค่าใช้จ่ายอื่น", "Other Expenses"],
  // 9999 พักรายการ
  ["9999", "ASSET", "พักรายการ (Suspense)", "Suspense"],
];

// posting mapping: semantic key → ledger code (§7.10 + QC5-A2)
const MAPPINGS: [string, string][] = [
  ["AR", "1100"],
  ["AP", "2100"],
  ["VAT_OUTPUT", "2200"],
  ["VAT_OUTPUT_UNDUE", "2210"],
  ["VAT_OUTPUT_PENDING_INVOICE", "2205"], // QC5-A2
  ["VAT_INPUT", "1150"],
  ["VAT_INPUT_UNDUE", "1155"],
  ["WHT_ASSET", "1160"],
  ["WHT_PAYABLE", "2130"],
  ["DEPOSIT_RECEIVED", "2110"],
  ["DEPOSIT_PAID", "1130"],
  ["INCOME_DEFAULT", "4030"],
  ["PURCHASE_DEFAULT", "5000"],
  ["EXPENSE_DEFAULT", "6900"],
  ["DISCOUNT_GIVEN", "4800"],
  ["DISCOUNT_RECEIVED", "5800"],
  ["PAYMENT_FEE", "6500"],
  ["CHEQUE_IN_TRANSIT", "1040"],
  ["DEPRECIATION_EXPENSE", "6800"],
  ["ASSET_DISPOSAL_GAIN", "4900"],
  ["CASH", "1000"],
  ["BANK", "1010"],
  ["SUSPENSE", "9999"],
];

/**
 * seedChartOfAccounts — สร้างผังบัญชี system ครบตาม §4.14 + mapping default
 * idempotent: createMany skipDuplicates (unique systemId+code) + mapping upsert
 */
export async function seedChartOfAccounts(ctx: CoaCtx, tx?: Tx): Promise<void> {
  const db: Db = tx ?? prisma;

  await db.accountLedger.createMany({
    data: CHART.map(([code, type, name, nameEn]) => ({
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      code,
      name,
      nameEn,
      type,
      cashflowActivity: activityFor(code),
      isSystem: true,
    })),
    skipDuplicates: true,
  });

  // code → id (เฉพาะระบบนี้)
  const ledgers = await db.accountLedger.findMany({
    where: { systemId: ctx.systemId },
    select: { id: true, code: true },
  });
  const idByCode = new Map(ledgers.map((l) => [l.code, l.id]));

  for (const [key, code] of MAPPINGS) {
    const accountId = idByCode.get(code);
    if (!accountId) continue; // เชิงทฤษฎีเกิดไม่ได้ (seed ครบ)
    await db.accountMapping.upsert({
      where: { systemId_key: { systemId: ctx.systemId, key } },
      create: { tenantId: ctx.tenantId, systemId: ctx.systemId, key, accountId },
      update: {}, // ไม่ทับ mapping ที่ผู้ใช้อาจปรับเอง (QC5: แก้ mapping ไม่ย้อนหลัง)
    });
  }
}

export const CHART_CODES = CHART.map((c) => c[0]);
export const MAPPING_KEYS = MAPPINGS.map((m) => m[0]);
