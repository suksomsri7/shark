// serialize-gl.ts — ตัวแปลง "ของภายใน" → "ของที่ส่งออกทาง REST" ของบัญชี/งบ/งวด/สินทรัพย์/ตั้งค่า (WO B4)
//
// กติกาเหมือน `serialize.ts` ของ B1 เป๊ะ (อ่านหัวไฟล์นั้นก่อนแก้ที่นี่):
//   1) ห้าม spread แถว prisma / แถว service — เขียนชื่อฟิลด์ทีละตัวเสมอ
//      (ห้ามมี tenantId · systemId · keyHash · href หลุดออก — แถวสมุดรายวัน/การ์ดเชื่อมต่อมี `href`
//       ของหน้าจอติดมาด้วย ⇒ ต้องแปลงเป็น `ref{type,id,docNo}` ไม่ใช่ส่งของหน้าจอออกไปตรง ๆ)
//   2) เงินลงท้าย `Satang` เสมอ (จำนวนเต็ม)
//   3) วันที่ = วันไทย `YYYY-MM-DD` ผ่าน `ymd()` · เวลาจริง = ISO ผ่าน `iso()`
//
// 🔴 งบการเงินคือ "ตัวเลขที่คนเอาไปยื่นสรรพากร" — ที่นี่ **เปลี่ยนได้แค่ชื่อฟิลด์/หน่วยเวลา** ห้ามคำนวณซ้ำ
//    (ยอดรวม/ยอดสมดุลมาจาก reports.ts ตัวเดียว ⇒ ตัวเลขบนหน้าจอกับใน API ไม่มีทางเดินคนละทาง)

import type { AccountLedgerType } from "@prisma/client";
import type { AuditLogRow } from "../access";
import type { AttachmentRowView } from "../attachment";
import type { AssetRow } from "../asset";
import { nextDepreciationAmount } from "../asset";
import type { AssetDetail, DepreciationPreview } from "../asset-v2";
import type { ChartAccountNode, ChartGroupNode, ChartNode, ChartTree, LedgerDetail } from "../coa-v2";
import { flattenChart } from "../coa-v2";
import type { ConnectionCard, ToggleKey } from "../connections";
import type { DocNumberingRow, DocTypeAccountRow } from "../doc-settings";
import type { GeneralLedger, JournalEntryDetail, JournalListRow } from "../journal-v2";
import type { PeriodChecklist, PeriodRow } from "../period-close";
import type { AccountPolicy } from "../policy";
import type { AgingReport, BalanceSheet, CashFlow, CashFlowSection, Pp30, Pp30Side, ProfitLoss, TrialBalance } from "../reports";
import type { AccountSettingsView } from "../service";
import type { DocSettings } from "../settings-schema";
import { iso, ymd } from "./serialize";

// ── ผังบัญชี ────────────────────────────────────────────────────────────────

/** ข้อมูลบัญชีที่ต้นไม้ไม่ได้พกมา (มาจากแถว AccountLedger ตรง ๆ) */
export type LedgerMetaRow = {
  id: string;
  parentId: string | null;
  level: number | null;
  vatTreatment: string | null;
  defaultWhtRateBp: number | null;
  defaultWhtType: string | null;
};

function whtDefaultView(rateBp: number | null, type: string | null) {
  return rateBp === null && type === null ? null : { rateBp, type };
}

/** แถวบัญชีแบบแบน — ผู้เรียก REST ส่วนใหญ่อยากได้ตารางไม่ใช่ต้นไม้ */
export function chartAccountRow(a: ChartAccountNode, meta: LedgerMetaRow | undefined) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    nameEn: a.nameEn,
    type: a.type,
    parentId: meta?.parentId ?? null,
    level: meta?.level ?? a.level,
    isSystem: a.isSystem,
    active: !a.archived,
    balanceSatang: a.balanceSatang,
    vatTreatment: meta?.vatTreatment ?? null,
    whtDefault: whtDefaultView(meta?.defaultWhtRateBp ?? null, meta?.defaultWhtType ?? null),
  };
}

