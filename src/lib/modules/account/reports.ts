import { prisma } from "@/lib/core/db";
import { csvCell } from "@/lib/core/csv";
import type { AccountLedgerType, AccountCashflowActivity, Prisma } from "@prisma/client";
import { buildChecks, salesTaxReport, type SalesTaxReport } from "./sales-tax-report";
import { purchaseTaxReport, type PurchaseTaxReport } from "./purchase-tax-report";
import { rateLabelTh, SALES_TAX_ABB_MODE_LABEL_TH, type SalesTaxAbbMode } from "./sales-tax-shared";
import { pp30ReturnOf, vatLedgers, type Pp30Return } from "./pp30-return";
import { PP30_CARRY_SOURCE_LABEL_TH, PP30_EXCESS_CHOICE_LABEL_TH, PP30_LINE_KEYS, PP30_LINE_LABEL_TH, PP30_AMOUNT_KEYS, type Pp30ExcessChoice } from "./pp30-shared";
import { legalWarningRefTh } from "@/lib/core/settings/legal/warnings"; // ACC T4 Job 0 ◂

// ─────────────────────────────────────────────────────────────
// reports.ts — งบการเงิน + รายงาน (P3) · READ-ONLY (ไม่โพสต์ GL)
// derive ทุกอย่างจาก AccountJournalLine (debit/credit) join AccountLedger
// เงิน Int สตางค์ล้วน · แปลงบาทตอนแสดงเท่านั้น (ห้าม float ใน pipeline)
// อ้าง §3.6 (งบ) · §10 (รายงาน) · QC5 ledger-M6/M7/M8/M10 · tax-M4/M5
// granularity = periodKey ("YYYY-MM") — ใช้ index [systemId, periodKey] + เลี่ยง TZ
// เจ้าของไฟล์ = Reports (P3) agent — ไม่แตะ service/actions/gl/coa
//
// ⚠️ Immutable ledger: reverse = entry ตรงข้าม (original คง status REVERSED อยู่ในบัญชี)
//    → รวม "ทุก" entry เสมอ (ไม่กรอง status) คู่ reverse หักกันเองเป็น 0
// ⚠️ NOTE dependency: งบกระแสเงินสด reconcile กับ AccountFinance ได้ต่อเมื่อ
//    ยอดยกมา (OPENING) ถูกโพสต์ (ledger-M6) + บัญชีเงินผูก ledgerAccountId
// ─────────────────────────────────────────────────────────────

export type GlCtx = { tenantId: string; systemId: string };

// ตัวกรอง periodKey ("YYYY-MM") — lexicographic เทียบได้ตรง ๆ
type KeyFilter = {
  lt?: string;
  lte?: string;
  gte?: string;
  gt?: string;
  equals?: string;
};

type LedgerMeta = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  type: AccountLedgerType;
  cashflowActivity: AccountCashflowActivity;
};

type Sums = Map<string, { debit: number; credit: number }>;

// ─────────────────── ตัวช่วยหลัก ───────────────────

async function loadLedgers(systemId: string): Promise<Map<string, LedgerMeta>> {
  const rows = await prisma.accountLedger.findMany({
    where: { systemId },
    select: { id: true, code: true, name: true, nameEn: true, type: true, cashflowActivity: true },
  });
  return new Map(rows.map((r) => [r.id, r]));
}

/** Σ debit/credit ต่อบัญชี บน periodKey filter (รวมทุก status — immutable ledger) */
async function sumByAccount(systemId: string, periodKey: KeyFilter): Promise<Sums> {
  const rows = await prisma.accountJournalLine.groupBy({
    by: ["accountId"],
    where: { systemId, entry: { periodKey } },
    _sum: { debit: true, credit: true },
  });
  const m: Sums = new Map();
  for (const r of rows) {
    m.set(r.accountId, { debit: r._sum.debit ?? 0, credit: r._sum.credit ?? 0 });
  }
  return m;
}

const get = (m: Sums, id: string) => m.get(id) ?? { debit: 0, credit: 0 };

