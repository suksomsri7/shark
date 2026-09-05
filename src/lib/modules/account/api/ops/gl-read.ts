// ops/gl-read.ts — READ ของผังบัญชี / สมุดรายวัน / แยกประเภท / งบการเงิน / งวด / สินทรัพย์ (WO B4)
//
// ทุก op ที่นี่ `kind: "read"` — ห้ามแตะ prisma ตรง ๆ (fitness F5) เรียกผ่าน service เท่านั้น
// ทุกก้อนผ่าน `../serialize-gl.ts` เสมอ (ห้าม spread แถว service — อ่านกติกาในหัวไฟล์นั้น)
//
// เรื่องที่พลาดง่ายและถูกดักไว้ตรงนี้:
//   · **หน่วยของช่วงเวลาไม่เท่ากันระหว่างรายงานกับสมุดรายวัน**: reports.ts คิดที่ระดับ "งวด" (periodKey
//     "YYYY-MM" · เทียบแบบ lexicographic) ส่วนสมุดรายวัน/แยกประเภทคิดที่ระดับ "วันไทย" ⇒ ถ้าส่ง
//     "2026-09-01" เข้า trialBalance ตรง ๆ จะได้ `gte "2026-09-01"` ซึ่ง **มากกว่า** "2026-09" ⇒ งวด
//     ก.ย. หายทั้งงวดแบบเงียบ ๆ (ยอดออกมาเป็น 0 โดยไม่มี error) → `periodOf()` ตัดให้เหลือ YYYY-MM ที่นี่
//     ที่เดียว และผู้เรียกส่งได้ทั้ง 2 รูปแบบ (ผลต้องเท่ากันเป๊ะ)
//   · `range` ค่าเริ่มต้นของ `journal.list` = **`all`** ไม่ใช่ "เดือนนี้" ของหน้าจอ — ผู้เรียก REST ที่ไม่ได้
//     ส่งตัวกรองอะไรเลยต้องได้ "ทั้งเล่ม" ไม่ใช่ผลที่ถูกตัดด้วยนาฬิกาของเซิร์ฟเวอร์โดยไม่รู้ตัว
//   · aging ใช้คำว่า AR/AP (ภาษาคนทำบัญชี) แต่ service ใช้ OUT/IN (ทิศของเอกสาร) — แปลงที่นี่
//   · รายงานทุกตัว `rate: "report"` (ถังเพดานคนละใบกับการอ่านทั่วไป — งบหนักกว่ามาก)

import { z } from "zod";
import type { AccountAssetStatus } from "@prisma/client";
import { csvRow } from "@/lib/core/csv";
import { listAssets } from "../../asset";
import { assetDetail, previewDepreciation } from "../../asset-v2";
import { chartTree, ledgerDetail, listLedgers, listMappings, mappingKeyLabel } from "../../coa";
import { docTypeLabel } from "../../dashboard";
import { listDocTypeAccounts } from "../../doc-settings";
import { ERR } from "../../errors";
import {
  generalLedger,
  journalEntryDetail,
  journalRangeOf,
  listJournalPaged,
  type JournalRangeKey,
} from "../../journal-v2";
import { currentPeriodKey, isPeriodKey, listPeriods, listVatFilings, periodChecklist } from "../../period-close";
import { fiscalYearEndMonth, getPolicy } from "../../policy";
import { agingReport, balanceSheet, cashFlow, pp30, pp30Csv, profitLoss, trialBalance } from "../../reports";
import { defineOp, type ApiOp } from "../op";
import { ApiError, paged, type PagedInfo } from "../respond";
import {
  agingView,
  assetDetailView,
  assetRowView,
  balanceSheetView,
  cashFlowView,
  chartView,
  checklistView,
  depreciationPreviewView,
  docTypeAccountView,
  generalLedgerView,
  journalDetail,
  journalRow,
  ledgerDetailView,
  mappingView,
  periodRowView,
  pp30View,
  profitLossView,
  trialBalanceView,
  type LedgerMetaRow,
} from "../serialize-gl";

