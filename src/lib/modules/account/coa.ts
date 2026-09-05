import { prisma } from "@/lib/core/db";
import type { Prisma, AccountLedgerType, AccountCashflowActivity, AccountDocType } from "@prisma/client";
import { docTypeLabel } from "./dashboard";

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
  ["3999", "EQUITY", "ยอดยกมา/บัญชีคู่เปิดบัญชี", "Opening Balance Equity"], // Gate C ledger-M6 (บัญชีคู่ postOpening)
  // 4000-4999 รายได้
  ["4000", "INCOME", "รายได้จากการขายสินค้า", "Sales Revenue - Goods"],
  ["4030", "INCOME", "รายได้ค่าบริการ", "Service Revenue"],
  ["4800", "INCOME", "ส่วนลดจ่าย (contra)", "Discounts Given"],
  ["4900", "INCOME", "รายได้อื่น / กำไรจากการจำหน่ายสินทรัพย์", "Other Income / Disposal Gain"],
  ["4910", "INCOME", "ดอกเบี้ยรับ", "Interest Income"], // V2 (WO 5.3): ดอกเบี้ยเงินฝากจากแถว statement
  // 5000-5999 ต้นทุน
  ["5000", "COGS", "ซื้อสินค้า/ต้นทุนขาย", "Purchases / COGS"],
  // V2 (WO 4.3 · SPEC §8.4) — เอกสารปรับปรุงสต็อก/ต้นทุน
  ["5300", "COGS", "สินค้าที่เบิกใช้ในกิจการ", "Goods Issued for Internal Use"],
  ["5310", "COGS", "กำไร/ขาดทุนจากการปรับมูลค่าสินค้า", "Inventory Cost Adjustment Gain/Loss"],
  ["5800", "COGS", "ส่วนลดรับ (contra)", "Discounts Received"],
  // 6000-6999 ค่าใช้จ่าย
  ["6000", "EXPENSE", "เงินเดือนและค่าแรง", "Salaries & Wages"],
  ["6100", "EXPENSE", "ค่าเช่า", "Rent"],
  ["6200", "EXPENSE", "ค่าสาธารณูปโภค (น้ำ/ไฟ/เน็ต)", "Utilities"],
  ["6300", "EXPENSE", "ค่าการตลาดและโฆษณา", "Marketing"],
  ["6500", "EXPENSE", "ค่าธรรมเนียมชำระเงิน", "Payment Fees"],
  // V2 (WO 5.3 · §10.2): สร้างรายการจากแถว statement — ค่าธรรมเนียมธนาคารแยกจากค่าธรรมเนียมชำระเงิน (6500)
  // เพราะรายงานค่าใช้จ่ายของเจ้าของร้านต้องแยก "ค่าธรรมเนียมบัตร/พร้อมเพย์" กับ "ค่าธรรมเนียมธนาคารรายเดือน"
  ["6510", "EXPENSE", "ค่าธรรมเนียมธนาคาร", "Bank Charges"],
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
  ["INCOME_GOODS", "4000"], // F-09: รายได้ขายสินค้า (tax point ON_ISSUE)
  ["INCOME_SERVICE", "4030"], // F-09: รายได้ค่าบริการ (tax point ON_PAYMENT)
  ["PURCHASE_DEFAULT", "5000"],
  ["INVENTORY", "1200"], // V2 (WO 4.3): บัญชีสินค้าคงเหลือ — ขา Cr ของใบเบิก · ขา Dr/Cr ของใบปรับต้นทุน
  ["GOODS_ISSUE_EXPENSE", "5300"], // V2 (WO 4.3 §8.4): "ค่าใช้จ่ายที่ปรับปรุง" ปริยายของใบเบิก (ใช้ในกิจการ)
  ["INVENTORY_ADJUST_GAINLOSS", "5310"], // V2 (WO 4.3 §8.4): บัญชีคู่ของใบปรับต้นทุนสินค้า
  ["EXPENSE_DEFAULT", "6900"],
  ["ASSET_DEFAULT", "1610"], // P2 ASSET_PURCHASE (บัญชีสินทรัพย์ default เมื่อ line ไม่ระบุ)
  ["OPENING_BALANCE", "3999"], // Gate C ledger-M6 (บัญชีคู่ postOpening)
  ["DISCOUNT_GIVEN", "4800"],
  ["DISCOUNT_RECEIVED", "5800"],
  ["PAYMENT_FEE", "6500"],
  ["BANK_FEE", "6510"], // V2 (WO 5.3): ขา Dr ของ "สร้างรายการค่าธรรมเนียมจากแถว statement"
  ["INTEREST_INCOME", "4910"], // V2 (WO 5.3): ขา Cr ของ "สร้างรายการดอกเบี้ยรับจากแถว statement"
  ["CHEQUE_IN_TRANSIT", "1040"],
  ["CHEQUE_PAYABLE", "2300"], // เช็คจ่ายรอเรียกเก็บ (§3.5 เช็คจ่าย)
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

  // ⚠️ ต้องเป็น batch เดียว ห้ามวน upsert ทีละตัว — เดิม 28 upsert = 28 round-trip ใน tx เดียว
  // เครื่องไกล DB (เช่น CI อเมริกา → Neon สิงคโปร์ ~250ms/query) ทะลุเพดาน interactive tx 5 วิ
  // → P2028 หมดเวลากลางคัน (CI run #10) หรือ FK พังปริศนา (query หลังหมดเวลาหลุดนอก tx — run #8)
  // createMany skipDuplicates = พฤติกรรมเดียวกับ upsert ที่ update:{} เป๊ะ:
  // "สร้างถ้ายังไม่มี ไม่ทับของเดิม" (คงกติกา QC5: ไม่ทับ mapping ที่ผู้ใช้ปรับเอง)
  await db.accountMapping.createMany({
    data: MAPPINGS.flatMap(([key, code]) => {
      const accountId = idByCode.get(code);
      return accountId ? [{ tenantId: ctx.tenantId, systemId: ctx.systemId, key, accountId }] : [];
    }),
    skipDuplicates: true, // unique(systemId, key)
  });
}

