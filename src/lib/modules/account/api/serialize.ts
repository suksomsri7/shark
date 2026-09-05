// serialize.ts — ตัวแปลง "ของภายใน" → "ของที่ส่งออกทาง REST" (WO B1)
//
// 🔴 กติกาเหล็ก 3 ข้อของไฟล์นี้ (ทุก op ของ B1–D4 ต้องผ่านทางนี้):
//   1) **ห้าม spread แถว prisma** — เขียนชื่อฟิลด์ทีละตัวเสมอ ต่อให้ยาว
//      เพราะ `{ ...row }` วันนี้ปลอดภัย แต่พรุ่งนี้ใครเพิ่มคอลัมน์ `internalCostBasis` ในตาราง
//      ก็จะไหลออก API ทันทีโดยไม่มีใครรู้ตัว (ของแบบนี้ไม่มีทางเห็นใน diff ของคนที่เพิ่มคอลัมน์)
//      ⇒ ห้ามมี tenantId / systemId / publicToken / keyHash / href / base / glRows ในผลลัพธ์ใด ๆ
//   2) **เงินลงท้าย `Satang` เสมอ** (จำนวนเต็ม) — ชื่อภายในหลายตัวเป็น `amount`/`grandTotal`/`balance`
//      ซึ่งอ่านแล้วเดาหน่วยไม่ได้ ⇒ เปลี่ยนชื่อตอนออกให้ผู้เรียกไม่มีทางคูณ 100 ผิด
//   3) **วันที่คือ "วันไทย" `YYYY-MM-DD"` · เวลาจริงคือ ISO** — วันที่ออกเอกสาร/ครบกำหนดเป็น "วัน"
//      ไม่ใช่ instant (ใช้ `dayKeyBkk` ตัวเดียวกับที่หน้าจอใช้ ⇒ ตัวเลขบนจอกับใน API ตรงกันเสมอ)

import type { AccountDocStatus, AccountDocType } from "@prisma/client";
import type { AttachmentView } from "@/components/account-v2/doc-editor-types";
import type {
  CashPosition,
  CategoryBreakdown,
  CategorySlice,
  DashboardSnapshot,
  DocumentsIssued,
  IssuedByType,
  MonthlySeries,
  MonthlyStatusSeries,
  PendingTasksDash,
  ReceivablePayableSummary,
  RecentDocRow,
  SideSummary,
  TopContactRow,
  TopProductRow,
  TrackedContactRow,
} from "../dashboard";
import { dayKeyBkk } from "../dashboard";
import type { DocDetailData, JvEntryView, RelatedSlot, TimelineStep } from "../doc-detail";
import type { GroupChildView } from "../group";
import type { OverviewData } from "../overview";
import type { DocPaymentRow, ListDocumentsPage } from "../service";
import { isOverdue } from "../service";

// ── วันที่/เวลา ────────────────────────────────────────────────────────────
/** วันไทย `YYYY-MM-DD` (null คงเป็น null — ไม่แปลงเป็นสตริงว่าง) */
export function ymd(d: Date | null | undefined): string | null {
  return d ? dayKeyBkk(d) : null;
}
/** instant จริง → ISO-8601 (UTC) */
export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
/** สตริงวันที่/ISO ที่ service คืนมาแล้ว → วันไทย (แถว "เอกสารล่าสุด" ของแดชบอร์ดเก็บเป็น ISO) */
function ymdOfString(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : dayKeyBkk(d);
}

const remainOf = (grandTotal: number, paidTotal: number) => Math.max(0, grandTotal - paidTotal);