/**
 * แถวบัญชีแบบแบน **หน้าตาเดียวกับ `chart.list`** แต่ประกอบจากรายละเอียดบัญชีตัวเดียว (WO D2)
 * ⇒ ผู้เรียกที่เพิ่งสร้าง/แก้บัญชีได้ของหน้าตาเดิมกับตอนไปอ่านทีหลัง ไม่ต้องแปลงสองแบบ
 * `meta` = แถว AccountLedger จริง (ต้นไม้ผังบัญชีไม่ได้พก parentId/level มา)
 */
export function chartRowView(d: LedgerDetail, meta: { parentId: string | null; level: number | null } | undefined) {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    nameEn: d.nameEn,
    type: d.type,
    parentId: meta?.parentId ?? null,
    level: meta?.level ?? null,
    isSystem: d.isSystem,
    active: !d.archivedAt,
    balanceSatang: d.balanceSatang,
    vatTreatment: d.vatTreatment,
    whtDefault: whtDefaultView(d.defaultWhtRateBp, d.defaultWhtType),
  };
}

function chartNodeView(n: ChartNode): Record<string, unknown> {
  if (n.kind === "account") {
    return {
      kind: "account",
      id: n.id,
      level: n.level,
      code: n.code,
      name: n.name,
      nameEn: n.nameEn,
      type: n.type,
      isSystem: n.isSystem,
      active: !n.archived,
      balanceSatang: n.balanceSatang,
    };
  }
  return {
    kind: "group",
    level: n.level,
    code: n.code,
    name: n.name,
    count: n.count,
    children: n.children.map(chartNodeView),
  };
}

export function chartView(tree: ChartTree, metaById: Map<string, LedgerMetaRow>) {
  const accounts = flattenChart(tree).map((x) => chartAccountRow(x.account, metaById.get(x.account.id)));
  const totalsByType: Record<string, number> = {};
  for (const a of accounts) totalsByType[a.type] = (totalsByType[a.type] ?? 0) + a.balanceSatang;
  return {
    accounts,
    tree: (tree.nodes as ChartGroupNode[]).map(chartNodeView),
    totalsByType,
    total: tree.total,
    grandTotal: tree.grandTotal,
  };
}

export function ledgerDetailView(d: LedgerDetail, mappings: { key: string; label: string }[]) {
  return {
    account: {
      id: d.id,
      code: d.code,
      name: d.name,
      nameEn: d.nameEn,
      type: d.type,
      typeLabel: d.typeLabel,
      isSystem: d.isSystem,
      active: !d.archivedAt,
      description: d.description,
      vatTreatment: d.vatTreatment,
      whtDefault: whtDefaultView(d.defaultWhtRateBp, d.defaultWhtType),
      group1: d.group1,
      group2: d.group2,
      group3: d.group3,
    },
    asOf: ymd(d.asOf),
    balanceSatang: d.balanceSatang,
    monthMovement: {
      period: d.monthKey,
      debitSatang: d.monthDebitSatang,
      creditSatang: d.monthCreditSatang,
      netSatang: d.monthDeltaSatang,
    },
    recentLines: d.movements.map((m) => ({
      entryId: m.entryId,
      date: ymd(m.date),
      journalNo: m.docNo,
      memo: m.memo,
      debitSatang: m.debit,
      creditSatang: m.credit,
      balanceSatang: m.runningSatang,
    })),
    mappings,
    financeAccounts: d.finance ? [{ id: d.finance.id, code: d.finance.code, name: d.finance.name }] : [],
    journalLineCount: d.usage.journalLines,
    docLineCount: d.usage.docLines,
    canArchive: d.blockReason === null,
    archiveBlockReason: d.blockReason,
  };
}

export function mappingView(m: { key: string; account: { code: string; name: string } | null; accountId: string | null }, label: string) {
  return {
    key: m.key,
    label,
    account: m.account && m.accountId ? { id: m.accountId, code: m.account.code, name: m.account.name } : null,
  };
}