// เดือน index สำหรับเลื่อนงวด / ปีบัญชี — "YYYY-MM" ↔ ปี*12 + (เดือน−1)
function keyToIdx(key: string): number {
  const [y, mo] = key.split("-").map(Number);
  return y * 12 + (mo - 1);
}
function idxToKey(idx: number): string {
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** ต้นปีบัญชีที่ครอบเดือน asOfKey (fyEndMonth = เดือนสิ้นปีบัญชี, default 12 = ปีปฏิทิน) */
export function fiscalYearStartKey(asOfKey: string, fyEndMonth = 12): string {
  const [y, mo] = asOfKey.split("-").map(Number);
  const endYear = mo <= fyEndMonth ? y : y + 1;
  const endIdx = endYear * 12 + (fyEndMonth - 1);
  return idxToKey(endIdx - 11);
}

// ─────────────────── 1) งบทดลอง (Trial Balance) ───────────────────

export type TrialBalanceRow = {
  code: string;
  name: string;
  type: AccountLedgerType;
  openingDebit: number;
  openingCredit: number;
  movementDebit: number;
  movementCredit: number;
  closingDebit: number;
  closingCredit: number;
};

export type TrialBalance = {
  from: string;
  to: string;
  rows: TrialBalanceRow[];
  totals: Omit<TrialBalanceRow, "code" | "name" | "type">;
  balanced: boolean; // Σ closingDebit == Σ closingCredit (+ movement เท่ากัน)
};

export async function trialBalance(ctx: GlCtx, from: string, to: string): Promise<TrialBalance> {
  const ledgers = await loadLedgers(ctx.systemId);
  const [opening, movement] = await Promise.all([
    sumByAccount(ctx.systemId, { lt: from }),
    sumByAccount(ctx.systemId, { gte: from, lte: to }),
  ]);

  const ids = new Set<string>([...opening.keys(), ...movement.keys()]);
  const rows: TrialBalanceRow[] = [];
  const totals = {
    openingDebit: 0,
    openingCredit: 0,
    movementDebit: 0,
    movementCredit: 0,
    closingDebit: 0,
    closingCredit: 0,
  };

  for (const id of ids) {
    const led = ledgers.get(id);
    if (!led) continue;
    const op = get(opening, id);
    const mv = get(movement, id);
    const openNet = op.debit - op.credit;
    const closeNet = openNet + mv.debit - mv.credit;
    if (openNet === 0 && mv.debit === 0 && mv.credit === 0) continue; // บัญชีไม่มีความเคลื่อนไหว

    const row: TrialBalanceRow = {
      code: led.code,
      name: led.name,
      type: led.type,
      openingDebit: openNet > 0 ? openNet : 0,
      openingCredit: openNet < 0 ? -openNet : 0,
      movementDebit: mv.debit,
      movementCredit: mv.credit,
      closingDebit: closeNet > 0 ? closeNet : 0,
      closingCredit: closeNet < 0 ? -closeNet : 0,
    };
    rows.push(row);
    totals.openingDebit += row.openingDebit;
    totals.openingCredit += row.openingCredit;
    totals.movementDebit += row.movementDebit;
    totals.movementCredit += row.movementCredit;
    totals.closingDebit += row.closingDebit;
    totals.closingCredit += row.closingCredit;
  }

  rows.sort((a, b) => a.code.localeCompare(b.code));
  const balanced =
    totals.closingDebit === totals.closingCredit && totals.movementDebit === totals.movementCredit;
  return { from, to, rows, totals, balanced };
}

// ─────────────────── 2) งบกำไรขาดทุน (P&L) ───────────────────

export type PLRow = { code: string; name: string; amount: number };
type PLCore = {
  income: { rows: PLRow[]; total: number };
  cogs: { rows: PLRow[]; total: number };
  grossProfit: number;
  expense: { rows: PLRow[]; total: number };
  netProfit: number;
};

// INCOME = credit−debit (contra 4800 = debit → ลดรายได้เอง) · COGS/EXPENSE = debit−credit
function plCore(sums: Sums, ledgers: Map<string, LedgerMeta>): PLCore {
  const income: PLRow[] = [];
  const cogs: PLRow[] = [];
  const expense: PLRow[] = [];
  let incomeTotal = 0;
  let cogsTotal = 0;
  let expenseTotal = 0;

  for (const [id, s] of sums) {
    const led = ledgers.get(id);
    if (!led) continue;
    if (led.type === "INCOME") {
      const amt = s.credit - s.debit;
      if (amt === 0) continue;
      income.push({ code: led.code, name: led.name, amount: amt });
      incomeTotal += amt;
    } else if (led.type === "COGS") {
      const amt = s.debit - s.credit;
      if (amt === 0) continue;
      cogs.push({ code: led.code, name: led.name, amount: amt });
      cogsTotal += amt;
    } else if (led.type === "EXPENSE") {
      const amt = s.debit - s.credit;
      if (amt === 0) continue;
      expense.push({ code: led.code, name: led.name, amount: amt });
      expenseTotal += amt;
    }
  }
  const sortByCode = (a: PLRow, b: PLRow) => a.code.localeCompare(b.code);
  income.sort(sortByCode);
  cogs.sort(sortByCode);
  expense.sort(sortByCode);
  const grossProfit = incomeTotal - cogsTotal;
  return {
    income: { rows: income, total: incomeTotal },
    cogs: { rows: cogs, total: cogsTotal },
    grossProfit,
    expense: { rows: expense, total: expenseTotal },
    netProfit: grossProfit - expenseTotal,
  };
}

function plProfit(sums: Sums, ledgers: Map<string, LedgerMeta>): number {
  return plCore(sums, ledgers).netProfit;
}

export type ProfitLoss = PLCore & {
  from: string;
  to: string;
  compare?: { from: string; to: string } & PLCore; // งวดก่อน (ช่วงยาวเท่ากัน)
};

export async function profitLoss(
  ctx: GlCtx,
  from: string,
  to: string,
  opts?: { compare?: boolean },
): Promise<ProfitLoss> {
  const ledgers = await loadLedgers(ctx.systemId);
  const sums = await sumByAccount(ctx.systemId, { gte: from, lte: to });
  const core = plCore(sums, ledgers);

  let compare: ProfitLoss["compare"];
  if (opts?.compare) {
    const span = keyToIdx(to) - keyToIdx(from); // จำนวนเดือน − 1
    const prevToIdx = keyToIdx(from) - 1;
    const prevFromIdx = prevToIdx - span;
    const prevFrom = idxToKey(prevFromIdx);
    const prevTo = idxToKey(prevToIdx);
    const prevSums = await sumByAccount(ctx.systemId, { gte: prevFrom, lte: prevTo });
    compare = { from: prevFrom, to: prevTo, ...plCore(prevSums, ledgers) };
  }

  return { from, to, ...core, compare };
}

// ─────────────────── 3) งบแสดงฐานะการเงิน (Balance Sheet) ───────────────────

export type BSRow = { code: string; name: string; amount: number };
export type BalanceSheet = {
  asOf: string; // periodKey — "ณ สิ้นเดือน"
  fiscalYearStartKey: string;
  assets: { rows: BSRow[]; total: number };
  liabilities: { rows: BSRow[]; total: number };
  equity: { rows: BSRow[]; total: number }; // บัญชีทุนจริง (3xxx)
  retainedEarnings: number; // virtual: Σ P&L ปีบัญชีก่อนหน้า
  currentPeriodProfit: number; // virtual: Σ P&L ตั้งแต่ต้นปีบัญชีถึง asOf
  totalEquity: number; // equity.total + retained + current
  totalLiabilitiesEquity: number;
  balanced: boolean; // assets == liabilities + totalEquity
};

export async function balanceSheet(
  ctx: GlCtx,
  asOf: string,
  opts?: { fiscalYearEndMonth?: number },
): Promise<BalanceSheet> {
  const ledgers = await loadLedgers(ctx.systemId);
  const fyStart = fiscalYearStartKey(asOf, opts?.fiscalYearEndMonth ?? 12);

  const [sums, retainedSums] = await Promise.all([
    sumByAccount(ctx.systemId, { lte: asOf }),
    sumByAccount(ctx.systemId, { lt: fyStart }),
  ]);

  const assets: BSRow[] = [];
  const liabilities: BSRow[] = [];
  const equity: BSRow[] = [];
  let assetTotal = 0;
  let liabTotal = 0;
  let equityTotal = 0;

  for (const [id, s] of sums) {
    const led = ledgers.get(id);
    if (!led) continue;
    if (led.type === "ASSET") {
      const amt = s.debit - s.credit;
      if (amt === 0) continue;
      assets.push({ code: led.code, name: led.name, amount: amt });
      assetTotal += amt;
    } else if (led.type === "LIABILITY") {
      const amt = s.credit - s.debit;
      if (amt === 0) continue;
      liabilities.push({ code: led.code, name: led.name, amount: amt });
      liabTotal += amt;
    } else if (led.type === "EQUITY") {
      const amt = s.credit - s.debit;
      if (amt === 0) continue;
      equity.push({ code: led.code, name: led.name, amount: amt });
      equityTotal += amt;
    }
  }
  const sortByCode = (a: BSRow, b: BSRow) => a.code.localeCompare(b.code);
  assets.sort(sortByCode);
  liabilities.sort(sortByCode);
  equity.sort(sortByCode);

  const cumulativeProfit = plProfit(sums, ledgers);
  const retainedEarnings = plProfit(retainedSums, ledgers);
  const currentPeriodProfit = cumulativeProfit - retainedEarnings;
  const totalEquity = equityTotal + retainedEarnings + currentPeriodProfit;
  const totalLiabilitiesEquity = liabTotal + totalEquity;

  return {
    asOf,
    fiscalYearStartKey: fyStart,
    assets: { rows: assets, total: assetTotal },
    liabilities: { rows: liabilities, total: liabTotal },
    equity: { rows: equity, total: equityTotal },
    retainedEarnings,
    currentPeriodProfit,
    totalEquity,
    totalLiabilitiesEquity,
    balanced: assetTotal === totalLiabilitiesEquity,
  };
}

// ─────────────────── 4) งบกระแสเงินสด (วิธีตรง — ledger-M8) ───────────────────

export type CashFlowLine = { code: string; name: string; amount: number }; // + เข้า / − ออก
export type CashFlowSection = {
  activity: "OPERATING" | "INVESTING" | "FINANCING";
  inflow: number;
  outflow: number; // ค่าบวก (ยอดที่ไหลออก)
  net: number;
  lines: CashFlowLine[];
};

export type CashFlow = {
  from: string;
  to: string;
  openingCash: number;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChange: number;
  closingCash: number;
  reconciled: boolean; // openingCash + netChange == closingCash
  hasUnclassified: boolean; // มีบัญชีคู่ activity=NONE → รวมเข้า OPERATING (ต้องเคลียร์ก่อนปิดงวด)
};

// รหัสบัญชีเงิน 1000–1049 (§4.14)
function isCashCode(code: string): boolean {
  return code >= "1000" && code <= "1049";
}

export async function cashFlow(ctx: GlCtx, from: string, to: string): Promise<CashFlow> {
  const ledgers = await loadLedgers(ctx.systemId);

  // บัญชีเงิน = code 10xx (1000–1049) ∪ ledger ที่ AccountFinance ผูกไว้
  const cashIds = new Set<string>();
  for (const [id, led] of ledgers) if (isCashCode(led.code)) cashIds.add(id);
  const finances = await prisma.accountFinance.findMany({
    where: { systemId: ctx.systemId, ledgerAccountId: { not: null } },
    select: { ledgerAccountId: true },
  });
  for (const f of finances) if (f.ledgerAccountId) cashIds.add(f.ledgerAccountId);

  const cashIdList = [...cashIds];
  const netOverCash = (sums: Sums) => {
    let n = 0;
    for (const id of cashIdList) {
      const s = get(sums, id);
      n += s.debit - s.credit;
    }
    return n;
  };
  const [openingSums, closingSums] = await Promise.all([
    sumByAccount(ctx.systemId, { lt: from }),
    sumByAccount(ctx.systemId, { lte: to }),
  ]);
  const openingCash = netOverCash(openingSums);
  const closingCash = netOverCash(closingSums);

  // entry ในช่วงที่แตะบัญชีเงิน ≥ 1 บรรทัด
  const entries =
    cashIdList.length === 0
      ? []
      : await prisma.accountJournalEntry.findMany({
          where: {
            systemId: ctx.systemId,
            periodKey: { gte: from, lte: to },
            lines: { some: { accountId: { in: cashIdList } } },
          },
          select: { lines: { select: { accountId: true, debit: true, credit: true } } },
        });

  // bucket ต่อ activity → บัญชีคู่ → ยอด (credit−debit = ทิศทางเงินสด)
  const buckets: Record<"OPERATING" | "INVESTING" | "FINANCING", Map<string, number>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FINANCING: new Map(),
  };
  let hasUnclassified = false;

  for (const e of entries) {
    const nonCash = e.lines.filter((l) => !cashIds.has(l.accountId));
    if (nonCash.length === 0) continue; // โอนภายใน (cash↔cash) → ไม่นับ
    for (const l of nonCash) {
      const led = ledgers.get(l.accountId);
      if (!led) continue;
      let act = led.cashflowActivity;
      if (act === "NONE") {
        act = "OPERATING"; // ledger-M8: NONE → OPERATING + flag ให้เคลียร์
        hasUnclassified = true;
      }
      const flow = l.credit - l.debit; // + = เงินเข้า, − = เงินออก
      const m = buckets[act];
      m.set(l.accountId, (m.get(l.accountId) ?? 0) + flow);
    }
  }

  const section = (activity: "OPERATING" | "INVESTING" | "FINANCING"): CashFlowSection => {
    const lines: CashFlowLine[] = [];
    let inflow = 0;
    let outflow = 0;
    for (const [id, amt] of buckets[activity]) {
      if (amt === 0) continue;
      const led = ledgers.get(id)!;
      lines.push({ code: led.code, name: led.name, amount: amt });
      if (amt > 0) inflow += amt;
      else outflow += -amt;
    }
    lines.sort((a, b) => a.code.localeCompare(b.code));
    return { activity, inflow, outflow, net: inflow - outflow, lines };
  };

  const operating = section("OPERATING");
  const investing = section("INVESTING");
  const financing = section("FINANCING");
  const netChange = operating.net + investing.net + financing.net;

  return {
    from,
    to,
    openingCash,
    operating,
    investing,
    financing,
    netChange,
    closingCash,
    reconciled: openingCash + netChange === closingCash,
    hasUnclassified,
  };
}

