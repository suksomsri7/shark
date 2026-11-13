// serialize-purchase-tax.ts — รายงานภาษีซื้อ (ACC T1.6) → รูป REST/AI (เงินเป็นสตางค์ ชื่อลงท้าย Satang · วันที่ YYYY-MM-DD)
import type { PurchaseTaxReport, PurchaseTaxRow } from "../purchase-tax-report";

function rowView(r: PurchaseTaxRow) {
  return {
    seq: r.seq,
    kind: r.kind,
    receivedDate: r.receivedDate,
    invoiceDate: r.invoiceDate,
    invoiceNo: r.invoiceNo,
    docNo: r.docNo,
    docId: r.docId,
    docType: r.docType,
    vendorName: r.vendorName,
    vendorTaxId: r.vendorTaxId,
    vendorBranchCode: r.vendorBranchCode,
    rateBp: r.rateBp,
    baseSatang: r.base,
    vatSatang: r.vat,
    notes: r.notes,
    cancelled: r.cancelled,
    manual: r.manual === true,
    ...(r.flag ? { flag: r.flag } : {}),
  };
}

export function purchaseTaxView(r: PurchaseTaxReport) {
  return {
    period: r.periodKey,
    header: r.header,
    standardRateBp: r.stdRateBp,
    inputVatAccount: r.inputLedger,
    rows: r.rows.map(rowView),
    adjustments: r.adjustments.map(rowView),
    totals: {
      documentsBaseSatang: r.docsTotal.base,
      documentsVatSatang: r.docsTotal.vat,
      adjustmentsVatSatang: r.adjustmentsTotal.vat,
      adjustmentCount: r.adjustmentsTotal.count,
      baseSatang: r.total.base,
      vatSatang: r.total.vat,
      ledgerMovementSatang: r.glVat,
    },
    checks: r.checks.map((c) => ({ key: c.key, label: c.label, ok: c.ok, expected: c.expected, actual: c.actual, ...(c.detail ? { detail: c.detail } : {}) })),
    notClaimable: {
      posting: r.notClaimable.posting,
      groups: r.notClaimable.groups.map((g) => ({
        reason: g.reason,
        label: g.labelTh,
        section: g.sectionTh,
        group: g.group,
        baseSatang: g.base,
        vatSatang: g.vat,
        rows: g.rows.map((x) => ({ date: x.date, docNo: x.docNo, docId: x.docId, docType: x.docType, vendorName: x.vendorName, vendorTaxId: x.vendorTaxId, baseSatang: x.base, vatSatang: x.vat, notes: x.notes })),
      })),
      baseSatang: r.notClaimable.total.base,
      vatSatang: r.notClaimable.total.vat,
    },
    pending: {
      vatSatang: r.pending.vat,
      rows: r.pending.rows.map((x) => ({
        purchaseTaxInvoiceId: x.ptxId,
        purchaseTaxInvoiceNo: x.ptxNo,
        sourceId: x.sourceId,
        sourceDocNo: x.sourceDocNo,
        sourceDocType: x.sourceDocType,
        sourceDate: x.sourceDate,
        vendorName: x.vendorName,
        vendorTaxId: x.vendorTaxId,
        vatSatang: x.vat,
        ageDays: x.ageDays,
        lastClaimMonth: x.lastClaimMonthTh,
        pastWindow: x.pastWindow,
      })),
    },
  };
}