export function docTypeAccountView(r: DocTypeAccountRow, label: string) {
  return {
    docType: r.docType,
    label,
    account: r.accountId ? { id: r.accountId, code: r.code, name: r.name } : null,
  };
}

// ── สมุดรายวัน ──────────────────────────────────────────────────────────────

/** อ้างอิงเอกสารต้นทาง — ห้ามส่ง `href` ของหน้าจอออก API */
function refView(refType: string | null, refId: string | null, docNo: string | null) {
  return refType && refId ? { type: refType, id: refId, docNo } : null;
}

export function journalRow(r: JournalListRow) {
  return {
    id: r.id,
    journalNo: r.docNo,
    date: ymd(r.date),
    period: r.periodKey,
    book: r.book,
    bookLabel: r.bookLabel,
    journal: r.journal,
    memo: r.memo,
    status: r.status,
    needsReview: r.needsReview,
    flagNote: r.flagNote,
    source: r.source,
    debitSatang: r.totalDebit,
    creditSatang: r.totalCredit,
    ref: refView(r.refType, r.refId, r.refDocNo),
  };
}

function journalLineView(l: JournalEntryDetail["lines"][number]) {
  return {
    id: l.id,
    account: { id: l.accountId, code: l.code, name: l.name },
    debitSatang: l.debit,
    creditSatang: l.credit,
    memo: l.note,
    contactName: l.contactName,
    suspense: l.suspense,
  };
}

export function journalDetail(d: JournalEntryDetail) {
  return {
    ...journalRow(d),
    reversal: d.reversedBy ? { id: d.reversedBy.id, journalNo: d.reversedBy.docNo } : null,
    reversalOf: d.reversalOf ? { id: d.reversalOf.id, journalNo: d.reversalOf.docNo } : null,
    lines: d.lines.map(journalLineView),
    createdBy: d.postedById ? { id: d.postedById, name: d.postedByName } : null,
    attachments: d.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      url: a.fileUrl,
      mime: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
  };
}

// ── บัญชีแยกประเภท ──────────────────────────────────────────────────────────

export function generalLedgerView(g: GeneralLedger) {
  const account = g.account;
  return {
    account: account && { id: account.id, code: account.code, name: account.name, type: account.type },
    from: ymd(g.from),
    to: ymd(g.to),
    openingSatang: g.opening,
    rows: g.rows.map((r) => ({
      entryId: r.entryId,
      lineId: r.id,
      date: ymd(r.date),
      journalNo: r.docNo,
      memo: r.memo,
      ref: refView(r.refType, r.refId, null),
      reversed: r.reversed,
      debitSatang: r.debit,
      creditSatang: r.credit,
      balanceSatang: r.running,
    })),
    movement: { debitSatang: g.movementDebit, creditSatang: g.movementCredit },
    closingSatang: g.closing,
  };
}

// ── งบการเงิน ───────────────────────────────────────────────────────────────

export function trialBalanceView(tb: TrialBalance) {
  const t = tb.totals;
  return {
    from: tb.from,
    to: tb.to,
    rows: tb.rows.map((r) => ({
      code: r.code,
      name: r.name,
      type: r.type,
      openingDebitSatang: r.openingDebit,
      openingCreditSatang: r.openingCredit,
      movementDebitSatang: r.movementDebit,
      movementCreditSatang: r.movementCredit,
      closingDebitSatang: r.closingDebit,
      closingCreditSatang: r.closingCredit,
    })),
    totals: {
      openingDebitSatang: t.openingDebit,
      openingCreditSatang: t.openingCredit,
      movementDebitSatang: t.movementDebit,
      movementCreditSatang: t.movementCredit,
      closingDebitSatang: t.closingDebit,
      closingCreditSatang: t.closingCredit,
    },
    balanced: tb.balanced,
  };
}

function plSectionView(s: { rows: { code: string; name: string; amount: number }[]; total: number }) {
  return {
    rows: s.rows.map((r) => ({ code: r.code, name: r.name, amountSatang: r.amount })),
    totalSatang: s.total,
  };
}

