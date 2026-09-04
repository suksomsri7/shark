import { tenantDb } from "@/lib/core/db";
import type { AccountDocStatus, AccountDocType, AccountLedgerType } from "@prisma/client";
import { DOC_LABEL, STATUS_LABEL, isOverdue } from "./service";
import { EXP_DOC_LABEL } from "./expense";
import { financeBalances } from "./finance";
import { agingBucket, emptyAging, type AgingGrand } from "./reports";

// ─────────────────────────────────────────────────────────────
// dashboard.ts — query ของ "หน้าหลัก + ภาพรวม" (WO 2.1) · READ-ONLY
// อ้าง DESIGN-SPEC-V2 §4 (บล็อกหน้าหลัก) · §6 (ดูภาพรวมรายรับ/รายจ่าย) · §10.2 (ปฏิทินเงินเข้า-ออก)
// อ้าง BLUEPRINT §3 เฟส 2 WO 2.1: "query ≤ 12 ต่อหน้า (นับจริงด้วย prisma log)"
//
// กติกาของไฟล์นี้ (อย่าละเมิด — ข้อสอบ scripts/qc-acc-v2-dashboard.mts จับทุกข้อ):
//   1) เงินเป็น **สตางค์ integer** ล้วน · ห้าม float เข้าไปในไปป์ไลน์ (เปอร์เซ็นต์คืนเป็น basis point)
//   2) ทุก query ผูก tenantId + systemId — ผ่าน `tenantDb(ctx)` (inject ให้อัตโนมัติ)
//      ยกเว้น `$queryRaw` ซึ่ง **เขียน WHERE เองทั้ง tenantId และ systemId** (ดู glAggregate/cashCalendar)
//   3) ไม่มี N+1 — ทุกก้อนเป็น groupBy/aggregate/raw aggregate ก้อนเดียว
//   4) ฟังก์ชันบริสุทธิ์แบบ cache ได้: input = ctx + ช่วงเวลา · output = object ธรรมดา (JSON.stringify ได้)
//      → เวลา "ตอนนี้" รับผ่าน opts.now ได้ (ข้อสอบตรึงเวลาได้ · ไม่มีอะไรอ่านนาฬิกาเงียบ ๆ)
//   5) ป้ายภาษาไทยของหมวดบัญชี = ชื่อจาก AccountLedger (ไม่ตั้งชื่อเองในโค้ด)
//
// ทำไมบางที่ใช้ `$queryRaw` (ที่อื่นในโมดูลไม่ใช้เลย):
//   - เงิน "รายเดือน" ต้อง group ตาม `AccountJournalEntry.periodKey` แต่ groupBy ของ Prisma
//     ทำได้เฉพาะคอลัมน์ของ model ตัวเอง (periodKey อยู่คนละตาราง) → ทางเลือกคือดึงทุก entry+line
//     มา aggregate ฝั่ง JS (หนักและ 2–3 query) หรือ SQL ก้อนเดียว ⇒ เลือก SQL
//   - ปฏิทินต้อง group ตาม "วันตามเวลาไทย" (date_trunc/AT TIME ZONE) ซึ่ง Prisma groupBy ทำไม่ได้
//   ทุก raw query เป็น parameterized (tagged template) — ไม่มีการต่อสตริงค่าจากผู้ใช้
//
// ⚠️ Immutable ledger: reversal = entry ตรงข้าม (ตัวเดิมยัง REVERSED อยู่) ⇒ รวมทุก status เสมอ
//    (ทำแบบเดียวกับ reports.ts — คู่ reverse หักกันเองเป็น 0)
// ─────────────────────────────────────────────────────────────

export type DashCtx = { tenantId: string; systemId: string };

/**
 * ตัวนับ query — ข้อสอบใช้ยืนยัน budget ≤ 12 ของหน้าหลัก (BLUEPRINT เฟส 2 · §9.3)
 * นับ 3 ทาง: (1) operation ที่ผ่าน client ของไฟล์นี้ นับอัตโนมัติด้วย extension
 *            (2) `$queryRaw` นับเองด้วย `bump(meter)` (ไม่ผ่าน $allModels)
 *            (3) ฟังก์ชันของโมดูลอื่นที่ใช้ prisma ของตัวเอง (financeBalances = 2) นับเองเช่นกัน
 * ข้อสอบเทียบตัวเลขนี้กับจำนวน SQL จริงจาก prisma log — ถ้าไม่ตรงคือมีคนแอบยิงเพิ่ม
 */
export type QueryMeter = { count: number };

type Db = ReturnType<typeof tenantDb>;

function bump(meter: QueryMeter | undefined, n = 1) {
  if (meter) meter.count += n;
}

/** จำนวน query ที่ finance.financeBalances ยิง (บัญชีเงิน + ยอด GL) — ใช้บวกเข้ามิเตอร์ */
const FINANCE_BALANCES_QUERIES = 2;

function dbOf(ctx: DashCtx, meter?: QueryMeter): Db {
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  if (!meter) return db;
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          meter.count += 1;
          return query(args);
        },
      },
    },
  }) as unknown as Db;
}

// ─────────────────── ตัวช่วยวัน/งวด (เวลาไทยเสมอ) ───────────────────

const TZ = "Asia/Bangkok";

/** "YYYY-MM-DD" ตามเวลาไทยของ Date (กันเพี้ยน 1 วันบนเครื่อง UTC) */
export function dayKeyBkk(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "YYYY-MM" ตามเวลาไทย — ตรงนิยามเดียวกับ gl.ts (bkkPeriod) */
export function periodKeyBkk(d: Date): string {
  return dayKeyBkk(d).slice(0, 7);
}

/** ต้นเดือน (00:00 เวลาไทย) ของ periodKey */
export function monthStart(periodKey: string): Date {
  return new Date(`${periodKey}-01T00:00:00+07:00`);
}

/** ต้นเดือนถัดไป (00:00 เวลาไทย) — ใช้เป็นขอบบนแบบ exclusive */
export function monthEndExclusive(periodKey: string): Date {
  const [y, m] = periodKey.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return new Date(`${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+07:00`);
}

/** จำนวนวันของเดือน periodKey */
function daysInMonth(periodKey: string): number {
  const [y, m] = periodKey.split("-").map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - 86400000).getUTCDate();
}

/** 12 periodKey ของปี */
function yearKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

/** เปอร์เซ็นต์เทียบงวดก่อนเป็น basis point (300 = +3.00%) · null = งวดก่อนเป็น 0 (เทียบไม่ได้) */
export function changeBp(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000);
}

/** สัดส่วนเป็น basis point (10000 = 100%) · หารศูนย์ = 0 */
function shareBp(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 10000);
}

// ─────────────────── ก้อนกลาง: ยอด GL ต่องวด/ต่อบัญชี ───────────────────

export type GlPeriodRow = {
  periodKey: string;
  accountId: string;
  code: string;
  name: string;
  type: AccountLedgerType;
  debit: number;
  credit: number;
};

/**
 * Σ debit/credit ต่อ (งวด × บัญชี) ในช่วง periodKey — **1 query**
 * ใช้ร่วมกันหลายบล็อก (series 12 เดือน · donut หมวด · ค่าใช้จ่ายตามหมวด · เงินเข้า-ออกของช่องทางเดือนนี้)
 * ⇒ หน้าหลักจ่ายค่า query ก้อนนี้ครั้งเดียว
 */
async function glAggregate(
  db: Db,
  ctx: DashCtx,
  fromKey: string,
  toKey: string,
): Promise<GlPeriodRow[]> {
  const rows = await db.$queryRaw<
    Array<{
      periodKey: string;
      accountId: string;
      code: string;
      name: string;
      type: AccountLedgerType;
      debit: bigint;
      credit: bigint;
    }>
  >`
    SELECT e."periodKey"        AS "periodKey",
           l."id"               AS "accountId",
           l."code"             AS "code",
           l."name"             AS "name",
           l."type"::text       AS "type",
           SUM(jl."debit")::bigint  AS "debit",
           SUM(jl."credit")::bigint AS "credit"
      FROM "AccountJournalLine" jl
      JOIN "AccountJournalEntry" e ON e."id" = jl."entryId"
      JOIN "AccountLedger" l       ON l."id" = jl."accountId"
     WHERE jl."tenantId" = ${ctx.tenantId}
       AND jl."systemId" = ${ctx.systemId}
       AND e."periodKey" >= ${fromKey}
       AND e."periodKey" <= ${toKey}
     GROUP BY 1, 2, 3, 4, 5`;
  return rows.map((r) => ({
    periodKey: r.periodKey,
    accountId: r.accountId,
    code: r.code,
    name: r.name,
    type: r.type,
    debit: Number(r.debit),
    credit: Number(r.credit),
  }));
}

