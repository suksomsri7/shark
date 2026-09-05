// serialize-finance.ts — ตัวแปลง "ของภายใน" → "ของที่ส่งออกทาง REST" ของการเงิน/เช็ค/WHT (WO B3)
//
// กติกาเหมือน `serialize.ts` ของ B1 เป๊ะ (อ่านหัวไฟล์นั้นก่อนแก้ที่นี่):
//   1) ห้าม spread แถว prisma — เขียนชื่อฟิลด์ทีละตัวเสมอ (ห้ามมี tenantId/systemId/keyHash/href/base
//      หลุดออก — ช่องทางการเงิน/เช็ค/WHT เป็นข้อมูลอ่อนไหวกว่าเอกสารทั่วไป ระวังเป็นพิเศษ)
//   2) เงินลงท้าย `Satang` เสมอ
//   3) วันที่ = วันไทย `YYYY-MM-DD` ผ่าน `ymd()` · เวลาจริง = ISO ผ่าน `iso()` (ตัวเดียวกับ serialize.ts)

import type { AccountWhtIncomeType } from "@prisma/client";
import type { getWhtCert, PndRow, WhtCertRow, WhtCreditRow, listWhtFilings } from "../wht";
import { CHEQUE_STATUS_LABEL, type ChequeRowV2 } from "../cheque";
import type { CashCalendar, CashCalendarItem } from "../dashboard";
import type { FinanceAccountBalance, FinanceGroup, FinanceOpeningRow, StatementRow } from "../finance";
import type { FinanceOverview, PettyCashRow } from "../finance-overview";
import type { PaymentRequestView } from "../payment-request";
import type { ReconcileChannel, ReconcileSummary, StatementLineView, SystemEntryRow } from "../reconcile";
import type { AccountSettingsView } from "../service";
import { cashView, iso, ymd } from "./serialize";

// ── ช่องทางการเงิน ───────────────────────────────────────────────────────────

export function financeAccountRow(a: FinanceAccountBalance, ledgerCodeById: Map<string, string>) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    bankSubtype: a.bankSubtype,
    bankName: a.bankName,
    accountNo: a.accountNo,
    promptpayId: a.promptpayId,
    openingSatang: a.openingBalance,
    openingDate: ymd(a.openingDate),
    balanceSatang: a.balance,
    showOnDocuments: a.showOnDocuments,
    ledgerAccountCode: a.ledgerAccountId ? (ledgerCodeById.get(a.ledgerAccountId) ?? null) : null,
    pinned: a.pinned,
  };
}

function financeOpeningEntryView(e: FinanceOpeningRow) {
  return { seq: e.seq, date: ymd(e.date), amountSatang: e.amountSatang, note: e.note };
}

export function financeAccountDetail(
  a: FinanceAccountBalance,
  openingEntries: FinanceOpeningRow[],
  ledgerCodeById: Map<string, string>,
) {
  return { ...financeAccountRow(a, ledgerCodeById), openingEntries: openingEntries.map(financeOpeningEntryView) };
}

/**
 * แถวช่องทางการเงินของฝั่ง **เขียน** (WO D1) — ของ B3 บวกช่องที่ `POST`/`PATCH` ตั้งค่าได้
 * (ชื่อบัญชี · สาขา · หมายเหตุ · ธงใช้รับ/จ่าย · วงเงิน · ผู้ถือ) ⇒ ผู้เรียกเห็นผลของสิ่งที่เพิ่งส่งไป
 * ไม่ต้องยิง GET ตาม · แยกจาก `financeAccountRow` โดยตั้งใจเพื่อ **ไม่ขยายคำตอบของ B3**
 * (รายการช่องทางถูกดึงบ่อยจากหน้าจอ — ช่องเพิ่มที่ไม่มีใครใช้ = ข้อมูลอ่อนไหวรั่วฟรี)
 */