// ─────────────────── 5) ภ.พ.30 + รายงานภาษีขาย/ซื้อ (tax-M4/M5) ───────────────────

export type Pp30Row = {
  docNo: string;
  date: Date;
  contactName: string;
  taxId: string;
  branchCode: string;
  base: number; // ฐานภาษี (สตางค์)
  vat: number; // จำนวนภาษี (สตางค์)
  rateBp: number; // 700 = 7%
  /** ACC T1.9 ▸ แถวจาก JV ที่บันทึกเอง (รายการปรับปรุงมือ — ไม่มีใบกำกับ) ◂ */
  manual?: boolean;
  /** ACC T1.5 (เลน 2) — ภาษีซื้อเคลมข้ามเดือน: "ถือเป็นภาษีซื้อในเดือนภาษี…" (ประกาศ VAT ฉ.4 ข้อ 2) */
  note?: string | null;
};

export type Pp30RateGroup = { rateBp: number; base: number; vat: number };
/** ACC T1.9 ▸ rateBp ของกลุ่ม "รายการปรับปรุงมือ" (JV ที่บันทึกเอง ไม่มีฐาน) ในรายงานภาษีซื้อ ◂ */
export const MANUAL_ADJUST_RATE_BP = -2;

export type Pp30Side = {
  total: number; // Σ ภาษี (สตางค์)
  base: number; // Σ ฐาน
  rows: Pp30Row[];
  byRate: Pp30RateGroup[];
};

