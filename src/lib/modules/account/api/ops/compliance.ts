// compliance.ts — op ของใบงาน T4.4 T4.5 T4.7 T4.8 (เลน 1): รายงานการแก้ไข · ลบร้าน/ส่งออก · POS ↔ บัญชี · คลัง/เงินประกัน/แต้ม
//   รูปแบบเดียวกับไฟล์ op อื่น: สคีมา zod · สิทธิ์ตาม action · `tool` = เครื่องมือเลขา (ลงทะเบียนใน src/lib/ai/skills.ts สกิล account)
import { z } from "zod";
import { AUDIT_TRAIL_KINDS, listAccountChanges } from "../../audit-trail";
import { defineOp, type ApiOp } from "../op";
import { ApiError, withExtra } from "../respond";
import { actorRefId } from "../actor";
import { accountNow } from "../../clock";
import { complianceViewFrom, loadBookLegal, saveBookTax, tipTreatmentWarning } from "../../legal-values";
import { COMPLIANCE_KEYS } from "@/lib/core/settings/legal/th-tax-2569";
import { TIP_TREATMENTS, TIP_TREATMENT_LABEL_TH } from "@/lib/core/settings/defs/account";
import { buildBooksArchive, retentionNotice } from "../../books-export";
import { legalWarning } from "@/lib/core/settings/legal/warnings";
import { posDailyRecon, posLinkWarnings, posShiftVariances, posUnpostedBills, postPosShiftVariances } from "../../pos-link";
import { GOODS_ISSUE_REASON_DEFS, goodsIssueWarnings } from "../../stock-issue-reasons";
import { dormDepositReport, pointsOutstandingAt } from "../../deposits-points";
import { tenantDb } from "@/lib/core/db";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymdField = (what: string) => z.string().regex(YMD, `${what} ต้องเป็นวันที่รูปแบบ YYYY-MM-DD`).describe(`${what} (Thai calendar day, YYYY-MM-DD).`);
const dayStart = (d: string) => new Date(`${d}T00:00:00.000+07:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+07:00`);

// ═══════════════ T4.4 รายงานการแก้ไขของบัญชี ═══════════════

const auditChanges = defineOp({
  id: "audit.changes",
  method: "GET",
  path: "/audit/changes",
  kind: "read",
  action: "account.journal.view",
  summary:
    "Accounting change report of this book, newest first: who did what and when (documents issued, edited, voided; payments voided; journal reversals with amounts; filing marks; legal warnings acknowledged; sign-ins of the shop's members) with the cancel reason. Default range is the last 90 days.",
  label: "รายงานการแก้ไขของบัญชี",
  tool: { name: "account_audit_changes", hint: "Use for 'who cancelled / changed / reversed what and why' questions and for the sign-in log of the shop's staff." },
  input: z
    .object({
      from: ymdField("from").optional(),
      to: ymdField("to").optional(),
      kind: z.enum(AUDIT_TRAIL_KINDS as [string, ...string[]]).optional().describe("all (default) · cancel = voids, reversals, unmarks · legal = acknowledged legal warnings · signin = sign-in log."),
      actorId: z.string().min(1).max(60).optional().describe("Only rows done by this user id."),
      take: z.coerce.number().int().min(1).max(500).optional().describe("1-500. Default 100."),
      cursor: z.string().regex(/^\d+$/).optional().describe("`nextCursor` from the previous response."),
    })
    .strict(),
  test: "T44-R1",
  async handler({ actor, input }) {
    const res = await listAccountChanges(
      { tenantId: actor.tenantId, systemId: actor.systemId },
      {
        from: input.from ? dayStart(input.from) : undefined,
        to: input.to ? dayEnd(input.to) : undefined,
        kind: input.kind as (typeof AUDIT_TRAIL_KINDS)[number] | undefined,
        actorId: input.actorId,
        take: input.take,
        cursor: input.cursor,
      },
    );
    return withExtra(
      res.rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        category: r.category,
        action: r.action,
        actionLabel: r.actionLabel,
        actorType: r.actorType,
        actorId: r.actorId,
        actorName: r.actorName,
        targetType: r.targetType,
        targetId: r.targetId,
        ref: r.ref,
        amountSatang: r.amountSatang,
        reason: r.reason,
        detail: r.detail,
      })),
      { nextCursor: res.nextCursor, total: res.total },
    );
  },
});

// ═══════════════ T4.5 ลบร้าน/ยกเลิกบริการ: หน้าที่เก็บเอกสาร ═══════════════