function plCoreView(p: Pick<ProfitLoss, "income" | "cogs" | "expense" | "grossProfit" | "netProfit">) {
  return {
    revenue: plSectionView(p.income),
    cogs: plSectionView(p.cogs),
    expenses: plSectionView(p.expense),
    grossProfitSatang: p.grossProfit,
    netProfitSatang: p.netProfit,
  };
}

export function profitLossView(p: ProfitLoss) {
  return {
    from: p.from,
    to: p.to,
    ...plCoreView(p),
    compare: p.compare ? { from: p.compare.from, to: p.compare.to, ...plCoreView(p.compare) } : null,
  };
}

function bsSectionView(s: { rows: { code: string; name: string; amount: number }[]; total: number }) {
  return {
    rows: s.rows.map((r) => ({ code: r.code, name: r.name, amountSatang: r.amount })),
    totalSatang: s.total,
  };
}

export function balanceSheetView(b: BalanceSheet) {
  return {
    asOf: b.asOf,
    fiscalYearStart: b.fiscalYearStartKey,
    assets: bsSectionView(b.assets),
    liabilities: bsSectionView(b.liabilities),
    equity: bsSectionView(b.equity),
    retainedEarningsSatang: b.retainedEarnings,
    currentPeriodProfitSatang: b.currentPeriodProfit,
    totalEquitySatang: b.totalEquity,
    totalLiabilitiesEquitySatang: b.totalLiabilitiesEquity,
    balanced: b.balanced,
  };
}

function cashFlowSectionView(s: CashFlowSection) {
  return {
    activity: s.activity,
    rows: s.lines.map((l) => ({ code: l.code, name: l.name, amountSatang: l.amount })),
    inflowSatang: s.inflow,
    outflowSatang: s.outflow,
    totalSatang: s.net,
  };
}

export function cashFlowView(c: CashFlow) {
  return {
    from: c.from,
    to: c.to,
    openingCashSatang: c.openingCash,
    operating: cashFlowSectionView(c.operating),
    investing: cashFlowSectionView(c.investing),
    financing: cashFlowSectionView(c.financing),
    /** true = มีบัญชีคู่ที่ยังไม่จัดกิจกรรม (นับรวมใน operating ไปก่อน — ต้องเคลียร์ก่อนปิดงวด) */
    unclassified: c.hasUnclassified,
    netChangeSatang: c.netChange,
    closingCashSatang: c.closingCash,
    reconciled: c.reconciled,
  };
}

function pp30SideView(s: Pp30Side) {
  return {
    baseSatang: s.base,
    vatSatang: s.total,
    rows: s.rows.map((r) => ({
      docNo: r.docNo,
      date: ymd(r.date),
      contactName: r.contactName,
      taxId: r.taxId,
      branchCode: r.branchCode,
      baseSatang: r.base,
      vatSatang: r.vat,
      rateBp: r.rateBp,
    })),
    byRate: s.byRate.map((g) => ({ rateBp: g.rateBp, baseSatang: g.base, vatSatang: g.vat })),
  };
}

export function pp30View(r: Pp30) {
  return {
    period: r.periodKey,
    output: pp30SideView(r.output),
    input: pp30SideView(r.input),
    carryForwardSatang: r.carryForward,
    netPayableSatang: r.netPayable,
    creditCarrySatang: r.creditCarry,
  };
}

/** ชื่อ bucket ของ API (สั้น อ่านง่าย) ← ชื่อภายในที่ลงท้าย Satang */
function bucketsView(b: {
  notDueSatang: number;
  d1_30Satang: number;
  d31_60Satang: number;
  d61_90Satang: number;
  d90plusSatang: number;
}) {
  return {
    current: b.notDueSatang,
    d1_30: b.d1_30Satang,
    d31_60: b.d31_60Satang,
    d61_90: b.d61_90Satang,
    d90plus: b.d90plusSatang,
  };
}

