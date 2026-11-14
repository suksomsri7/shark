// ops/finance-read.ts — READ ของการเงิน/เช็ค/ภาษีหัก ณ ที่จ่าย (WO B3)
//
// ทุก op ที่นี่ `kind: "read"` — ห้ามแตะ prisma ตรง ๆ (fitness F5) เรียกผ่าน service เท่านั้น
// ทุกก้อนผ่าน `../serialize-finance.ts` เสมอ (ห้าม spread แถว prisma — อ่านกติกาในหัวไฟล์นั้น)
//
// สโคป: `finance-accounts.*` / `finance.*` / `petty-cash.*` = `account.finance.manage` (อ่อนไหวกว่าเอกสารทั่วไป
// เพราะเห็นเลขบัญชี/พร้อมเพย์ — คีย์ read-only ธรรมดาไม่พอ) · `reconcile.*` = `account.reconcile` ·
// `cheques.*` = `account.cheque.manage` · `wht.*` = `account.tax.view`
//
// เรื่องที่พลาดง่ายและถูกดักไว้ตรงนี้:
//   · `finance-accounts.list` ไม่ใช่รายการแบ่งหน้า (ช่องทางการเงินของร้านหนึ่งมีไม่กี่สิบบัญชี) —
//     ใช้ `withExtra()` ไม่ใช่ `paged()` (ไม่มี `page` ในคำตอบเลย)
//   · CSV (statement/pnd/credits): เมื่อ `Accept` มี `text/csv` dispatch เรียก `op.csv(ctx, data)` แทน JSON —
//     pnd/credits ใช้ตัวสร้าง CSV เดิมของ wht.ts ตรง ๆ (คำนวณจาก `ctx.input` ไม่ใช่จาก `data` ที่ serialize
//     แล้ว เพราะ `pndCsv`/`whtCreditsCsv` มีคอลัมน์ฟอร์มราชการที่ไม่ได้อยู่ใน JSON view) · statement ไม่มี
//     ตัวสร้างสำเร็จรูป ⇒ ประกอบเองด้วย `csvRow()`

import { z } from "zod";
import type { AccountChequeStatus } from "@prisma/client";
import { csvCell, csvRow } from "@/lib/core/csv";
import { dayKeyBkk, periodKeyBkk, cashCalendar } from "../../dashboard";
import { ERR } from "../../errors";
import {
  financeBalances,
  financeLedgerCodes,
  financeStatement,
  getFinanceAccountBalance,
  groupFinanceAccounts,
  listFinanceOpeningEntries,
} from "../../finance";
import { financeOverview, listReimbursableExpensePayments, pettyCashList } from "../../finance-overview";
import { listPaymentRequests } from "../../payment-request";
import { listReconcilableChannels, reconcilePageData } from "../../reconcile";
import { CHEQUE_STATUS_LABEL, chequeStatusCounts, chequeSummaryV2, getChequeRowV2, listChequesV2 } from "../../cheque";
import { getDocRef, getSettings } from "../../service";
import {
  getWhtCert,
  listWhtCertsV2,
  listWhtCredits,
  listWhtFilings,
  pnd,
  pnd1kAnnual,
  pnd1kCsv,
  pndCsv,
  whtCreditsCsv,
  whtCreditYearTotal,
} from "../../wht";
import { isPndFormNumber, type PndFormNumber } from "../../wht-forms"; // ACC T3.4 ◂
import { whtFilingState } from "../../wht-filing"; // ACC T3.4 ◂
import { whtCreditsOwed } from "../../wht-cert"; // ACC T3.5 ◂
import { defineOp, type ApiOp } from "../op";
import { ApiError, paged, withExtra, type PagedInfo } from "../respond";
import {
  calendarView,
  chequeRowView,
  financeAccountDetail,
  financeAccountRow,
  financeGroupView,
  financeOverviewView,
  financeStatementView,
  paymentRequestView,
  pettyCashView,
  pndView,
  reconcileChannelView,
  reconcileLineView,
  reconcileSummaryView,
  reconcileSystemEntryView,
  whtCertDetailView,
  whtCertRowView,
  whtCreditsView,
  whtFilingView,
} from "../serialize-finance";

