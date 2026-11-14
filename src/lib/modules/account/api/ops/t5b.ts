// t5b.ts — op ของใบงาน T5.8 T5.9 T5.10 T5.11 (เลน 1): งบเปลี่ยนแปลงส่วนของเจ้าของ · รายงานสินค้า/waste log/ถือเป็นขาย ·
//   รายได้รับล่วงหน้า/ชนิดเงินประกัน/ผู้ออกส่วนลด · สาขา/รายงานภาษีแยกสาขา
//   รูปแบบเดียวกับไฟล์ op อื่น · `tool` = เครื่องมือเลขา (ลงทะเบียนใน src/lib/ai/skills.ts สกิล account)
import { z } from "zod";
import { defineOp, type ApiOp } from "../op";
import { ApiError, legalAckApiError } from "../respond";
import { actorRefId } from "../actor";
import { accountNow } from "../../clock";
import { getPolicy } from "../../policy";
import { equityStatement } from "../../equity-statement";
import { giveawayDeemedSales, goodsPeriodReport, saveStockEvidence, wasteLog } from "../../goods-report";
import { cancelDeferral, createDeferral, DEPOSIT_KINDS, DISCOUNT_FUNDERS, listDeferrals, recognizeDeferrals, setDiscountFunder, setProductDepositKind } from "../../deferral";
import { loadBranches, purchaseTaxReportForBranch, salesTaxReportForBranch, saveBranches, setDocumentBranch } from "../../branches";
import { resolveBookSettings } from "@/lib/core/settings";
import { ACCOUNT_SETTING_KEYS, VAT_FILING_MODES } from "@/lib/core/settings/defs/account";
import { LEGAL_WARNING_CODES } from "@/lib/core/settings/legal/warnings";
import { tenantDb } from "@/lib/core/db";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const ymd = (what: string) => z.string().regex(YMD, `${what} ต้องเป็นวันที่ YYYY-MM-DD`).describe(`${what} (Thai calendar day, YYYY-MM-DD).`);
const month = (what: string) => z.string().regex(KEY, `${what} ต้องเป็น YYYY-MM`).describe(`${what} (YYYY-MM).`);
const today = () => new Date(accountNow().getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const curKey = () => today().slice(0, 7);
const rangeIn = z.object({ from: ymd("from").optional().describe("Start day. Default: first day of this month."), to: ymd("to").optional().describe("End day. Default: today.") }).strict();
const rangeOf = (i: { from?: string; to?: string }) => {
  const from = i.from ?? monthStart();
  const to = i.to ?? today();
  if (from > to) throw new ApiError(422, "validation", "from ต้องไม่เกิน to", "from must not be after to.");
  return { from, to };
};
const failed = (reason: string) => new ApiError(422, "validation", reason, reason);
const ackIn = z.array(z.enum(LEGAL_WARNING_CODES)).max(20).optional().describe("Legal warning codes the user has read and accepted (after a 409 legal_ack_required).");

// ═══════════════ T5.8 งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ ═══════════════
const equity = defineOp({
  id: "reports.equity",
  method: "GET",
  path: "/reports/equity",
  kind: "read",
  action: "account.report.view",
  summary:
    "Statement of changes in owner's equity from the start of the fiscal year to the given month: opening balance, capital contributed, withdrawals/drawings, retained earnings allocations (dividends, prior-period corrections), net profit, closing balance per equity account plus retained earnings. Comparative figures for the same span of the prior fiscal year are included by default (compare=false to omit). Closing total reconciles to the balance sheet's total equity. Draft for the bookkeeper/auditor.",
  label: "งบแสดงการเปลี่ยนแปลงส่วนของเจ้าของ",
  tool: { name: "account_equity_statement", hint: "Use for 'how did the owner's equity / capital / retained earnings change this year' and when the statement of changes in equity is asked for." },
  input: z.object({ to: month("to").optional().describe("Last month of the statement. Default: this month."), compare: z.enum(["true", "false"]).optional() }).strict(),
  test: "T58-R1",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const policy = await getPolicy(ctx);
    return equityStatement(ctx, input.to ?? curKey(), { fiscalYearStartMonth: policy.fiscalYearStartMonth, compare: input.compare !== "false" });
  },
});