const booksRetention = defineOp({
  id: "books.retention",
  method: "GET",
  path: "/books/retention",
  kind: "read",
  action: "account.report.view",
  summary:
    "Record-keeping duty before the shop deletes its data or cancels the service: how long this shop must keep its books and supporting documents (legal value table, shop-overridable), the last journal date and the keep-until date of every book, when the books were last downloaded, and the size of a download of this book (printable journal and ledger, CSV files, attachments). Download the ZIP from the web page /app/sys/{book}/account/export/books.",
  label: "หน้าที่เก็บบัญชีและเอกสาร",
  tool: { name: "account_books_retention", hint: "Use when the owner asks about deleting the shop, cancelling the service, or how long the accounting records must be kept." },
  input: z.object({}).strict(),
  test: "T45-R1",
  async handler({ actor }) {
    const books = await retentionNotice(actor.tenantId);
    const mine = books.find((b) => b.systemId === actor.systemId) ?? null;
    const preview = await buildBooksArchive({ tenantId: actor.tenantId, systemId: actor.systemId }, { includeAttachments: false });
    const years = Math.max(5, ...books.map((b) => b.retentionYears));
    const deletions = await tenantDb({ tenantId: actor.tenantId }).tenantDeletionLog.findMany({ where: { tenantId: actor.tenantId }, orderBy: { createdAt: "asc" }, select: { event: true, createdAt: true, actorUserId: true } });
    return {
      book: mine,
      books,
      exportPath: `/app/sys/${actor.systemId}/account/export/books`,
      exportPreview: { entries: preview.summary.entries, lines: preview.summary.lines, documents: preview.summary.documents, attachments: preview.summary.attachments, firstDate: preview.summary.firstDate, lastDate: preview.summary.lastDate },
      deletionLog: deletions.map((d) => ({ event: d.event, at: d.createdAt.toISOString(), actorUserId: d.actorUserId })),
      warnings: [legalWarning("SHOP_RECORDS_RETENTION_DUTY", { years }), legalWarning("PAPER_ORIGINALS_KEEP")],
    };
  },
});

// ═══════════════ ค่ากฎหมายอื่น + วิธีลงทิป (T4.5 · T4.7 · T4.8) ═══════════════

const complianceGet = defineOp({
  id: "settings.compliance",
  method: "GET",
  path: "/settings/compliance",
  kind: "read",
  action: "account.doc.view",
  summary:
    "Legal values that are not tax rates, with source, confidence tag and check date: minimum years to keep books and documents, the suggested keeping period, the dorm security deposit limits (times the monthly rent, contract years). Also how POS tips are booked (LIABILITY, REVENUE_VAT or STAFF_DIRECT) with its warning.",
  label: "ค่ากฎหมายอื่น + วิธีลงทิป",
  tool: { name: "account_compliance_values", hint: "Use for record keeping periods, the dorm deposit limits (6 times rent / 3 years) and how POS tips are booked." },
  input: z.object({}).strict(),
  test: "T45-R2",
  async handler({ actor }) {
    const legal = await loadBookLegal({ tenantId: actor.tenantId, systemId: actor.systemId });
    const v = complianceViewFrom(legal, accountNow());
    const tip = legal.tipTreatment ?? "LIABILITY";
    return { ...v, tipTreatment: tip, tipTreatmentLabel: TIP_TREATMENT_LABEL_TH[tip], tipOptions: TIP_TREATMENTS.map((t) => ({ value: t, label: TIP_TREATMENT_LABEL_TH[t] })), tipWarning: tipTreatmentWarning(tip) };
  },
});

const complianceRow = z
  .object({
    id: z.string().min(1).max(64).optional(),
    key: z.enum(COMPLIANCE_KEYS),
    value: z.number().int().min(1).max(100),
    from: z.string().regex(YMD).nullable(),
    to: z.string().regex(YMD).nullable(),
    source: z.string().max(500).optional().describe("Where the shop's value comes from (e.g. the accountant's advice)."),
    note: z.string().max(500).optional(),
  })
  .strict();