export function financeAccountWriteView(
  a: FinanceAccountBalance,
  openingEntries: FinanceOpeningRow[],
  ledgerCodeById: Map<string, string>,
) {
  return {
    ...financeAccountDetail(a, openingEntries, ledgerCodeById),
    bankBranch: a.bankBranch,
    accountName: a.accountName,
    note: a.note,
    useForReceive: a.useForReceive,
    useForPay: a.useForPay,
    limitSatang: a.limitSatang,
    holderUserId: a.holderUserId,
  };
}

export function financeGroupView(g: FinanceGroup) {
  return { key: g.key, label: g.label, totalSatang: g.total, accountIds: g.accounts.map((a) => a.id) };
}

// ── statement ────────────────────────────────────────────────────────────────

function statementRowView(r: StatementRow) {
  return {
    entryId: r.entryId,
    date: ymd(r.date),
    journalNo: r.docNo,
    memo: r.memo,
    refType: r.refType,
    refId: r.refId,
    inSatang: r.debit,
    outSatang: r.credit,
    balanceSatang: r.balance,
  };
}

export function financeStatementView(data: {
  account: { id: string; name: string; type: string } | null;
  opening: number;
  closing: number;
  rows: StatementRow[];
}) {
  return {
    account: data.account,
    openingSatang: data.opening,
    closingSatang: data.closing,
    rows: data.rows.map(statementRowView),
  };
}

// ── ภาพรวมการเงิน / ปฏิทิน / เงินสดย่อย ────────────────────────────────────────

function calendarItemView(it: CashCalendarItem) {
  return { type: it.type, docNo: it.docNo, contact: it.contact, amountSatang: it.amountSatang };
}

export function calendarView(c: CashCalendar) {
  return {
    month: c.monthKey,
    days: c.days.map((d) => ({
      date: d.date,
      inSatang: d.inflow,
      outSatang: d.outflow,
      items: d.items.map(calendarItemView),
    })),
  };
}

/** ก้อน "ดูภาพรวมการเงิน" → JSON ของ API — ตัด `queryCount` (ตัวเลขวัดผลภายใน ไม่ใช่ของหน้าจอ) */
export function financeOverviewView(o: FinanceOverview) {
  return {
    monthKey: o.monthKey,
    asOf: ymd(o.asOf),
    tracked: o.tracked.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      type: t.type,
      subtitle: t.subtitle,
      balanceSatang: t.balanceSatang,
      monthDeltaSatang: t.monthDeltaSatang,
      monthText: t.monthText,
    })),
    calendar: calendarView(o.calendar),
    cash: cashView(o.cash),
    reconcile: {
      channelOptions: o.reconcile.channelOptions,
      selectedChannelId: o.reconcile.selectedChannelId,
      selectedChannelLabel: o.reconcile.selectedChannelLabel,
      systemBalanceSatang: o.reconcile.systemBalanceSatang,
      statementBalanceSatang: o.reconcile.statementBalanceSatang,
      differenceSatang: o.reconcile.differenceSatang,
      pendingCount: o.reconcile.pendingCount,
      confirmed: o.reconcile.confirmed,
    },
    reconciledCount: o.reconciledCount,
    chequeBadges: { inCount: o.chequeBadges.inCount, outCount: o.chequeBadges.outCount },
  };
}

export function pettyCashView(p: PettyCashRow, pendingSatang: number) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    balanceSatang: p.balanceSatang,
    holder: p.holderName,
    pendingSatang,
    lastTopUp: iso(p.lastTopUpAt),
  };
}

// ── ลิงก์ชำระเงิน ─────────────────────────────────────────────────────────────

/** `PaymentRequestView` มี `token` (capability ของลิงก์สาธารณะ) — ห้ามหลุดออก API เด็ดขาด */
export function paymentRequestView(r: PaymentRequestView) {
  return {
    id: r.id,
    url: r.url,
    amountSatang: r.amountSatang,
    method: r.method,
    methodLabel: r.methodLabel,
    status: r.status,
    statusLabel: r.statusLabel,
    qrPayload: r.qrPayload,
    providerUrl: r.providerUrl,
    financeAccount: { id: r.financeId, name: r.financeName },
    expiresAt: iso(r.expiresAt),
    paidAt: iso(r.paidAt),
    paidAmountSatang: r.paidAmountSatang,
    note: r.note,
    createdAt: iso(r.createdAt),
  };
}