// ═══════════════ T5.9 สินค้าและวัตถุดิบ · waste log · ของแถม/ถือเป็นขาย ═══════════════
const goodsReport = defineOp({
  id: "stock.goods-report",
  method: "GET",
  path: "/stock/goods-report",
  kind: "read",
  action: "account.report.view",
  summary: "Goods and raw-materials report for a date range: per stock-tracked product the opening quantity/cost, receipts, issues split by kind (sale, business use, giveaway/sample, waste/damage, deemed sale = owner use or shortage, other) and the closing quantity/cost, from the stock movements of the products linked to the inventory.",
  label: "รายงานสินค้าและวัตถุดิบ",
  tool: { name: "account_goods_report", hint: "Use for the stock/goods and raw materials report (receipts, issues, balance) of a month or a range." },
  input: rangeIn,
  test: "T59-R1",
  async handler({ actor, input }) {
    const r = rangeOf(input);
    return goodsPeriodReport({ tenantId: actor.tenantId, systemId: actor.systemId }, r.from, r.to);
  },
});

const wasteLogOp = defineOp({
  id: "stock.waste-log",
  method: "GET",
  path: "/stock/waste-log",
  kind: "read",
  action: "account.report.view",
  summary: "Waste/destruction log: goods issues with reason waste, damaged or shortage in the range, each with date, items, quantity, cost, reason, maker, approver, witness and number of photos, and a warning when witness, photo or approver is missing.",
  label: "บันทึกของเสีย/ทำลาย",
  tool: { name: "account_waste_log", hint: "Use for 'what was thrown away / destroyed / short' questions and to print the destruction report." },
  input: rangeIn,
  test: "T59-R2",
  async handler({ actor, input }) {
    const r = rangeOf(input);
    return wasteLog({ tenantId: actor.tenantId, systemId: actor.systemId }, r.from, r.to);
  },
});

const wasteEvidence = defineOp({
  id: "stock.waste-evidence",
  method: "PUT",
  path: "/stock/waste-log/{id}/evidence",
  kind: "write",
  action: "account.doc.create",
  summary: "Record the witness and inspection details of a goods issue (waste/destruction evidence). Does not change quantities or the ledger. Photos are attached as files of the document.",
  label: "บันทึกพยานของใบเบิก",
  tool: { name: "account_set_waste_evidence", hint: "Use when the owner tells who witnessed a destruction of goods. Proposed for confirmation." },
  input: z.object({ witnessName: z.string().max(200).nullable().optional(), witnessRole: z.string().max(200).nullable().optional(), inspectedAt: z.string().max(40).nullable().optional(), method: z.string().max(200).nullable().optional(), note: z.string().max(200).nullable().optional() }).strict(),
  test: "T59-W1",
  async handler({ actor, input, params }) {
    const r = await saveStockEvidence({ tenantId: actor.tenantId, systemId: actor.systemId }, params.id ?? "", input);
    if (!r.ok) throw new ApiError(404, "not_found", r.reason, "Goods issue not found.");
    return { saved: true };
  },
});

const deemedSales = defineOp({
  id: "stock.deemed-sales",
  method: "GET",
  path: "/stock/deemed-sales",
  kind: "read",
  action: "account.report.view",
  summary: "Giveaways/samples issued in the range (cost) and goods issues that count as a sale (owner personal use, unexplained shortage) with an estimated market value (product sale price, or cost when no price) and the output VAT on it. The system never books that VAT by itself; the shop setting deemedSale (WARN default / OFF) only changes whether the estimate is shown.",
  label: "ของแถม · ถือเป็นขาย",
  tool: { name: "account_deemed_sales", hint: "Use for 'do I owe VAT on goods the owner took / goods that went missing' and for the giveaway list." },
  input: rangeIn,
  test: "T59-R3",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const r = rangeOf(input);
    const [st, set] = await Promise.all([
      tenantDb(ctx).accountSettings.findFirst({ where: { systemId: ctx.systemId }, select: { vatRegistered: true, vatRateBp: true } }),
      resolveBookSettings({ tenantId: ctx.tenantId }, [ACCOUNT_SETTING_KEYS.deemedSale], ctx.systemId),
    ]);
    const mode = set[ACCOUNT_SETTING_KEYS.deemedSale]?.value === "OFF" ? "OFF" : "WARN";
    return giveawayDeemedSales(ctx, r.from, r.to, { setting: mode, vatRateBp: st?.vatRateBp ?? 700, vatRegistered: st?.vatRegistered ?? true });
  },
});