/** ยอดของบัญชีตามธรรมชาติของหมวด: รายได้ = เครดิต−เดบิต · ค่าใช้จ่าย/ต้นทุน = เดบิต−เครดิต */
function naturalAmount(row: { type: AccountLedgerType; debit: number; credit: number }): number {
  return row.type === "INCOME" || row.type === "LIABILITY" || row.type === "EQUITY"
    ? row.credit - row.debit
    : row.debit - row.credit;
}

const EXPENSE_TYPES: readonly AccountLedgerType[] = ["EXPENSE", "COGS"];

// ─────────────────── 1) series 12 เดือน + YoY (§4 บล็อก 3) ───────────────────

export type MonthPoint = { periodKey: string; revenue: number; expense: number; profit: number };

export type MonthlySeries = {
  year: number;
  months: MonthPoint[]; // 12 เดือนเสมอ (เดือนไม่มีรายการ = 0)
  total: { revenue: number; expense: number; profit: number };
  prevYear: { revenue: number; expense: number; profit: number };
  /** เทียบปีก่อนเป็น basis point (null = ปีก่อนเป็น 0) */
  yoyBp: { revenue: number | null; expense: number | null; profit: number | null };
};

function emptyTotals() {
  return { revenue: 0, expense: 0, profit: 0 };
}

function seriesFromRows(rows: GlPeriodRow[], year: number): MonthlySeries {
  const byKey = new Map<string, MonthPoint>();
  for (const k of yearKeys(year)) byKey.set(k, { periodKey: k, revenue: 0, expense: 0, profit: 0 });
  const total = emptyTotals();
  const prevYear = emptyTotals();

  for (const r of rows) {
    const isIncome = r.type === "INCOME";
    const isExpense = EXPENSE_TYPES.includes(r.type);
    if (!isIncome && !isExpense) continue;
    const amount = naturalAmount(r);
    const bucket = byKey.get(r.periodKey);
    const target = bucket ?? (r.periodKey.startsWith(`${year - 1}-`) ? prevYear : null);
    if (!target) continue;
    if (isIncome) target.revenue += amount;
    else target.expense += amount;
  }

  for (const m of byKey.values()) {
    m.profit = m.revenue - m.expense;
    total.revenue += m.revenue;
    total.expense += m.expense;
  }
  total.profit = total.revenue - total.expense;
  prevYear.profit = prevYear.revenue - prevYear.expense;

  return {
    year,
    months: yearKeys(year).map((k) => byKey.get(k) as MonthPoint),
    total,
    prevYear,
    yoyBp: {
      revenue: changeBp(total.revenue, prevYear.revenue),
      expense: changeBp(total.expense, prevYear.expense),
      profit: changeBp(total.profit, prevYear.profit),
    },
  };
}

/** รายได้/ค่าใช้จ่าย/กำไร 12 เดือนของปี + ยอดรวมปีก่อนไว้คิด %YoY — 1 query */
export async function monthlySeries(ctx: DashCtx, year: number, meter?: QueryMeter): Promise<MonthlySeries> {
  const db = dbOf(ctx, meter);
  bump(meter); // $queryRaw ไม่ผ่าน $allOperations → นับเอง
  const rows = await glAggregate(db, ctx, `${year - 1}-01`, `${year}-12`);
  return seriesFromRows(rows, year);
}

// ─────────────────── 2) donut หมวดรายได้/ค่าใช้จ่าย (§4 บล็อก 5) ───────────────────

export type CategorySlice = { accountCode: string; name: string; amount: number; shareBp: number };

export type CategoryBreakdown = {
  periodKey: string;
  kind: "income" | "expense";
  total: number;
  rows: CategorySlice[]; // top N + "อื่น ๆ" (ถ้ามีเศษเหลือ) — Σ rows.amount = total เสมอ
};

export const OTHER_LABEL = "อื่น ๆ";

/** เหมือน `breakdownFromRows` แต่ export ให้ WO 2.2 (หน้าหลัก V2) เรียกซ้ำได้ฝั่ง UI
 * โดยไม่ยิง query เพิ่ม — `glRows` ที่ dashboardSnapshot คืนมาครอบคลุม `${year-1}-01`..`${year}-12`
 * (24 เดือน) อยู่แล้ว ⇒ ตัวเลือกเดือนของโดนัท "รายได้/ค่าใช้จ่ายเดือนนี้" (§4 ข้อ 5) เลือกเดือนไหนในช่วงนั้น
 * ก็คำนวณจากก้อนเดิมได้ทันที ไม่ต้อง query ใหม่ (กติกา BLUEPRINT §3 WO 2.2: ห้ามเกิน 12 query ของหน้าหลัก) */
export function categoryBreakdownFromRows(
  rows: GlPeriodRow[],
  periodKey: string,
  kind: "income" | "expense",
  topN = 5,
): CategoryBreakdown {
  return breakdownFromRows(rows, periodKey, kind, topN);
}

function breakdownFromRows(
  rows: GlPeriodRow[],
  periodKey: string,
  kind: "income" | "expense",
  topN: number,
): CategoryBreakdown {
  const wanted = kind === "income" ? ["INCOME"] : EXPENSE_TYPES;
  const byAccount = new Map<string, { code: string; name: string; amount: number }>();
  for (const r of rows) {
    if (r.periodKey !== periodKey) continue;
    if (!wanted.includes(r.type)) continue;
    const amount = naturalAmount(r);
    if (amount === 0) continue;
    const cur = byAccount.get(r.accountId);
    if (cur) cur.amount += amount;
    else byAccount.set(r.accountId, { code: r.code, name: r.name, amount });
  }
  const all = [...byAccount.values()].sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code));
  const total = all.reduce((s, a) => s + a.amount, 0);
  const head = all.slice(0, topN);
  const restAmount = all.slice(topN).reduce((s, a) => s + a.amount, 0);
  const out: CategorySlice[] = head.map((a) => ({
    accountCode: a.code,
    name: a.name,
    amount: a.amount,
    shareBp: shareBp(a.amount, total),
  }));
  if (restAmount !== 0)
    out.push({ accountCode: "", name: OTHER_LABEL, amount: restAmount, shareBp: shareBp(restAmount, total) });
  return { periodKey, kind, total, rows: out };
}

/** หมวดรายได้/ค่าใช้จ่ายของงวด (ชื่อหมวด = ชื่อบัญชีจาก AccountLedger) — 1 query */
export async function categoryBreakdown(
  ctx: DashCtx,
  periodKey: string,
  kind: "income" | "expense",
  topN = 5,
  meter?: QueryMeter,
): Promise<CategoryBreakdown> {
  const db = dbOf(ctx, meter);
  bump(meter);
  const rows = await glAggregate(db, ctx, periodKey, periodKey);
  return breakdownFromRows(rows, periodKey, kind, topN);
}

/** "ค่าใช้จ่ายตามหมวดบัญชี" (§6 การ์ดล่าง) — ช่วงหลายงวดได้ · 1 query */
export async function topExpenseCategories(
  ctx: DashCtx,
  range: { fromKey: string; toKey: string },
  n = 5,
  meter?: QueryMeter,
): Promise<{ total: number; rows: CategorySlice[] }> {
  const db = dbOf(ctx, meter);
  bump(meter);
  const rows = await glAggregate(db, ctx, range.fromKey, range.toKey);
  return expenseCategoriesFromRows(rows, n);
}

/**
 * "รายได้อะไรมากที่สุด" (§4 ข้อ 8, เพิ่มโดย WO 2.2) — เหมือน `expenseCategoriesFromRows` แต่ฝั่งรายได้
 * ไม่ยิง query เพิ่ม: หน้าหลักส่ง `snapshot.glRows` (มีอยู่แล้วจากงบ 12 query เดิม) กรองตามปีเอง แล้วเรียกฟังก์ชันนี้
 */
export function incomeCategoriesFromRows(rows: GlPeriodRow[], n: number): { total: number; rows: CategorySlice[] } {
  const byAccount = new Map<string, { code: string; name: string; amount: number }>();
  for (const r of rows) {
    if (r.type !== "INCOME") continue;
    const amount = naturalAmount(r);
    if (amount === 0) continue;
    const cur = byAccount.get(r.accountId);
    if (cur) cur.amount += amount;
    else byAccount.set(r.accountId, { code: r.code, name: r.name, amount });
  }
  const all = [...byAccount.values()].sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code));
  const total = all.reduce((s, a) => s + a.amount, 0);
  return {
    total,
    rows: all.slice(0, n).map((a) => ({
      accountCode: a.code,
      name: a.name,
      amount: a.amount,
      shareBp: shareBp(a.amount, total),
    })),
  };
}