// ── เอกสาร: แถวในรายการ ───────────────────────────────────────────────────
export type DocRowView = {
  id: string;
  type: AccountDocType;
  docNo: string | null;
  status: AccountDocStatus;
  issueDate: string | null;
  dueDate: string | null;
  validUntil: string | null;
  contact: { id: string; name: string } | null;
  subTotalSatang: number;
  discountSatang: number;
  vatSatang: number;
  whtSatang: number;
  grandTotalSatang: number;
  paidSatang: number;
  remainSatang: number;
  overdue: boolean;
  tags: string[];
  source: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export function docRow(d: ListDocumentsPage["rows"][number]): DocRowView {
  return {
    id: d.id,
    type: d.docType,
    docNo: d.docNo,
    status: d.status,
    issueDate: ymd(d.issueDate),
    dueDate: ymd(d.dueDate),
    validUntil: ymd(d.validUntil),
    contact: d.contact ? { id: d.contact.id, name: d.contact.name } : null,
    subTotalSatang: d.subTotal,
    discountSatang: d.discountAmount,
    vatSatang: d.vatAmount,
    whtSatang: d.whtAmount,
    grandTotalSatang: d.grandTotal,
    paidSatang: d.paidTotal,
    remainSatang: remainOf(d.grandTotal, d.paidTotal),
    // นิยามเดียวกับหน้ารายการ/รายงานอายุหนี้ (service.isOverdue) — ไม่คิดสูตรที่สอง
    overdue: isOverdue({ status: d.status, dueDate: d.dueDate, validUntil: d.validUntil }),
    tags: [...d.tags],
    source: d.source,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

// ── เอกสาร: หน้ารายละเอียด ─────────────────────────────────────────────────
export function attachmentView(a: AttachmentView) {
  return { id: a.id, fileName: a.fileName, mime: a.mimeType, sizeBytes: a.sizeBytes, url: a.fileUrl };
}

function paymentView(p: DocPaymentRow) {
  return {
    id: p.id,
    paidAt: iso(p.paidAt),
    channel: p.channel as string,
    financeAccount: p.financeAccountId ? { id: p.financeAccountId, name: p.financeName } : null,
    amountSatang: p.amount,
    whtSatang: p.whtAmount,
    feeSatang: p.feeAmount,
    note: p.note,
    chequeNo: p.chequeNo,
    certNo: p.certNo,
    voidedAt: iso(p.voidedAt),
  };
}

function relatedView(r: RelatedSlot) {
  return {
    kind: r.kind,
    label: r.label,
    doc: r.doc ? { id: r.doc.id, type: r.doc.docType, docNo: r.doc.docNo, status: r.doc.status } : null,
  };
}

function timelineView(t: TimelineStep) {
  return { code: t.code, label: t.label, date: iso(t.date), note: t.note ?? null, state: t.state };
}

function jvView(j: JvEntryView) {
  return {
    id: j.id,
    // ชื่อฟิลด์ในสัญญาเรียก "เลขที่สมุดรายวัน" ให้ต่างจาก `docNo` ของเอกสารการค้า (คนละเลขคนละชุด)
    journalNo: j.docNo,
    date: ymd(j.date),
    book: j.book,
    memo: j.memo,
    status: j.status,
    needsReview: j.needsReview,
    lines: j.lines.map((l) => ({
      accountCode: l.accountCode,
      accountName: l.accountName,
      debitSatang: l.debit,
      creditSatang: l.credit,
    })),
  };
}

function groupChildView(c: GroupChildView) {
  return {
    id: c.id,
    type: c.docType,
    docNo: c.docNo,
    issueDate: c.issueDate,
    dueDate: c.dueDate,
    status: c.status,
    grandTotalSatang: c.grandTotal,
    remainSatang: c.outstanding,
    whtBaseSatang: c.whtBaseSatang,
  };
}

/** เอกสาร 1 ใบเต็มรูป — ตัด `auditLogs` (มี endpoint แยก) · `publicToken` · `paymentRequests` (ลิงก์จ่ายเงิน) ทิ้ง */
export function docDetail(d: DocDetailData) {
  return {
    id: d.id,
    type: d.docType,
    docNo: d.docNo,
    status: d.status,
    label: d.label,
    createdAt: iso(d.createdAt),
    issueDate: ymd(d.issueDate),
    dueDate: ymd(d.dueDate),
    validUntil: ymd(d.validUntil),
    contact: d.contact
      ? { id: d.contact.id, name: d.contact.name, taxId: d.contact.taxId, email: d.contact.email }
      : null,
    lines: d.lines.map((l) => ({
      id: l.id,
      description: l.description,
      qty: l.qty,
      unitName: l.unitName,
      unitPriceSatang: l.unitPrice,
      discountSatang: l.discount,
      vatRateBp: l.vatRateBp,
      amountSatang: l.amount,
      account: l.account ? { code: l.account.code, name: l.account.name } : null,
    })),
    subTotalSatang: d.subTotal,
    discountSatang: d.discountAmount,
    vatSatang: d.vatAmount,
    whtSatang: d.whtAmount,
    depositDeductedSatang: d.depositDeducted,
    grandTotalSatang: d.grandTotal,
    paidSatang: d.paidTotal,
    remainSatang: d.remain,
    note: d.note,
    internalNote: d.internalNote,
    tags: [...d.tags],
    overdue: d.overdue,
    payments: d.payments.map(paymentView),
    related: d.related.map(relatedView),
    timeline: d.timeline.map(timelineView),
    jv: d.jv.map(jvView),
    attachments: d.attachments.map(attachmentView),
    groupChildren: d.groupChildren ? d.groupChildren.map(groupChildView) : null,
  };
}

// ── แดชบอร์ด ──────────────────────────────────────────────────────────────
function sideSummaryView(s: SideSummary) {
  return {
    count: s.count,
    amountSatang: s.amount,
    overdueCount: s.overdueCount,
    overdueAmountSatang: s.overdueAmount,
    contactCount: s.contactCount,
    // aging ลงท้าย Satang อยู่แล้วในชั้น service (reports.ts) — คัดลอกทีละช่องเพื่อคงกติกา "ห้าม spread"
    aging: {
      notDueSatang: s.aging.notDueSatang,
      d1_30Satang: s.aging.d1_30Satang,
      d31_60Satang: s.aging.d31_60Satang,
      d61_90Satang: s.aging.d61_90Satang,
      d90plusSatang: s.aging.d90plusSatang,
      totalSatang: s.aging.totalSatang,
    },
  };
}

function arapView(a: ReceivablePayableSummary) {
  return { asOf: a.asOf, receivable: sideSummaryView(a.receivable), payable: sideSummaryView(a.payable) };
}

function categorySliceView(c: CategorySlice) {
  return { accountCode: c.accountCode, name: c.name, amountSatang: c.amount, shareBp: c.shareBp };
}

function breakdownView(b: CategoryBreakdown) {
  return { periodKey: b.periodKey, kind: b.kind, totalSatang: b.total, rows: b.rows.map(categorySliceView) };
}

function categoryTotalView(t: { total: number; rows: CategorySlice[] }) {
  return { totalSatang: t.total, rows: t.rows.map(categorySliceView) };
}

function cashView(c: CashPosition) {
  return {
    totalSatang: c.total,
    periodKey: c.periodKey,
    accounts: c.accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      balanceSatang: a.balance,
      monthDeltaSatang: a.monthDelta,
      pinned: a.pinned,
      bankName: a.bankName,
      accountNo: a.accountNo,
      bankSubtype: a.bankSubtype,
      limitSatang: a.limitSatang,
    })),
  };
}