// ── กระทบยอด ──────────────────────────────────────────────────────────────────

export function reconcileChannelView(c: ReconcileChannel) {
  return { id: c.id, code: c.code, name: c.name, bankName: c.bankName, accountNo: c.accountNo };
}

/** ตัด `channel.ledgerAccountId`/`ledgerCode` (รายละเอียด GL ภายใน) และ `confirmedById` (userId ภายใน) */
export function reconcileSummaryView(s: ReconcileSummary) {
  return {
    hasStatement: s.hasStatement,
    statementId: s.statementId,
    statementBalanceSatang: s.statementBalanceSatang,
    systemBalanceSatang: s.systemBalanceSatang,
    differenceSatang: s.differenceSatang,
    matchedCount: s.matchedCount,
    totalCount: s.totalCount,
    pendingCount: s.pendingCount,
    suggestedCount: s.suggestedCount,
    unmatchedCount: s.unmatchedCount,
    skippedCount: s.skippedCount,
    confirmedAt: iso(s.confirmedAt),
    canConfirm: s.canConfirm,
    confirmBlockReason: s.confirmBlockReason,
    importedAt: iso(s.importedAt),
    fileName: s.fileName,
    source: s.source,
    channel: reconcileChannelView(s.channel),
  };
}

export function reconcileLineView(l: StatementLineView) {
  return {
    id: l.id,
    date: ymd(l.txDate),
    description: l.description,
    amountSatang: l.amountSatang,
    status: l.status,
    matchedEntryId: l.matchedEntryId,
    matchedLineId: l.matchedLineId,
    suggestion: l.suggestedHint,
  };
}

export function reconcileSystemEntryView(r: SystemEntryRow) {
  return {
    entryId: r.entryId,
    journalLineId: r.lineId,
    date: ymd(r.date),
    journalNo: r.docNo,
    memo: r.memo,
    amountSatang: r.amountSatang,
    matchedLineId: r.matchedLineId,
  };
}

// ── เช็ค ──────────────────────────────────────────────────────────────────────

export function chequeRowView(c: ChequeRowV2) {
  return {
    id: c.id,
    direction: c.direction,
    chequeNo: c.chequeNo,
    bankName: c.bankName,
    branch: c.bankBranch,
    chequeDate: ymd(c.chequeDate),
    amountSatang: c.amount,
    status: c.status,
    statusLabel: CHEQUE_STATUS_LABEL[c.status],
    contact: c.contactId ? { id: c.contactId, name: c.contactName ?? "" } : null,
    document: c.documentId ? { id: c.documentId, docNo: c.documentNo } : null,
    depositedAt: iso(c.depositedAt),
    clearedAt: iso(c.clearedAt),
    note: c.note,
  };
}

// ── WHT ───────────────────────────────────────────────────────────────────────

export function whtCertRowView(r: WhtCertRow) {
  return {
    id: r.id,
    docNo: r.certNo,
    date: ymd(r.paidAt),
    contact: { id: r.contactId, name: r.contactName, taxId: r.contactTaxId },
    incomeType: r.incomeType,
    incomeTypeLabel: r.incomeLabel,
    rateBp: r.whtRateBp,
    baseSatang: r.base,
    whtSatang: r.whtAmount,
    status: r.cancelled ? "CANCELLED" : "NORMAL",
    filedPeriod: r.filedPeriodKey,
    sourceDocument: r.sourceDocId ? { id: r.sourceDocId, docNo: r.sourceDocNo } : null,
  };
}

type WhtCertDoc = NonNullable<Awaited<ReturnType<typeof getWhtCert>>>;
type PartyView = { name: string; taxId: string | null; address: string | null };

function orgParty(s: AccountSettingsView): PartyView {
  const name = s.orgPrefix ? `${s.orgPrefix}${s.orgName ?? ""}` : (s.orgName ?? "");
  return { name, taxId: s.taxId, address: s.address };
}