export const CHART_CODES = CHART.map((c) => c[0]);
export const MAPPING_KEYS = MAPPINGS.map((m) => m[0]);

// WO 9.4 §0.3 ข้อ 9 (ภาษาคนทั่วไป) — เจอจริงตอน eye-check: หน้า /accounts/mapping และแผงรายละเอียดผังบัญชี
// (coa-ui.tsx "ใช้ลงบัญชีอัตโนมัติ") โชว์ `AccountMapping.key` ดิบ ๆ เช่น "CASH"/"AR"/"VAT_OUTPUT" — ไม่มี label
// ไทยมาก่อนเลย ⇒ เพิ่มที่นี่ (แหล่งเดียวกับ MAPPINGS ด้านบน กัน key ใหม่ในอนาคตหลุดไม่มี label ทั้งคู่แยกกัน)
export const MAPPING_KEY_LABEL: Record<string, string> = {
  AR: "ลูกหนี้การค้า",
  AP: "เจ้าหนี้การค้า",
  VAT_OUTPUT: "ภาษีขาย",
  VAT_OUTPUT_UNDUE: "ภาษีขายยังไม่ถึงกำหนด (บริการรอรับเงิน)",
  VAT_OUTPUT_PENDING_INVOICE: "ภาษีขายรอออกใบกำกับ",
  VAT_INPUT: "ภาษีซื้อ",
  VAT_INPUT_UNDUE: "ภาษีซื้อยังไม่ถึงกำหนด (รอใบกำกับ)",
  WHT_ASSET: "ภาษีถูกหัก ณ ที่จ่าย (สินทรัพย์)",
  WHT_PAYABLE: "ภาษีหัก ณ ที่จ่ายค้างนำส่ง",
  DEPOSIT_RECEIVED: "เงินมัดจำรับ/เงินรับล่วงหน้า",
  DEPOSIT_PAID: "เงินมัดจำจ่าย",
  INCOME_DEFAULT: "รายได้ (บัญชีเริ่มต้น)",
  INCOME_GOODS: "รายได้จากการขายสินค้า",
  INCOME_SERVICE: "รายได้ค่าบริการ",
  PURCHASE_DEFAULT: "ซื้อสินค้า/ต้นทุนขาย (บัญชีเริ่มต้น)",
  INVENTORY: "สินค้าคงเหลือ",
  GOODS_ISSUE_EXPENSE: "ค่าใช้จ่ายที่ปรับปรุงจากใบเบิกสินค้า",
  INVENTORY_ADJUST_GAINLOSS: "กำไร/ขาดทุนจากปรับต้นทุนสินค้า",
  EXPENSE_DEFAULT: "ค่าใช้จ่าย (บัญชีเริ่มต้น)",
  ASSET_DEFAULT: "สินทรัพย์ถาวร (บัญชีเริ่มต้น)",
  OPENING_BALANCE: "ยอดยกมา/บัญชีคู่เปิดบัญชี",
  DISCOUNT_GIVEN: "ส่วนลดจ่าย",
  DISCOUNT_RECEIVED: "ส่วนลดรับ",
  PAYMENT_FEE: "ค่าธรรมเนียมการชำระเงิน",
  BANK_FEE: "ค่าธรรมเนียมธนาคาร",
  INTEREST_INCOME: "ดอกเบี้ยรับ",
  CHEQUE_IN_TRANSIT: "เช็ครับรอนำฝาก",
  CHEQUE_PAYABLE: "เช็คจ่ายรอเรียกเก็บ",
  DEPRECIATION_EXPENSE: "ค่าเสื่อมราคา",
  ASSET_DISPOSAL_GAIN: "กำไร/ขาดทุนจากการจำหน่ายสินทรัพย์",
  CASH: "เงินสด (บัญชีเริ่มต้น)",
  BANK: "เงินฝากธนาคาร (บัญชีเริ่มต้น)",
  SUSPENSE: "บัญชีพักรายการ (9999)",
};