const noQuery = z.object({}).strict();
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
/** วัน หรือ เดือน — รายงานคิดเป็น "งวด" อยู่แล้ว ⇒ รับได้ทั้งคู่ (ดูหัวไฟล์) */
const YM_OR_YMD = /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/;

const ymdField = (what: string) =>
  z.string().regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`).describe(`${what} (Thai calendar day, YYYY-MM-DD).`);
const periodField = (what: string) =>
  z.string().regex(YM, `${what} ต้องเป็นงวดรูปแบบ YYYY-MM`).describe(`${what} (accounting period, \`YYYY-MM\`).`);
const spanField = (what: string) =>
  z
    .string()
    .regex(YM_OR_YMD, `${what} ต้องเป็น YYYY-MM หรือ YYYY-MM-DD`)
    .describe(`${what}. Accepts \`YYYY-MM\` (whole month) or \`YYYY-MM-DD\` (the month that day falls in).`);

const boolQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true")
  .describe('"true" or "false". Default false.');

/** "2026-09-30" | "2026-09" → "2026-09" (หน่วยที่ reports.ts ใช้จริง) */
const periodOf = (v: string) => v.slice(0, 7);
const dayStart = (d: string) => new Date(`${d}T00:00:00.000+07:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

function pageInfoFrom(total: number, page: number, pageSize: number): PagedInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, pageCount, total, hasMore: page < pageCount };
}

// ═══════════════ ผังบัญชี ═══════════════

const chartListInput = z
  .object({
    asOf: ymdField("asOf").optional(),
    q: z.string().max(200).optional().describe("Free text: account code, Thai name or English name."),
    includeArchived: boolQuery.describe('"true" = also return deactivated accounts. Default false.'),
  })
  .strict();

/** meta ที่ต้นไม้ผังบัญชีไม่ได้พกมา (parent/level/VAT/WHT) — 1 query ต่อคำขอ */
async function chartMeta(ctx: { tenantId: string; systemId: string }): Promise<Map<string, LedgerMetaRow>> {
  const rows = await listLedgers(ctx);
  return new Map(
    rows.map((l) => [
      l.id,
      {
        id: l.id,
        parentId: l.parentId,
        level: l.level,
        vatTreatment: l.vatTreatment,
        defaultWhtRateBp: l.defaultWhtRateBp,
        defaultWhtType: l.defaultWhtType,
      },
    ]),
  );
}

const chartList = defineOp({
  id: "chart.list",
  method: "GET",
  path: "/chart",
  kind: "read",
  action: "account.journal.view",
  summary: "The whole chart of accounts: a flat list, the 3-level tree and balances per account type.",
  label: "ผังบัญชีทั้งผัง",
  tool: { name: "account_chart_of_accounts", hint: "Use to find the accountId of a ledger account before posting a manual journal entry." },
  input: chartListInput,
  test: "B4-G1.1",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const [tree, meta] = await Promise.all([
      chartTree(ctx, {
        q: input.q,
        includeArchived: input.includeArchived,
        asOf: input.asOf ? dayEnd(input.asOf) : undefined,
      }),
      chartMeta(ctx),
    ]);
    return chartView(tree, meta);
  },
});

const chartGetInput = z.object({ asOf: ymdField("asOf").optional() }).strict();

const chartGet = defineOp({
  id: "chart.get",
  method: "GET",
  path: "/chart/{id}",
  kind: "read",
  action: "account.journal.view",
  summary: "One account with its balance, this month's movement, the latest journal lines and what uses it.",
  label: "บัญชี 1 บัญชี",
  input: chartGetInput,
  test: "B4-G1.3",
  async handler({ actor, params, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const d = await ledgerDetail(ctx, params.id ?? "", { asOf: input.asOf ? dayEnd(input.asOf) : undefined });
    if (!d) throw new Error(ERR.LEDGER_NOT_FOUND);
    return ledgerDetailView(
      d,
      d.mappingKeys.map((k) => ({ key: k, label: mappingKeyLabel(k) })),
    );
  },
});

const mappingsList = defineOp({
  id: "mappings.list",
  method: "GET",
  path: "/mappings",
  kind: "read",
  action: "account.mapping.manage",
  summary: "Posting rules: which ledger account each system key (AR, AP, VAT_OUTPUT, ...) posts to.",
  label: "การผูกบัญชีอัตโนมัติ",
  test: "B4-G1.6",
  async handler({ actor }) {
    const rows = await listMappings({ tenantId: actor.tenantId, systemId: actor.systemId });
    return rows.map((m) => mappingView(m, mappingKeyLabel(m.key)));
  },
});

const docTypeAccountsList = defineOp({
  id: "doc-type-accounts.list",
  method: "GET",
  path: "/doc-type-accounts",
  kind: "read",
  action: "account.mapping.manage",
  summary: "The income/expense account used per document type when a document is posted.",
  label: "บัญชีรายวันต่อชนิดเอกสาร",
  test: "B4-G1.8",
  async handler({ actor }) {
    const rows = await listDocTypeAccounts({ tenantId: actor.tenantId, systemId: actor.systemId });
    return rows.map((r) => docTypeAccountView(r, docTypeLabel(r.docType)));
  },
});

// ═══════════════ สมุดรายวัน ═══════════════

const BOOKS = ["SALES", "PURCHASES", "RECEIPTS", "PAYMENTS", "GENERAL"] as const;

const journalListInput = z
  .object({
    range: z
      .enum(["all", "this_month", "last_month", "this_quarter", "this_year"])
      .optional()
      .describe('Preset date range. Default "all" (every entry ever posted). Ignored when from/to are given.'),
    from: ymdField("from").optional(),
    to: ymdField("to").optional(),
    book: z.enum(BOOKS).optional().describe("Journal book filter."),
    needsReview: boolQuery.describe('"true" = only entries flagged for review.'),
    q: z.string().max(200).optional().describe("Free text: journal number or memo."),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().optional().describe("1-200. Default 20."),
  })
  .strict();

const journalList = defineOp({
  id: "journal.list",
  method: "GET",
  path: "/journal",
  kind: "read",
  action: "account.journal.view",
  paged: true,
  summary: "Journal entries with paging, plus entry counts per book and debit/credit totals for the filtered range.",
  label: "สมุดรายวัน",
  tool: { name: "account_list_journal", hint: "Use for bookkeeping questions about journal entries and which book they were posted to." },
  input: journalListInput,
  test: "B4-G2.1",
  async handler({ actor, input }) {
    const page = input.page ?? 1;
    const pageSize = Math.min(Math.max(1, input.pageSize ?? 20), 200);
    // from/to ที่ส่งมาเองชนะ preset เสมอ · ไม่ส่งอะไรเลย = ทั้งเล่ม (range "all")
    let from = input.from;
    let to = input.to;
    const range = input.range ?? "all";
    if (!from && !to && range !== "all") {
      const r = journalRangeOf(range as JournalRangeKey, new Date());
      from = r.from;
      to = r.to;
    }
    const res = await listJournalPaged(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { book: input.book, from, to, q: input.q, needsReview: input.needsReview, page, pageSize },
    );
    const byBook = Object.fromEntries(BOOKS.map((b) => [b, res.tabCounts[b] ?? 0]));
    return paged(res.rows.map(journalRow), pageInfoFrom(res.total, res.page, res.pageSize), {
      byBook,
      totals: { debitSatang: res.sumDebit, creditSatang: res.sumCredit },
    });
  },
});

const journalGet = defineOp({
  id: "journal.get",
  method: "GET",
  path: "/journal/{id}",
  kind: "read",
  action: "account.journal.view",
  summary: "One journal entry with every line, the account behind each line and its reversal links.",
  label: "ใบสำคัญ 1 ใบ",
  input: noQuery,
  test: "B4-G2.6",
  async handler({ actor, params }) {
    const d = await journalEntryDetail({ tenantId: actor.tenantId, systemId: actor.systemId }, params.id ?? "");
    if (!d) throw new Error(ERR.JOURNAL_ENTRY_NOT_FOUND);
    return journalDetail(d);
  },
});

// ═══════════════ รายงาน ═══════════════

const generalLedgerInput = z
  .object({
    accountId: z.string().min(1, "ต้องระบุ accountId"),
    from: ymdField("from"),
    to: ymdField("to"),
  })
  .strict();

const reportsGeneralLedger = defineOp({
  id: "reports.general-ledger",
  method: "GET",
  path: "/reports/general-ledger",
  kind: "read",
  action: "account.journal.view",
  rate: "report",
  summary: "General ledger of one account between two dates: opening balance, every line and a running balance. Supports CSV.",
  label: "บัญชีแยกประเภท",
  input: generalLedgerInput,
  test: "B4-G3.1",
  async handler({ actor, input }) {
    const g = await generalLedger(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { accountId: input.accountId, from: dayStart(input.from), to: dayEnd(input.to) },
    );
    if (!g.account) throw new Error(ERR.LEDGER_NOT_FOUND);
    return generalLedgerView(g);
  },
  csv(_ctx, data) {
    const d = data as ReturnType<typeof generalLedgerView>;
    const header = csvRow(["date", "journalNo", "memo", "debitSatang", "creditSatang", "balanceSatang"]);
    const opening = csvRow(["", "ยอดยกมา", "", "", "", d.openingSatang]);
    const rows = d.rows.map((r) => csvRow([r.date, r.journalNo, r.memo, r.debitSatang, r.creditSatang, r.balanceSatang]));
    const closing = csvRow(["", "ยอดยกไป", "", d.movement.debitSatang, d.movement.creditSatang, d.closingSatang]);
    return [header, opening, ...rows, closing].join("\n");
  },
});

const spanInput = z.object({ from: spanField("from"), to: spanField("to") }).strict();

const reportsTrialBalance = defineOp({
  id: "reports.trial-balance",
  method: "GET",
  path: "/reports/trial-balance",
  kind: "read",
  action: "account.report.view",
  rate: "report",
  summary: "Trial balance: opening, movement and closing debit/credit per account, with a balanced flag. Supports CSV.",
  label: "งบทดลอง",
  input: spanInput,
  test: "B4-G3.4",
  async handler({ actor, input }) {
    const tb = await trialBalance(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      periodOf(input.from),
      periodOf(input.to),
    );
    return trialBalanceView(tb);
  },
  csv(_ctx, data) {
    const d = data as ReturnType<typeof trialBalanceView>;
    const cols = ["code", "name", "type", "openingDebitSatang", "openingCreditSatang", "movementDebitSatang", "movementCreditSatang", "closingDebitSatang", "closingCreditSatang"];
    const rows = d.rows.map((r) =>
      csvRow([r.code, r.name, r.type, r.openingDebitSatang, r.openingCreditSatang, r.movementDebitSatang, r.movementCreditSatang, r.closingDebitSatang, r.closingCreditSatang]),
    );
    const t = d.totals;
    const total = csvRow(["", "รวม", "", t.openingDebitSatang, t.openingCreditSatang, t.movementDebitSatang, t.movementCreditSatang, t.closingDebitSatang, t.closingCreditSatang]);
    return [csvRow(cols), ...rows, total].join("\n");
  },
});

const profitLossInput = z
  .object({ from: spanField("from"), to: spanField("to"), compare: boolQuery.describe('"true" = also return the previous period of the same length.') })
  .strict();

const reportsProfitLoss = defineOp({
  id: "reports.profit-loss",
  method: "GET",
  path: "/reports/profit-loss",
  kind: "read",
  action: "account.report.view",
  rate: "report",
  summary: "Profit and loss: revenue, cost of goods sold and expenses, with gross and net profit. Supports CSV.",
  label: "งบกำไรขาดทุน",
  tool: { name: "account_report", hint: "One tool for every financial statement: set `kind` to trial-balance, profit-loss, balance-sheet, cash-flow, vat-pp30, aging or general-ledger." },
  input: profitLossInput,
  test: "B4-G3.6",
  async handler({ actor, input }) {
    const pl = await profitLoss(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      periodOf(input.from),
      periodOf(input.to),
      { compare: input.compare },
    );
    return profitLossView(pl);
  },
  csv(_ctx, data) {
    const d = data as ReturnType<typeof profitLossView>;
    const out = [csvRow(["section", "code", "name", "amountSatang"])];
    const push = (label: string, s: { rows: { code: string; name: string; amountSatang: number }[]; totalSatang: number }) => {
      for (const r of s.rows) out.push(csvRow([label, r.code, r.name, r.amountSatang]));
      out.push(csvRow([label, "", "รวม", s.totalSatang]));
    };
    push("รายได้", d.revenue);
    push("ต้นทุนขาย", d.cogs);
    out.push(csvRow(["กำไรขั้นต้น", "", "", d.grossProfitSatang]));
    push("ค่าใช้จ่าย", d.expenses);
    out.push(csvRow(["กำไรสุทธิ", "", "", d.netProfitSatang]));
    return out.join("\n");
  },
});

const balanceSheetInput = z.object({ asOf: spanField("asOf") }).strict();

const reportsBalanceSheet = defineOp({
  id: "reports.balance-sheet",
  method: "GET",
  path: "/reports/balance-sheet",
  kind: "read",
  action: "account.report.view",
  rate: "report",
  summary: "Balance sheet at the end of one period: assets, liabilities and equity (incl. retained earnings). Supports CSV.",
  label: "งบแสดงฐานะการเงิน",
  input: balanceSheetInput,
  test: "B4-G3.8",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    // ปีบัญชีมาจากนโยบายของร้าน — งบที่คิดปีบัญชีผิด = กำไรสะสม/กำไรงวดนี้แบ่งผิดเส้น
    const policy = await getPolicy(ctx);
    const bs = await balanceSheet(ctx, periodOf(input.asOf), {
      fiscalYearEndMonth: fiscalYearEndMonth(policy.fiscalYearStartMonth),
    });
    return balanceSheetView(bs);
  },
  csv(_ctx, data) {
    const d = data as ReturnType<typeof balanceSheetView>;
    const out = [csvRow(["section", "code", "name", "amountSatang"])];
    const push = (label: string, s: { rows: { code: string; name: string; amountSatang: number }[]; totalSatang: number }) => {
      for (const r of s.rows) out.push(csvRow([label, r.code, r.name, r.amountSatang]));
      out.push(csvRow([label, "", "รวม", s.totalSatang]));
    };
    push("สินทรัพย์", d.assets);
    push("หนี้สิน", d.liabilities);
    push("ส่วนของเจ้าของ", d.equity);
    out.push(csvRow(["ส่วนของเจ้าของ", "", "กำไรสะสม", d.retainedEarningsSatang]));
    out.push(csvRow(["ส่วนของเจ้าของ", "", "กำไรงวดนี้", d.currentPeriodProfitSatang]));
    out.push(csvRow(["ส่วนของเจ้าของ", "", "รวมส่วนของเจ้าของ", d.totalEquitySatang]));
    return out.join("\n");
  },
});

const reportsCashFlow = defineOp({
  id: "reports.cash-flow",
  method: "GET",
  path: "/reports/cash-flow",
  kind: "read",
  action: "account.report.view",
  rate: "report",
  summary: "Cash flow (direct method) split into operating, investing and financing, reconciled to the cash accounts. Supports CSV.",
  label: "งบกระแสเงินสด",
  input: spanInput,
  test: "B4-G3.9",
  async handler({ actor, input }) {
    const cf = await cashFlow(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      periodOf(input.from),
      periodOf(input.to),
    );
    return cashFlowView(cf);
  },
  csv(_ctx, data) {
    const d = data as ReturnType<typeof cashFlowView>;
    const out = [csvRow(["section", "code", "name", "amountSatang"])];
    out.push(csvRow(["ยอดยกมา", "", "เงินสดต้นงวด", d.openingCashSatang]));
    for (const s of [d.operating, d.investing, d.financing]) {
      for (const r of s.rows) out.push(csvRow([s.activity, r.code, r.name, r.amountSatang]));
      out.push(csvRow([s.activity, "", "รวม", s.totalSatang]));
    }
    out.push(csvRow(["เปลี่ยนแปลงสุทธิ", "", "", d.netChangeSatang]));
    out.push(csvRow(["ยอดยกไป", "", "เงินสดปลายงวด", d.closingCashSatang]));
    return out.join("\n");
  },
});

const pp30Input = z
  .object({
    period: periodField("period"),
    carryForwardSatang: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("VAT credit carried forward from the previous month, in satang. Default 0."),
  })
  .strict();

const reportsVatPp30 = defineOp({
  id: "reports.vat-pp30",
  method: "GET",
  path: "/reports/vat-pp30",
  kind: "read",
  action: "account.tax.view",
  rate: "report",
  summary: "Monthly VAT return (PP30): output VAT, input VAT and the net amount payable. Supports CSV (filing layout).",
  label: "ภ.พ.30 รายเดือน",
  input: pp30Input,
  test: "B4-G3.10",
  async handler({ actor, input }) {
    const r = await pp30({ tenantId: actor.tenantId, systemId: actor.systemId }, input.period, {
      carryForward: input.carryForwardSatang,
    });
    return pp30View(r);
  },
  async csv(ctx) {
    const input = ctx.input as { period: string; carryForwardSatang?: number };
    return pp30Csv({ tenantId: ctx.actor.tenantId, systemId: ctx.actor.systemId }, input.period, {
      carryForward: input.carryForwardSatang,
    });
  },
});

const agingInput = z
  .object({
    direction: z.enum(["AR", "AP"], { message: 'direction ต้องเป็น "AR" (ลูกหนี้) หรือ "AP" (เจ้าหนี้)' }),
    asOf: ymdField("asOf").optional(),
    contactId: z.string().min(1).optional(),
  })
  .strict();

const reportsAging = defineOp({
  id: "reports.aging",
  method: "GET",
  path: "/reports/aging",
  kind: "read",
  action: "account.report.view",
  rate: "report",
  summary: "Receivable (AR) or payable (AP) aging per contact, bucketed by days overdue. Supports CSV.",
  label: "รายงานอายุหนี้",
  input: agingInput,
  test: "B4-G3.12",
  async handler({ actor, input }) {
    const asOf = input.asOf ? dayEnd(input.asOf) : new Date();
    const r = await agingReport(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      { direction: input.direction === "AR" ? "OUT" : "IN", asOf, contactId: input.contactId },
    );
    return agingView(r, input.direction, asOf);
  },
  csv(_ctx, data) {
    const d = data as ReturnType<typeof agingView>;
    const header = csvRow(["contact", "current", "d1_30", "d31_60", "d61_90", "d90plus", "totalSatang", "docs", "overdueDocs"]);
    const line = (name: string, b: ReturnType<typeof agingView>["grand"]["buckets"], totalSatang: number, docs: number, overdueDocs: number) =>
      csvRow([name, b.current, b.d1_30, b.d31_60, b.d61_90, b.d90plus, totalSatang, docs, overdueDocs]);
    const rows = d.rows.map((r) => line(r.contact?.name ?? "ไม่ระบุคู่ค้า", r.buckets, r.totalSatang, r.docs, r.overdueDocs));
    return [header, ...rows, line("รวม", d.grand.buckets, d.grand.totalSatang, d.grand.docs, d.grand.overdueDocs)].join("\n");
  },
});

// ═══════════════ งวดบัญชี ═══════════════

const periodsList = defineOp({
  id: "periods.list",
  method: "GET",
  path: "/periods",
  kind: "read",
  action: "account.report.view",
  summary: "Accounting periods with their status, entry count, who closed them and whether VAT was filed.",
  label: "งวดบัญชีทั้งหมด",
  test: "B4-G4.1",
  async handler({ actor }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const [periods, filings] = await Promise.all([listPeriods(ctx), listVatFilings(ctx)]);
    const filed = new Set(filings.map((f) => f.periodKey));
    return periods.map((p) => periodRowView(p, filed.has(p.periodKey)));
  },
});

const periodsChecklist = defineOp({
  id: "periods.checklist",
  method: "GET",
  path: "/periods/{key}/checklist",
  kind: "read",
  action: "account.period.close",
  summary: "The pre-close checklist of one period: suspense account, flagged entries, reconciliation and VAT.",
  label: "เช็กลิสต์ก่อนปิดงวด",
  input: noQuery,
  test: "B4-G4.2",
  async handler({ actor, params }) {
    const key = params.key ?? "";
    if (!isPeriodKey(key)) {
      throw new ApiError(422, "validation", "งวดต้องเป็นรูปแบบ YYYY-MM (เดือน 01-12)", "Period must look like YYYY-MM.");
    }
    const c = await periodChecklist({ tenantId: actor.tenantId, systemId: actor.systemId }, key);
    return checklistView(c);
  },
});

// ═══════════════ สินทรัพย์ถาวร ═══════════════

const ASSET_STATUSES = ["ACTIVE", "FULLY_DEPRECIATED", "DISPOSED", "WRITTEN_OFF"] as const satisfies readonly AccountAssetStatus[];

const assetsListInput = z
  .object({ status: z.enum(ASSET_STATUSES).optional().describe("Filter by asset status. Default: every asset.") })
  .strict();

const assetsList = defineOp({
  id: "assets.list",
  method: "GET",
  path: "/assets",
  kind: "read",
  action: "account.asset.manage",
  summary: "Fixed asset register with cost, monthly depreciation, accumulated depreciation and net book value.",
  label: "ทะเบียนสินทรัพย์",
  tool: { name: "account_assets", hint: "Use for fixed assets: cost, monthly depreciation and net book value." },
  input: assetsListInput,
  test: "B4-G5.1",
  async handler({ actor, input }) {
    const rows = await listAssets({ tenantId: actor.tenantId, systemId: actor.systemId });
    return rows.filter((a) => !input.status || a.status === input.status).map(assetRowView);
  },
});

const assetsGet = defineOp({
  id: "assets.get",
  method: "GET",
  path: "/assets/{id}",
  kind: "read",
  action: "account.asset.manage",
  summary: "One fixed asset with every depreciation period already posted and the accounts it posts to.",
  label: "สินทรัพย์ 1 รายการ",
  input: noQuery,
  test: "B4-G5.2",
  async handler({ actor, params }) {
    const d = await assetDetail({ tenantId: actor.tenantId, systemId: actor.systemId }, params.id ?? "");
    if (!d) throw new Error(ERR.ASSET_NOT_FOUND);
    return assetDetailView(d);
  },
});

const depreciationPreviewInput = z.object({ period: periodField("period").optional() }).strict();

const assetsDepreciationPreview = defineOp({
  id: "assets.depreciation-preview",
  method: "GET",
  path: "/assets/depreciation/preview",
  kind: "read",
  action: "account.asset.manage",
  summary: "What running depreciation for a period would post, without writing anything.",
  label: "พรีวิวค่าเสื่อมของงวด",
  input: depreciationPreviewInput,
  test: "B4-G5.3",
  async handler({ actor, input }) {
    const p = await previewDepreciation(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      input.period ?? currentPeriodKey(),
    );
    return depreciationPreviewView(p);
  },
});

export const GL_READ_OPS: ApiOp[] = [
  chartList,
  chartGet,
  mappingsList,
  docTypeAccountsList,
  journalList,
  journalGet,
  reportsGeneralLedger,
  reportsTrialBalance,
  reportsProfitLoss,
  reportsBalanceSheet,
  reportsCashFlow,
  reportsVatPp30,
  reportsAging,
  periodsList,
  periodsChecklist,
  assetsList,
  assetsGet,
  assetsDepreciationPreview,
];