function expenseCategoriesFromRows(rows: GlPeriodRow[], n: number): { total: number; rows: CategorySlice[] } {
  const byAccount = new Map<string, { code: string; name: string; amount: number }>();
  for (const r of rows) {
    if (!EXPENSE_TYPES.includes(r.type)) continue;
    const amount = naturalAmount(r);
    if (amount === 0) continue;
    const cur = byAccount.get(r.accountId);
    if (cur) cur.amount += amount;
    else byAccount.set(r.accountId, { code: r.code, name: r.name, amount });
  }
  const all = [...byAccount.values()].sort((a, b) => b.amount - a.amount || a.code.localeCompare(b.code));
  const total = all.reduce((s, a) => s + a.amount, 0);
  return {
    total,
    rows: all.slice(0, n).map((a) => ({
      accountCode: a.code,
      name: a.name,
      amount: a.amount,
      shareBp: shareBp(a.amount, total),
    })),
  };
}

// ─────────────────── 3) "เงินคุณอยู่ไหน" (§4 บล็อก 5/9) ───────────────────

export type CashAccount = {
  id: string;
  /** บัญชี GL ที่ผูก (null = ยังไม่ผูก) — รหัส/ชื่อบัญชีอยู่ที่ผังบัญชี ไม่ดึงมาที่นี่ (ดูหมายเหตุใต้ type) */
  ledgerAccountId: string | null;
  name: string;
  type: string;
  balance: number;
  /** เงินเข้า−ออกของเดือนปัจจุบัน (จาก GL ของบัญชีที่ผูก — นิยามเดียวกับ balance) */
  monthDelta: number;
  pinned: boolean;
  // ── WO 5.2 (§10.2 "บัญชีเงินที่ติดตาม" การ์ด — subtitle ต้องการฟิลด์พวกนี้) ──
  // additive: มาจาก financeBalances อยู่แล้ว (ผ่าน parts ที่ cashPosition รับเข้ามา) แค่ผ่านทะลุออกมาเพิ่ม
  // ไม่กระทบ consumer เดิม (หน้าหลัก) ที่ยังอ่านแค่ id/name/balance/monthDelta/pinned เหมือนเดิม
  code: string | null;
  bankName: string | null;
  accountNo: string | null;
  bankSubtype: string | null;
  promptpayId: string | null;
  limitSatang: number | null;
  holderUserId: string | null;
};

export type CashPosition = { total: number; periodKey: string; accounts: CashAccount[] };
// หมายเหตุ: การ์ด "เงินคุณอยู่ไหน" (§4 บล็อก 5/9) แสดง ชื่อ/ชนิด/ยอด/เคลื่อนไหว — ไม่มีรหัสบัญชี
// AccountFinance ไม่มีคอลัมน์รหัส และ ledgerAccountId ไม่ใช่ relation ⇒ จะได้รหัส GL ต้องยิงเพิ่มอีก 1 query
// (บัญชีที่ไม่มีรายการในงวดจะไม่โผล่ในก้อน GL ⇒ ดึงรหัสจากก้อนนั้นได้ไม่ครบ) ⇒ ส่ง ledgerAccountId ไปแทน

function cashFromParts(
  balances: Awaited<ReturnType<typeof financeBalances>>,
  glRows: GlPeriodRow[],
  periodKey: string,
): CashPosition {
  const move = new Map<string, number>();
  for (const r of glRows) {
    if (r.periodKey !== periodKey) continue;
    move.set(r.accountId, (move.get(r.accountId) ?? 0) + (r.debit - r.credit));
  }
  const accounts = balances.map((b) => ({
    id: b.id,
    ledgerAccountId: b.ledgerAccountId,
    name: b.name,
    type: b.type as string,
    balance: b.balance,
    monthDelta: b.ledgerAccountId ? move.get(b.ledgerAccountId) ?? 0 : 0,
    pinned: b.pinned,
    // WO 5.2 — ผ่านทะลุฟิลด์ที่มีอยู่แล้วใน FinanceAccountBalance (ไม่ query เพิ่ม)
    code: b.code,
    bankName: b.bankName,
    accountNo: b.accountNo,
    bankSubtype: b.bankSubtype,
    promptpayId: b.promptpayId,
    limitSatang: b.limitSatang,
    holderUserId: b.holderUserId,
  }));
  return { total: accounts.reduce((s, a) => s + a.balance, 0), periodKey, accounts };
}

/**
 * ยอดคงเหลือทุกช่องทาง + เงินเข้า-ออกของเดือนนี้ต่อช่องทาง — 3 query
 * (financeBalances 2 + GL งวดนี้ 1) · บนหน้าหลักใช้ก้อน GL ร่วมกับบล็อกอื่น ⇒ เหลือ 2
 *
 * monthDelta คิดจาก **GL ของบัญชีเงินที่ผูก** (นิยามเดียวกับ balance) ไม่ใช่ผลรวม payment
 * — เพราะยอดคงเหลือมาจาก GL ถ้า delta มาจากอีกแหล่ง "ยอดต้นเดือน + delta" จะไม่เท่ายอดวันนี้
 * (โอนระหว่างช่องทาง · ค่าธรรมเนียม · ยอดยกมา ไม่มีใน payment)
 */
export async function cashPosition(
  ctx: DashCtx,
  opts: { now?: Date } = {},
  meter?: QueryMeter,
): Promise<CashPosition> {
  const db = dbOf(ctx, meter);
  const periodKey = periodKeyBkk(opts.now ?? new Date());
  bump(meter, 1 + FINANCE_BALANCES_QUERIES);
  const [balances, glRows] = await Promise.all([
    financeBalances(ctx.tenantId, ctx.systemId),
    glAggregate(db, ctx, periodKey, periodKey),
  ]);
  return cashFromParts(balances, glRows, periodKey);
}

// ─────────────────── 4) ลูกหนี้/เจ้าหนี้ + อายุหนี้ (§4 บล็อก 2, 4) ───────────────────

export type SideSummary = {
  count: number;
  amount: number;
  overdueCount: number;
  overdueAmount: number;
  contactCount: number;
  aging: AgingGrand;
};

export type ReceivablePayableSummary = { receivable: SideSummary; payable: SideSummary; asOf: string };

type OpenDocRow = {
  id: string;
  direction: string;
  contactId: string | null;
  grandTotal: number;
  paidTotal: number;
  dueDate: Date | null;
  issueDate: Date;
  status: AccountDocStatus;
  validUntil: Date | null;
};

const DAY_MS = 86400000;

function emptySide(): SideSummary {
  return { count: 0, amount: 0, overdueCount: 0, overdueAmount: 0, contactCount: 0, aging: emptyAging() };
}

/**
 * รวมยอดค้างรับ/ค้างจ่าย + อายุหนี้ 5 ช่วง จากเอกสารเปิดชุดเดียว
 *
 * 🔴 ทำไมไม่ compose overviewStats + payableStats + agingReport×2 ตรง ๆ:
 *    ทั้ง 4 ตัวรวมกัน = 11 query (วัดจริง: 4 + 3 + 2 + 2) ⇒ ทะลุ budget 12 ของทั้งหน้าเพียงบล็อกเดียว
 *    ที่นี่จึงอ่านเอกสารเปิดครั้งเดียว (2 query) แล้ว **ใช้ตรรกะเดิมทั้งดุ้น** — `isOverdue` (service.ts)
 *    และ `agingBucket`/`emptyAging` (reports.ts) — ไม่มีสูตรเงินเขียนซ้ำในไฟล์นี้
 *    ข้อสอบ qc-acc-v2-dashboard บังคับว่าผลลัพธ์ต้อง **เท่ากับ** overviewStats/payableStats/agingReport
 *    ทุกช่อง (เท่ากับระดับสตางค์) — ถ้าวันหนึ่งของเดิมเปลี่ยนนิยาม ข้อสอบจะแดงทันที
 */