export type Pp30 = {
  periodKey: string;
  /** ACC T1.1 ▸ รายงานภาษีขายเต็ม (หัวรายงาน · ใบย่อรวมรายวัน · กลุ่มอัตรา · ข้อตรวจ) — output.rows/byRate มาจากก้อนนี้ ◂ */
  salesTax: SalesTaxReport;
  /** ACC T1.6 ▸ รายงานภาษีซื้อเต็ม (หัวรายงาน · ลำดับที่ต่อเดือนตามวันที่รับ · ปรับปรุงมือ · หักไม่ได้ · รอใบกำกับ · ข้อตรวจ) ◂ */
  purchaseTax: PurchaseTaxReport;
  output: Pp30Side; // ภาษีขาย (บัญชีตาม mapping VAT_OUTPUT)
  input: Pp30Side; // ภาษีซื้อ (บัญชีตาม mapping VAT_INPUT)
  carryForward: number; // เครดิตภาษียกมา (T1.3: จำจากเดือนก่อน — `ret.carry` บอกที่มา)
  netPayable: number; // > 0 = ต้องชำระ · < 0 = ชำระเกินสุทธิ
  creditCarry: number; // ยอดเครดิตยกไปเดือนถัดไป (0 เมื่อเลือกขอคืน)
  /** ACC T1.3 ▸ ภ.พ.30 ครบช่อง · เครดิตยกมา · กำหนดยื่น · กระทบ GL ผ่าน mapping · สถานะยื่น/แบบเพิ่มเติม · คำเตือน ◂ */
  ret: Pp30Return;
};

async function pp30Side(
  systemId: string,
  ledgerId: string,
  periodKey: string,
  sign: "OUTPUT" | "INPUT",
): Promise<Pp30Side> {
  // ทุกบรรทัดที่แตะบัญชี VAT ในเดือนนั้น (reconcile กับ GL เป๊ะ)
  const lines = await prisma.accountJournalLine.findMany({
    where: { systemId, accountId: ledgerId, entry: { periodKey } },
    select: {
      debit: true,
      credit: true,
      entry: { select: { refType: true, refId: true, date: true, docNo: true, source: true } },
    },
  });

  // รวม VAT ต่อเอกสารต้นทาง
  type Agg = { vat: number; date: Date; docRefId: string | null; journalNo: string; manual: boolean };
  const perDoc = new Map<string, Agg>();
  const docIds = new Set<string>();
  let i = 0;
  for (const l of lines) {
    const vat = sign === "OUTPUT" ? l.credit - l.debit : l.debit - l.credit;
    if (vat === 0) continue;
    const isDoc = l.entry.refType === "AccountDocument" && l.entry.refId;
    const key = isDoc ? `doc:${l.entry.refId}` : `jv:${l.entry.docNo}:${i++}`;
    if (isDoc && l.entry.refId) docIds.add(l.entry.refId);
    const prev = perDoc.get(key);
    if (prev) prev.vat += vat;
    else
      perDoc.set(key, {
        vat,
        date: l.entry.date,
        docRefId: isDoc ? l.entry.refId : null,
        journalNo: l.entry.docNo,
        manual: l.entry.source === "MANUAL",
      });
  }

  // ดึงข้อมูลเอกสาร (ฐาน + คู่ค้า + สาขา)
  const docs =
    docIds.size === 0
      ? []
      : await prisma.accountDocument.findMany({
          where: { systemId, id: { in: [...docIds] } },
          select: {
            id: true,
            docNo: true,
            subTotal: true,
            discountAmount: true,
            contactSnapshot: true,
            contact: { select: { name: true, taxId: true, branchCode: true } },
            inputVatLateNote: true, // ACC T1.5 (เลน 2)
          },
        });
  const docMap = new Map(docs.map((d) => [d.id, d]));

  const rows: Pp30Row[] = [];
  const rateMap = new Map<number, Pp30RateGroup>();
  let total = 0;
  let baseTotal = 0;

  for (const agg of perDoc.values()) {
    // F-08: ข้ามเอกสารที่ VAT สุทธิ = 0 (void แล้ว reversal หักกันเอง) — ไม่นับฐาน
    if (agg.vat === 0) continue;
    const doc = agg.docRefId ? docMap.get(agg.docRefId) : undefined;
    const snap = (doc?.contactSnapshot ?? null) as
      | { name?: string; taxId?: string; branchCode?: string }
      | null;
    const contactName = snap?.name ?? doc?.contact?.name ?? "-";
    const taxId = snap?.taxId ?? doc?.contact?.taxId ?? "";
    const branchCode = snap?.branchCode ?? doc?.contact?.branchCode ?? "";
    // ฐาน: ประมาณจากยอดเอกสาร (subTotal − ส่วนลด) — reconcile ภาษีจาก GL จริง
    // F-08: ฐานตามทิศ VAT (ใบลดหนี้ VAT ติดลบ → ฐานติดลบด้วย)
    const rawBase = doc ? doc.subTotal - doc.discountAmount : 0;
    const base = agg.vat < 0 ? -rawBase : rawBase;
    // อัตรา: derive จาก vat/base (700 = 7%) — SME ส่วนใหญ่อัตราเดียว (ทั้งบวก/ลบให้ได้ 700)
    // ACC T1.9 ▸ JV มือ (ไม่มีเอกสาร) ไม่มีฐาน ⇒ กลุ่มของตัวเอง (MANUAL_ADJUST_RATE_BP) ไม่ปนกับอัตรา 0% ◂
    const rateBp = agg.manual && !doc ? MANUAL_ADJUST_RATE_BP : base !== 0 ? Math.round((agg.vat / base) * 10000) : 0;

    rows.push({
      docNo: doc?.docNo ?? agg.journalNo,
      date: agg.date,
      contactName,
      taxId,
      branchCode,
      base,
      vat: agg.vat,
      rateBp,
      ...(agg.manual ? { manual: true, contactName: "รายการปรับปรุงมือ (JV ที่บันทึกเอง)" } : {}),
      note: doc?.inputVatLateNote ?? null, // ACC T1.5 (เลน 2)
    });
    total += agg.vat;
    baseTotal += base;

    const g = rateMap.get(rateBp) ?? { rateBp, base: 0, vat: 0 };
    g.base += base;
    g.vat += agg.vat;
    rateMap.set(rateBp, g);
  }

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const byRate = [...rateMap.values()].sort((a, b) => b.rateBp - a.rateBp);
  return { total, base: baseTotal, rows, byRate };
}