const complianceUpdate = defineOp({
  id: "settings.compliance.update",
  method: "PATCH",
  path: "/settings/compliance",
  kind: "write",
  action: "account.settings.manage",
  summary:
    "Replace the shop's own rows of the other legal values (keeping period, dorm deposit limits) and/or choose how POS tips are booked: LIABILITY = held for staff (no VAT, default), REVENUE_VAT = shop revenue with output VAT, STAFF_DIRECT = cash tips go straight to staff (not booked). Values that differ from an official default are accepted and returned with a warning.",
  label: "แก้ค่ากฎหมายอื่น/วิธีลงทิป",
  tool: { name: "account_update_compliance_values", hint: "Use when the owner wants to change the record keeping period, the dorm deposit limits or how POS tips are booked. Read account_compliance_values first. Proposed for confirmation." },
  input: z
    .object({
      rows: z.array(complianceRow).max(50).optional().describe("Replaces ALL shop rows. [] = use the system defaults."),
      tipTreatment: z.enum(TIP_TREATMENTS).optional(),
      reason: z.string().max(500).optional(),
    })
    .strict(),
  test: "T45-R3",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const res = await saveBookTax(
      { ...actor.membership, userId: actorRefId(actor) },
      ctx,
      {
        ...(input.rows !== undefined ? { complianceRows: input.rows.map((r) => ({ ...r, id: r.id ?? "", source: r.source ?? "", checkedAt: null })) } : {}),
        ...(input.tipTreatment !== undefined ? { tipTreatment: input.tipTreatment } : {}),
      },
      input.reason,
    );
    if (!res.ok) {
      const msg = res.issues.map((i) => i.messageTh).join(" · ") || "บันทึกไม่สำเร็จ";
      if (res.code === "PERMISSION") throw new ApiError(403, "forbidden", msg, "Not allowed to change these settings.");
      throw new ApiError(422, "validation", msg, "Invalid values.");
    }
    const legal = await loadBookLegal(ctx);
    return { saved: res.saved, warnings: res.warnings, compliance: complianceViewFrom(legal, accountNow()), tipTreatment: legal.tipTreatment ?? "LIABILITY" };
  },
});

// ═══════════════ T4.7 POS ↔ บัญชี ═══════════════

const rangeInput = z
  .object({
    from: ymdField("from").optional(),
    to: ymdField("to").optional(),
  })
  .strict();
const rangeOf = (i: { from?: string; to?: string }) => {
  const to = i.to ? dayEnd(i.to) : dayEnd(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
  const from = i.from ? dayStart(i.from) : new Date(to.getTime() - 31 * 86_400_000);
  return { from, to };
};

const posUnposted = defineOp({
  id: "pos.unposted-bills",
  method: "GET",
  path: "/pos/unposted-bills",
  kind: "read",
  action: "account.report.view",
  summary: "Paid bills of the point of sale systems linked to this book that have no sales journal entry yet (default: last 31 days), with age in days. Abbreviated tax invoices must reach the sales tax report as a daily total within 3 working days.",
  label: "บิลขายหน้าร้านที่ยังไม่ลงบัญชี",
  tool: { name: "account_pos_unposted", hint: "Use to find point of sale bills that are missing from the books." },
  input: rangeInput,
  test: "T47-R1",
  async handler({ actor, input }) {
    const r = await posUnpostedBills({ tenantId: actor.tenantId, systemId: actor.systemId }, rangeOf(input));
    return { ...r, bills: r.bills.map((b) => ({ ...b, at: b.at.toISOString() })) };
  },
});

const posRecon = defineOp({
  id: "pos.daily-reconciliation",
  method: "GET",
  path: "/pos/daily-reconciliation",
  kind: "read",
  action: "account.report.view",
  summary: "Daily reconciliation of point of sale takings against the ledger: per Thai calendar day the money received by POS (bill totals + tips), the debit total of the posted sales entries, bills not posted and the difference. Also legal warnings for cash register approval, tips, unposted bills and cash over/short.",
  label: "กระทบยอดขายหน้าร้านรายวัน",
  tool: { name: "account_pos_daily_recon", hint: "Use to check whether POS sales of each day match the books." },
  input: rangeInput,
  test: "T47-R2",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const r = rangeOf(input);
    const [rec, un, vs] = await Promise.all([posDailyRecon(ctx, r), posUnpostedBills(ctx, r), posShiftVariances(ctx, r)]);
    return { ...rec, warnings: await posLinkWarnings(ctx, { unposted: un, variances: vs.filter((v) => !v.posted).length }) };
  },
});

const posVariances = defineOp({
  id: "pos.shift-variances",
  method: "GET",
  path: "/pos/shift-variances",
  kind: "read",
  action: "account.report.view",
  summary: "Closed POS shifts (and manager recounts of force-closed shifts) whose counted cash differs from expected, with who counted, the note and whether the over/short is already posted to the ledger.",
  label: "เงินขาด/เกินปิดกะ",
  tool: { name: "account_pos_shift_variances", hint: "Use for cash over/short of POS shifts and whether it is in the books." },
  input: rangeInput,
  test: "T47-R3",
  async handler({ actor, input }) {
    const rows = await posShiftVariances({ tenantId: actor.tenantId, systemId: actor.systemId }, rangeOf(input));
    return rows.map((v) => ({ ...v, at: v.at.toISOString() }));
  },
});

