// tax-t5.ts — REST ของใบงาน ACC T5 (เลน 2): รายงานเงินสดรับ-จ่าย · เกณฑ์จด VAT · บวกกลับทางภาษี · ตรวจภาษีประจำเดือน · หนี้สูญ/ค่าเผื่อ
//   ปฏิทินภาษี (T5.1) อยู่ที่ op เดิม `settings.tax.deadlines` (ช่อง `calendar`) — ไม่เพิ่ม op ใหม่
//   design notes: ledger/wo-notes/T5.2.md T5.3.md T5.5.md T5.6.md T5.7.md
import { z } from "zod";
import { csvRow } from "@/lib/core/csv";
import { TAX_ADD_BACK_NONE, TAX_ADD_BACK_SECTIONS } from "@/lib/core/settings/legal/th-tax-2569";
import { ackField } from "../ack-field";
import { actorAuditId, actorAuditType, actorRefId, type ApiActor } from "../actor";
import { defineOp, type ApiOp } from "../op";
import { ApiError, legalAckApiError } from "../respond";
import { RECOVERY_CHANNELS, badDebtSummary, recoverBadDebt, setDoubtfulAllowance, voidBadDebtRecovery, writeOffBadDebt } from "../../bad-debt";
import { saveStatementMeeting } from "../../tax-calendar";
import { cashBook } from "../../cash-book";
import { setTaxAddBack, taxAddBackReport } from "../../tax-add-back";
import { setStampDutyRef, taxChecks } from "../../tax-checks";
import { vatThreshold } from "../../vat-threshold";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymdField = (what: string) => z.string().regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`).describe(`${what} (Thai calendar day, YYYY-MM-DD).`);
const ctxOf = (a: ApiActor) => ({ tenantId: a.tenantId, systemId: a.systemId });
const dayOf = (v: string) => new Date(`${v}T12:00:00+07:00`);
const ackOf = (a: ApiActor, codes: readonly string[] | undefined) => ({ codes: codes ?? [], actorId: actorAuditId(a), actorType: actorAuditType(a), via: a.kind === "apikey" ? "rest" : "ai-proposal" });
const warnView = (ws: readonly { code: string; messageTh: string; citation?: string; tag?: string; checkedAt?: string; ack?: boolean }[]) =>
  ws.map((w) => ({ code: w.code, message_th: w.messageTh, citation: w.citation ?? null, tag: w.tag ?? null, checkedAt: w.checkedAt ?? null, needsAcknowledge: !!w.ack }));
const failWith = (reason: string): never => {
  throw new Error(reason);
};
const notFound = (m: string) => new ApiError(404, "not_found", m, "The requested record was not found in this accounting book.");

// ═══ T5.2 รายงานเงินสดรับ-จ่าย ═══
const reportsCashBook = defineOp({
  id: "reports.cash-book",
  method: "GET",
  path: "/reports/cash-book",
  kind: "read",
  action: "account.report.view",
  rate: "report",
  summary:
    "Cash receipts and payments report on the cash basis, from the general ledger: every journal entry that moves money in or out of the book's cash and bank accounts (credit sales appear only when the money comes in, transfers between the shop's own money accounts are left out, owner capital and withdrawals are listed apart), with daily and monthly totals. This is the daily income and expense report an individual shop that is not VAT registered has to keep; the column layout has not been compared with the Revenue Department's annex form.",
  label: "รายงานเงินสดรับ-จ่าย",
  input: z.object({ from: ymdField("from").optional(), to: ymdField("to").optional() }).strict(),
  test: "T5-API.2",
  async handler({ actor, input }) {
    const r = await cashBook(ctxOf(actor), { from: input.from, to: input.to });
    return {
      from: r.from,
      to: r.to,
      entityKind: r.entityKind,
      vatRegistered: r.vatRegistered,
      applies: r.applies,
      rows: r.rows.map((x) => ({ date: x.date, journalNo: x.docNo, description: x.description, receiptSatang: x.receipt, paymentSatang: x.payment, owner: x.owner, counterAccounts: x.counterTh })),
      days: r.days.map((d) => ({ date: d.date, receiptSatang: d.receipt, paymentSatang: d.payment })),
      months: r.months.map((m) => ({ month: m.month, receiptSatang: m.receipt, paymentSatang: m.payment, ownerInSatang: m.ownerIn, ownerOutSatang: m.ownerOut, netSatang: m.net })),
      totals: { receiptSatang: r.totals.receipt, paymentSatang: r.totals.payment, ownerInSatang: r.totals.ownerIn, ownerOutSatang: r.totals.ownerOut, netSatang: r.totals.net },
      warnings: warnView(r.warnings),
    };
  },
  csv(_ctx, data) {
    const d = data as { rows: { date: string; journalNo: string; description: string; receiptSatang: number; paymentSatang: number; owner: boolean; counterAccounts: string }[] };
    const out = [csvRow(["date", "journalNo", "description", "receiptSatang", "paymentSatang", "owner", "counterAccounts"])];
    for (const r of d.rows) out.push(csvRow([r.date, r.journalNo, r.description, r.receiptSatang, r.paymentSatang, r.owner ? "Y" : "", r.counterAccounts]));
    return out.join("\n");
  },
});

// ═══ T5.3 เกณฑ์จด VAT ═══
const taxVatThreshold = defineOp({
  id: "tax.vat-threshold",
  method: "GET",
  path: "/tax/vat-threshold",
  kind: "read",
  action: "account.report.view",
  summary:
    "Sales of the year compared with the VAT registration threshold (1,800,000 baht a year by default, from the legal value table; calendar year for individuals, the accounting period for juristic persons): total, percentage, the day it was crossed and the 30-day registration deadline, with warnings. Only for books that are not VAT registered. Warning only, sales are never blocked.",
  label: "ยอดขายเทียบเกณฑ์จด VAT",
  input: z.object({ asOf: ymdField("asOf").optional() }).strict(),
  tool: { name: "account_vat_threshold", hint: "Use when asked whether the shop must register for VAT or how close it is to 1.8 million baht. Quote the warning text; the measure is a system default." },
  test: "T5-API.3",
  async handler({ actor, input }) {
    const r = await vatThreshold(ctxOf(actor), input.asOf ? dayOf(input.asOf) : undefined);
    return {
      asOf: r.asOf,
      vatRegistered: r.vatRegistered,
      status: r.status,
      yearBasis: r.yearBasis,
      yearLabel: r.yearLabel,
      from: r.from,
      to: r.to,
      salesSatang: r.sales,
      thresholdSatang: r.threshold,
      nearRatioBp: r.nearRatioBp,
      ratioBp: r.ratioBp,
      withinDays: r.withinDays,
      crossedOn: r.crossedOn,
      registerBy: r.registerBy,
      byMonth: r.byMonth.map((m) => ({ month: m.month, salesSatang: m.sales, cumulativeSatang: m.cumulative })),
      warnings: warnView(r.warnings),
    };
  },
});

// ═══ T5.5 บวกกลับทางภาษี ═══
const reportsTaxAddBack = defineOp({
  id: "reports.tax-add-back",
  method: "GET",
  path: "/reports/tax-add-back",
  kind: "read",
  action: "account.report.view",
  rate: "report",
  summary:
    "Expenses that may have to be added back for income tax (Revenue Code s.65 ter): every account flagged with its subsection and the amount of the accounting period, the part to add back where the system can tell (whole amount, or the part above a cap), the entertainment cap helper (0.3% of revenue or paid-up capital, whichever is higher, at most 10 million baht; gifts above 2,000 baht per person per occasion), the donation helper (2% of net profit, estimated from the book unless netProfitSatang is given) and the passenger car rental helper (36,000 baht per car per month or 1,200 per car per day including VAT; needs carMonths/carDays). Helpers are suggestions only and are never posted. It does not compute taxable profit or tax payable.",
  label: "รายจ่ายที่อาจต้องบวกกลับทางภาษี",
  input: z
    .object({
      asOf: ymdField("asOf").optional(),
      from: ymdField("from").optional(),
      to: ymdField("to").optional(),
      paidUpCapitalSatang: z.coerce.number().int().min(0).max(1_000_000_000_000).optional().describe("Paid-up capital at the period end in satang; default = balance of account 3000."),
      netProfitSatang: z.coerce.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).optional().describe("Net profit before donations given by the bookkeeper, in satang; default = an estimate from the book (revenue - all expenses + donations of the period)."),
      carMonths: z.coerce.number().int().min(0).max(100_000).optional().describe("Passenger cars rented x months in the period (for the monthly rental cap)."),
      carDays: z.coerce.number().int().min(0).max(1_000_000).optional().describe("Passenger cars rented x days, for cars rented by the day (daily cap)."),
      carRentSatang: z.coerce.number().int().min(0).max(1_000_000_000_000).optional().describe("Rental paid for passenger cars in the period, in satang; default = all accounts flagged s.65 ter (20)."),
    })
    .strict(),
  tool: { name: "account_tax_add_back", hint: "Use for questions about non-deductible expenses, add-backs or the entertainment limit. Say the amounts are for the bookkeeper to review, not tax payable." },
  test: "T5-API.5a",
  async handler({ actor, input }) {
    const r = await taxAddBackReport(ctxOf(actor), { asOf: input.asOf, from: input.from, to: input.to, paidUpCapital: input.paidUpCapitalSatang ?? null, netProfit: input.netProfitSatang ?? null, carMonths: input.carMonths ?? null, carDays: input.carDays ?? null, carRent: input.carRentSatang ?? null });
    const e = r.entertainment;
    return {
      from: r.from,
      to: r.to,
      periodLabel: r.periodLabel,
      rows: r.rows.map((x) => ({ ledgerId: x.ledgerId, code: x.code, name: x.name, section: x.section, sectionTh: x.sectionTh, labelTh: x.labelTh, scope: x.scope, origin: x.origin, amountSatang: x.amount, addBackSatang: x.addBack })),
      totals: { amountSatang: r.totals.amount, addBackSatang: r.totals.addBack },
      entertainment: e
        ? { amountSatang: e.amount, revenueSatang: e.revenue, capitalSatang: e.capital, capitalSource: e.capitalSource, rateBp: e.rateBp, maxCapSatang: e.maxCap, capSatang: e.cap, base: e.baseLabel, excessSatang: e.excess, giftLimitSatang: e.giftLimit, giftDocuments: e.giftDocs.map((g) => ({ documentId: g.documentId, docNo: g.docNo, date: g.date, amountSatang: g.amount })) }
        : null,
      donationCapRateBp: r.donationCapRateBp,
      donation: r.donation ? { amountSatang: r.donation.amount, profitSatang: r.donation.profit, profitSource: r.donation.profitSource, rateBp: r.donation.rateBp, capSatang: r.donation.cap, excessSatang: r.donation.excess } : null,
      carRent: r.carRent
        ? { rentSatang: r.carRent.rent, rentSource: r.carRent.rentSource, carMonths: r.carRent.carMonths, carDays: r.carRent.carDays, monthlyCapSatang: r.carRent.monthlyCap, dailyCapSatang: r.carRent.dailyCap, capSatang: r.carRent.cap, excessSatang: r.carRent.excess }
        : null,
      sections: r.sections.map((s) => ({ code: s.code, labelTh: s.labelTh, sectionTh: s.sectionTh, scope: s.scope })),
      warnings: warnView(r.warnings),
    };
  },
});

const chartSetTaxAddBack = defineOp({
  id: "chart.set-tax-add-back",
  method: "PATCH",
  path: "/chart/{id}/tax-add-back",
  kind: "write",
  action: "account.chart.manage",
  summary:
    "Flag an account as 'may have to be added back for income tax' with the s.65 ter subsection, clear the flag (NONE) or go back to the system default for its code (null). The flag only feeds the add-back report; nothing is blocked.",
  label: "ตั้งธงอาจต้องบวกกลับทางภาษีของบัญชี",
  input: z
    .object({
      section: z
        .enum([TAX_ADD_BACK_NONE, ...TAX_ADD_BACK_SECTIONS.map((s) => s.code)] as [string, ...string[]])
        .nullable()
        .describe("Subsection code (S65TRI_1 reserves, S65TRI_3 personal/charity, S65TRI_4 entertainment above cap, S65TRI_5 capital expenditure, S65TRI_6 penalties and income tax, S65TRI_6BIS non-deductible input VAT, S65TRI_9, S65TRI_13 not for the business, S65TRI_17 write-down, S65TRI_18 payee unknown, S65TRI_20 passenger car excess), NONE to clear, null for the default."),
    })
    .strict(),
  tool: { name: "account_set_tax_add_back", hint: "Use when the owner or bookkeeper says an expense account is (or is not) non-deductible. Proposed for confirmation." },
  test: "T5-API.5b",
  async handler({ actor, params, input }) {
    const r = await setTaxAddBack(ctxOf(actor), params.id ?? "", input.section);
    if (!r.ok) {
      if (r.reason.startsWith("ไม่พบ")) throw notFound(r.reason);
      failWith(r.reason);
    }
    return { ledgerId: params.id, section: input.section, effective: r.ok ? r.effective : null };
  },
});

// ═══ T5.6 ตรวจภาษีประจำเดือน ═══
const taxChecksOp = defineOp({
  id: "tax.checks",
  method: "GET",
  path: "/tax/checks",
  kind: "read",
  action: "account.report.view",
  summary:
    "Monthly tax checks with warnings only: input VAT apportionment when the month has VAT-exempt revenue mixed with taxable revenue (s.82/6; the system does not apportion and does not decide the formula), payments to foreign service providers that may need VAT remitted with PP36 (VAT registered books), and service quotations accepted / purchase orders issued that may be hire-of-work instruments liable to stamp duty (1 baht per 1,000 baht, with the stored payment reference).",
  label: "ตรวจภาษีประจำเดือน",
  input: z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period ต้องเป็น YYYY-MM").optional().describe("Tax month YYYY-MM; default the current Thai month.") }).strict(),
  tool: { name: "account_tax_checks", hint: "Use to review the month for input VAT apportionment, PP36 on foreign services and stamp duty on hire-of-work documents. Everything is a warning for the shop's accountant." },
  test: "T5-API.6a",
  async handler({ actor, input }) {
    const r = await taxChecks(ctxOf(actor), { period: input.period });
    return {
      period: r.period,
      vatRegistered: r.vatRegistered,
      apportionment: { exemptSatang: r.apportionment.exempt, taxableSatang: r.apportionment.taxable, inputVatSatang: r.apportionment.inputVat, taxableRatioBp: r.apportionment.taxableRatioBp, warning: r.apportionment.warning ? warnView([r.apportionment.warning])[0] : null },
      pp36: r.pp36.map((x) => ({ documentId: x.documentId, docNo: x.docNo, paidAt: x.paidAt, vendorName: x.vendorName, amountSatang: x.amount, warning: warnView([x.warning])[0] })),
      stampDuty: r.stamp.map((x) => ({ documentId: x.documentId, docType: x.docType, docNo: x.docNo, date: x.date, contactName: x.contactName, payer: x.payer, amountSatang: x.amount, dutySatang: x.duty, stampDutyRef: x.stampDutyRef, warning: warnView([x.warning])[0] })),
      warnings: warnView(r.warnings),
    };
  },
});

const documentsStampDutyRef = defineOp({
  id: "documents.stamp-duty-ref",
  method: "POST",
  path: "/documents/{id}/stamp-duty-ref",
  kind: "write",
  action: "account.doc.create",
  summary: "Store (or clear with null) the stamp duty payment reference (the code from the e-stamp duty payment, form Or.Sor.9) on a quotation or purchase order.",
  label: "บันทึกรหัสรับรองการเสียอากรแสตมป์",
  input: z.object({ ref: z.string().max(60).nullable().describe("Payment reference shown after paying the stamp duty online; null clears it.") }).strict(),
  tool: { name: "account_set_stamp_duty_ref", hint: "Use when the owner gives the stamp duty payment code of a quotation or purchase order. Proposed for confirmation." },
  test: "T5-API.6b",
  async handler({ actor, params, input }) {
    const r = await setStampDutyRef(ctxOf(actor), params.id ?? "", input.ref);
    if (!r.ok) {
      if (r.reason.startsWith("ไม่พบ")) throw notFound(r.reason);
      failWith(r.reason);
    }
    return { documentId: params.id, stampDutyRef: input.ref?.trim() || null };
  },
});

// ═══ T5.7 หนี้สูญ / ค่าเผื่อ ═══
const badDebtSummaryOp = defineOp({
  id: "bad-debt.summary",
  method: "GET",
  path: "/bad-debt",
  kind: "read",
  action: "account.report.view",
  summary:
    "Allowance for doubtful accounts balance, receivables total, overdue receivable documents that could be written off, write-offs so far and the per-debtor amount tiers of the tax conditions for writing off bad debt (from the legal value table).",
  label: "หนี้สูญและค่าเผื่อหนี้สงสัยจะสูญ",
  input: z.object({ asOf: ymdField("asOf").optional() }).strict(),
  tool: { name: "account_bad_debt", hint: "Use for questions about overdue debts that may never be paid, the allowance for doubtful accounts or past write-offs." },
  test: "T5-API.7a",
  async handler({ actor, input }) {
    const r = await badDebtSummary(ctxOf(actor), input.asOf ? dayOf(input.asOf) : undefined);
    return {
      asOf: r.asOf,
      allowanceSatang: r.allowance,
      receivableSatang: r.receivable,
      tiers: { tier1MaxSatang: r.tiers.tier1Max, tier2MaxSatang: r.tiers.tier2Max },
      candidates: r.candidates.map((c) => ({ documentId: c.documentId, docType: c.docType, docNo: c.docNo, contactId: c.contactId, contactName: c.contactName, issueDate: c.issueDate, dueDate: c.dueDate, daysOverdue: c.daysOverdue, outstandingSatang: c.outstanding })),
      writeOffs: r.writeOffs.map((w) => ({ paymentId: w.paymentId, documentId: w.documentId, docNo: w.docNo, contactName: w.contactName, date: w.date, amountSatang: w.amount, voided: w.voided, note: w.note })),
      writtenOffDocuments: r.writtenDocs.map((w) => ({ documentId: w.documentId, docNo: w.docNo, contactName: w.contactName, writtenOffSatang: w.writtenOff, recoveredSatang: w.recovered, recoverableSatang: w.recoverable })),
      recoveries: r.recoveries.map((x) => ({ recoveryId: x.recoveryId, documentId: x.documentId, docNo: x.docNo, contactName: x.contactName, date: x.date, amountSatang: x.amount, channel: x.channel, voided: x.voided, note: x.note, journalEntryId: x.entryId })),
    };
  },
});

const badDebtWriteOff = defineOp({
  id: "bad-debt.write-off",
  method: "POST",
  path: "/documents/{id}/write-off",
  kind: "write",
  action: "account.journal.adjust",
  summary:
    "Write off the unpaid amount of a sales invoice as a bad debt: recorded as a non-cash settlement (channel BAD_DEBT) so the invoice is no longer outstanding; the entry uses the allowance for doubtful accounts first, then bad debt expense, and never reduces revenue; undue service VAT of the written-off part is released. The tax conditions (s.65 bis rules of Ministerial Regulation 186/374) come back as 409 legal_ack_required until `acknowledge` contains BAD_DEBT_TAX_CONDITIONS. Undo with payments void.",
  label: "ตัดหนี้สูญ",
  input: z
    .object({
      amountSatang: z.number().int().positive().optional().describe("Amount to write off in satang; default the whole outstanding amount."),
      date: ymdField("date").optional(),
      note: z.string().max(300).optional(),
      idempotencyKey: z.string().min(8).max(80).optional(),
      acknowledge: ackField,
    })
    .strict(),
  tool: { name: "account_write_off_bad_debt", hint: "Use only when the owner decides a customer's debt will not be collected. Show the tax conditions warning first; proposed for confirmation." },
  test: "T5-API.7b",
  async handler({ actor, params, input }) {
    const r = await writeOffBadDebt(ctxOf(actor), {
      documentId: params.id ?? "",
      amount: input.amountSatang ?? null,
      date: input.date ? dayOf(input.date) : undefined,
      note: input.note ?? null,
      createdById: actorRefId(actor),
      idempotencyKey: input.idempotencyKey ?? null,
      ack: ackOf(actor, input.acknowledge),
    });
    if (!r.ok) {
      if (r.legal) throw legalAckApiError(r.legal.warnings);
      if (r.reason.startsWith("ไม่พบ")) throw notFound(r.reason);
      failWith(r.reason);
    }
    if (!r.ok) return null;
    return { documentId: params.id, paymentId: r.paymentId, journalEntryId: r.entryId, status: r.status, amountSatang: r.amount, duplicate: r.duplicate, warnings: warnView(r.warnings) };
  },
});

const badDebtAllowance = defineOp({
  id: "bad-debt.allowance",
  method: "POST",
  path: "/bad-debt/allowance",
  kind: "write",
  action: "account.journal.adjust",
  summary:
    "Set the allowance for doubtful accounts to a target balance at a date; the difference is posted (increase = doubtful debt expense, decrease = reversed). The allowance is a reserve that is not deductible for income tax until a bad debt is actually written off (s.65 ter (1)); a warning says so.",
  label: "ตั้งค่าเผื่อหนี้สงสัยจะสูญ",
  input: z.object({ targetSatang: z.number().int().min(0).max(1_000_000_000_000).describe("Allowance balance wanted at the date, in satang."), date: ymdField("date").optional(), note: z.string().max(300).optional() }).strict(),
  tool: { name: "account_set_doubtful_allowance", hint: "Use when the owner or bookkeeper sets the allowance for doubtful accounts. Proposed for confirmation." },
  test: "T5-API.7c",
  async handler({ actor, input }) {
    const r = await setDoubtfulAllowance(ctxOf(actor), { target: input.targetSatang, date: input.date ? dayOf(input.date) : undefined, note: input.note ?? null, postedById: actorRefId(actor) });
    if (!r.ok) failWith(r.reason);
    if (!r.ok) return null;
    return { beforeSatang: r.before, afterSatang: r.after, deltaSatang: r.delta, journalEntryId: r.entryId, warnings: warnView(r.warnings) };
  },
});

// ═══ ACC T5c (เลน 2) ▸ หนี้สูญได้รับคืน · วันประชุมใหญ่อนุมัติงบ ═══
const badDebtRecover = defineOp({
  id: "bad-debt.recover",
  method: "POST",
  path: "/documents/{id}/bad-debt-recovery",
  kind: "write",
  action: "account.payment.record",
  summary:
    "Record money received later for a debt that was already written off as bad debt on this sales document: posted as income 'bad debts recovered' (cash or bank / account 4920) on the date received, linked to the written-off document; the document is not reopened as a receivable. Amount defaults to the written-off amount not yet recovered and cannot exceed it. If the write-off released undue service VAT, a warning says VAT and a tax invoice may arise on the money received (not decided by the system). Undo with bad-debt.recovery-void.",
  label: "บันทึกหนี้สูญได้รับคืน",
  input: z
    .object({
      amountSatang: z.number().int().positive().optional().describe("Amount received in satang; default = the written-off amount not yet recovered."),
      date: ymdField("date").optional(),
      channel: z.enum(RECOVERY_CHANNELS).optional().describe("How the money came in; default CASH."),
      financeAccountId: z.string().max(40).optional().describe("Money account (from finance accounts) that received it; default = the channel's default ledger."),
      note: z.string().max(300).optional(),
      idempotencyKey: z.string().min(8).max(80).optional(),
    })
    .strict(),
  tool: { name: "account_recover_bad_debt", hint: "Use when a customer pays a debt that was written off as bad debt. It is booked as income, not as a normal payment. Proposed for confirmation." },
  test: "T5c-API.1a",
  async handler({ actor, params, input }) {
    const r = await recoverBadDebt(ctxOf(actor), {
      documentId: params.id ?? "",
      amount: input.amountSatang ?? null,
      date: input.date ? dayOf(input.date) : undefined,
      channel: input.channel,
      financeAccountId: input.financeAccountId ?? null,
      note: input.note ?? null,
      createdById: actorAuditId(actor),
      actorType: actorAuditType(actor) as "USER" | "API_KEY",
      idempotencyKey: input.idempotencyKey ?? null,
    });
    if (!r.ok) {
      if (r.reason.startsWith("ไม่พบ")) throw notFound(r.reason);
      failWith(r.reason);
    }
    if (!r.ok) return null;
    return { documentId: params.id, recoveryId: r.recoveryId, journalEntryId: r.entryId, amountSatang: r.amount, duplicate: r.duplicate, warnings: warnView(r.warnings) };
  },
});

const badDebtRecoveryVoid = defineOp({
  id: "bad-debt.recovery-void",
  method: "POST",
  path: "/bad-debt/recoveries/{id}/void",
  kind: "danger",
  action: "account.payment.void",
  summary: "Cancel a recorded bad debt recovery: its journal entry is reversed (posted rows are never edited) and the row is marked voided with the reason.",
  label: "ยกเลิกรายการหนี้สูญได้รับคืน",
  input: z.object({ reason: z.string().min(5).max(300).describe("Why the recovery is cancelled, at least 5 characters. Stored on the reversing journal entry and in the audit log.") }).strict(),
  tool: { name: "account_void_bad_debt_recovery", hint: "Irreversible: reverses one recorded bad debt recovery. Needs a reason and a double confirmation." },
  test: "T5c-API.1b",
  async handler({ actor, params, input }) {
    const r = await voidBadDebtRecovery(ctxOf(actor), { recoveryId: params.id ?? "", reason: input.reason, actorId: actorAuditId(actor), actorType: actorAuditType(actor) as "USER" | "API_KEY" });
    if (!r.ok) {
      if (r.reason.startsWith("ไม่พบ")) throw notFound(r.reason);
      failWith(r.reason);
    }
    return { recoveryId: params.id, documentId: r.ok ? r.documentId : null, voided: true };
  },
});

const settingsStatementMeeting = defineOp({
  id: "settings.statement-meeting",
  method: "PUT",
  path: "/settings/statement-meetings/{id}",
  kind: "write",
  action: "account.settings.manage",
  summary:
    "Set (or clear with null) the date of the shareholders' meeting that approved the financial statements of the accounting period ending on {id} (YYYY-MM-DD). Companies file the statements within 1 month from that meeting (legal value table row FS_COMPANY); with the date the tax calendar shows the computed filing date, without it the rule text.",
  label: "บันทึกวันประชุมใหญ่อนุมัติงบ",
  input: z.object({ meetingDate: ymdField("meetingDate").nullable() }).strict(),
  tool: { name: "account_set_statement_meeting", hint: "Use when the owner gives the date of the annual general meeting that approved the financial statements. Proposed for confirmation." },
  test: "T5c-API.2",
  async handler({ actor, params, input }) {
    const fyEnd = params.id ?? "";
    if (!YMD.test(fyEnd)) throw new ApiError(422, "unprocessable", "วันสิ้นรอบบัญชีต้องเป็น YYYY-MM-DD", "The path id must be the accounting period end date YYYY-MM-DD.");
    const r = await saveStatementMeeting({ ...actor.membership, userId: actorRefId(actor) }, ctxOf(actor), fyEnd, input.meetingDate);
    if (!r.ok) failWith(r.reason);
    return { fyEnd, meetingDate: input.meetingDate, meetings: r.ok ? r.meetings : [] };
  },
});

export const TAX_T5_OPS: ApiOp[] = [reportsCashBook, taxVatThreshold, reportsTaxAddBack, chartSetTaxAddBack, taxChecksOp, documentsStampDutyRef, badDebtSummaryOp, badDebtWriteOff, badDebtAllowance, badDebtRecover, badDebtRecoveryVoid, settingsStatementMeeting];