function summaryFromDocs(
  docs: OpenDocRow[],
  cnBySource: Map<string, number>,
  asOf: Date,
): ReceivablePayableSummary {
  const receivable = emptySide();
  const payable = emptySide();
  const contacts = { OUT: new Set<string>(), IN: new Set<string>() };

  for (const d of docs) {
    const side = d.direction === "IN" ? payable : receivable;
    // ฝั่งรับหักใบลดหนี้ที่ออกแล้ว (F-06 — ตรงกับ overviewStats) · ฝั่งจ่ายใช้ยอดคงเหลือตรง ๆ (payableStats)
    const remain =
      d.direction === "IN"
        ? d.grandTotal - d.paidTotal
        : Math.max(0, d.grandTotal - d.paidTotal - (cnBySource.get(d.id) ?? 0));
    const outstanding = d.direction === "IN" ? Math.max(0, remain) : remain;
    side.count += 1;
    side.amount += outstanding;
    if (d.contactId) contacts[d.direction === "IN" ? "IN" : "OUT"].add(d.contactId);
    if (isOverdue({ status: d.status, dueDate: d.dueDate, validUntil: d.validUntil })) {
      side.overdueCount += 1;
      side.overdueAmount += outstanding;
    }
    // อายุหนี้ใช้ยอดคงค้างก่อนหักใบลดหนี้ — นิยามเดียวกับ agingReport (grandTotal − paidTotal)
    const agingAmount = d.grandTotal - d.paidTotal;
    if (agingAmount > 0) {
      const due = d.dueDate ?? d.issueDate;
      const bucket = agingBucket(Math.floor((asOf.getTime() - due.getTime()) / DAY_MS));
      side.aging[bucket] += agingAmount;
      side.aging.totalSatang += agingAmount;
    }
  }
  receivable.contactCount = contacts.OUT.size;
  payable.contactCount = contacts.IN.size;
  return { receivable, payable, asOf: dayKeyBkk(asOf) };
}

const OPEN_STATUSES: AccountDocStatus[] = ["AWAITING_PAYMENT", "PARTIAL"];

/**
 * เอกสารเปิดทั้ง 2 ฝั่ง (+ ใบลดหนี้ที่ออกแล้ว) — 2 query
 *
 * 🔴 ตัด BILLING_NOTE ทิ้ง: ใบวางบิลรวม (WO 1.7) ออกแล้วได้สถานะ AWAITING_PAYMENT เหมือนกัน
 *    แต่มันคือ "การเรียกเก็บใบแจ้งหนี้ที่นับไปแล้ว" ⇒ ถ้านับด้วยจะเป็นลูกหนี้ซ้ำสองเท่า
 *    (ของเดิม `agingReport(direction OUT)` ไม่ได้กรอง — จดเป็นข้อค้นพบใน ledger/wo-notes/2.1.md)
 */
async function loadOpenDocs(db: Db): Promise<{ docs: OpenDocRow[]; cn: Map<string, number> }> {
  const [docs, cns] = await Promise.all([
    db.accountDocument.findMany({
      where: {
        direction: { in: ["OUT", "IN"] },
        status: { in: OPEN_STATUSES },
        voidedAt: null,
        docType: { not: "BILLING_NOTE" },
      },
      select: {
        id: true,
        direction: true,
        contactId: true,
        grandTotal: true,
        paidTotal: true,
        dueDate: true,
        issueDate: true,
        status: true,
        validUntil: true,
      },
    }),
    db.accountDocument.groupBy({
      by: ["sourceDocId"],
      where: { docType: "CREDIT_NOTE", status: { notIn: ["DRAFT", "VOIDED", "CANCELLED"] } },
      _sum: { grandTotal: true },
    }),
  ]);
  const cn = new Map<string, number>();
  for (const c of cns) if (c.sourceDocId) cn.set(c.sourceDocId, c._sum.grandTotal ?? 0);
  return { docs: docs as OpenDocRow[], cn };
}

/** ค้างรับ/ค้างจ่าย + พ้นกำหนด + อายุหนี้ 5 ช่วง ทั้งสองฝั่ง — 2 query */
export async function receivablePayableSummary(
  ctx: DashCtx,
  opts: { now?: Date } = {},
  meter?: QueryMeter,
): Promise<ReceivablePayableSummary> {
  const db = dbOf(ctx, meter);
  const { docs, cn } = await loadOpenDocs(db);
  return summaryFromDocs(docs, cn, opts.now ?? new Date());
}

// ─────────────────── 5) "เอกสารที่ออก" (§4 บล็อก 6) ───────────────────

export type IssuedRow = { key: string; label: string; count: number; amount: number; shareBp: number };

export type DocumentsIssued = {
  docType: AccountDocType;
  label: string;
  from: string;
  to: string;
  total: { count: number; amount: number };
  rows: IssuedRow[]; // 4 แถวตาม §4 ข้อ 6 (แถวแรก = ที่ออกทั้งหมด)
};

/** สถานะที่ถือว่า "ยังไม่ออก/ไม่มีผล" — ไม่นับในการ์ดนี้ */
const NOT_ISSUED: AccountDocStatus[] = ["DRAFT", "CANCELLED", "VOIDED"];

/** ป้ายชนิดเอกสารภาษาไทย (ขาย + จ่าย)
 *  TAX_INVOICE_ABB อยู่นอก DOC_LABEL โดยตั้งใจ (ไม่มีหน้ารายการ/ฟอร์มสร้างเอง — เกิดจากบิล POS เท่านั้น)
 *  แต่ต้องมีชื่อไทยเวลาโผล่ในรายงาน/โปรไฟล์ผู้ติดต่อ */
export function docTypeLabel(docType: AccountDocType): string {
  if (docType === "TAX_INVOICE_ABB") return "บิลขายหน้าร้าน (POS)";
  return DOC_LABEL[docType] ?? EXP_DOC_LABEL[docType] ?? docType;
}

/** นิยาม 3 แถวย่อยต่อชนิดเอกสาร (แถวแรก "ที่ออก" เติมให้อัตโนมัติ) */
const ISSUED_ROWS: Partial<Record<AccountDocType, Array<{ key: string; statuses: AccountDocStatus[] }>>> = {
  QUOTATION: [
    { key: "AWAITING_ACCEPT", statuses: ["AWAITING_ACCEPT"] },
    { key: "ACCEPTED", statuses: ["ACCEPTED"] },
    { key: "REJECTED", statuses: ["REJECTED"] },
  ],
  PURCHASE_ORDER: [
    { key: "AWAITING_APPROVAL", statuses: ["AWAITING_APPROVAL"] },
    { key: "APPROVED", statuses: ["APPROVED"] },
    { key: "RECEIVED", statuses: ["RECEIVED"] },
  ],
  ASSET_PURCHASE_ORDER: [
    { key: "AWAITING_APPROVAL", statuses: ["AWAITING_APPROVAL"] },
    { key: "APPROVED", statuses: ["APPROVED"] },
    { key: "RECEIVED", statuses: ["RECEIVED"] },
  ],
  DEPOSIT_RECEIPT: [
    { key: "AWAITING_PAYMENT", statuses: ["AWAITING_PAYMENT"] },
    { key: "AWAITING_DEDUCT", statuses: ["AWAITING_DEDUCT", "PAID"] },
    { key: "DEDUCTED", statuses: ["DEDUCTED"] },
  ],
};

const ISSUED_ROWS_DEFAULT: Array<{ key: string; statuses: AccountDocStatus[] }> = [
  { key: "AWAITING_PAYMENT", statuses: ["AWAITING_PAYMENT"] },
  { key: "PARTIAL", statuses: ["PARTIAL"] },
  { key: "PAID", statuses: ["PAID"] },
];

function issuedFromGroups(
  groups: Array<{ status: AccountDocStatus; count: number; amount: number }>,
  docType: AccountDocType,
  from: Date,
  to: Date,
): DocumentsIssued {
  const byStatus = new Map(groups.map((g) => [g.status, g]));
  const total = groups.reduce(
    (acc, g) => ({ count: acc.count + g.count, amount: acc.amount + g.amount }),
    { count: 0, amount: 0 },
  );
  const label = docTypeLabel(docType);
  const defs = ISSUED_ROWS[docType] ?? ISSUED_ROWS_DEFAULT;
  const rows: IssuedRow[] = [
    { key: "ISSUED_ALL", label: `${label}ที่ออก`, count: total.count, amount: total.amount, shareBp: 10000 },
  ];
  for (const d of defs) {
    let count = 0;
    let amount = 0;
    for (const s of d.statuses) {
      const g = byStatus.get(s);
      if (!g) continue;
      count += g.count;
      amount += g.amount;
    }
    rows.push({
      key: d.key,
      label: STATUS_LABEL[d.statuses[0]],
      count,
      amount,
      shareBp: shareBp(amount, total.amount),
    });
  }
  return { docType, label, from: dayKeyBkk(from), to: dayKeyBkk(to), total, rows };
}

/** การ์ด "เอกสารที่ออก" — 4 แถวสถานะพร้อมยอด+จำนวน+สัดส่วน · 1 query */
export async function documentsIssued(
  ctx: DashCtx,
  docType: AccountDocType,
  range: { from: Date; to: Date },
  meter?: QueryMeter,
): Promise<DocumentsIssued> {
  const db = dbOf(ctx, meter);
  const groups = await db.accountDocument.groupBy({
    by: ["status"],
    where: {
      docType,
      status: { notIn: NOT_ISSUED },
      issueDate: { gte: range.from, lt: range.to },
    },
    _count: { _all: true },
    _sum: { grandTotal: true },
  });
  return issuedFromGroups(
    groups.map((g) => ({ status: g.status, count: g._count._all, amount: g._sum.grandTotal ?? 0 })),
    docType,
    range.from,
    range.to,
  );
}