// ═══════════════ T5.10 รายได้รับล่วงหน้า · ชนิดเงินประกัน · ผู้ออกส่วนลด ═══════════════
const deferralsList = defineOp({
  id: "deferrals.list",
  method: "GET",
  path: "/deferrals",
  kind: "read",
  action: "account.journal.view",
  summary: "Deferred revenue schedules (annual memberships, courses, packages): total, start month, months, recognised so far, remaining and the month-by-month schedule with the journal entry of each posted month.",
  label: "รายได้รับล่วงหน้าทยอยรับรู้",
  tool: { name: "account_deferrals", hint: "Use for 'how much membership/course revenue is still unearned' and to see the recognition schedule." },
  input: z.object({}).strict(),
  test: "T510-R1",
  async handler({ actor }) {
    return listDeferrals({ tenantId: actor.tenantId, systemId: actor.systemId });
  },
});

const deferralsCreate = defineOp({
  id: "deferrals.create",
  method: "POST",
  path: "/deferrals",
  kind: "write",
  action: "account.journal.adjust",
  summary: "Create a deferred revenue schedule: moves the amount from the income account to unearned revenue (default account 2110) in the start month, then recognises it month by month. VAT and the tax invoice stay with the original sales document (the tax point does not move).",
  label: "ตั้งรายได้รับล่วงหน้า",
  tool: { name: "account_create_deferral", hint: "Use when the owner sold an annual membership, course or package paid in advance and wants the revenue spread over the months. Proposed for confirmation." },
  input: z.object({
    description: z.string().min(1).max(200),
    amount: z.number().int().positive().describe("Amount in satang (1 baht = 100)."),
    startMonth: month("startMonth"),
    months: z.number().int().min(1).max(120),
    incomeAccountCode: z.string().min(1).max(20).describe("Income account the sale was booked to, e.g. 4030."),
    deferredAccountCode: z.string().min(1).max(20).optional().describe("Liability account for unearned revenue. Default 2110."),
    documentId: z.string().min(1).max(60).optional(),
  }).strict(),
  test: "T510-W1",
  async handler({ actor, input }) {
    const r = await createDeferral({ tenantId: actor.tenantId, systemId: actor.systemId }, { description: input.description, totalSatang: input.amount, startMonth: input.startMonth, months: input.months, incomeAccountCode: input.incomeAccountCode, deferredAccountCode: input.deferredAccountCode ?? null, documentId: input.documentId ?? null, createdById: actorRefId(actor) });
    if (!r.ok) throw failed(r.reason);
    return { id: r.id, warnings: r.warnings };
  },
});

const deferralsRecognize = defineOp({
  id: "deferrals.recognize",
  method: "POST",
  path: "/deferrals/recognize",
  kind: "write",
  action: "account.journal.adjust",
  summary: "Post the monthly recognition entries of every active deferred revenue schedule up to and including a month. Safe to repeat: months already posted are skipped.",
  label: "รับรู้รายได้รับล่วงหน้าถึงเดือน",
  tool: { name: "account_recognize_deferrals", hint: "Use at month end to recognise the earned part of memberships/courses. Proposed for confirmation." },
  input: z.object({ upTo: month("upTo").optional().describe("Default: this month."), deferralId: z.string().min(1).max(60).optional() }).strict(),
  test: "T510-W2",
  async handler({ actor, input }) {
    return recognizeDeferrals({ tenantId: actor.tenantId, systemId: actor.systemId }, input.upTo ?? curKey(), { deferralId: input.deferralId, postedById: actorRefId(actor) });
  },
});

