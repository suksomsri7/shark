import { prisma } from "@/lib/core/db";
import type { AccountLedgerType, AccountCashflowActivity } from "@prisma/client";

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
};

export type Pp30RateGroup = { rateBp: number; base: number; vat: number };

export type Pp30Side = {
  total: number; // Σ ภาษี (สตางค์)
  base: number; // Σ ฐาน
  rows: Pp30Row[];
  byRate: Pp30RateGroup[];
};

export type Pp30 = {
  periodKey: string;
  output: Pp30Side; // ภาษีขาย (2200)
  input: Pp30Side; // ภาษีซื้อ (1150)
  carryForward: number; // เครดิตภาษียกมาเดือนก่อน (ผู้ใช้กรอก — v1 ไม่มีตารางยื่น)
  netPayable: number; // > 0 = ต้องชำระ · < 0 = เครดิตยกไป
  creditCarry: number; // ยอดเครดิตยกไปเดือนถัดไป (= −netPayable ถ้าติดลบ)
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
      entry: { select: { refType: true, refId: true, date: true, docNo: true } },
    },
  });

  // รวม VAT ต่อเอกสารต้นทาง
  type Agg = { vat: number; date: Date; docRefId: string | null; journalNo: string };
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
          },
        });
  const docMap = new Map(docs.map((d) => [d.id, d]));

  const rows: Pp30Row[] = [];
  const rateMap = new Map<number, Pp30RateGroup>();
  let total = 0;
  let baseTotal = 0;

  for (const agg of perDoc.values()) {
    const doc = agg.docRefId ? docMap.get(agg.docRefId) : undefined;
    const snap = (doc?.contactSnapshot ?? null) as
      | { name?: string; taxId?: string; branchCode?: string }
      | null;
    const contactName = snap?.name ?? doc?.contact?.name ?? "-";
    const taxId = snap?.taxId ?? doc?.contact?.taxId ?? "";
    const branchCode = snap?.branchCode ?? doc?.contact?.branchCode ?? "";
    // ฐาน: ประมาณจากยอดเอกสาร (subTotal − ส่วนลด) — reconcile ภาษีจาก GL จริง
    const base = doc ? doc.subTotal - doc.discountAmount : 0;
    // อัตรา: derive จาก vat/base (700 = 7%) — SME ส่วนใหญ่อัตราเดียว
    const rateBp = base > 0 ? Math.round((agg.vat / base) * 10000) : 0;

    rows.push({
      docNo: doc?.docNo ?? agg.journalNo,
      date: agg.date,
      contactName,
      taxId,
      branchCode,
      base,
      vat: agg.vat,
      rateBp,
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
  opts?: { carryForward?: number },
): Promise<Pp30> {
  const ledgers = await prisma.accountLedger.findMany({
    where: { systemId: ctx.systemId, code: { in: ["2200", "1150"] } },
    select: { id: true, code: true },
  });
  const outputId = ledgers.find((l) => l.code === "2200")?.id;
  const inputId = ledgers.find((l) => l.code === "1150")?.id;

  const [output, input] = await Promise.all([
    outputId
      ? pp30Side(ctx.systemId, outputId, periodKey, "OUTPUT")
      : Promise.resolve<Pp30Side>({ total: 0, base: 0, rows: [], byRate: [] }),
    inputId
      ? pp30Side(ctx.systemId, inputId, periodKey, "INPUT")
      : Promise.resolve<Pp30Side>({ total: 0, base: 0, rows: [], byRate: [] }),
  ]);

  const carryForward = opts?.carryForward ?? 0;
  const netPayable = output.total - input.total - carryForward;
  return {
    periodKey,
    output,
    input,
    carryForward,
    netPayable,
    creditCarry: netPayable < 0 ? -netPayable : 0,
  };
}