export async function pp30(
  ctx: GlCtx,
  periodKey: string,
  opts?: { carryForward?: number | null; abbMode?: SalesTaxAbbMode | null; excessChoice?: Pp30ExcessChoice | null },
): Promise<Pp30> {
  // ACC T1.3 ▸ บัญชีภาษีจาก mapping (VAT_OUTPUT / VAT_INPUT) — ไม่ใช่รหัสตายตัว ◂
  const ledgers = await vatLedgers(ctx);
  const outputId = ledgers.VAT_OUTPUT?.id;
  const inputId = ledgers.VAT_INPUT?.id;

  // ACC T1.1 ▸ ภาษีขาย: ยอด ภ.พ.30 = ยอดเคลื่อนไหว 2200 ของเดือน (คิวรีรวมแยก) · รายใบ/กลุ่มอัตรามาจากรายงานภาษีขาย ◂
  const [salesTax, outAgg, input] = await Promise.all([
    salesTaxReport(ctx, periodKey, { abbMode: opts?.abbMode ?? null, outputLedgerId: outputId ?? null }),
    outputId
      ? prisma.accountJournalLine.aggregate({ where: { systemId: ctx.systemId, accountId: outputId, entry: { periodKey } }, _sum: { debit: true, credit: true } })
      : Promise.resolve(null),
    inputId
      ? pp30Side(ctx.systemId, inputId, periodKey, "INPUT")
      : Promise.resolve<Pp30Side>({ total: 0, base: 0, rows: [], byRate: [] }),
  ]);
  const outputVat = (outAgg?._sum.credit ?? 0) - (outAgg?._sum.debit ?? 0);
  salesTax.checks = buildChecks(salesTax.rows, salesTax.total.vat, salesTax.glVat, outputVat, salesTax.outputLedger);
  const output: Pp30Side = {
    total: outputVat,
    base: salesTax.total.base,
    // แถวยกเลิกในเดือนเดียวกัน (ยอด 0) อยู่ในรายงานภาษีขายพร้อมหมายเหตุ — ไม่ใส่ในรายการแบบแบน (API/ผู้เรียกเดิม: แถว = ยอดภาษี)
    rows: salesTax.rows.flatMap((r) =>
      r.parts.filter((p) => p.base !== 0 || p.vat !== 0).map((p) => ({
        docNo: r.docNoTo ? `${r.docNo} ถึง ${r.docNoTo}` : r.docNo,
        date: new Date(`${r.date}T00:00:00+07:00`),
        contactName: r.buyerName,
        taxId: r.buyerTaxId,
        branchCode: r.buyerBranchCode,
        base: p.base,
        vat: p.vat,
        rateBp: p.rateBp,
        ...(r.manual ? { manual: true } : {}),
      })),
    ),
    byRate: salesTax.groups.map((g) => ({ rateBp: g.rateBp, base: g.base, vat: g.vat })),
  };

  // ACC T1.6 ▸ รายงานภาษีซื้อ (ข้อตรวจเทียบภาษีซื้อของแบบ = ยอดเคลื่อนไหวบัญชีภาษีซื้อตาม mapping) ◂
  const purchaseTax = await purchaseTaxReport(ctx, periodKey, { pp30Vat: input.total });

  // ACC T1.3 ▸ ช่องยอดขายแยกอัตรามาจากกลุ่มของรายงานภาษีขาย (ตัวคิดเดียว — ตรงรายงาน ม.87) ◂
  const sumGroups = (f: (bp: number) => boolean) => salesTax.groups.filter((g) => f(g.rateBp)).reduce((n, g) => n + g.base, 0);
  const ret = await pp30ReturnOf(
    ctx,
    periodKey,
    {
      salesTaxable: sumGroups((bp) => bp > 0),
      salesZero: sumGroups((bp) => bp === 0),
      salesExempt: sumGroups((bp) => bp < 0),
      outputVat,
      // ACC T1.6 ▸ ยอดซื้อ = มูลค่าของส่วนที่หักได้ในรายงานภาษีซื้อ (ตัวคิดเดียวกับรายงาน ม.87 · ใบที่เคลมบางส่วนนับเฉพาะส่วนนั้น) ◂
      purchases: purchaseTax.docsTotal.base,
      inputVat: input.total,
    },
    { carryOverride: opts?.carryForward ?? null, excessChoice: opts?.excessChoice ?? null, ledgers },
  );
  const l = ret.lines;
  return {
    periodKey,
    salesTax,
    purchaseTax,
    output,
    input,
    carryForward: l.creditBroughtForward,
    netPayable: l.netPayable - l.netExcess,
    creditCarry: l.creditCarriedForward,
    ret,
  };
}