function issuedView(i: DocumentsIssued) {
  return {
    type: i.docType,
    label: i.label,
    from: i.from,
    to: i.to,
    total: { count: i.total.count, amountSatang: i.total.amount },
    rows: i.rows.map((r) => ({ key: r.key, label: r.label, count: r.count, amountSatang: r.amount, shareBp: r.shareBp })),
  };
}

function pendingView(p: PendingTasksDash) {
  return {
    quotationAwaitingAccept: p.quotationAwaitingAccept,
    poAwaitingApproval: p.poAwaitingApproval,
    depositAwaitingDeduct: p.depositAwaitingDeduct,
    needsReview: p.needsReview,
    purchaseTaxAwaiting: p.purchaseTaxAwaiting,
    recurringDraftsAwaiting: p.recurringDraftsAwaiting,
    total: p.total,
  };
}

function recentView(r: RecentDocRow) {
  return {
    id: r.id,
    type: r.docType,
    typeLabel: r.docTypeLabel,
    docNo: r.docNo,
    direction: r.direction,
    status: r.status,
    statusLabel: r.statusLabel,
    contactId: r.contactId,
    contactName: r.contactName,
    grandTotalSatang: r.grandTotal,
    issueDate: r.issueDate,
    dueDate: ymdOfString(r.dueDate),
    validUntil: ymdOfString(r.validUntil),
    updatedAt: r.updatedAt,
  };
}

function topContactView(t: TopContactRow) {
  return { contactId: t.contactId, name: t.name, docCount: t.docCount, amountSatang: t.amount };
}

function topProductView(t: TopProductRow) {
  return { productId: t.productId, name: t.name, qty: t.qty, amountSatang: t.amount };
}

function trackedView(t: TrackedContactRow) {
  return { contactId: t.contactId, name: t.name, outstandingSatang: t.outstanding, count: t.count };
}

/**
 * ก้อนแดชบอร์ด → JSON ของ API
 * ตัดทิ้งโดยตั้งใจ: `glRows` (บรรทัดบัญชีดิบเป็นหมื่นแถว — มี endpoint บัญชีแยกใน B4) ·
 * `queryCount` (ตัวเลขวัดผลภายใน) · `calendar` (ไม่ได้เปิดในเส้นทางนี้) · `series`
 * (มี `GET /dashboard/series` ของตัวเองแล้ว — ไม่ส่งซ้ำให้ payload บวมทุกครั้งที่เปิดหน้า)
 */