// ─────────────────── 6) top ลูกค้า/ผู้ขาย/สินค้า (§4 บล็อก 8 · §6) ───────────────────

export type TopContactRow = { contactId: string | null; name: string; docCount: number; amount: number };
export type TopProductRow = { productId: string | null; name: string; qty: number; amount: number };

const NO_CONTACT = "ไม่ระบุคู่ค้า";

/** เอกสารที่นับเป็น "ยอดขาย" — ใบเสร็จที่แปลงมาจากใบแจ้งหนี้ถูกตัดออก (กันนับซ้ำ)
 *  WO 4.2: + บิลขายหน้าร้าน (POS = ใบกำกับอย่างย่อ) — บิล POS ไม่มีใบแจ้งหนี้/ใบเสร็จคู่กัน
 *  จึงไม่มีทางนับซ้ำ · ถ้าไม่ใส่ ยอดขายหน้าร้านจะหายไปจาก "ขายอะไรดี/ขายใคร" ทั้งก้อน (SPEC §4 บล็อก 8) */
const SALES_WHERE = {
  direction: "OUT" as const,
  OR: [
    { docType: "INVOICE" as const },
    { docType: "RECEIPT" as const, sourceDocId: null },
    { docType: "TAX_INVOICE_ABB" as const },
  ],
};
/** เอกสารที่นับเป็น "รายจ่าย" ฝั่งซื้อ (PO/PTX เป็นทะเบียน ไม่ใช่ค่าใช้จ่าย) */
const PURCHASE_WHERE = { direction: "IN" as const, docType: { in: ["PURCHASE", "EXPENSE"] as AccountDocType[] } };

async function topContactsRaw(
  db: Db,
  range: { from: Date; to: Date },
): Promise<Array<{ contactId: string | null; direction: string; docCount: number; amount: number }>> {
  const rows = await db.accountDocument.groupBy({
    by: ["contactId", "direction"],
    where: {
      status: { notIn: NOT_ISSUED },
      issueDate: { gte: range.from, lt: range.to },
      OR: [SALES_WHERE, PURCHASE_WHERE],
    },
    _count: { _all: true },
    _sum: { grandTotal: true },
  });
  return rows.map((r) => ({
    contactId: r.contactId,
    direction: r.direction as string,
    docCount: r._count._all,
    amount: r._sum.grandTotal ?? 0,
  }));
}

function pickTop(
  rows: Array<{ contactId: string | null; direction: string; docCount: number; amount: number }>,
  direction: "IN" | "OUT",
  names: Map<string, string>,
  n: number,
): TopContactRow[] {
  return rows
    .filter((r) => r.direction === direction)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map((r) => ({
      contactId: r.contactId,
      name: (r.contactId ? names.get(r.contactId) : null) ?? NO_CONTACT,
      docCount: r.docCount,
      amount: r.amount,
    }));
}

async function contactNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.accountContact.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** "ขายใครได้มากที่สุด" — 2 query (groupBy + ชื่อผู้ติดต่อ) */
export async function topCustomers(
  ctx: DashCtx,
  range: { from: Date; to: Date },
  n = 5,
  meter?: QueryMeter,
): Promise<TopContactRow[]> {
  const db = dbOf(ctx, meter);
  const rows = await topContactsRaw(db, range);
  const ids = rows.filter((r) => r.direction === "OUT" && r.contactId).map((r) => r.contactId as string);
  return pickTop(rows, "OUT", await contactNames(db, ids), n);
}

/** "จ่ายให้ใครมากที่สุด" — 2 query */
export async function topVendors(
  ctx: DashCtx,
  range: { from: Date; to: Date },
  n = 5,
  meter?: QueryMeter,
): Promise<TopContactRow[]> {
  const db = dbOf(ctx, meter);
  const rows = await topContactsRaw(db, range);
  const ids = rows.filter((r) => r.direction === "IN" && r.contactId).map((r) => r.contactId as string);
  return pickTop(rows, "IN", await contactNames(db, ids), n);
}

async function topProductRows(db: Db, range: { from: Date; to: Date }): Promise<TopProductRow[]> {
  const rows = await db.accountDocumentLine.groupBy({
    by: ["productId", "description"],
    where: {
      document: {
        ...SALES_WHERE,
        status: { notIn: NOT_ISSUED },
        issueDate: { gte: range.from, lt: range.to },
      },
    },
    _sum: { amount: true, qty: true },
  });
  // ชื่อสินค้า = description บนบรรทัด (ชื่อ ณ วันขาย) — ไม่ต้อง join ทะเบียนสินค้าเพิ่ม 1 query
  // บรรทัดที่ผูก productId เดียวกันแต่คนละ description ถูกยุบรวมด้วย productId
  const merged = new Map<string, TopProductRow>();
  for (const r of rows) {
    const key = r.productId ?? `d:${r.description}`;
    const cur = merged.get(key);
    const amount = r._sum.amount ?? 0;
    const qty = Number(r._sum.qty ?? 0);
    if (cur) {
      cur.amount += amount;
      cur.qty += qty;
    } else {
      merged.set(key, { productId: r.productId, name: r.description, qty, amount });
    }
  }
  return [...merged.values()].sort((a, b) => b.amount - a.amount);
}

/** "ขายอะไรดีสุด" — 1 query (POS จะส่งบรรทัดเข้ามาเองใน WO 4.2 → ตัวเลขนี้ครบขึ้นโดยไม่ต้องแก้โค้ด) */
export async function topProducts(
  ctx: DashCtx,
  range: { from: Date; to: Date },
  n = 5,
  meter?: QueryMeter,
): Promise<TopProductRow[]> {
  const db = dbOf(ctx, meter);
  return (await topProductRows(db, range)).slice(0, n);
}

// ─────────────────── 6b) "ดูภาพรวม" รายรับ/รายจ่าย (§6 WO 2.3) ───────────────────

export type OverviewSide = "revenue" | "expense";

export type StatusBucket = "paid" | "awaiting" | "overdue";

export type MonthStatusPoint = {
  periodKey: string;
  paid: number;
  awaiting: number;
  overdue: number;
  paidCount: number;
  awaitingCount: number;
  overdueCount: number;
};

export type MonthlyStatusSeries = {
  side: OverviewSide;
  year: number;
  months: MonthStatusPoint[]; // 12 เดือนเสมอ (เดือนไม่มีรายการ = 0)
  total: {
    paid: number;
    awaiting: number;
    overdue: number;
    paidCount: number;
    awaitingCount: number;
    overdueCount: number;
    grand: number;
    grandCount: number;
  };
};

function emptyStatusPoint(periodKey: string): MonthStatusPoint {
  return { periodKey, paid: 0, awaiting: 0, overdue: 0, paidCount: 0, awaitingCount: 0, overdueCount: 0 };
}

/**
 * กราฟแท่งซ้อน 3 โทน "ค่าใช้จ่ายรายเดือน"/"รายรับรายเดือน" (§6 การ์ดกราฟ) — ชำระแล้ว/รอชำระ/พ้นกำหนด
 * ต่อเดือนที่ **ออก**เอกสาร (ไม่ใช่เดือนที่ชำระ)
 *
 * ขอบเขตเอกสารตั้งใจใช้ **ตัวเดียวกับการ์ดอันดับด้านล่าง**: SALES_WHERE (topCustomers/topProducts) ฝั่งรายรับ ·
 * PURCHASE_WHERE (topVendors) ฝั่งรายจ่าย — ไม่ใช่นิยามที่ 3 — เพราะเอกสารกลุ่มนี้เท่านั้นที่มี dueDate/paidTotal/
 * สถานะชำระเงินแบบเดียวกับหน้ารายการจริง (ต่างจาก QUOTATION/PURCHASE_ORDER ที่ไม่ใช่เอกสารเงิน)
 *
 * สถานะต่อใบตัดสินด้วย `isOverdue()` ตัวเดียวกับหน้ารายการ/รายงานอายุหนี้ (service.ts) · ยอดต่อถัง = grandTotal
 * เต็มใบ (ธรรมเนียมเดียวกับ documentsIssued() ที่ไม่ใช้ยอดคงค้าง) ⇒ ชำระแล้ว+รอชำระ+พ้นกำหนด = ยอดที่ออกทั้งเดือนเสมอ
 *
 * ใช้ findMany + bucket ฝั่ง JS (ไม่ใช่ $queryRaw) — แนวเดียวกับ loadOpenDocs()/recentRows() ในไฟล์นี้ (ไม่ต้อง
 * เขียนตรรกะวันที่/overdue ซ้ำเป็น SQL คนละสำนวน) — **1 query**
 */