export function agingView(r: AgingReport, direction: "AR" | "AP", asOf: Date) {
  const countOf = (contactId: string | null) => r.docCounts.get(contactId ?? "__none__") ?? { docs: 0, overdueDocs: 0 };
  let docs = 0;
  let overdueDocs = 0;
  for (const c of r.docCounts.values()) {
    docs += c.docs;
    overdueDocs += c.overdueDocs;
  }
  return {
    asOf: ymd(asOf),
    direction,
    rows: r.rows.map((row) => {
      const c = countOf(row.contactId);
      return {
        contact: row.contactId ? { id: row.contactId, name: row.contactName } : null,
        buckets: bucketsView(row),
        totalSatang: row.totalSatang,
        docs: c.docs,
        overdueDocs: c.overdueDocs,
      };
    }),
    grand: { buckets: bucketsView(r.grand), totalSatang: r.grand.totalSatang, docs, overdueDocs },
  };
}

// ── งวดบัญชี ────────────────────────────────────────────────────────────────

export function periodRowView(p: PeriodRow, vatFiled: boolean) {
  return {
    period: p.periodKey,
    label: p.label,
    status: p.status,
    entryCount: p.entryCount,
    closedAt: iso(p.closedAt),
    closedBy: p.closedById ? { id: p.closedById, name: p.closedByName } : null,
    reopenedAt: iso(p.reopenedAt),
    reopenCount: p.reopenCount,
    vatFiled,
    isCurrent: p.isCurrent,
  };
}

export function checklistView(c: PeriodChecklist) {
  const items = c.items.map((i) => ({
    key: i.key,
    label: i.label,
    ok: i.state === "PASS",
    blocking: i.blocking,
    state: i.state,
    detail: i.detail,
  }));
  const blocker = items.find((i) => i.blocking && !i.ok);
  return {
    period: c.periodKey,
    items,
    canClose: c.canClose,
    warnings: c.warnings,
    blockReason: blocker ? `${blocker.label} — ${blocker.detail}` : null,
  };
}

// ── สินทรัพย์ถาวร ───────────────────────────────────────────────────────────

const ledgerRefView = (l: { id: string; code: string; name: string } | null) =>
  l ? { id: l.id, code: l.code, name: l.name } : null;

export function assetRowView(a: AssetRow) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    status: a.status,
    acquiredAt: ymd(a.acquiredDate),
    startDepreciationAt: ymd(a.startDepDate),
    costSatang: a.cost,
    salvageValueSatang: a.salvageValue,
    usefulLifeMonths: a.usefulLifeMonths,
    monthlySatang: nextDepreciationAmount({
      cost: a.cost,
      salvageValue: a.salvageValue,
      usefulLifeMonths: a.usefulLifeMonths,
      monthsDepreciated: a.monthsDepreciated,
      accumDepreciation: a.accumDepreciation,
    }),
    periodsPosted: a.monthsDepreciated,
    accumDepreciationSatang: a.accumDepreciation,
    netBookValueSatang: a.netBookValue,
    disposedAt: ymd(a.disposedAt),
    disposalAmountSatang: a.disposalAmount,
    accounts: {
      asset: ledgerRefView(a.accounts.asset),
      accum: ledgerRefView(a.accounts.accum),
      expense: ledgerRefView(a.accounts.expense),
    },
  };
}

export function assetDetailView(d: AssetDetail) {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    category: d.category,
    status: d.status,
    statusLabel: d.statusLabel,
    acquiredAt: ymd(d.acquiredDate),
    startDepreciationAt: ymd(d.startDepDate),
    costSatang: d.cost,
    salvageValueSatang: d.salvageValue,
    usefulLifeMonths: d.usefulLifeMonths,
    monthlySatang: d.nextAmount,
    periodsPosted: d.monthsDepreciated,
    accumDepreciationSatang: d.accumDepreciation,
    netBookValueSatang: d.netBookValue,
    note: d.note,
    disposedAt: ymd(d.disposedAt),
    disposalMethod: d.disposalMethod,
    disposalAmountSatang: d.disposalAmount,
    accounts: {
      asset: ledgerRefView(d.accounts.asset),
      accum: ledgerRefView(d.accounts.accum),
      expense: ledgerRefView(d.accounts.expense),
    },
    sourceDocument: d.sourceDocument
      ? { id: d.sourceDocument.id, docNo: d.sourceDocument.docNo, type: d.sourceDocument.docType }
      : null,
    depreciations: d.rows.map((r) => ({
      period: r.periodKey,
      amountSatang: r.amount,
      journalNo: r.entryDocNo,
      entryId: r.entryId,
      accumAfterSatang: r.accumAfter,
      netBookAfterSatang: r.netBookAfter,
    })),
  };
}