function certContactParty(cert: WhtCertDoc): PartyView {
  const snap = (cert.contactSnapshot as Record<string, unknown> | null) ?? null;
  return {
    name: (snap?.name as string | undefined) ?? cert.contact?.name ?? "",
    taxId: (snap?.taxId as string | undefined) ?? cert.contact?.taxId ?? null,
    address: (snap?.address as string | undefined) ?? cert.contact?.address ?? null,
  };
}

/**
 * ใบ 50 ทวิ/WTI 1 ใบ → JSON — `direction IN` (เราหักผู้ขาย): payer = กิจการเรา · payee = ผู้ขาย
 * `direction OUT` (WTI ลูกค้าหักเรา): payer = ลูกค้า (แช่แข็งใน snapshot) · payee = กิจการเรา
 */
export function whtCertDetailView(
  cert: WhtCertDoc,
  settings: AccountSettingsView,
  sourceDoc: { id: string; docNo: string | null } | null,
) {
  const org = orgParty(settings);
  const contact = certContactParty(cert);
  const isOut = cert.direction === "OUT";
  return {
    id: cert.id,
    docNo: cert.docNo,
    date: ymd(cert.issueDate),
    direction: cert.direction,
    payer: isOut ? contact : org,
    payee: isOut ? org : contact,
    incomeType: cert.whtIncomeType,
    rateBp: cert.whtRateBp,
    baseSatang: cert.subTotal,
    whtSatang: cert.whtAmount,
    sourceDocument: sourceDoc ? { id: sourceDoc.id, docNo: sourceDoc.docNo } : null,
    status: cert.status,
  };
}

function pndRowView(row: PndRow) {
  return {
    seq: row.seq,
    certId: row.certId,
    certNo: row.certNo,
    date: ymd(row.paidAt),
    recipientName: row.recipientName,
    recipientTaxId: row.recipientTaxId,
    recipientBranch: row.recipientBranch,
    recipientAddress: row.recipientAddress,
    incomeType: row.incomeType,
    incomeTypeLabel: row.incomeLabel,
    baseSatang: row.base,
    rateBp: row.whtRateBp,
    whtSatang: row.whtAmount,
    condition: row.condition,
  };
}

export function pndView(
  r: { rows: PndRow[]; byIncomeType: Array<{ incomeType: AccountWhtIncomeType; label: string; base: number; wht: number; count: number }>; grandBase: number; grandWht: number },
  type: 3 | 53,
  period: string,
) {
  return {
    type,
    period,
    rows: r.rows.map(pndRowView),
    byIncomeType: r.byIncomeType.map((b) => ({
      incomeType: b.incomeType,
      label: b.label,
      baseSatang: b.base,
      whtSatang: b.wht,
      count: b.count,
    })),
    grandBaseSatang: r.grandBase,
    grandWhtSatang: r.grandWht,
  };
}

function whtCreditRowView(row: WhtCreditRow) {
  return {
    paymentId: row.paymentId,
    documentId: row.documentId,
    paidAt: iso(row.paidAt),
    docNo: row.docNo,
    docType: row.docType,
    contactName: row.contactName,
    contactTaxId: row.contactTaxId,
    baseSatang: row.base,
    whtRateBp: row.whtRateBp,
    whtSatang: row.whtAmount,
    hasCertCopy: row.hasCertCopy,
  };
}

export function whtCreditsView(r: { rows: WhtCreditRow[]; totalWht: number; totalBase: number }, yearTotalSatang: number) {
  return {
    rows: r.rows.map(whtCreditRowView),
    totalWhtSatang: r.totalWht,
    totalBaseSatang: r.totalBase,
    yearTotalSatang,
  };
}

export function whtFilingView(f: Awaited<ReturnType<typeof listWhtFilings>>[number]) {
  return {
    id: f.id,
    period: f.periodKey,
    form: f.form,
    filedAt: iso(f.filedAt),
    certCount: f.certCount,
    whtSatang: f.totalTaxSatang,
    note: f.note,
  };
}
