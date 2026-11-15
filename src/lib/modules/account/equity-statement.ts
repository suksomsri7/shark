// ACC T5.8 (D9) — งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ (TFRS for NPAEs 4.1.3 — บังคับ · 4.3 เปรียบเทียบงวดก่อน) · design note ledger/wo-notes/T5.8.md
//
// คอลัมน์ = บัญชีทุนจริงทุกบัญชี (ประเภท EQUITY) ที่มียอด/เคลื่อนไหว ยกเว้นบัญชีกำไรสะสม (รหัส 3800 ของผังมาตรฐาน) ·
//           "กำไรสะสม" = บัญชีกำไรสะสม + กำไรสะสมเสมือน (Σ กำไรขาดทุนของปีบัญชีก่อน ๆ — ระบบไม่ปิดบัญชีด้วย JV) · รวม
// แถว   = ยอดยกมาต้นงวด · เพิ่มทุน/นำเงินมาลงทุน (เครดิตบัญชีทุน) · ลดทุน/ถอนใช้ส่วนตัว (เดบิตบัญชีทุน) ·
//         ปรับปรุง/จัดสรรกำไรสะสม (สุทธิของบัญชีกำไรสะสมในงวด — เงินปันผล ปรับปรุงข้อผิดพลาดงวดก่อน) · กำไร(ขาดทุน)สุทธิ · ยอดคงเหลือปลายงวด
// งวด  = ตั้งแต่ต้นปีบัญชีถึงเดือน `to` (ปีที่ยังไม่จบ = ถึงเดือนนั้น) · งวดก่อน = ช่วงเดียวกันของปีบัญชีก่อน (ค่าเริ่ม แสดงคู่กันเสมอ)
// ตรวจตัวเอง: ยอดปลายงวดรวม = ส่วนของเจ้าของในงบฐานะการเงิน ณ เดือน `to` (reconciled)
import { tenantDb } from "@/lib/core/db";
import { balanceSheet, fiscalYearStartKey } from "./reports";
import { STATEMENT_DRAFT_LABEL_TH } from "./fiscal-rules";

export type GlCtx = { tenantId: string; systemId: string };
export type EquityColumn = { key: string; code: string | null; name: string };
export type EquityRow = { kind: "OPENING" | "CONTRIBUTION" | "WITHDRAWAL" | "RETAINED_ADJ" | "PROFIT" | "CLOSING"; label: string; amounts: Record<string, number>; total: number };
export type EquityBlock = { from: string; to: string; label: string; rows: EquityRow[]; closingTotal: number; bsTotalEquity: number; reconciled: boolean };
export type EquityStatement = { columns: EquityColumn[]; current: EquityBlock; prior: EquityBlock | null; draftLabel: string };

export const EQUITY_DRAFT_LABEL = STATEMENT_DRAFT_LABEL_TH; // merge T4+T5 ▸ ป้ายเดียวกับงบอื่น (ACC T4.6 fiscal-rules) ◂
const RETAINED = "__retained";