// ── ภ.พ.30 → CSV ยื่น/ตรวจ (WO-0035) ─────────────────────────────
// BOM UTF-8 ให้ Excel เปิดไทยได้ · ยอดเป็นบาททศนิยม 2 (แปลงจากสตางค์) — pattern เดียวกับ pndCsv
// 🔴 WO 9.2 ข้อ 7: กันสูตร + quote ผ่าน `csvCell` กลาง (ชื่อคู่ค้า/เลขที่เอกสารมาจากผู้ใช้)
//    ตัวเลขที่ส่งเข้ามาเป็น number = สตางค์ → แปลงเป็นบาททศนิยม 2 ก่อนส่งต่อ
const pp30Cell = (v: string | number): string => csvCell(typeof v === "number" ? (v / 100).toFixed(2) : v);

/** ACC T1.6 ▸ รายงานภาษีซื้อ → CSV (หัว · รายใบ ลำดับที่ · ปรับปรุงมือ · รวม · ข้อตรวจ · หักไม่ได้ · รอใบกำกับ) — เนื้อหาเดียวกับจอ ◂ */
export function purchaseTaxCsv(pt: PurchaseTaxReport, row: (cells: (string | number)[]) => void): void {
  const txt = (v: string | number) => String(v);
  const h = pt.header;
  row(["รายงานภาษีซื้อ"]);
  row(["ชื่อผู้ประกอบการ", h.orgName]);
  row(["เลขประจำตัวผู้เสียภาษีอากร", h.taxId]);
  row(["สถานประกอบการ", h.branchLabel, "รหัสสาขา", h.branchCode]);
  row(["เดือนภาษี", h.monthLabel, "งวด", pt.periodKey]);
  if (pt.inputLedger) row(["บัญชีภาษีซื้อ", `${pt.inputLedger.code} ${pt.inputLedger.name}`]);
  for (const w of h.warnings) row(["คำเตือน", w.messageTh, legalWarningRefTh(w)]); // ACC T4 Job 0 ◂
  row([]);
  row(["ลำดับ", "วันที่ได้รับ", "วันที่ใบกำกับ", "เลขที่ใบกำกับ", "เลขที่เอกสาร", "ชื่อผู้ขาย", "เลขผู้เสียภาษีผู้ขาย", "สาขาผู้ขาย", "มูลค่า(บาท)", "ภาษี(บาท)", "หมายเหตุ"]);
  for (const x of pt.rows)
    row([txt(x.seq ?? ""), x.receivedDate, x.invoiceDate, x.invoiceNo, x.docNo, x.vendorName, x.vendorTaxId, x.vendorBranchCode, x.base, x.vat, [...x.notes, ...(x.flag ? [x.flag] : [])].join(" · ")]);
  row(["รวมรายใบ", "", "", "", "", "", "", "", pt.docsTotal.base, pt.docsTotal.vat, ""]);
  if (pt.adjustments.length) {
    row(["รายการปรับปรุง (ไม่มีใบกำกับ)"]);
    for (const x of pt.adjustments) row(["", x.receivedDate, "", "", x.docNo, x.vendorName, "", "", 0, x.vat, x.notes.join(" · ")]);
    row(["รวมรายการปรับปรุง", "", "", "", "", "", "", "", 0, pt.adjustmentsTotal.vat, ""]);
  }
  row(["รวมภาษีซื้อทั้งสิ้น", "", "", "", "", "", "", "", pt.total.base, pt.total.vat, ""]);
  row([]);
  row(["ข้อตรวจกระทบยอด", "ผล", "ควรเป็น(บาท/จำนวน)", "ได้(บาท/จำนวน)", "รายละเอียด"]);
  for (const c of pt.checks) {
    const money = c.key !== "BASE_VAT";
    row([c.label, c.ok ? "ผ่าน" : "ไม่ตรง", money ? c.expected : txt(c.expected), money ? c.actual : txt(c.actual), c.detail ?? ""]);
  }
  row([]);
  row([`ภาษีซื้อที่หักไม่ได้ (ไม่รวมในรายงาน)${pt.notClaimable.posting === "INTO_COST" ? " — ค่าตั้ง: รวมเข้าต้นทุน ไม่มีบัญชีแยก" : ""}`]);
  row(["เหตุ", "มาตรา", "วันที่", "เลขที่เอกสาร", "ชื่อผู้ขาย", "เลขผู้เสียภาษีผู้ขาย", "มูลค่า(บาท)", "ภาษี(บาท)", "หมายเหตุ"]);
  for (const g of pt.notClaimable.groups) {
    for (const x of g.rows) row([g.labelTh, g.sectionTh, x.date, x.docNo, x.vendorName, x.vendorTaxId, x.base, x.vat, x.notes.join(" · ")]);
    row([`รวม ${g.labelTh}`, "", "", "", "", "", g.base, g.vat, ""]);
  }
  row(["รวมภาษีซื้อที่หักไม่ได้", "", "", "", "", "", pt.notClaimable.total.base, pt.notClaimable.total.vat, ""]);
  row([]);
  row(["ภาษีซื้อรอใบกำกับ (ไม่รวมในรายงาน · ณ วันที่ดู)"]);
  row(["เอกสารต้นทาง", "วันที่", "ชื่อผู้ขาย", "เลขผู้เสียภาษีผู้ขาย", "ภาษีรอ(บาท)", "อายุ(วัน)", "เคลมได้ถึง"]);
  for (const x of pt.pending.rows) row([x.sourceDocNo ?? "", x.sourceDate, x.vendorName, x.vendorTaxId, x.vat, txt(x.ageDays), `${x.pastWindow ? "เลย " : ""}${x.lastClaimMonthTh ?? ""}`]);
  row(["รวมภาษีซื้อรอใบกำกับ", "", "", "", pt.pending.vat, "", ""]);
}