const posVariancesPost = defineOp({
  id: "pos.shift-variances.post",
  method: "POST",
  path: "/pos/shift-variances/post",
  kind: "write",
  action: "account.journal.adjust",
  summary: "Post the cash over/short of closed POS shifts that are not in the ledger yet: over = Dr cash / Cr cash over (other income), short = Dr cash short (expense) / Cr cash. One journal entry per shift, never netted across shifts. Shifts in a closed period fail one by one.",
  label: "ลงบัญชีเงินขาด/เกินปิดกะ",
  tool: { name: "account_post_shift_variances", hint: "Use when the owner asks to book the cash over/short of POS shifts. Proposed for confirmation." },
  input: rangeInput.extend({ refIds: z.array(z.string().min(1).max(60)).max(500).optional().describe("Only these shift/recount ids (from GET /pos/shift-variances refId). Default: all unposted in the range.") }).strict(),
  test: "T47-R4",
  async handler({ actor, input }) {
    return postPosShiftVariances({ tenantId: actor.tenantId, systemId: actor.systemId }, rangeOf(input), { userId: actor.kind === "user" ? actor.userId ?? null : null }, input.refIds);
  },
});

// ═══════════════ T4.8 คลัง · เงินประกันหอ · แต้ม ═══════════════

const stockReasons = defineOp({
  id: "stock.issue-reasons",
  method: "GET",
  path: "/stock/issue-reasons",
  kind: "read",
  action: "account.doc.view",
  summary: "Goods issue reasons (business use, sample, giveaway, staff meal, owner personal use, waste, shortage, ...) with the default debit account and the accounting/VAT consequence of each as legal warnings (for example owner personal use is a deemed sale at market price).",
  label: "สาเหตุการเบิกสินค้า",
  tool: { name: "account_stock_issue_reasons", hint: "Use before taking goods out of stock to pick the right reason and tell the owner the VAT consequence." },
  input: z.object({}).strict(),
  test: "T48-R1",
  async handler() {
    return GOODS_ISSUE_REASON_DEFS.map((d) => ({ code: d.code, label: d.labelTh, defaultAccountCode: d.defaultCode, deemedSale: d.deemedSale, needsSeparateApprover: d.separateApprover, warnings: goodsIssueWarnings(d.code) }));
  },
});

const dormDeposits = defineOp({
  id: "dorm.deposit-check",
  method: "GET",
  path: "/dorm/deposit-check",
  kind: "read",
  action: "account.report.view",
  summary: "Security deposits of the dorm leases linked to this book checked against the limits under which a residential deposit is not income of the landlord (deposit at most N times the monthly rent and contract at most M years; values come from the legal table).",
  label: "ตรวจเงินประกันหอพัก",
  tool: { name: "account_dorm_deposit_check", hint: "Use to find dorm security deposits above 6 times the rent or contracts longer than 3 years." },
  input: z.object({ asOf: ymdField("asOf").optional() }).strict(),
  test: "T48-R2",
  async handler({ actor, input }) {
    return dormDepositReport({ tenantId: actor.tenantId, systemId: actor.systemId }, input.asOf ? dayEnd(input.asOf) : accountNow());
  },
});

const pointsOutstanding = defineOp({
  id: "points.outstanding",
  method: "GET",
  path: "/points/outstanding",
  kind: "read",
  action: "account.report.view",
  summary: "Loyalty points still outstanding at the end of a day (the period end), per point system, with their value at the redemption rate, for the accountant's choice between booking a liability or recognising a discount when used.",
  label: "แต้มคงค้าง ณ วันสิ้นงวด",
  tool: { name: "account_points_outstanding", hint: "Use for 'how many loyalty points / how much baht is outstanding at month or year end'." },
  input: z.object({ asOf: ymdField("asOf").optional().describe("Period end day. Default: today.") }).strict(),
  test: "T48-R3",
  async handler({ actor, input }) {
    const asOf = input.asOf ?? new Date(accountNow().getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    return pointsOutstandingAt({ tenantId: actor.tenantId, systemId: actor.systemId }, asOf);
  },
});

export const COMPLIANCE_OPS: ApiOp[] = [auditChanges, booksRetention, complianceGet, complianceUpdate, posUnposted, posRecon, posVariances, posVariancesPost, stockReasons, dormDeposits, pointsOutstanding];