const deferralsCancel = defineOp({
  id: "deferrals.cancel",
  method: "POST",
  path: "/deferrals/{id}/cancel",
  kind: "write",
  action: "account.journal.adjust",
  summary: "Cancel a deferred revenue schedule: every journal entry of the schedule (setup and months recognised) is reversed, never deleted. Reason required.",
  label: "ยกเลิกรายได้รับล่วงหน้า",
  tool: { name: "account_cancel_deferral", hint: "Use when a membership/course was refunded or set up by mistake. Proposed for confirmation." },
  input: z.object({ reason: z.string().min(1).max(500) }).strict(),
  test: "T510-W3",
  async handler({ actor, input, params }) {
    const r = await cancelDeferral({ tenantId: actor.tenantId, systemId: actor.systemId }, params.id ?? "", input.reason);
    if (!r.ok) throw failed(r.reason);
    return r;
  },
});

const depositKind = defineOp({
  id: "products.deposit-kind",
  method: "PUT",
  path: "/products/{id}/deposit-kind",
  kind: "write",
  action: "account.product.manage",
  summary: "Set what kind of security deposit a product/service line is: REAL_ESTATE (room/house rent deposit, VAT exempt), SERVICE_VAT (meter, key card, parking card: VAT when received, credit note when returned), HOTEL_DAMAGE (check-in damage deposit, unverified case), NONE. Returns warnings when the product's VAT rate does not match the kind.",
  label: "ตั้งชนิดเงินประกันของสินค้า/บริการ",
  tool: { name: "account_set_deposit_kind", hint: "Use when the owner says an item is a deposit (key card, meter, room deposit). Proposed for confirmation." },
  input: z.object({ kind: z.enum(DEPOSIT_KINDS) }).strict(),
  test: "T510-W4",
  async handler({ actor, input, params }) {
    const r = await setProductDepositKind({ tenantId: actor.tenantId, systemId: actor.systemId }, params.id ?? "", input.kind);
    if (!r.ok) throw new ApiError(404, "not_found", r.reason, "Product not found.");
    return { kind: input.kind, warnings: r.warnings };
  },
});

const discountFunder = defineOp({
  id: "documents.discount-funder",
  method: "PUT",
  path: "/documents/{id}/discount-funder",
  kind: "write",
  action: "account.doc.create",
  summary: "Record who funded the discount on a document (SHOP, PLATFORM or SHARED; null clears). Information only: the VAT base is not changed; a warning is returned when a platform funded it.",
  label: "ตั้งผู้ออกส่วนลดของเอกสาร",
  tool: { name: "account_set_discount_funder", hint: "Use when a delivery/booking platform paid for the discount on a bill. Proposed for confirmation." },
  input: z.object({ funder: z.enum(DISCOUNT_FUNDERS).nullable() }).strict(),
  test: "T510-W5",
  async handler({ actor, input, params }) {
    const r = await setDiscountFunder({ tenantId: actor.tenantId, systemId: actor.systemId }, params.id ?? "", input.funder);
    if (!r.ok) throw new ApiError(404, "not_found", r.reason, "Document not found.");
    return { funder: input.funder, warnings: r.warnings };
  },
});

// ═══════════════ T5.11 หลายสาขา ═══════════════
const branchesGet = defineOp({
  id: "branches.list",
  method: "GET",
  path: "/branches",
  kind: "read",
  action: "account.report.view",
  summary: "Places of business of this book: the home branch from the company settings (00000 = head office) and the other registered branches (5-digit codes), plus the VAT return filing mode (SEPARATE default, COMBINED needs the Revenue Department's approval).",
  label: "สาขา (สถานประกอบการ)",
  tool: { name: "account_branches", hint: "Use for 'which branches does the shop have' and before issuing a document at a branch." },
  input: z.object({}).strict(),
  test: "T511-R1",
  async handler({ actor }) {
    return loadBranches({ tenantId: actor.tenantId, systemId: actor.systemId });
  },
});