/** ป้ายไทยของ mapping key — คีย์ "DOC:<docType>" (override ใบกำกับภาษีอัตโนมัติต่อชนิดเอกสาร) แปลด้วย docTypeLabel
 * ไม่พบใน MAPPING_KEY_LABEL และไม่ใช่ "DOC:" = คืน key ดิบ (ไม่ควรเกิด — เตือนให้เติม label ใหม่แทนที่จะซ่อนเงียบ ๆ) */
export function mappingKeyLabel(key: string): string {
  if (key.startsWith("DOC:")) return `เอกสาร: ${docTypeLabel(key.slice(4) as AccountDocType)}`;
  return MAPPING_KEY_LABEL[key] ?? key;
}

// ─────────────────── ผังบัญชี — จัดการ (P3 UI) ───────────────────

export function listLedgers(ctx: CoaCtx) {
  return prisma.accountLedger.findMany({
    where: { systemId: ctx.systemId },
    orderBy: { code: "asc" },
  });
}

export function listMappings(ctx: CoaCtx) {
  return prisma.accountMapping.findMany({
    where: { systemId: ctx.systemId },
    include: { account: { select: { code: true, name: true } } },
    orderBy: { key: "asc" },
  });
}

export async function createLedger(
  ctx: CoaCtx,
  input: {
    code: string;
    name: string;
    nameEn?: string | null;
    type: AccountLedgerType;
    cashflowActivity?: AccountCashflowActivity;
    parentId?: string | null;
  },
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const code = input.code.trim();
  if (!/^\d{3,6}$/.test(code)) return { ok: false, reason: "รหัสบัญชีต้องเป็นตัวเลข 3–6 หลัก" };
  if (!input.name.trim()) return { ok: false, reason: "ต้องระบุชื่อบัญชี" };
  const dup = await prisma.accountLedger.findFirst({
    where: { systemId: ctx.systemId, code },
    select: { id: true },
  });
  if (dup) return { ok: false, reason: `มีรหัสบัญชี ${code} อยู่แล้ว` };
  const l = await prisma.accountLedger.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      code,
      name: input.name.trim(),
      nameEn: input.nameEn?.trim() || null,
      type: input.type,
      cashflowActivity: input.cashflowActivity ?? activityFor(code),
      parentId: input.parentId || null,
      isSystem: false,
    },
    select: { id: true },
  });
  return { ok: true, id: l.id };
}

export async function updateLedger(
  ctx: CoaCtx,
  id: string,
  input: {
    name?: string;
    nameEn?: string | null;
    type?: AccountLedgerType;
    cashflowActivity?: AccountCashflowActivity;
    parentId?: string | null;
  },
): Promise<{ ok: boolean; reason?: string }> {
  const l = await prisma.accountLedger.findFirst({
    where: { id, systemId: ctx.systemId },
    select: { id: true, isSystem: true },
  });
  if (!l) return { ok: false, reason: "ไม่พบบัญชี" };
  // บัญชี system: แก้ชื่อได้ แต่ห้ามเปลี่ยน type/กระแสเงินสด (งบพึ่งพา code เดิม)
  await prisma.accountLedger.update({
    where: { id },
    data: {
      name: input.name?.trim() || undefined,
      nameEn: input.nameEn === undefined ? undefined : input.nameEn?.trim() || null,
      type: l.isSystem ? undefined : input.type,
      cashflowActivity: l.isSystem ? undefined : input.cashflowActivity,
      parentId: input.parentId === undefined ? undefined : input.parentId || null,
    },
  });
  return { ok: true };
}