/** ACC T1.3 ▸ ช่อง ภ.พ.30 ครบ (มูลค่า + ภาษี) · เครดิตยกมา + ที่มา · กำหนดยื่น · กระทบ GL · สถานะยื่น — ใช้ใน CSV ◂ */
function pp30ReturnCsv(ret: Pp30Return, row: (cells: (string | number)[]) => void): void {
  const l = ret.lines;
  row(["ภ.พ.30 — สรุปตามช่อง", "มูลค่า(บาท)", "ภาษี(บาท)"]);
  for (const k of PP30_LINE_KEYS) {
    const amount = PP30_AMOUNT_KEYS.includes(k);
    row([PP30_LINE_LABEL_TH[k], amount ? l[k] : "", amount ? "" : l[k]]);
  }
  row(["ภาษีที่ชำระเกินสุทธิ", PP30_EXCESS_CHOICE_LABEL_TH[l.excessChoice]]);
  row(["ที่มาของเครดิตยกมา", PP30_CARRY_SOURCE_LABEL_TH[ret.carry.source], "เดือนต้นทาง", ret.carry.fromPeriod]);
  if (ret.deadline.paper) row(["กำหนดยื่น (กระดาษ)", ret.deadline.paper.date]);
  if (ret.deadline.online) row(["กำหนดยื่น (อินเทอร์เน็ต)", ret.deadline.online.date]);
  for (const c of ret.reconcile) {
    if (c.onReturn === null) row([`บัญชีพัก: ${c.label}`, c.ledger ? `${c.ledger.code} ${c.ledger.name}` : "ไม่ได้ผูกบัญชี", "ยอดคงค้างสิ้นเดือน (ไม่เข้า ภ.พ.30)", c.balance ?? 0]);
    else row([`กระทบยอด: ${c.label}`, c.ledger ? `${c.ledger.code} ${c.ledger.name}` : "ไม่ได้ผูกบัญชี", "ยอดในบัญชี", c.movement, "ในแบบ", c.onReturn, c.ok ? "ตรง" : "ไม่ตรง"]);
  }
  row(["สถานะยื่น", ret.filed.filed ? `ยื่นแล้ว ${ret.filed.records.length} ครั้ง` : "ยังไม่ได้ทำเครื่องหมายยื่น"]);
  for (const x of ret.filed.records) row([x.kind === "ORIGINAL" ? "แบบปกติ" : `แบบเพิ่มเติมครั้งที่ ${x.seq}`, new Date(x.filedAt.getTime() + 7 * 3600_000).toISOString().slice(0, 10), "ภาษีสุทธิ", (x.lines.netPayable ?? 0) - (x.lines.netExcess ?? 0)]);
  if (ret.amendmentNeeded) row(["ยอดในสมุดต่างจากที่ยื่นล่าสุด — อาจต้องยื่นแบบเพิ่มเติม"]);
  for (const w of ret.warnings) row(["คำเตือน", w.messageTh, legalWarningRefTh(w)]); // ACC T4 Job 0 ◂
}