export async function monthlyStatusSeries(
  ctx: DashCtx,
  side: OverviewSide,
  year: number,
  meter?: QueryMeter,
): Promise<MonthlyStatusSeries> {
  const db = dbOf(ctx, meter);
  const from = monthStart(`${year}-01`);
  const to = monthEndExclusive(`${year}-12`);
  const scopeWhere = side === "revenue" ? SALES_WHERE : PURCHASE_WHERE;
  const docs = await db.accountDocument.findMany({
    where: { ...scopeWhere, status: { notIn: NOT_ISSUED }, issueDate: { gte: from, lt: to } },
    select: { issueDate: true, status: true, dueDate: true, validUntil: true, grandTotal: true },
  });

  const byKey = new Map<string, MonthStatusPoint>();
  for (const k of yearKeys(year)) byKey.set(k, emptyStatusPoint(k));
  const total = {
    paid: 0,
    awaiting: 0,
    overdue: 0,
    paidCount: 0,
    awaitingCount: 0,
    overdueCount: 0,
    grand: 0,
    grandCount: 0,
  };

  for (const d of docs) {
    const bucket = byKey.get(periodKeyBkk(d.issueDate));
    if (!bucket) continue;
    const overdue = isOverdue({ status: d.status, dueDate: d.dueDate, validUntil: d.validUntil });
    if (d.status === "PAID") {
      bucket.paid += d.grandTotal;
      bucket.paidCount += 1;
      total.paid += d.grandTotal;
      total.paidCount += 1;
    } else if (overdue) {
      bucket.overdue += d.grandTotal;
      bucket.overdueCount += 1;
      total.overdue += d.grandTotal;
      total.overdueCount += 1;
    } else {
      bucket.awaiting += d.grandTotal;
      bucket.awaitingCount += 1;
      total.awaiting += d.grandTotal;
      total.awaitingCount += 1;
    }
    total.grand += d.grandTotal;
    total.grandCount += 1;
  }

  return { side, year, months: yearKeys(year).map((k) => byKey.get(k) as MonthStatusPoint), total };
}

/** ชนิดเอกสารรายรับ/รายจ่ายของการ์ด "เอกสารที่ออก" บนหน้าภาพรวม (§6) — ตรงกับ f4 mockup จริง
 * (ฝั่งรายจ่าย: บันทึกค่าใช้จ่าย/บันทึกซื้อสินค้า/ใบสั่งซื้อ/ซื้อสินทรัพย์ — ไม่รวม DP/PTX/CNR/DNR/CP
 * ซึ่งเป็นเอกสารทะเบียน/สนับสนุน ไม่ใช่ "บันทึกรายจ่ายใหม่" · ฝั่งรายรับใช้ 4 ชนิดคู่ขนาน) */
export const REVENUE_ISSUED_TYPES: readonly AccountDocType[] = ["QUOTATION", "INVOICE", "RECEIPT", "TAX_INVOICE"];
export const EXPENSE_ISSUED_TYPES: readonly AccountDocType[] = ["EXPENSE", "PURCHASE", "PURCHASE_ORDER", "ASSET_PURCHASE"];

export type IssuedTypeRow = { docType: AccountDocType; label: string; count: number; amount: number; shareBp: number };
export type IssuedByType = {
  side: OverviewSide;
  from: string;
  to: string;
  total: { count: number; amount: number };
  rows: IssuedTypeRow[]; // เรียงยอดมากไปน้อย
};

/**
 * การ์ด "เอกสารที่ออก" ของหน้าภาพรวม (§6) — breakdown ตาม **ชนิดเอกสาร** (ต่างจาก `documentsIssued()`
 * ของหน้าหลักที่ breakdown ตามสถานะของชนิดเดียว) · ช่วงเวลาเลือกได้ (เดือนนี้/เดือนก่อน/ปีนี้ ฯลฯ) — 1 query
 */
export async function issuedByType(
  ctx: DashCtx,
  side: OverviewSide,
  range: { from: Date; to: Date },
  meter?: QueryMeter,
): Promise<IssuedByType> {
  const db = dbOf(ctx, meter);
  const types = side === "revenue" ? REVENUE_ISSUED_TYPES : EXPENSE_ISSUED_TYPES;
  const groups = await db.accountDocument.groupBy({
    by: ["docType"],
    where: {
      docType: { in: types as AccountDocType[] },
      status: { notIn: NOT_ISSUED },
      issueDate: { gte: range.from, lt: range.to },
    },
    _count: { _all: true },
    _sum: { grandTotal: true },
  });
  const byType = new Map(groups.map((g) => [g.docType, { count: g._count._all, amount: g._sum.grandTotal ?? 0 }]));
  const rows: IssuedTypeRow[] = types.map((t) => {
    const g = byType.get(t) ?? { count: 0, amount: 0 };
    return { docType: t, label: docTypeLabel(t), count: g.count, amount: g.amount, shareBp: 0 };
  });
  const total = rows.reduce((acc, r) => ({ count: acc.count + r.count, amount: acc.amount + r.amount }), { count: 0, amount: 0 });
  rows.sort((a, b) => b.amount - a.amount);
  for (const r of rows) r.shareBp = shareBp(r.amount, total.amount);
  return { side, from: dayKeyBkk(range.from), to: dayKeyBkk(range.to), total, rows };
}

/** "รายได้อะไรมากที่สุด" (§6 การ์ดล่างฝั่งรายรับ) — คู่กับ `topExpenseCategories` · ช่วงหลายงวดได้ · 1 query */
export async function topIncomeCategories(
  ctx: DashCtx,
  range: { fromKey: string; toKey: string },
  n = 5,
  meter?: QueryMeter,
): Promise<{ total: number; rows: CategorySlice[] }> {
  const db = dbOf(ctx, meter);
  bump(meter);
  const rows = await glAggregate(db, ctx, range.fromKey, range.toKey);
  return incomeCategoriesFromRows(rows, n);
}

export type TrackedContactRow = { contactId: string; name: string; outstanding: number; count: number };

/**
 * "ลูกหนี้ที่ติดตาม"/"เจ้าหนี้ที่ติดตาม" (§6) — AccountContact ยังไม่มีคอลัมน์ `pinned` (ต่างจาก
 * AccountFinance/AccountLedger ที่ WO 0.3 เพิ่มให้แล้ว) ⇒ ตาม WO 2.3: ไม่มี pinned → โชว์ top-5 ตามยอดค้างแทน
 * (ห้ามเพิ่ม schema ใน WO นี้) — ยอดค้าง = grandTotal−paidTotal ตรง ๆ (แบบเดียวกับ payableStats เดิม ไม่ได้หัก
 * ใบลดหนี้เหมือน receivablePayableSummary — เพื่อคง 2 query) — เรียงยอดค้างมาก→น้อย
 */
export async function topTrackedContacts(
  ctx: DashCtx,
  side: OverviewSide,
  n = 5,
  meter?: QueryMeter,
): Promise<TrackedContactRow[]> {
  const db = dbOf(ctx, meter);
  const direction = side === "revenue" ? "OUT" : "IN";
  const groups = await db.accountDocument.groupBy({
    by: ["contactId"],
    where: {
      direction,
      status: { in: OPEN_STATUSES },
      voidedAt: null,
      docType: { not: "BILLING_NOTE" },
      contactId: { not: null },
    },
    _sum: { grandTotal: true, paidTotal: true },
    _count: { _all: true },
  });
  const rows = groups
    .map((g) => ({
      contactId: g.contactId as string,
      outstanding: Math.max(0, (g._sum.grandTotal ?? 0) - (g._sum.paidTotal ?? 0)),
      count: g._count._all,
    }))
    .filter((r) => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, n);
  const names = await contactNames(db, rows.map((r) => r.contactId));
  return rows.map((r) => ({ ...r, name: names.get(r.contactId) ?? NO_CONTACT }));
}

// ─────────────────── 7) งานที่รอคุณ (§4 บล็อก 7) ───────────────────

export type PendingTasksDash = {
  quotationAwaitingAccept: number;
  poAwaitingApproval: number;
  depositAwaitingDeduct: number;
  needsReview: number;
  purchaseTaxAwaiting: number;
  recurringDraftsAwaiting: number;
  total: number;
};

const PENDING_STATUSES: AccountDocStatus[] = [
  "AWAITING_ACCEPT",
  "AWAITING_APPROVAL",
  "AWAITING_DEDUCT",
  "AWAITING_RECEIVE",
  "DRAFT",
];