export async function archiveLedger(
  ctx: CoaCtx,
  id: string,
): Promise<{ ok: boolean; reason?: string }> {
  const l = await prisma.accountLedger.findFirst({
    where: { id, systemId: ctx.systemId },
    select: { id: true, isSystem: true },
  });
  if (!l) return { ok: false, reason: "ไม่พบบัญชี" };
  if (l.isSystem) return { ok: false, reason: "บัญชีระบบ ลบ/ปิดใช้งานไม่ได้" };
  const used = await prisma.accountJournalLine.count({
    where: { systemId: ctx.systemId, accountId: id },
  });
  // มี movement แล้ว → archive (ซ่อน) ไม่ลบ เพื่อคงประวัติ
  await prisma.accountLedger.update({ where: { id }, data: { archivedAt: new Date() } });
  return { ok: true, reason: used > 0 ? "มีการเคลื่อนไหวแล้ว — ปิดใช้งาน (ซ่อน) ไว้" : undefined };
}

const MAX_PINNED_LEDGER = 4;

/** ตั้ง "บัญชีที่ติดตาม" (ผังบัญชี) ใหม่ทั้งชุด (WO 2.2 §4 ข้อ 9) — เหมือน setPinnedFinanceAccounts
 * แต่เป็นฝั่ง AccountLedger · จำกัด ≤4 · ทุก id ต้องเป็นของ system นี้เท่านั้น */
export async function setPinnedLedgerAccounts(
  ctx: CoaCtx,
  ids: string[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const uniq = [...new Set(ids)];
  if (uniq.length > MAX_PINNED_LEDGER) return { ok: false, reason: `ปักหมุดได้สูงสุด ${MAX_PINNED_LEDGER} บัญชี` };
  const owned = await prisma.accountLedger.findMany({
    where: { id: { in: uniq }, tenantId: ctx.tenantId, systemId: ctx.systemId, archivedAt: null },
    select: { id: true },
  });
  if (owned.length !== uniq.length) return { ok: false, reason: "พบบัญชีที่ไม่ใช่ของระบบนี้" };
  await prisma.$transaction([
    prisma.accountLedger.updateMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, pinned: true },
      data: { pinned: false },
    }),
    ...(uniq.length
      ? [
          prisma.accountLedger.updateMany({
            where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: uniq } },
            data: { pinned: true },
          }),
        ]
      : []),
  ]);
  return { ok: true };
}