export function dashboardView(s: DashboardSnapshot) {
  return {
    asOf: s.asOf,
    periodKey: s.periodKey,
    year: s.year,
    kpi: {
      receivable: { count: s.kpi.receivable.count, amountSatang: s.kpi.receivable.amount },
      payable: { count: s.kpi.payable.count, amountSatang: s.kpi.payable.amount },
      // ไทล์ "พ้นกำหนด" บนหน้าจอโชว์ยอดรวม 2 ฝั่ง — API คืนยอดรวม **พร้อมตัวแยก** เพราะผู้เรียกส่วนใหญ่
      // (ทวงหนี้ = ฝั่งรับ · ตั้งจ่าย = ฝั่งจ่าย) ต้องการคนละฝั่ง และแยกเองจากยอดรวมไม่ได้
      // ตัวแยกมาจากก้อน `arap` ของ snapshot เดียวกัน ⇒ ไม่มี query เพิ่มแม้แต่คำสั่งเดียว
      overdue: {
        count: s.kpi.overdue.count,
        amountSatang: s.kpi.overdue.amount,
        receivable: { count: s.arap.receivable.overdueCount, amountSatang: s.arap.receivable.overdueAmount },
        payable: { count: s.arap.payable.overdueCount, amountSatang: s.arap.payable.overdueAmount },
      },
      cashTotalSatang: s.kpi.cashTotal,
    },
    arap: arapView(s.arap),
    income: breakdownView(s.income),
    expense: breakdownView(s.expense),
    cash: cashView(s.cash),
    issued: issuedView(s.issued),
    pending: pendingView(s.pending),
    recent: s.recent.map(recentView),
    topCustomers: s.topCustomers.map(topContactView),
    topProducts: s.topProducts.map(topProductView),
    topVendors: s.topVendors.map(topContactView),
    topExpenseCategories: categoryTotalView(s.topExpenseCategories),
  };
}

/** รายได้/ค่าใช้จ่าย/กำไร 12 เดือน + เทียบปีก่อน */
export function seriesView(m: MonthlySeries) {
  const totals = (t: { revenue: number; expense: number; profit: number }) => ({
    revenueSatang: t.revenue,
    expenseSatang: t.expense,
    profitSatang: t.profit,
  });
  return {
    year: m.year,
    months: m.months.map((p) => ({
      period: p.periodKey,
      incomeSatang: p.revenue,
      expenseSatang: p.expense,
      profitSatang: p.profit,
    })),
    total: totals(m.total),
    prevYear: totals(m.prevYear),
    yoyBp: { revenue: m.yoyBp.revenue, expense: m.yoyBp.expense, profit: m.yoyBp.profit },
  };
}

// ── ภาพรวมรายรับ/รายจ่าย ──────────────────────────────────────────────────
function statusSeriesView(s: MonthlyStatusSeries) {
  return {
    side: s.side,
    year: s.year,
    months: s.months.map((m) => ({
      period: m.periodKey,
      paidSatang: m.paid,
      awaitingSatang: m.awaiting,
      overdueSatang: m.overdue,
      paidCount: m.paidCount,
      awaitingCount: m.awaitingCount,
      overdueCount: m.overdueCount,
    })),
    total: {
      paidSatang: s.total.paid,
      awaitingSatang: s.total.awaiting,
      overdueSatang: s.total.overdue,
      paidCount: s.total.paidCount,
      awaitingCount: s.total.awaitingCount,
      overdueCount: s.total.overdueCount,
      grandSatang: s.total.grand,
      grandCount: s.total.grandCount,
    },
  };
}

function issuedByTypeView(i: IssuedByType) {
  return {
    side: i.side,
    from: i.from,
    to: i.to,
    total: { count: i.total.count, amountSatang: i.total.amount },
    rows: i.rows.map((r) => ({
      type: r.docType,
      label: r.label,
      count: r.count,
      amountSatang: r.amount,
      shareBp: r.shareBp,
    })),
  };
}

/** หน้า "ดูภาพรวม" → JSON · ตัด `base` (ที่อยู่ของหน้าเว็บ) · `now` · `queryCount` ทิ้ง */
export function overviewView(o: OverviewData) {
  return {
    side: o.side,
    params: { year: o.params.year, chartPeriod: o.params.chartPeriod, issuedRange: o.params.issuedRange },
    series: statusSeriesView(o.series),
    issued: issuedByTypeView(o.issued),
    issuedRangeLabel: o.issuedRangeLabel,
    topCustomers: o.topCustomers.map(topContactView),
    topVendors: o.topVendors.map(topContactView),
    topProducts: o.topProducts.map(topProductView),
    topIncomeCategories: categoryTotalView(o.topIncomeCategories),
    topExpenseCategories: categoryTotalView(o.topExpenseCategories),
    tracked: o.tracked.map(trackedView),
  };
}