export function depreciationPreviewView(p: DepreciationPreview) {
  return {
    period: p.periodKey,
    rows: p.rows.map((r) => ({
      assetId: r.assetId,
      code: r.code,
      name: r.name,
      amountSatang: r.amount,
      alreadyPosted: r.alreadyPosted,
      skipReason: r.skipReason,
    })),
    totalSatang: p.totalAmount,
    postableCount: p.postableCount,
    alreadyPostedCount: p.alreadyPostedCount,
  };
}

// ── ประวัติการแก้ไข ─────────────────────────────────────────────────────────

export function auditRowView(l: AuditLogRow) {
  return {
    id: l.id,
    at: iso(l.createdAt),
    actorType: l.actorType,
    actor: l.actorId ? { id: l.actorId, name: l.actorName } : null,
    action: l.action,
    actionLabel: l.actionLabel,
    targetType: l.targetType,
    targetId: l.targetId,
    before: l.before ?? null,
    after: l.after ?? null,
  };
}

// ── ตั้งค่า / นโยบาย / เอกสาร / การเชื่อมต่อ ─────────────────────────────────

/**
 * ข้อมูลกิจการที่พิมพ์บนเอกสารได้ — **ไม่มี** ตราประทับ/ลายเซ็น (ภาพลายเซ็นจริงของเจ้าของกิจการ
 * ไม่ใช่ของที่ API คีย์ระดับ `doc.view` ควรหยิบไปได้) และไม่มีบล็อกนโยบาย/เลขบัญชีธนาคาร
 */
export function settingsView(s: AccountSettingsView) {
  return {
    orgName: s.orgName,
    legalName: s.orgPrefix ? `${s.orgPrefix}${s.orgName}` : s.orgName,
    taxId: s.taxId,
    branchCode: s.branchCode,
    branchName: s.branchName,
    address: s.address,
    phone: s.phone,
    email: s.email,
    website: s.website,
    vatRegistered: s.vatRegistered,
    vatRateBp: s.vatRateBp,
    taxPointBasis: s.taxPointBasis,
    fiscalYearStartMonth: s.policy.fiscalYearStartMonth,
    currency: "THB",
    logoUrl: s.logoUrl,
  };
}

export function policyView(p: AccountPolicy) {
  return {
    fiscalYearStartMonth: p.fiscalYearStartMonth,
    periodCloseDay: p.periodCloseDay,
    vatRegistered: p.vatRegistered,
    vatRateBp: p.vatRateBp,
    vatTiming: p.vatTiming,
    defaultPriceMode: p.defaultPriceMode,
    lockBeforeDate: ymd(p.lockBeforeDate),
    dupContactPolicy: p.dupContactPolicy,
    dupProductPolicy: p.dupProductPolicy,
    defaultSalesAccountCode: p.defaultSalesAccountCode,
    defaultPurchaseAccountCode: p.defaultPurchaseAccountCode,
    defaultExpenseAccountCode: p.defaultExpenseAccountCode,
    convertQtTo: p.convertQtTo,
    convertPoTo: p.convertPoTo,
    copyNotesOnConvert: p.copyNotesOnConvert,
    copyTagsOnConvert: p.copyTagsOnConvert,
    autoClosePeriods: p.autoClosePeriods,
    autoCloseNotify: p.autoCloseNotify,
    emailReportDaily: p.emailReportDaily,
    emailReportWeekly: p.emailReportWeekly,
    emailReportRecipients: p.emailReportRecipients,
    whtDefaults: p.whtDefaults.map((w) => ({ ...w })),
    regularCustomer: {
      minPaidDocs: p.regularCustomer.minPaidDocs,
      minPaidTotalSatang: p.regularCustomer.minPaidTotalSatang,
      periodMonths: p.regularCustomer.periodMonths,
    },
  };
}