export async function setMapping(
  ctx: CoaCtx,
  key: string,
  accountId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const acct = await prisma.accountLedger.findFirst({
    where: { id: accountId, systemId: ctx.systemId },
    select: { id: true },
  });
  if (!acct) return { ok: false, reason: "ไม่พบบัญชีปลายทาง" };
  await prisma.accountMapping.upsert({
    where: { systemId_key: { systemId: ctx.systemId, key } },
    create: { tenantId: ctx.tenantId, systemId: ctx.systemId, key, accountId },
    update: { accountId },
  });
  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// ผังบัญชี V2 (WO 6.1 · DESIGN-SPEC-V2 §11.1 · เฟรม f8-chart-of-accounts.png)
//
// อยู่ในไฟล์นี้ (ไม่ใช่ coa-v2.ts) เพราะ fitness F5 ห้ามไฟล์โมดูล **ใหม่** import prisma ตรง
// (ratchet baseline 45 ไฟล์ · ลดได้อย่างเดียว) — ส่วนที่เป็นตรรกะบริสุทธิ์ (โครงต้นไม้ · ชื่อหมวด ·
// ช่วงรหัส · ป้ายภาษี/WHT · กติกาปิดใช้งาน · validate ฟอร์ม) อยู่ที่ `coa-v2.ts` และถูก import มาที่นี่
// ═════════════════════════════════════════════════════════════════════════════

import {
  buildChartTree,
  archiveBlockReason,
  naturalAmount,
  asOfCutoff,
  bkkMonthStart,
  bkkMonthKey,
  prefixOf,
  groupNameOf,
  typeFromCode,
  validateLedgerInput,
  CHART_TYPE_LABEL,
  CHART_TYPE_DIGIT,
  type ChartTree,
  type LedgerDetail,
  type LedgerMovementRow,
  type SaveLedgerInput,
  type SaveLedgerResult,
} from "./coa-v2";

/**
 * chartTree — ต้นไม้ผังบัญชี 3 ระดับ + จำนวนต่อหมวด + ยอดคงเหลือต่อบัญชี
 * งบประมาณ query: **2 ครั้ง** (รายการบัญชี · Σ debit/credit ต่อบัญชีทั้งหมด) — ประกอบต้นไม้ในหน่วยความจำ
 * (SPEC §11.1 · เพดานของ WO คือ ≤6 query ต่อการเปิดหน้า — ยอดเดือนนี้/รายละเอียดอยู่ที่ ledgerDetail)
 */
export async function chartTree(
  ctx: CoaCtx,
  opts: { q?: string; includeArchived?: boolean; asOf?: Date } = {},
): Promise<ChartTree> {
  const cutoff = asOfCutoff(opts.asOf ?? new Date());
  const [ledgers, sums] = await Promise.all([
    prisma.accountLedger.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
      select: {
        id: true,
        code: true,
        name: true,
        nameEn: true,
        type: true,
        isSystem: true,
        archivedAt: true,
        level: true,
      },
      orderBy: [{ code: "asc" }],
    }),
    // ยอด "ณ วันที่" — ไม่รวมรายการที่ลงวันที่ล่วงหน้า (ดู asOfCutoff ใน coa-v2.ts)
    prisma.accountJournalLine.groupBy({
      by: ["accountId"],
      where: { systemId: ctx.systemId, entry: { date: { lt: cutoff } } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const sumBy = new Map(sums.map((s) => [s.accountId, { debit: s._sum.debit ?? 0, credit: s._sum.credit ?? 0 }]));
  return buildChartTree(ledgers, sumBy, opts);
}

export async function ledgerDetail(ctx: CoaCtx, id: string, opts: { asOf?: Date } = {}): Promise<LedgerDetail | null> {
  const led = await prisma.accountLedger.findFirst({
    where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId },
  });
  if (!led) return null;

  // ยอด/รายการทั้งหมดในแผงนี้คิด "ณ วันที่ asOf" (ค่าเริ่มต้น = วันนี้) — รายการลงวันที่ล่วงหน้ายังไม่นับ
  const asOf = opts.asOf ?? new Date();
  const cutoff = asOfCutoff(asOf);
  const monthFrom = bkkMonthStart(asOf);
  const monthKey = bkkMonthKey(asOf);
  const [allSum, monthSum, lines, finance, mappings, docLineCount] = await Promise.all([
    prisma.accountJournalLine.aggregate({
      where: { systemId: ctx.systemId, accountId: id, entry: { date: { lt: cutoff } } },
      _sum: { debit: true, credit: true },
      _count: { _all: true },
    }),
    prisma.accountJournalLine.aggregate({
      where: { systemId: ctx.systemId, accountId: id, entry: { date: { gte: monthFrom, lt: cutoff } } },
      _sum: { debit: true, credit: true },
    }),
    prisma.accountJournalLine.findMany({
      where: { systemId: ctx.systemId, accountId: id, entry: { date: { lt: cutoff } } },
      select: {
        id: true,
        debit: true,
        credit: true,
        note: true,
        entry: { select: { id: true, date: true, docNo: true, memo: true, createdAt: true } },
      },
      orderBy: [{ entry: { date: "desc" } }, { entry: { createdAt: "desc" } }, { id: "desc" }],
      take: 5,
    }),
    prisma.accountFinance.findFirst({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, ledgerAccountId: id },
      select: { id: true, code: true, name: true },
    }),
    prisma.accountMapping.findMany({
      where: { systemId: ctx.systemId, accountId: id },
      select: { key: true },
      orderBy: { key: "asc" },
    }),
    prisma.accountDocumentLine.count({ where: { systemId: ctx.systemId, accountId: id } }),
  ]);

  const balanceSatang = naturalAmount(led.type, allSum._sum.debit ?? 0, allSum._sum.credit ?? 0);
  const monthDeltaSatang = naturalAmount(led.type, monthSum._sum.debit ?? 0, monthSum._sum.credit ?? 0);

  // ยอดคงเหลือสะสมย้อนหลัง: แถวใหม่สุด = ยอดคงเหลือปัจจุบัน แล้วถอยทีละบรรทัด
  let running = balanceSatang;
  const movements: LedgerMovementRow[] = lines.map((l) => {
    const row: LedgerMovementRow = {
      id: l.id,
      entryId: l.entry.id,
      date: l.entry.date,
      docNo: l.entry.docNo,
      memo: l.note ?? l.entry.memo,
      debit: l.debit,
      credit: l.credit,
      runningSatang: running,
    };
    running -= naturalAmount(led.type, l.debit, l.credit);
    return row;
  });

  // 🔴 ตัวนับสำหรับกติกา "ปิดใช้งานไม่ได้" ต้องนับ **ทุกบรรทัด** ไม่ใช่แค่ถึง asOf
  //    (บัญชีที่มีรายการลงวันที่ล่วงหน้าก็ถือว่า "ถูกใช้แล้ว")
  const journalLinesAll = await prisma.accountJournalLine.count({ where: { systemId: ctx.systemId, accountId: id } });
  const usage = {
    journalLines: journalLinesAll,
    docLines: docLineCount,
    mappings: mappings.length,
    finance: finance ? 1 : 0,
  };

  return {
    id: led.id,
    code: led.code,
    name: led.name,
    nameEn: led.nameEn,
    type: led.type,
    typeLabel: CHART_TYPE_LABEL[led.type],
    isSystem: led.isSystem,
    archivedAt: led.archivedAt,
    description: led.description,
    defaultWhtRateBp: led.defaultWhtRateBp,
    defaultWhtType: led.defaultWhtType,
    vatTreatment: led.vatTreatment,
    group1: { code: CHART_TYPE_DIGIT[led.type], name: CHART_TYPE_LABEL[led.type] },
    group2: { code: prefixOf(led.code, 2), name: groupNameOf(prefixOf(led.code, 2)) },
    group3: { code: prefixOf(led.code, 3), name: groupNameOf(prefixOf(led.code, 3)) },
    asOf,
    balanceSatang,
    monthDeltaSatang,
    monthKey,
    finance,
    mappingKeys: mappings.map((m) => m.key),
    movements,
    blockReason: archiveBlockReason(led.isSystem, usage),
    usage,
  };
}

/** ข้อความไทยบอกเหตุที่ "ปิดใช้งาน" ไม่ได้ · null = ปิดได้ */

export async function createLedgerV2(ctx: CoaCtx, input: SaveLedgerInput): Promise<SaveLedgerResult> {
  const fields = validateLedgerInput(input);
  if (Object.keys(fields).length) return { ok: false, fields };
  const code = input.code.trim();
  const type = typeFromCode(input.groupPrefix) ?? typeFromCode(code);
  if (!type) return { ok: false, fields: { code: "รหัสบัญชีต้องขึ้นต้นด้วย 1–6 (หมวดบัญชี)" } };

  const dup = await prisma.accountLedger.findFirst({
    where: { systemId: ctx.systemId, code },
    select: { id: true },
  });
  if (dup) return { ok: false, fields: { code: `มีรหัสบัญชี ${code} อยู่แล้ว` } };

  const l = await prisma.accountLedger.create({
    data: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      code,
      name: input.name.trim(),
      nameEn: input.nameEn?.trim() || null,
      type,
      cashflowActivity: code.startsWith("16") ? "INVESTING" : code.startsWith("3") ? "FINANCING" : "OPERATING",
      isSystem: false,
      level: 4,
      description: input.description?.trim() || null,
      defaultWhtRateBp: input.defaultWhtRateBp ?? null,
      defaultWhtType: input.defaultWhtType?.trim() || null,
      vatTreatment: input.vatTreatment?.trim() || null,
    },
    select: { id: true, code: true },
  });
  return { ok: true, id: l.id, code: l.code };
}

export async function updateLedgerV2(ctx: CoaCtx, id: string, input: SaveLedgerInput): Promise<SaveLedgerResult> {
  const led = await prisma.accountLedger.findFirst({
    where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, code: true, isSystem: true },
  });
  if (!led) return { ok: false, fields: { code: "ไม่พบบัญชีนี้" } };

  const fields = validateLedgerInput(input);
  const code = input.code.trim();
  // บัญชีระบบ: แก้ชื่อ/คำอธิบาย/WHT/ภาษีได้ แต่ห้ามย้ายรหัส (งบ/mapping อ้างรหัสเดิม)
  if (led.isSystem && code !== led.code) fields.code = "บัญชีระบบเปลี่ยนรหัสไม่ได้";
  if (Object.keys(fields).length) return { ok: false, fields };

  if (code !== led.code) {
    const dup = await prisma.accountLedger.findFirst({
      where: { systemId: ctx.systemId, code, NOT: { id } },
      select: { id: true },
    });
    if (dup) return { ok: false, fields: { code: `มีรหัสบัญชี ${code} อยู่แล้ว` } };
  }

  const type = typeFromCode(input.groupPrefix) ?? typeFromCode(code);
  await prisma.accountLedger.update({
    where: { id },
    data: {
      code: led.isSystem ? undefined : code,
      name: input.name.trim(),
      nameEn: input.nameEn?.trim() || null,
      type: led.isSystem || !type ? undefined : type,
      description: input.description?.trim() || null,
      defaultWhtRateBp: input.defaultWhtRateBp ?? null,
      defaultWhtType: input.defaultWhtType?.trim() || null,
      vatTreatment: input.vatTreatment?.trim() || null,
    },
  });
  return { ok: true, id, code };
}