const branchesSave = defineOp({
  id: "branches.update",
  method: "PUT",
  path: "/branches",
  kind: "write",
  action: "account.settings.manage",
  summary: "Replace the list of other branches (code 5 digits not 00000, name, address) and/or the VAT return filing mode. COMBINED returns 409 legal_ack_required with warning BRANCH_COMBINED_FILING until acknowledged.",
  label: "ตั้งสาขา",
  tool: { name: "account_update_branches", hint: "Use when the owner opens a branch or changes how VAT returns are filed. Proposed for confirmation." },
  input: z.object({
    branches: z.array(z.object({ code: z.string().max(5), name: z.string().max(120), address: z.string().max(300).nullable().optional() }).strict()).max(50).optional(),
    vatFilingMode: z.enum(VAT_FILING_MODES).optional(),
    acknowledge: ackIn,
    reason: z.string().max(500).optional(),
  }).strict(),
  test: "T511-W1",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const r = await saveBranches({ ...actor.membership, userId: actorRefId(actor) }, ctx, { branches: input.branches, vatFilingMode: input.vatFilingMode }, { ack: input.acknowledge, reason: input.reason });
    if (!r.ok) {
      if (r.reason === "LEGAL_ACK_REQUIRED" && r.warnings) throw legalAckApiError(r.warnings);
      throw failed(r.reason);
    }
    return { ...(await loadBranches(ctx)), warnings: r.warnings };
  },
});

const docBranch = defineOp({
  id: "documents.branch",
  method: "PUT",
  path: "/documents/{id}/branch",
  kind: "write",
  action: "account.doc.create",
  summary: "Set the place of business (branch code, 5 digits; null = home branch) that issues a DRAFT document. Its number then runs in that branch's own sequence and the branch is printed on it. Issued documents cannot change branch.",
  label: "ตั้งสาขาที่ออกเอกสาร",
  tool: { name: "account_set_document_branch", hint: "Use when a draft document should be issued by another branch. Proposed for confirmation." },
  input: z.object({ branchCode: z.string().max(5).nullable() }).strict(),
  test: "T511-W2",
  async handler({ actor, input, params }) {
    const r = await setDocumentBranch({ tenantId: actor.tenantId, systemId: actor.systemId }, params.id ?? "", input.branchCode);
    if (!r.ok) throw failed(r.reason);
    return r;
  },
});

const branchTax = defineOp({
  id: "reports.branch-tax",
  method: "GET",
  path: "/reports/branch-tax",
  kind: "read",
  action: "account.report.view",
  summary: "Sales tax and purchase tax report of ONE place of business for a tax month (rows of documents issued/received at that branch; rows without a source document belong to the home branch).",
  label: "รายงานภาษีแยกสาขา",
  tool: { name: "account_branch_tax_report", hint: "Use for the sales/purchase tax report of a single branch." },
  input: z.object({ month: month("month").optional().describe("Tax month. Default: this month."), branch: z.string().regex(/^\d{5}$/).describe("Branch code (5 digits).") }).strict(),
  test: "T511-R2",
  async handler({ actor, input }) {
    const ctx = { tenantId: actor.tenantId, systemId: actor.systemId };
    const m = input.month ?? curKey();
    const [sales, purchase] = await Promise.all([salesTaxReportForBranch(ctx, m, input.branch), purchaseTaxReportForBranch(ctx, m, input.branch)]);
    return { month: m, branch: sales.branch, sales: { header: sales.header, rows: sales.rows, total: sales.total, warnings: sales.branchWarnings }, purchase: { header: purchase.header, rows: purchase.rows, total: purchase.branchTotal } };
  },
});

export const T5B_OPS: ApiOp[] = [equity, goodsReport, wasteLogOp, wasteEvidence, deemedSales, deferralsList, deferralsCreate, deferralsRecognize, deferralsCancel, depositKind, discountFunder, branchesGet, branchesSave, docBranch, branchTax];