export function docSettingRowView(r: DocNumberingRow, s: DocSettings) {
  const note = s.notes[r.docType];
  const dueDays =
    r.docType === "PURCHASE_ORDER" ? s.due.purchaseOrderDueDays : s.due.invoiceCreditDays;
  return {
    docType: r.docType,
    label: r.label,
    prefix: r.prefix,
    pattern: r.pattern,
    effectivePattern: r.effectivePattern,
    reset: r.reset,
    nextNo: r.nextNo,
    example: r.example,
    dueDays,
    dueBasis: s.due.basis,
    validDays: s.due.quotationValidDays,
    notes: note?.footer ?? "",
    terms: note?.terms ?? "",
    publicLink: { enabled: s.publicView.enabled, expiryDays: s.publicView.expiryDays },
    autoTaxInvoice: s.autoTaxInvoice.mode,
    printTemplate: s.print.template,
    channels: [...s.channels.order],
  };
}

const TOGGLE_KEYS: ToggleKey[] = ["autoCreateContact", "syncProductPrices", "autoPost", "inboxFromChat"];

export function linkCardView(c: ConnectionCard) {
  const on = new Map(c.toggles.map((t) => [t.key, t.on]));
  const options = Object.fromEntries(TOGGLE_KEYS.map((k) => [k, on.get(k) === true])) as Record<ToggleKey, boolean>;
  return {
    kind: c.kind,
    label: c.label,
    hint: c.hint,
    status: c.status,
    statusLabel: c.statusLabel,
    linkedSystem: c.linkedId ? { id: c.linkedId, name: c.linkedName } : null,
    options,
    accountCodes: [...c.accountCodes],
    lastPostedAt: iso(c.lastPostedAt),
    monthCount: c.monthCount,
  };
}

// ── คลังเอกสาร / กล่องขาเข้า ─────────────────────────────────────────────────

export function fileRowView(r: AttachmentRowView) {
  return {
    id: r.id,
    fileName: r.fileName,
    mime: r.mimeType,
    sizeBytes: r.sizeBytes,
    url: r.fileUrl,
    thumbUrl: r.thumbUrl,
    sha256: r.sha256,
    status: r.status,
    source: r.source,
    folder: r.folder,
    docTypeHint: r.docTypeHint,
    typeLabel: r.typeLabel,
    note: r.note,
    document: r.document ? { id: r.document.id, docNo: r.document.docNo, type: r.document.docType } : null,
    uploadedAt: iso(r.createdAt),
    uploadedBy: r.uploadedById ? { id: r.uploadedById, name: r.uploaderName } : null,
  };
}

export function inboxItemView(r: AttachmentRowView) {
  const e = r.aiExtract;
  return {
    id: r.id,
    fileName: r.fileName,
    url: r.fileUrl,
    mime: r.mimeType,
    sizeBytes: r.sizeBytes,
    receivedAt: iso(r.createdAt),
    source: r.source,
    senderLabel: r.senderLabel,
    aiStatus: r.aiStatus,
    aiReason: r.aiReason,
    aiReadAt: iso(r.aiReadAt),
    extracted: e
      ? {
          vendor: e.vendorName,
          vendorTaxId: e.vendorTaxId,
          docNo: e.invoiceNo,
          date: e.issueDate,
          amountSatang: e.totalSatang,
          vat: e.vatSatang,
          confidence: e.confidence,
        }
      : null,
    expenseDocId: r.expenseDocId,
  };
}

/** ป้ายชนิดบัญชี → ยอดรวม (ใช้ตอนทำ totalsByType ให้ผู้เรียกรู้ว่าคีย์ที่เป็นไปได้มีอะไรบ้าง) */
export type ChartTotalsByType = Partial<Record<AccountLedgerType, number>>;