export async function pp30Csv(
  ctx: GlCtx,
  periodKey: string,
  opts?: { carryForward?: number | null; abbMode?: SalesTaxAbbMode | null },
): Promise<string> {
  const r = await pp30(ctx, periodKey, opts);
  const st = r.salesTax;
  const lines: string[] = [];
  const row = (cells: (string | number)[]) => lines.push(cells.map((v) => pp30Cell(v)).join(","));
  const txt = (v: string | number) => String(v); // ตัวเลขที่ไม่ใช่เงิน (ลำดับ จำนวนใบ อัตรา) — ไม่แปลงสตางค์

  // ── ACC T1.1 ▸ หัวรายงานภาษีขาย (skill §18: เดือนภาษี ชื่อ เลขผู้เสียภาษี สำนักงานใหญ่/สาขา) ◂
  row(["รายงานภาษีขาย"]);
  row(["ชื่อผู้ประกอบการ", st.header.orgName]);
  row(["เลขประจำตัวผู้เสียภาษีอากร", st.header.taxId]);
  row(["สถานประกอบการ", st.header.branchLabel, "รหัสสาขา", st.header.branchCode]);
  row(["เดือนภาษี", st.header.monthLabel, "งวด", st.periodKey]);
  row(["ใบกำกับภาษีอย่างย่อ", SALES_TAX_ABB_MODE_LABEL_TH[st.abbMode]]);
  for (const w of st.header.warnings) row(["คำเตือน", w.messageTh, legalWarningRefTh(w)]); // ACC T4 Job 0 ◂
  lines.push("");
  row(["ลำดับ", "วันที่", "เลขที่", "ถึงเลขที่", "จำนวนใบ", "ชื่อผู้ซื้อ", "เลขผู้เสียภาษีผู้ซื้อ", "สาขาผู้ซื้อ", "อัตรา", "มูลค่า(บาท)", "ภาษี(บาท)", "หมายเหตุ"]);
  for (const g of st.groups) {
    row([rateLabelTh(g.rateBp)]);
    for (const { row: x, part, seq } of g.rows) {
      row([
        txt(seq),
        x.date,
        x.docNo,
        x.docNoTo ?? "",
        txt(x.count ?? 1),
        x.buyerName,
        x.buyerTaxId,
        x.buyerBranchCode,
        part.rateBp > 0 ? (part.rateBp / 100).toFixed(2) : part.rateBp === 0 ? "0.00" : "ยกเว้น",
        part.base,
        part.vat,
        [...x.notes, ...(x.flag ? [x.flag] : [])].join(" · "),
      ]);
    }
    row([`รวม${rateLabelTh(g.rateBp)}`, "", "", "", "", "", "", "", "", g.base, g.vat, ""]);
  }
  row(["รวมภาษีขายทั้งสิ้น", "", "", "", "", "", "", "", "", st.total.base, st.total.vat, ""]);
  lines.push("");
  row(["ข้อตรวจกระทบยอด", "ผล", "ควรเป็น(บาท/จำนวน)", "ได้(บาท/จำนวน)", "รายละเอียด"]);
  for (const c of st.checks) {
    const money = c.key !== "BASE_VAT";
    row([c.label, c.ok ? "ผ่าน" : "ไม่ตรง", money ? c.expected : txt(c.expected), money ? c.actual : txt(c.actual), c.detail ?? ""]);
  }
  lines.push("");

  // ── ACC T1.6 ▸ รายงานภาษีซื้อ (เนื้อหาเดียวกับจอ/ใบพิมพ์) ◂ ──
  purchaseTaxCsv(r.purchaseTax, row);
  lines.push("");
  pp30ReturnCsv(r.ret, row);
  return "\uFEFF" + lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// รายงานอายุหนี้ (Aging) — ลูกหนี้ (OUT/AR) / เจ้าหนี้ (IN/AP) · WO-0039
// นับ AccountDocument ที่ยังค้างชำระ (AWAITING_PAYMENT|PARTIAL) voidedAt null
// outstanding = grandTotal − paidTotal (>0 เท่านั้น) · จัดกลุ่มต่อคู่ค้า
// bucket จากวันครบกำหนด (dueDate ?? issueDate) เทียบ asOf (default = ตอนนี้)
// สตางค์ล้วน — แปลงบาทตอนแสดง
// ─────────────────────────────────────────────────────────────

export type AgingRow = {
  contactId: string | null;
  contactName: string;
  notDueSatang: number;
  d1_30Satang: number;
  d31_60Satang: number;
  d61_90Satang: number;
  d90plusSatang: number;
  totalSatang: number;
};

export type AgingGrand = Omit<AgingRow, "contactId" | "contactName">;

/** จำนวน "ใบ" ที่ยังค้าง (ไม่ใช่ยอดเงิน) ต่อคู่ค้า — WO 3.4 ใช้ทำป้าย KPI "1 ใบ · พ้นกำหนด" */
export type AgingDocCount = { docs: number; overdueDocs: number };

export type AgingReport = {
  rows: AgingRow[];
  grand: AgingGrand;
  /**
   * WO 3.4 (additive · ผู้เรียกเดิมไม่ต้องแก้) — จำนวนใบค้าง/ใบพ้นกำหนดต่อคู่ค้า (key = contactId · null → "__none__")
   * มาจากรอบเดียวกับที่คิด bucket ⇒ ไม่ต้อง query ซ้ำเพื่อนับใบ
   */
  docCounts: Map<string, AgingDocCount>;
};

const AGING_NO_CONTACT = "ไม่ระบุคู่ค้า";

/** สร้างแถวอายุหนี้เปล่า (ทุก bucket = 0) — export ให้ dashboard.ts ใช้นิยาม bucket ชุดเดียวกัน */
export function emptyAging(): AgingGrand {
  return {
    notDueSatang: 0,
    d1_30Satang: 0,
    d31_60Satang: 0,
    d61_90Satang: 0,
    d90plusSatang: 0,
    totalSatang: 0,
  };
}

/** เลือก bucket key จากจำนวนวันเกินกำหนด (≤0 = ยังไม่ครบกำหนด) — export: dashboard.ts ใช้ตัวเดียวกัน */
export function agingBucket(daysOverdue: number): keyof AgingGrand {
  if (daysOverdue <= 0) return "notDueSatang";
  if (daysOverdue <= 30) return "d1_30Satang";
  if (daysOverdue <= 60) return "d31_60Satang";
  if (daysOverdue <= 90) return "d61_90Satang";
  return "d90plusSatang";
}

export async function agingReport(
  ctx: GlCtx,
  // WO 3.4: `contactId` = ตัวกรอง optional (แผงโปรไฟล์ 360° ต้องการอายุหนี้ "ของรายนี้" — ใช้สูตร bucket
  // ชุดเดียวกันเป๊ะ ไม่ก๊อปไปเขียนใหม่) · ไม่ใส่ = พฤติกรรมเดิมทุกประการ
  opts: { direction: "OUT" | "IN"; asOf?: Date; contactId?: string },
): Promise<AgingReport> {
  const asOf = opts.asOf ?? new Date();
  const DAY = 86400000;

  const docs = await prisma.accountDocument.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      direction: opts.direction,
      status: { in: ["AWAITING_PAYMENT", "PARTIAL"] },
      voidedAt: null,
      ...(opts.contactId ? { contactId: opts.contactId } : {}),
    },
    select: {
      id: true,
      contactId: true,
      grandTotal: true,
      paidTotal: true,
      dueDate: true,
      issueDate: true,
      contact: { select: { name: true } },
    },
  });
  // CRM C5.4-C ▸ (review round 2) ยอดค้าง = grand − paid − ใบลดหนี้ที่ยังมีผล (F-05/F-06 — ตรงกับ overviewStats และ GL 1100) ◂
  const creditOf = new Map<string, number>();
  if (opts.direction === "OUT" && docs.length > 0) {
    // hunt F1: ทั้งครอบครัวใบแจ้งหนี้ (ใบลดหนี้อ้างใบเสร็จ/ใบกำกับด้วย)
    const fam = await (await import("./service")).familyCreditByInvoice(prisma as unknown as Prisma.TransactionClient, ctx.systemId, docs.map((d) => d.id));
    for (const [k, v] of fam) creditOf.set(k, v);
  }

  // key ต่อคู่ค้า — null → แถวรวม "ไม่ระบุคู่ค้า"
  const byContact = new Map<
    string,
    { contactId: string | null; contactName: string; buckets: AgingGrand }
  >();
  const grand = emptyAging();
  const docCounts = new Map<string, AgingDocCount>();

  for (const d of docs) {
    const outstanding = d.grandTotal - d.paidTotal - (creditOf.get(d.id) ?? 0);
    if (outstanding <= 0) continue; // จ่ายครบ/เกิน — ไม่นับ

    const due = d.dueDate ?? d.issueDate;
    const daysOverdue = Math.floor((asOf.getTime() - due.getTime()) / DAY);
    const bucket = agingBucket(daysOverdue);

    const key = d.contactId ?? "__none__";
    const cnt = docCounts.get(key) ?? { docs: 0, overdueDocs: 0 };
    cnt.docs += 1;
    if (daysOverdue > 0) cnt.overdueDocs += 1;
    docCounts.set(key, cnt);
    let entry = byContact.get(key);
    if (!entry) {
      entry = {
        contactId: d.contactId ?? null,
        contactName: d.contactId ? d.contact?.name ?? AGING_NO_CONTACT : AGING_NO_CONTACT,
        buckets: emptyAging(),
      };
      byContact.set(key, entry);
    }
    entry.buckets[bucket] += outstanding;
    entry.buckets.totalSatang += outstanding;
    grand[bucket] += outstanding;
    grand.totalSatang += outstanding;
  }

  const rows: AgingRow[] = [...byContact.values()]
    .map((e) => ({ contactId: e.contactId, contactName: e.contactName, ...e.buckets }))
    .sort((a, b) => b.totalSatang - a.totalSatang);

  return { rows, grand, docCounts };
}