/** เปิด/ปิดใช้งานบัญชี (SPEC §11.1 toggle) — ปิดได้เฉพาะบัญชีที่ยังไม่ถูกใช้ · กู้คืนได้เสมอ */
export async function setLedgerActive(
  ctx: CoaCtx,
  id: string,
  active: boolean,
): Promise<{ ok: true; active: boolean } | { ok: false; reason: string }> {
  const led = await prisma.accountLedger.findFirst({
    where: { id, tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { id: true, isSystem: true, archivedAt: true },
  });
  if (!led) return { ok: false, reason: "ไม่พบบัญชีนี้" };

  if (active) {
    if (!led.archivedAt) return { ok: true, active: true };
    await prisma.accountLedger.update({ where: { id }, data: { archivedAt: null } });
    return { ok: true, active: true };
  }

  if (led.archivedAt) return { ok: true, active: false };
  const [journalLines, docLines, mappings, finance] = await Promise.all([
    prisma.accountJournalLine.count({ where: { systemId: ctx.systemId, accountId: id } }),
    prisma.accountDocumentLine.count({ where: { systemId: ctx.systemId, accountId: id } }),
    prisma.accountMapping.count({ where: { systemId: ctx.systemId, accountId: id } }),
    prisma.accountFinance.count({ where: { systemId: ctx.systemId, ledgerAccountId: id } }),
  ]);
  const reason = archiveBlockReason(led.isSystem, { journalLines, docLines, mappings, finance });
  if (reason) return { ok: false, reason };
  await prisma.accountLedger.update({ where: { id }, data: { archivedAt: new Date() } });
  return { ok: true, active: false };
}

/** รหัสบัญชีที่ใช้ไปแล้วทั้งหมด (รวมที่ปิดใช้งาน) — modal ใช้หา "รหัสถัดไปที่ว่าง" */
export async function usedLedgerCodes(ctx: CoaCtx): Promise<Set<string>> {
  const rows = await prisma.accountLedger.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId },
    select: { code: true },
  });
  return new Set(rows.map((r) => r.code));
}