/**
 * "งานที่รอคุณ" — ช่องเดียวกับ service.pendingTasks (WO 1.9) เป๊ะ แต่ยิง 2 query แทน 6
 * (groupBy [docType,status,source] + count needsReview) เพื่ออยู่ใน budget ของหน้าหลัก
 * ข้อสอบบังคับให้ทุกช่อง === service.pendingTasks()
 */
export async function pendingTasks(ctx: DashCtx, meter?: QueryMeter): Promise<PendingTasksDash> {
  const db = dbOf(ctx, meter);
  const [groups, needsReview] = await Promise.all([
    db.accountDocument.groupBy({
      by: ["docType", "status", "source"],
      where: { status: { in: PENDING_STATUSES } },
      _count: { _all: true },
    }),
    db.accountJournalEntry.count({ where: { needsReview: true } }),
  ]);
  return pendingFromGroups(
    groups.map((g) => ({ docType: g.docType, status: g.status, source: g.source as string, count: g._count._all })),
    needsReview,
  );
}

function pendingFromGroups(
  groups: Array<{ docType: AccountDocType; status: AccountDocStatus; source: string; count: number }>,
  needsReview: number,
): PendingTasksDash {
  const sum = (fn: (g: (typeof groups)[number]) => boolean) =>
    groups.reduce((s, g) => (fn(g) ? s + g.count : s), 0);
  const out = {
    quotationAwaitingAccept: sum((g) => g.docType === "QUOTATION" && g.status === "AWAITING_ACCEPT"),
    poAwaitingApproval: sum(
      (g) =>
        (g.docType === "PURCHASE_ORDER" || g.docType === "ASSET_PURCHASE_ORDER") &&
        g.status === "AWAITING_APPROVAL",
    ),
    depositAwaitingDeduct: sum(
      (g) =>
        (g.docType === "DEPOSIT_RECEIPT" || g.docType === "DEPOSIT_PAYMENT") && g.status === "AWAITING_DEDUCT",
    ),
    needsReview,
    purchaseTaxAwaiting: sum((g) => g.docType === "PURCHASE_TAX_INVOICE" && g.status === "AWAITING_RECEIVE"),
    recurringDraftsAwaiting: sum((g) => g.source === "RECURRING" && g.status === "DRAFT"),
    total: 0,
  };
  out.total =
    out.quotationAwaitingAccept +
    out.poAwaitingApproval +
    out.depositAwaitingDeduct +
    out.needsReview +
    out.purchaseTaxAwaiting +
    out.recurringDraftsAwaiting;
  return out;
}

// ─────────────────── 8) เอกสารล่าสุด (§4 บล็อก 7) ───────────────────

export type RecentDocRow = {
  id: string;
  docType: AccountDocType;
  docTypeLabel: string;
  docNo: string | null;
  direction: string;
  status: AccountDocStatus;
  statusLabel: string;
  contactId: string | null;
  contactName: string;
  grandTotal: number;
  issueDate: string;
  updatedAt: string;
  /** เพิ่มโดย WO 2.2 (select กว้างขึ้นในคำสั่งเดิม — ไม่ยิง query เพิ่ม) ให้หน้าหลักคำนวณ "พ้นกำหนด" เองด้วย
   * service.isOverdue({status,dueDate,validUntil}) ตรงกับที่หน้ารายการอื่นใช้ */
  dueDate: string | null;
  validUntil: string | null;
};

async function recentRows(db: Db, n: number): Promise<Array<Omit<RecentDocRow, "contactName">>> {
  const docs = await db.accountDocument.findMany({
    orderBy: { updatedAt: "desc" },
    take: n,
    select: {
      id: true,
      docType: true,
      docNo: true,
      direction: true,
      status: true,
      contactId: true,
      grandTotal: true,
      issueDate: true,
      updatedAt: true,
      dueDate: true,
      validUntil: true,
    },
  });
  return docs.map((d) => ({
    id: d.id,
    docType: d.docType,
    docTypeLabel: docTypeLabel(d.docType),
    docNo: d.docNo,
    direction: d.direction as string,
    status: d.status,
    statusLabel: STATUS_LABEL[d.status],
    contactId: d.contactId,
    grandTotal: d.grandTotal,
    issueDate: dayKeyBkk(d.issueDate),
    updatedAt: d.updatedAt.toISOString(),
    dueDate: d.dueDate ? d.dueDate.toISOString() : null,
    validUntil: d.validUntil ? d.validUntil.toISOString() : null,
  }));
}

/** เอกสารล่าสุดทั้ง 2 ฝั่ง เรียงตามการแก้ไขล่าสุด — 2 query (เอกสาร + ชื่อผู้ติดต่อ) */
export async function recentDocuments(ctx: DashCtx, n = 6, meter?: QueryMeter): Promise<RecentDocRow[]> {
  const db = dbOf(ctx, meter);
  const rows = await recentRows(db, n);
  const names = await contactNames(db, rows.map((r) => r.contactId).filter((x): x is string => !!x));
  return rows.map((r) => ({ ...r, contactName: (r.contactId ? names.get(r.contactId) : null) ?? NO_CONTACT }));
}

// ─────────────────── 9) ปฏิทินเงินเข้า-ออก + คาดการณ์ (§10.2) ───────────────────

export type CalendarTile = { count: number; amount: number };

export type CashCalendar = {
  monthKey: string;
  tiles: {
    inflow: CalendarTile;
    outflow: CalendarTile;
    overdueReceivable: CalendarTile;
    overduePayable: CalendarTile;
    expectedIn: CalendarTile;
    expectedOut: CalendarTile;
  };
  days: Array<{ date: string; inflow: number; outflow: number; expectedIn: number; expectedOut: number }>;
};

const zeroTile = (): CalendarTile => ({ count: 0, amount: 0 });

/**
 * ตารางเงินเข้า-ออกของเดือน + คาดการณ์จากวันครบกำหนด — 3 query
 * เงินเข้า/ออกจริง = AccountDocumentPayment.paidAt (เฉพาะที่มีช่องทางเงินจริง — DEPOSIT_APPLY/CREDIT_APPLY
 * ไม่ใช่เงินสดเข้าออก) · คาดการณ์ = เอกสารเปิดที่ dueDate อยู่ในเดือนนี้ (ยอดคงค้าง)
 */
export async function cashCalendar(
  ctx: DashCtx,
  monthKey: string,
  opts: { now?: Date } = {},
  meter?: QueryMeter,
): Promise<CashCalendar> {
  const db = dbOf(ctx, meter);
  const from = monthStart(monthKey);
  const to = monthEndExclusive(monthKey);
  const now = opts.now ?? new Date();
  bump(meter, 3); // raw ×3

  const [paid, expected, overdue] = await Promise.all([
    db.$queryRaw<Array<{ day: string; dir: string; c: bigint; amt: bigint }>>`
      SELECT to_char((p."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS "day",
             d."direction"::text AS "dir",
             COUNT(*)::bigint     AS "c",
             SUM(p."amount")::bigint AS "amt"
        FROM "AccountDocumentPayment" p
        JOIN "AccountDocument" d ON d."id" = p."documentId"
       WHERE p."tenantId" = ${ctx.tenantId}
         AND p."systemId" = ${ctx.systemId}
         AND p."voidedAt" IS NULL
         AND p."financeAccountId" IS NOT NULL
         AND p."paidAt" >= ${from}
         AND p."paidAt" < ${to}
       GROUP BY 1, 2`,
    db.$queryRaw<Array<{ day: string; dir: string; c: bigint; amt: bigint }>>`
      SELECT to_char((d."dueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS "day",
             d."direction"::text AS "dir",
             COUNT(*)::bigint    AS "c",
             SUM(d."grandTotal" - d."paidTotal")::bigint AS "amt"
        FROM "AccountDocument" d
       WHERE d."tenantId" = ${ctx.tenantId}
         AND d."systemId" = ${ctx.systemId}
         AND d."voidedAt" IS NULL
         AND d."status" IN ('AWAITING_PAYMENT', 'PARTIAL')
         AND d."grandTotal" > d."paidTotal"
         AND d."dueDate" >= ${from}
         AND d."dueDate" < ${to}
       GROUP BY 1, 2`,
    db.$queryRaw<Array<{ dir: string; c: bigint; amt: bigint }>>`
      SELECT d."direction"::text AS "dir",
             COUNT(*)::bigint    AS "c",
             SUM(d."grandTotal" - d."paidTotal")::bigint AS "amt"
        FROM "AccountDocument" d
       WHERE d."tenantId" = ${ctx.tenantId}
         AND d."systemId" = ${ctx.systemId}
         AND d."voidedAt" IS NULL
         AND d."status" IN ('AWAITING_PAYMENT', 'PARTIAL')
         AND d."grandTotal" > d."paidTotal"
         AND d."dueDate" IS NOT NULL
         AND d."dueDate" < ${now}
       GROUP BY 1`,
  ]);

  const days = Array.from({ length: daysInMonth(monthKey) }, (_, i) => ({
    date: `${monthKey}-${String(i + 1).padStart(2, "0")}`,
    inflow: 0,
    outflow: 0,
    expectedIn: 0,
    expectedOut: 0,
  }));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const tiles = {
    inflow: zeroTile(),
    outflow: zeroTile(),
    overdueReceivable: zeroTile(),
    overduePayable: zeroTile(),
    expectedIn: zeroTile(),
    expectedOut: zeroTile(),
  };

  for (const r of paid) {
    const amt = Number(r.amt);
    const tile = r.dir === "IN" ? tiles.outflow : tiles.inflow;
    tile.count += Number(r.c);
    tile.amount += amt;
    const day = byDate.get(r.day);
    if (day) {
      if (r.dir === "IN") day.outflow += amt;
      else day.inflow += amt;
    }
  }
  for (const r of expected) {
    const amt = Number(r.amt);
    const tile = r.dir === "IN" ? tiles.expectedOut : tiles.expectedIn;
    tile.count += Number(r.c);
    tile.amount += amt;
    const day = byDate.get(r.day);
    if (day) {
      if (r.dir === "IN") day.expectedOut += amt;
      else day.expectedIn += amt;
    }
  }
  for (const r of overdue) {
    const tile = r.dir === "IN" ? tiles.overduePayable : tiles.overdueReceivable;
    tile.count += Number(r.c);
    tile.amount += Number(r.amt);
  }

  return { monthKey, tiles, days };
}