const noQuery = z.object({}).strict();
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const ymdField = (what: string) => z.string().regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`).describe(`${what} (Thai calendar day, YYYY-MM-DD).`);
const monthField = z.string().regex(YM, "month ต้องเป็นเดือนรูปแบบ YYYY-MM (01-12)").optional().describe("Month `YYYY-MM`. Default: the current month in Thailand.");

/** จาก `{total,...}` (ไม่มี pageCount ในตัว service) → ซองแบ่งหน้าเต็มรูป */
function pageInfoFrom(total: number, page: number, pageSize: number): PagedInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, pageCount, total, hasMore: page < pageCount };
}

const clampSize = (n: number | undefined, fallback = 20) => Math.min(Math.max(1, n ?? fallback), 100);

// ── finance-accounts ──────────────────────────────────────────────────────

const financeAccountsListInput = z.object({ asOf: ymdField("asOf").optional() }).strict();

const financeAccountsList = defineOp({
  id: "finance-accounts.list",
  method: "GET",
  path: "/finance-accounts",
  kind: "read",
  action: "account.finance.manage",
  summary: "Every cash/bank/e-wallet/petty-cash channel with its balance, grouped by kind.",
  label: "ช่องทางการเงินทั้งหมด",
  tool: { name: "account_finance_balances", hint: "Use for \"how much money do we have\" per cash box, bank account, wallet or petty cash." },
  input: financeAccountsListInput,
  test: "B3-F1.1",
  async handler({ actor, input }) {
    const asOf = input.asOf ? new Date(`${input.asOf}T12:00:00+07:00`) : new Date();
    const rows = await financeBalances(actor.tenantId, actor.systemId, asOf);
    const ledgerCodes = await financeLedgerCodes(actor.systemId, rows.map((r) => r.ledgerAccountId));
    const groups = groupFinanceAccounts(rows);
    const totalSatang = rows.reduce((s, r) => s + r.balance, 0);
    return withExtra(
      rows.map((r) => financeAccountRow(r, ledgerCodes)),
      { groups: groups.map(financeGroupView), totalSatang },
    );
  },
});

const financeAccountsGet = defineOp({
  id: "finance-accounts.get",
  method: "GET",
  path: "/finance-accounts/{id}",
  kind: "read",
  action: "account.finance.manage",
  summary: "One finance channel with its opening balance entries.",
  label: "ช่องทางการเงิน 1 บัญชี",
  input: noQuery,
  test: "B3-F1.7",
  async handler({ actor, params }) {
    const id = params.id ?? "";
    const row = await getFinanceAccountBalance(actor.tenantId, actor.systemId, id);
    if (!row) throw new Error(ERR.FINANCE_ACCOUNT_NOT_FOUND);
    const [openingEntries, ledgerCodes] = await Promise.all([
      listFinanceOpeningEntries(id),
      financeLedgerCodes(actor.systemId, [row.ledgerAccountId]),
    ]);
    return financeAccountDetail(row, openingEntries, ledgerCodes);
  },
});

const statementInput = z.object({ from: ymdField("from").optional(), to: ymdField("to").optional() }).strict();

const financeAccountsStatement = defineOp({
  id: "finance-accounts.statement",
  method: "GET",
  path: "/finance-accounts/{id}/statement",
  kind: "read",
  action: "account.finance.manage",
  rate: "report",
  summary: "Ledger movements of one finance channel between two dates, with a running balance. Supports CSV.",
  label: "รายการเดินบัญชีของช่องทางการเงิน",
  input: statementInput,
  test: "B3-F1.8",
  async handler({ actor, params, input }) {
    const from = input.from ? new Date(`${input.from}T00:00:00+07:00`) : undefined;
    const to = input.to ? new Date(`${input.to}T23:59:59.999+07:00`) : undefined;
    const data = await financeStatement(actor.tenantId, actor.systemId, params.id ?? "", { from, to });
    if (!data) throw new Error(ERR.FINANCE_ACCOUNT_NOT_FOUND);
    return financeStatementView(data);
  },
  csv(_ctx, data) {
    const d = data as ReturnType<typeof financeStatementView>;
    const header = csvRow(["date", "journalNo", "memo", "refType", "refId", "inSatang", "outSatang", "balanceSatang"]);
    const rows = d.rows.map((r) => csvRow([r.date, r.journalNo, r.memo, r.refType, r.refId, r.inSatang, r.outSatang, r.balanceSatang]));
    return [header, ...rows].join("\n");
  },
});

// ── overview / calendar / petty cash ──────────────────────────────────────

const financeOverviewInput = z.object({ month: monthField }).strict();

const financeOverviewOp = defineOp({
  id: "finance.overview",
  method: "GET",
  path: "/finance/overview",
  kind: "read",
  action: "account.finance.manage",
  rate: "report",
  summary: "The finance overview screen in one call: tracked accounts, cash calendar, cash position, reconcile block and cheque badges.",
  label: "ภาพรวมการเงิน",
  input: financeOverviewInput,
  test: "B3-F2.1",
  async handler({ actor, input }) {
    const data = await financeOverview({ tenantId: actor.tenantId, systemId: actor.systemId }, { month: input.month });
    return financeOverviewView(data);
  },
});

const financeCalendarInput = z.object({ month: monthField }).strict();

const financeCalendarOp = defineOp({
  id: "finance.calendar",
  method: "GET",
  path: "/finance/calendar",
  kind: "read",
  action: "account.finance.manage",
  rate: "report",
  summary: "Cash in/out per day of one month, with the documents behind each amount.",
  label: "ปฏิทินเงินเข้า-ออก",
  input: financeCalendarInput,
  test: "B3-F2.3",
  async handler({ actor, input }) {
    const month = input.month ?? periodKeyBkk(new Date());
    const data = await cashCalendar({ tenantId: actor.tenantId, systemId: actor.systemId }, month, { withItems: true });
    return calendarView(data);
  },
});

const pettyCashListInput = z.object({ asOf: ymdField("asOf").optional() }).strict();

const pettyCashListOp = defineOp({
  id: "petty-cash.list",
  method: "GET",
  path: "/petty-cash",
  kind: "read",
  action: "account.finance.manage",
  summary: "Petty cash boxes with their balance and the amount currently awaiting reimbursement.",
  label: "เงินสำรองรับ-จ่าย",
  input: pettyCashListInput,
  test: "B3-F2.4",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const asOf = input.asOf ? new Date(`${input.asOf}T12:00:00+07:00`) : undefined;
    const boxes = await pettyCashList(ctx, undefined, { asOf });
    const pending = await Promise.all(boxes.map((b) => listReimbursableExpensePayments(ctx, b.id)));
    return boxes.map((b, i) => pettyCashView(b, pending[i]!.reduce((s, r) => s + r.amountSatang, 0)));
  },
});

// ── payment requests ───────────────────────────────────────────────────────

const paymentRequestsListInput = z.object({ documentId: z.string().min(1, "ต้องระบุ documentId") }).strict();

const paymentRequestsList = defineOp({
  id: "payment-requests.list",
  method: "GET",
  path: "/payment-requests",
  kind: "read",
  action: "account.doc.view",
  summary: "Payment (PromptPay) links created for one document, newest first. The capability token is never returned.",
  label: "ลิงก์ชำระเงินของเอกสาร",
  input: paymentRequestsListInput,
  test: "B3-F3.1",
  async handler({ actor, input }) {
    const rows = await listPaymentRequests({ tenantId: actor.tenantId, systemId: actor.systemId }, input.documentId);
    return rows.map(paymentRequestView);
  },
});

// ── reconcile ───────────────────────────────────────────────────────────────

const reconcileChannelsList = defineOp({
  id: "reconcile.channels",
  method: "GET",
  path: "/reconcile/channels",
  kind: "read",
  action: "account.reconcile",
  summary: "Bank/e-wallet channels that can be reconciled (linked to the chart of accounts).",
  label: "ช่องทางที่กระทบยอดได้",
  test: "B3-F4.1",
  async handler({ actor }) {
    const rows = await listReconcilableChannels({ tenantId: actor.tenantId, systemId: actor.systemId });
    return rows.map(reconcileChannelView);
  },
});

const reconcileGetInput = z
  .object({
    financeAccountId: z.string().min(1, "ต้องระบุ financeAccountId"),
    period: z.string().regex(YM, "period ต้องเป็นเดือนรูปแบบ YYYY-MM"),
  })
  .strict();

const reconcileGet = defineOp({
  id: "reconcile.get",
  method: "GET",
  path: "/reconcile",
  kind: "read",
  action: "account.reconcile",
  summary: "Bank reconciliation of one channel and month: summary, bank statement lines and system entries.",
  label: "หน้ากระทบยอดธนาคาร",
  input: reconcileGetInput,
  test: "B3-F4.2",
  async handler({ actor, input }) {
    const res = await reconcilePageData(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      input.financeAccountId,
      input.period,
      { base: "" },
    );
    if ("ok" in res) throw new Error(res.reason);
    return {
      summary: reconcileSummaryView(res.summary),
      lines: res.statementLines.map(reconcileLineView),
      systemEntries: res.systemRows.map(reconcileSystemEntryView),
    };
  },
});

// ── cheques ───────────────────────────────────────────────────────────────

const CHEQUE_STATUSES = Object.keys(CHEQUE_STATUS_LABEL) as AccountChequeStatus[];

const chequesListInput = z
  .object({
    direction: z.enum(["IN", "OUT"], { message: 'direction ต้องเป็น "IN" หรือ "OUT"' }),
    status: z.enum(CHEQUE_STATUSES as [AccountChequeStatus, ...AccountChequeStatus[]]).optional(),
    q: z.string().max(200).optional(),
    from: ymdField("from").optional(),
    to: ymdField("to").optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().optional(),
  })
  .strict();

const chequesList = defineOp({
  id: "cheques.list",
  method: "GET",
  path: "/cheques",
  kind: "read",
  action: "account.cheque.manage",
  paged: true,
  summary: "Cheques received or issued, with paging, plus a pending-amount summary and status counters.",
  label: "ทะเบียนเช็ค",
  input: chequesListInput,
  test: "B3-F5.1",
  async handler({ actor, input }) {
    const { tenantId, systemId } = actor;
    const page = input.page ?? 1;
    const pageSize = clampSize(input.pageSize);
    const from = input.from ? new Date(`${input.from}T00:00:00+07:00`) : undefined;
    const to = input.to ? new Date(`${input.to}T23:59:59.999+07:00`) : undefined;
    const [res, summary, counts] = await Promise.all([
      listChequesV2(tenantId, systemId, { direction: input.direction, status: input.status, bank: input.q, from, to, page, pageSize }),
      chequeSummaryV2(tenantId, systemId, input.direction),
      chequeStatusCounts(tenantId, systemId, input.direction),
    ]);
    const statusCounts = Object.fromEntries(CHEQUE_STATUSES.map((s) => [s, counts[s] ?? 0]));
    return paged(res.rows.map(chequeRowView), pageInfoFrom(res.total, page, pageSize), {
      totalSatang: res.totalSatang,
      summary: { pendingSatang: summary.pendingSatang, dueSoonCount: summary.dueSoonCount },
      statusCounts,
    });
  },
});

const chequesGet = defineOp({
  id: "cheques.get",
  method: "GET",
  path: "/cheques/{id}",
  kind: "read",
  action: "account.cheque.manage",
  summary: "One cheque in the same shape as the list row.",
  label: "เช็ค 1 ใบ",
  input: noQuery,
  test: "B3-F5.3",
  async handler({ actor, params }) {
    const row = await getChequeRowV2(actor.tenantId, actor.systemId, params.id ?? "");
    if (!row) throw new Error(ERR.CHEQUE_NOT_FOUND);
    return chequeRowView(row);
  },
});

// ── WHT ───────────────────────────────────────────────────────────────────

const whtListInput = z
  .object({
    direction: z.enum(["IN", "OUT"], { message: 'direction ต้องเป็น "IN" (เราหักผู้ขาย) หรือ "OUT" (ถูกหัก)' }),
    from: ymdField("from").optional(),
    to: ymdField("to").optional(),
    status: z.enum(["ALL", "NORMAL", "CANCELLED"]).optional(),
    q: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().optional(),
  })
  .strict();

const whtList = defineOp({
  id: "wht.list",
  method: "GET",
  path: "/wht",
  kind: "read",
  action: "account.tax.view",
  paged: true,
  summary: "Withholding tax certificates (50 Tawi / WTI), either direction, with paging and totals.",
  label: "ทะเบียนภาษีหัก ณ ที่จ่าย",
  tool: { name: "account_wht_summary", hint: "Use for withholding tax questions (50 Tawi certificates), either direction." },
  input: whtListInput,
  test: "B3-F6.1",
  async handler({ actor, input }) {
    const page = input.page ?? 1;
    const pageSize = clampSize(input.pageSize);
    const from = input.from ? new Date(`${input.from}T00:00:00+07:00`) : undefined;
    const to = input.to ? new Date(`${input.to}T23:59:59.999+07:00`) : undefined;
    const res = await listWhtCertsV2(actor.tenantId, actor.systemId, {
      direction: input.direction,
      from,
      to,
      status: input.status,
      q: input.q,
      page,
      pageSize,
    });
    return paged(res.rows.map(whtCertRowView), pageInfoFrom(res.total, page, pageSize), {
      totals: { baseSatang: res.totalBase, whtSatang: res.totalWht },
    });
  },
});

const whtCert = defineOp({
  id: "wht.cert",
  method: "GET",
  path: "/wht/certs/{id}",
  kind: "read",
  action: "account.tax.view",
  summary: "One withholding tax certificate in full (payer, payee, amounts) - ready to print.",
  label: "ใบ 50 ทวิ / WTI 1 ใบ",
  input: noQuery,
  test: "B3-F6.3",
  async handler({ actor, params }) {
    const cert = await getWhtCert(actor.tenantId, actor.systemId, params.id ?? "");
    if (!cert) throw new Error(ERR.WHT_CERT_NOT_FOUND);
    const [settings, sourceDoc] = await Promise.all([
      getSettings(actor.tenantId, actor.systemId),
      cert.sourceDocId ? getDocRef(actor.tenantId, actor.systemId, cert.sourceDocId) : Promise.resolve(null),
    ]);
    return whtCertDetailView(cert, settings, sourceDoc);
  },
});

const pndInput = z
  .object({
    type: z.coerce
      .number()
      .int()
      .refine((v) => isPndFormNumber(v), "type ต้องเป็น 1, 2, 3, 53 หรือ 54")
      .describe("PND form: 1 salary/commission to individuals (section 50(1)), 2 interest/dividends/royalties to individuals, 3 other payments to individuals, 53 companies, 54 payments abroad."),
    period: z.string().regex(YM, "period ต้องเป็นเดือนรูปแบบ YYYY-MM"),
  })
  .strict();

const whtPnd = defineOp({
  id: "wht.pnd",
  method: "GET",
  path: "/wht/pnd",
  kind: "read",
  action: "account.tax.view",
  rate: "report",
  summary:
    "Monthly withholding tax return list for one PND form (1, 2, 3, 53 or 54), grouped by the month the money was paid. Includes payments where tax was withheld but no certificate was issued yet (hasCert false). The CSV is a helper for filling the form, not a Revenue Department upload file.",
  label: "รายการ ภ.ง.ด. รายเดือน (1 / 2 / 3 / 53 / 54)",
  tool: { name: "account_wht_pnd_report", hint: "Use for 'what goes on PND 3/53 this month', missing 50 tawi certificates, or which form a payment belongs to." },
  input: pndInput,
  test: "B3-F6.4",
  async handler({ actor, input }) {
    const type = input.type as PndFormNumber;
    const report = await pnd(actor.tenantId, actor.systemId, { type, period: input.period });
    return pndView(report, type, input.period);
  },
  async csv(ctx) {
    const input = ctx.input as { type: PndFormNumber; period: string };
    return pndCsv(ctx.actor.tenantId, ctx.actor.systemId, { type: input.type, period: input.period });
  },
});

const whtCreditsInput = z
  .object({
    year: z.string().regex(/^\d{4}$/, "year ต้องเป็นปี ค.ศ. 4 หลัก").optional(),
    period: z.string().regex(YM, "period ต้องเป็นเดือนรูปแบบ YYYY-MM").optional(),
  })
  .strict();

const whtCredits = defineOp({
  id: "wht.credits",
  method: "GET",
  path: "/wht/credits",
  kind: "read",
  action: "account.tax.view",
  rate: "report",
  summary: "Withholding tax credits (tax our customers withheld from us), accumulated by year or month. Supports CSV.",
  label: "เครดิตภาษีถูกหัก ณ ที่จ่าย",
  input: whtCreditsInput,
  test: "B3-F6.7",
  async handler({ actor, input }) {
    const report = await listWhtCredits(actor.tenantId, actor.systemId, { year: input.year, period: input.period });
    const year = input.year ? Number(input.year) : Number((input.period ?? dayKeyBkk(new Date())).slice(0, 4));
    const yearTotal = await whtCreditYearTotal(actor.tenantId, actor.systemId, year);
    return whtCreditsView(report, yearTotal);
  },
  async csv(ctx) {
    const input = ctx.input as { year?: string; period?: string };
    return whtCreditsCsv(ctx.actor.tenantId, ctx.actor.systemId, { year: input.year, period: input.period });
  },
});

const whtFilings = defineOp({
  id: "wht.filings",
  method: "GET",
  path: "/wht/filings",
  kind: "read",
  action: "account.tax.view",
  summary: "Periods already marked as filed with the Revenue Department (PND 3/53).",
  label: "งวดที่ยื่นแล้ว",
  test: "B3-F6.8",
  async handler({ actor }) {
    const rows = await listWhtFilings(actor.tenantId, actor.systemId);
    return rows.map(whtFilingView);
  },
});

// ── ACC T3.4 ภ.ง.ด.1ก รายปี · สถานะนำส่ง/แบบเพิ่มเติม ── ACC T3.5 ค้างรับ 50 ทวิ ──
const pnd1kInput = z.object({ year: z.coerce.number().int().min(2000).max(2100).describe("Calendar year (A.D.), for example 2026.") }).strict();

const whtPnd1k = defineOp({
  id: "wht.pnd1k",
  method: "GET",
  path: "/wht/pnd1k",
  kind: "read",
  action: "account.tax.view",
  rate: "report",
  summary: "Yearly PND 1A list: everything on PND 1 in the year, totalled per payee. Supports CSV (a helper for filling the form).",
  label: "ภ.ง.ด.1ก รายปี",
  tool: { name: "account_wht_pnd1k", hint: "Use for the yearly PND 1A list (salary/commission paid to individuals, per person)." },
  input: pnd1kInput,
  test: "T3.4-R2",
  async handler({ actor, input }) {
    const r = await pnd1kAnnual(actor.tenantId, actor.systemId, { year: input.year });
    return {
      year: r.year,
      rows: r.rows.map((x) => ({ seq: x.seq, recipientName: x.recipientName, recipientTaxId: x.recipientTaxId, recipientAddress: x.recipientAddress, baseSatang: x.base, whtSatang: x.whtAmount, payments: x.count, withoutCertificate: x.uncertified })),
      grandBaseSatang: r.grandBase,
      grandWhtSatang: r.grandWht,
    };
  },
  async csv(ctx) {
    const input = ctx.input as { year: number };
    return pnd1kCsv(ctx.actor.tenantId, ctx.actor.systemId, { year: input.year });
  },
});

const whtFilingStateOp = defineOp({
  id: "wht.filing-state",
  method: "GET",
  path: "/wht/filings/{form}/{period}",
  kind: "read",
  action: "account.tax.view",
  summary:
    "Filing state of one PND form and month: the original filed mark, additional filings, the tax filed last time vs the report now, and the certificates issued or cancelled after filing (the adjustment list).",
  label: "สถานะนำส่ง ภ.ง.ด. + รายการปรับ",
  tool: { name: "account_wht_filing_state", hint: "Use before proposing an additional withholding tax filing: shows what changed after the month was filed." },
  input: noQuery,
  test: "T3.4-R3",
  async handler({ actor, params }) {
    const formNo = Number(params.form ?? "");
    const period = params.period ?? "";
    if (!isPndFormNumber(formNo)) throw new ApiError(422, "validation", "แบบ ภ.ง.ด. ต้องเป็น 1, 2, 3, 53 หรือ 54", "The form must be 1, 2, 3, 53 or 54.");
    if (!YM.test(period)) throw new ApiError(422, "validation", "งวดต้องเป็นเดือนรูปแบบ YYYY-MM (01-12)", "The period must be a month in `YYYY-MM` form.");
    const st = await whtFilingState({ tenantId: actor.tenantId, systemId: actor.systemId }, formNo, period);
    const row = (r: (typeof st.changes)[number]) => ({ certId: r.certId, certNo: r.certNo, contactName: r.contactName, change: r.change, at: r.at.toISOString(), whtSatang: r.whtDelta, acknowledged: r.acknowledged });
    return {
      form: st.form,
      period: st.periodKey,
      filed: st.filed ? { filedAt: st.filed.filedAt.toISOString(), totalTaxSatang: st.filed.totalTaxSatang, rows: st.filed.certCount } : null,
      additional: st.additional.map((a) => ({ seq: a.seq, filedAt: a.filedAt.toISOString(), totalTaxSatang: a.totalTaxSatang, deltaTaxSatang: a.deltaTaxSatang, note: a.note })),
      lastFiledTaxSatang: st.latestTaxSatang,
      reportTaxSatang: st.currentTaxSatang,
      differenceSatang: st.deltaTaxSatang,
      changes: st.changes.map(row),
      notYetFiled: st.pending.map(row),
    };
  },
});

const owedInput = z.object({ contactId: z.string().max(64).optional().describe("Only this customer.") }).strict();

const whtCreditsOwedOp = defineOp({
  id: "wht.credits-owed",
  method: "GET",
  path: "/wht/credits/owed",
  kind: "read",
  action: "account.tax.view",
  rate: "report",
  summary:
    "Withholding tax certificates (50 tawi) still owed by customers: tax a customer withheld from the shop where nobody has marked the certificate as received yet. Attachments do not count as received. Supports CSV.",
  label: "ค้างรับ 50 ทวิ จากลูกค้า",
  tool: { name: "account_wht_credits_owed", hint: "Use for 'which customers still owe us a 50 tawi certificate'." },
  input: owedInput,
  test: "T3.5-R3",
  async handler({ actor, input }) {
    const r = await whtCreditsOwed({ tenantId: actor.tenantId, systemId: actor.systemId }, { contactId: input.contactId ?? null });
    return {
      rows: r.rows.map((x) => ({ certId: x.certId, certNo: x.certNo, paidDate: ymdOf(x.paidAt), contactId: x.contactId, contactName: x.contactName, contactTaxId: x.contactTaxId, sourceDocId: x.sourceDocId, sourceDocNo: x.sourceDocNo, baseSatang: x.base, rateBp: x.whtRateBp, whtSatang: x.whtAmount, daysOwed: x.daysOwed, hasAttachment: x.hasAttachment })),
      byContact: r.byContact.map((b) => ({ contactId: b.contactId, contactName: b.contactName, count: b.count, whtSatang: b.whtAmount })),
      totalWhtSatang: r.totalWht,
      totalBaseSatang: r.totalBase,
      warnings: r.warnings,
    };
  },
  async csv(ctx) {
    const input = ctx.input as { contactId?: string };
    const r = await whtCreditsOwed({ tenantId: ctx.actor.tenantId, systemId: ctx.actor.systemId }, { contactId: input.contactId ?? null });
    const head = ["วันที่รับเงิน", "เอกสารภาษีถูกหัก", "ลูกค้า (ผู้หัก)", "เลขประจำตัวผู้เสียภาษี", "เอกสารต้นทาง", "ฐานเงินได้", "อัตรา (%)", "ภาษีถูกหัก", "ค้างมา (วัน)"];
    const b = (v: number) => (v / 100).toFixed(2);
    const lines = r.rows.map((x) => [ymdOf(x.paidAt), x.certNo ?? "", x.contactName, x.contactTaxId ?? "", x.sourceDocNo ?? "", b(x.base), x.whtRateBp != null ? (x.whtRateBp / 100).toFixed(2) : "", b(x.whtAmount), x.daysOwed].map(csvCell).join(","));
    return "\uFEFF" + [head.map(csvCell).join(","), ...lines, ["", "", "", "รวม", "", b(r.totalBase), "", b(r.totalWht), ""].map(csvCell).join(",")].join("\n");
  },
});

const ymdOf = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export const FINANCE_READ_OPS: ApiOp[] = [
  financeAccountsList,
  financeAccountsGet,
  financeAccountsStatement,
  financeOverviewOp,
  financeCalendarOp,
  pettyCashListOp,
  paymentRequestsList,
  reconcileChannelsList,
  reconcileGet,
  chequesList,
  chequesGet,
  whtList,
  whtCert,
  whtPnd,
  whtCredits,
  whtFilings,
  whtPnd1k,
  whtFilingStateOp,
  whtCreditsOwedOp,
];