/**
 * createLedgerFromImport — สร้างบัญชี 1 ตัวจากแถว CSV (WO 6.1 · §11.1 "นำเข้าผังบัญชี")
 * ต่างจาก createLedgerV2 ตรงที่ไม่บังคับให้เลือก "หมวดย่อย" (CSV ใช้คอลัมน์ประเภท/รหัสนำหน้าแทน)
 * และ **ไม่ทับของเดิม** — รหัสซ้ำ = คืน ok:false ให้ตัวเรียกนับเป็น "ข้าม" (นำเข้าไฟล์เดิมซ้ำ = 0 รายการใหม่)
 */
export async function createLedgerFromImport(
  ctx: CoaCtx,
  input: { code: string; name: string; nameEn?: string | null; type: string; description?: string | null },
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const code = input.code.trim();
  if (!/^\d{3,6}$/.test(code)) return { ok: false, reason: "รหัสบัญชีต้องเป็นตัวเลข 3–6 หลัก" };
  if (!input.name.trim()) return { ok: false, reason: "ต้องระบุชื่อบัญชี" };
  const type = (typeFromCode(code) === null ? null : (input.type as AccountLedgerType)) ?? null;
  if (!type) return { ok: false, reason: "รหัสบัญชีต้องขึ้นต้นด้วย 1–6 (หมวดบัญชี)" };
  try {
    const l = await prisma.accountLedger.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: ctx.systemId,
        code,
        name: input.name.trim(),
        nameEn: input.nameEn?.trim() || null,
        type,
        cashflowActivity: activityFor(code),
        isSystem: false,
        level: 4,
        description: input.description?.trim() || null,
      },
      select: { id: true },
    });
    return { ok: true, id: l.id };
  } catch {
    // ชน unique(systemId, code) จากแถว/คำขออื่นที่วิ่งพร้อมกัน = ถือเป็น "ข้าม" ไม่ใช่ error
    return { ok: false, reason: `มีรหัสบัญชี ${code} อยู่แล้ว` };
  }
}