// ─────────────────── 10) หน้าหลัก: ก้อนเดียวจบ (§4) ───────────────────

export type DashboardSnapshot = {
  asOf: string;
  periodKey: string;
  year: number;
  kpi: {
    receivable: { count: number; amount: number };
    payable: { count: number; amount: number };
    overdue: { count: number; amount: number };
    cashTotal: number;
  };
  series: MonthlySeries;
  arap: ReceivablePayableSummary;
  income: CategoryBreakdown;
  expense: CategoryBreakdown;
  cash: CashPosition;
  issued: DocumentsIssued;
  pending: PendingTasksDash;
  recent: RecentDocRow[];
  topCustomers: TopContactRow[];
  topProducts: TopProductRow[];
  topVendors: TopContactRow[];
  topExpenseCategories: { total: number; rows: CategorySlice[] };
  calendar: CashCalendar | null;
  queryCount: number;
  /** ก้อน GL ดิบต่องวด×บัญชี ของ `${year-1}-01`..`${year}-12` — เพิ่มโดย WO 2.2 (additive · ไม่ยิง query เพิ่ม
   * เพราะเป็นผลลัพธ์ของ query #1 อยู่แล้ว) ให้หน้าหลัก derive breakdown ของเดือนอื่นในช่วงนี้ได้เอง
   * ผ่าน `categoryBreakdownFromRows` โดยไม่ต้องเพิ่มงบ query · WO 2.1 เดิมไม่ใช้ฟิลด์นี้ */
  glRows: GlPeriodRow[];
};

export type SnapshotOpts = {
  now?: Date;
  /** ปีของกราฟ 12 เดือน (ค่าเริ่มต้น = ปีของ now) */
  year?: number;
  /** ชนิดเอกสารของการ์ด "เอกสารที่ออก" (ค่าเริ่มต้น = ใบเสนอราคา ตาม §4 ข้อ 6) */
  issuedDocType?: AccountDocType;
  topN?: number;
  recentN?: number;
  /** ปฏิทินเงินเข้า-ออก (§10.2) — ปิดไว้ ไม่ใช่บล็อกของหน้าหลัก (+3 query) */
  withCalendar?: boolean;
  meter?: QueryMeter;
};

/**
 * ทุกตัวเลขของหน้าหลัก (§4) ในการเรียกครั้งเดียว — **12 query** (นับจริงด้วย prisma log ในข้อสอบ)
 *
 * แผน query (ห้ามเพิ่มโดยไม่แก้ข้อสอบ):
 *   1 GL รายงวด (raw)  → series 12 เดือน + donut รายได้ + donut ค่าใช้จ่าย + หมวดค่าใช้จ่าย + เงินเข้า-ออกช่องทาง
 *   2 บัญชีเงิน (financeBalances) · 3 ยอด GL ของบัญชีเงิน (financeBalances)
 *   4 เอกสารเปิดทั้ง 2 ฝั่ง · 5 ใบลดหนี้ (groupBy)      → KPI + ค้างรับ/ค้างจ่าย + อายุหนี้
 *   6 เอกสารที่ออก (groupBy) · 7 งานที่รอคุณ (groupBy) · 8 JV ที่ต้องตรวจ (count)
 *   9 เอกสารล่าสุด · 10 อันดับผู้ติดต่อ 2 ฝั่ง (groupBy) · 11 อันดับสินค้า (groupBy)
 *   12 ชื่อผู้ติดต่อของ 9+10 (findMany ก้อนเดียว)
 */
export async function dashboardSnapshot(ctx: DashCtx, opts: SnapshotOpts = {}): Promise<DashboardSnapshot> {
  const meter = opts.meter;
  const db = dbOf(ctx, meter);
  const now = opts.now ?? new Date();
  const periodKey = periodKeyBkk(now);
  const year = opts.year ?? Number(periodKey.slice(0, 4));
  const topN = opts.topN ?? 5;
  const yearRange = { from: monthStart(`${year}-01`), to: monthEndExclusive(`${year}-12`) };
  const issuedDocType = opts.issuedDocType ?? "QUOTATION";
  bump(meter, 1 + FINANCE_BALANCES_QUERIES); // raw GL + financeBalances (ไม่ผ่าน $allOperations)

  const [glRows, balances, open, issued, pendingGroups, needsReview, recent, topRows, productRows] =
    await Promise.all([
      glAggregate(db, ctx, `${year - 1}-01`, `${year}-12`),
      financeBalances(ctx.tenantId, ctx.systemId),
      loadOpenDocs(db),
      documentsIssued(ctx, issuedDocType, { from: yearRange.from, to: yearRange.to }, meter),
      db.accountDocument.groupBy({
        by: ["docType", "status", "source"],
        where: { status: { in: PENDING_STATUSES } },
        _count: { _all: true },
      }),
      db.accountJournalEntry.count({ where: { needsReview: true } }),
      recentRows(db, opts.recentN ?? 6),
      topContactsRaw(db, yearRange),
      topProductRows(db, yearRange),
    ]);

  // ชื่อผู้ติดต่อของ "เอกสารล่าสุด" + "อันดับลูกค้า/ผู้ขาย" — ก้อนเดียว (query สุดท้าย)
  const wanted = new Set<string>();
  for (const r of recent) if (r.contactId) wanted.add(r.contactId);
  for (const r of topRows) if (r.contactId) wanted.add(r.contactId);
  const names = await contactNames(db, [...wanted]);

  const arap = summaryFromDocs(open.docs, open.cn, now);
  const cash = cashFromParts(balances, glRows, periodKey);
  const calendar = opts.withCalendar ? await cashCalendar(ctx, periodKey, { now }, meter) : null;

  return {
    asOf: dayKeyBkk(now),
    periodKey,
    year,
    kpi: {
      receivable: { count: arap.receivable.count, amount: arap.receivable.amount },
      payable: { count: arap.payable.count, amount: arap.payable.amount },
      overdue: {
        count: arap.receivable.overdueCount + arap.payable.overdueCount,
        amount: arap.receivable.overdueAmount + arap.payable.overdueAmount,
      },
      cashTotal: cash.total,
    },
    series: seriesFromRows(glRows, year),
    arap,
    income: breakdownFromRows(glRows, periodKey, "income", topN),
    expense: breakdownFromRows(glRows, periodKey, "expense", topN),
    cash,
    issued,
    pending: pendingFromGroups(
      pendingGroups.map((g) => ({
        docType: g.docType,
        status: g.status,
        source: g.source as string,
        count: g._count._all,
      })),
      needsReview,
    ),
    recent: recent.map((r) => ({
      ...r,
      contactName: (r.contactId ? names.get(r.contactId) : null) ?? NO_CONTACT,
    })),
    topCustomers: pickTop(topRows, "OUT", names, topN),
    topProducts: productRows.slice(0, topN),
    topVendors: pickTop(topRows, "IN", names, topN),
    topExpenseCategories: expenseCategoriesFromRows(
      glRows.filter((r) => r.periodKey === periodKey),
      topN,
    ),
    calendar,
    queryCount: meter?.count ?? 0,
    glRows,
  };
}