function shift(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

type Sums = Map<string, { debit: number; credit: number }>;
async function sums(ctx: GlCtx, periodKey: { lt?: string; gte?: string; lte?: string }, ids: string[] | null): Promise<Sums> {
  const systemId = ctx.systemId;
  const rows = await tenantDb(ctx).accountJournalLine.groupBy({
    by: ["accountId"],
    where: { systemId, entry: { periodKey }, ...(ids ? { accountId: { in: ids } } : {}) },
    _sum: { debit: true, credit: true },
  });
  return new Map(rows.map((r) => [r.accountId, { debit: r._sum.debit ?? 0, credit: r._sum.credit ?? 0 }]));
}

async function retainedLedgerId(ctx: GlCtx): Promise<string | null> {
  const systemId = ctx.systemId;
  // ผังบัญชีมาตรฐาน: 3800 กำไรสะสม (coa.ts) — ไม่มี mapping แยก
  return (await tenantDb(ctx).accountLedger.findFirst({ where: { systemId, type: "EQUITY", code: "3800" }, select: { id: true } }))?.id ?? null;
}

async function block(ctx: GlCtx, from: string, to: string, fyEndMonth: number, eq: { id: string; code: string; name: string }[], retainedId: string | null, label: string): Promise<EquityBlock> {
  const ids = eq.map((e) => e.id);
  const [open, move, bsOpen, bsClose] = await Promise.all([
    sums(ctx, { lt: from }, ids),
    sums(ctx, { gte: from, lte: to }, ids),
    balanceSheet(ctx, shift(from, -1), { fiscalYearEndMonth: fyEndMonth }),
    balanceSheet(ctx, to, { fiscalYearEndMonth: fyEndMonth }),
  ]);
  const z = () => Object.fromEntries([...eq.filter((e) => e.id !== retainedId).map((e) => [e.id, 0]), [RETAINED, 0]]) as Record<string, number>;
  const opening = z();
  const contrib = z();
  const withdraw = z();
  const retAdj = z();
  const profit = z();
  for (const e of eq) {
    const o = open.get(e.id) ?? { debit: 0, credit: 0 };
    const m = move.get(e.id) ?? { debit: 0, credit: 0 };
    if (e.id === retainedId) {
      opening[RETAINED] += o.credit - o.debit;
      retAdj[RETAINED] += m.credit - m.debit;
    } else {
      opening[e.id] += o.credit - o.debit;
      contrib[e.id] += m.credit;
      withdraw[e.id] -= m.debit;
    }
  }
  // กำไรสะสมเสมือน ณ ต้นงวด = กำไรสะสม + กำไรปีบัญชีของงบ ณ สิ้นเดือนก่อนเริ่มงวด (ทุกปีก่อน `from`)
  opening[RETAINED] += bsOpen.retainedEarnings + bsOpen.currentPeriodProfit;
  // กำไรของงวด = กำไรปีบัญชี ณ `to` (งวดเริ่มต้นปีบัญชีเสมอ)
  profit[RETAINED] = bsClose.currentPeriodProfit;
  const closing = z();
  for (const k of Object.keys(closing)) closing[k] = opening[k] + contrib[k] + withdraw[k] + retAdj[k] + profit[k];
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const rows: EquityRow[] = [
    { kind: "OPENING", label: "ยอดยกมาต้นงวด", amounts: opening, total: sum(opening) },
    { kind: "CONTRIBUTION", label: "เพิ่มทุน / นำเงินมาลงทุน", amounts: contrib, total: sum(contrib) },
    { kind: "WITHDRAWAL", label: "ลดทุน / ถอนใช้ส่วนตัว", amounts: withdraw, total: sum(withdraw) },
    { kind: "RETAINED_ADJ", label: "จัดสรร / ปรับปรุงกำไรสะสม (เช่น เงินปันผล)", amounts: retAdj, total: sum(retAdj) },
    { kind: "PROFIT", label: "กำไร (ขาดทุน) สุทธิของงวด", amounts: profit, total: sum(profit) },
    { kind: "CLOSING", label: "ยอดคงเหลือปลายงวด", amounts: closing, total: sum(closing) },
  ];
  const closingTotal = sum(closing);
  return { from, to, label, rows, closingTotal, bsTotalEquity: bsClose.totalEquity, reconciled: closingTotal === bsClose.totalEquity };
}

/**
 * งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ ของปีบัญชีที่ครอบเดือน `to` (ต้นปีบัญชี → `to`) + งวดเดียวกันของปีก่อน (ค่าเริ่ม)
 * `fiscalYearStartMonth` จากนโยบายบัญชี (policy)
 */
export async function equityStatement(ctx: GlCtx, to: string, opts: { fiscalYearStartMonth: number; compare?: boolean }): Promise<EquityStatement> {
  const startMonth = opts.fiscalYearStartMonth >= 1 && opts.fiscalYearStartMonth <= 12 ? opts.fiscalYearStartMonth : 1;
  const fyEndMonth = startMonth === 1 ? 12 : startMonth - 1;
  const from = fiscalYearStartKey(to, fyEndMonth);
  const retainedId = await retainedLedgerId(ctx);
  const db = tenantDb(ctx);
  const ledgers = await db.accountLedger.findMany({ where: { systemId: ctx.systemId, type: "EQUITY" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  // เฉพาะบัญชีที่มีบรรทัดถึงเดือน `to` (บัญชีว่างไม่เป็นคอลัมน์)
  const used = new Set(
    (await db.accountJournalLine.groupBy({ by: ["accountId"], where: { systemId: ctx.systemId, accountId: { in: ledgers.map((l) => l.id) }, entry: { periodKey: { lte: to } } } })).map((r) => r.accountId),
  );
  const eq = ledgers.filter((l) => used.has(l.id) || l.id === retainedId);
  const columns: EquityColumn[] = [
    ...eq.filter((e) => e.id !== retainedId).map((e) => ({ key: e.id, code: e.code, name: e.name })),
    { key: RETAINED, code: null, name: "กำไร (ขาดทุน) สะสม" },
  ];
  const fyLabel = (f: string, t: string) => `${f} ถึง ${t}`;
  const current = await block(ctx, from, to, fyEndMonth, eq, retainedId, fyLabel(from, to));
  const prior = opts.compare === false ? null : await block(ctx, shift(from, -12), shift(to, -12), fyEndMonth, eq, retainedId, fyLabel(shift(from, -12), shift(to, -12)));
  return { columns, current, prior, draftLabel: EQUITY_DRAFT_LABEL };
}

/** CSV: หนึ่งแถวต่อ (งวด × แถวของงบ) */
export function equityStatementCsv(s: EquityStatement): { headers: string[]; rows: (string | number)[][]; preamble: string[] } {
  const headers = ["งวด", "รายการ", ...s.columns.map((c) => (c.code ? `${c.code} ${c.name}` : c.name)), "รวม"];
  const rows: (string | number)[][] = [];
  for (const b of [s.prior, s.current]) {
    if (!b) continue;
    for (const r of b.rows) rows.push([b.label, r.label, ...s.columns.map((c) => (r.amounts[c.key] ?? 0) / 100), r.total / 100]);
  }
  return { headers, rows, preamble: [s.draftLabel] }; // merge T4+T5 ▸ ป้ายร่างบรรทัดแรกของไฟล์ (ACC T4.6) ◂
}