// ─────────────────── บัญชีแยกประเภท (หน้า /account/ledger — ปลายทางของลิงก์ "ดูบัญชีแยกประเภท") ───────────────────

export type LedgerRunningRow = {
  id: string;
  entryId: string;
  date: Date;
  docNo: string;
  memo: string | null;
  debit: number;
  credit: number;
  /** ยอดสะสม (Dr−Cr) หลังบรรทัดนี้ */
  running: number;
  /** ใบสำคัญนี้ถูกกลับรายการไปแล้ว (ยังต้องนับในยอด — สมุดรายวัน immutable) */
  reversed: boolean;
};

export type LedgerRunning = {
  opening: number;
  rows: LedgerRunningRow[];
  movementDebit: number;
  movementCredit: number;
  closing: number;
};

/**
 * ยอดยกมา + ความเคลื่อนไหวรายบรรทัด + ยอดยกไป ของบัญชีเดียวในช่วงวันที่
 *
 * 🐞 WO 6.1 รอบ 2 (บั๊กเดิมของหน้า /account/ledger): เดิมกรอง `entry.status = POSTED`
 *    แต่การกลับรายการ = ตั้งใบเดิมเป็น REVERSED (บรรทัดยังอยู่) + ลงใบตรงข้ามที่ POSTED
 *    ⇒ กรอง POSTED = เหลือแต่ "ขากลับ" ยอดในหน้าเลยเพี้ยนไปคนละทางกับ reports.ts/finance.ts/ผังบัญชี
 *    แก้: รวมทุกสถานะเหมือน reports.ts แล้วติดชิป "กลับรายการแล้ว" ให้ผู้ใช้เห็นว่าใบไหนถูกกลับ
 */
export async function ledgerRunning(
  ctx: CoaCtx,
  accountId: string,
  range: { from: Date; to: Date },
): Promise<LedgerRunning> {
  const [openAgg, lines] = await Promise.all([
    prisma.accountJournalLine.aggregate({
      where: { systemId: ctx.systemId, accountId, entry: { date: { lt: range.from } } },
      _sum: { debit: true, credit: true },
    }),
    prisma.accountJournalLine.findMany({
      where: { systemId: ctx.systemId, accountId, entry: { date: { gte: range.from, lte: range.to } } },
      select: {
        id: true,
        debit: true,
        credit: true,
        note: true,
        entry: { select: { id: true, date: true, docNo: true, memo: true, status: true, createdAt: true } },
      },
      orderBy: [{ entry: { date: "asc" } }, { entry: { createdAt: "asc" } }, { id: "asc" }],
    }),
  ]);

  const opening = (openAgg._sum.debit ?? 0) - (openAgg._sum.credit ?? 0);
  let running = opening;
  const rows: LedgerRunningRow[] = lines.map((l) => {
    running += l.debit - l.credit;
    return {
      id: l.id,
      entryId: l.entry.id,
      date: l.entry.date,
      docNo: l.entry.docNo,
      memo: l.note ?? l.entry.memo,
      debit: l.debit,
      credit: l.credit,
      running,
      reversed: l.entry.status === "REVERSED",
    };
  });
  const movementDebit = rows.reduce((s, r) => s + r.debit, 0);
  const movementCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { opening, rows, movementDebit, movementCredit, closing: opening + movementDebit - movementCredit };
}
