// ─────────────────────────────────────────────────────────────
// input-vat.ts — ใบกำกับภาษีซื้อรอรับ (ACC T1.5 §6) · mirror ของ parkedOutputVat (T1.2 · tax-point.ts)
//
// แหล่งความจริง = GL (gl.pendingInputVatOf: Σ Dr−Cr ของ 1155 ต่อใบซื้อต้นทาง รวมใบลด/เพิ่มหนี้รับและใบกำกับภาษีซื้อของใบนั้น)
// เพดานเคลมข้ามเดือน = ตารางค่ากฎหมาย (th-tax-2569 SYSTEM_INPUT_VAT_LATE_CLAIM_ROWS · ฉ.4 ข้อ 2 [V])
//   ยังไม่รู้วันที่ในใบกำกับจริง ⇒ นับจากเดือนของเอกสารต้นทาง (ตัวแทน — skill ไม่ได้บอก [S])
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import { lateClaimRuleAt } from "@/lib/core/settings/legal/th-tax-2569";
import { pendingInputVatOf } from "./gl";
import { accountNow } from "./clock";
import { addMonths, bkkYm, bkkYmdOf, docDefaultStatus, inputVatWarnings, lineStatusOf, monthDiff, nonClaimReasonOf, summarizeStatuses, thaiMonthLabel, vatPerLine, type InputVatStatus } from "./input-vat-shared";

type Ctx = { tenantId: string; systemId: string };

const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thDate = (d: Date) => {
  const t = new Date(d.getTime() + 7 * 3_600_000);
  return `${t.getUTCDate()}/${t.getUTCMonth() + 1}/${t.getUTCFullYear() + 543}`;
};
const DAY = 86_400_000;

export type PendingInputVatRow = {
  /** ใบกำกับภาษีซื้อรอรับ (PTX) */
  ptxId: string;
  ptxNo: string | null;
  /** ใบซื้อต้นทาง */
  sourceId: string;
  sourceDocNo: string | null;
  sourceDocType: string;
  sourceDate: Date;
  contactName: string | null;
  contactTaxId: string | null;
  /** ภาษีซื้อที่ยังพัก (สตางค์ · GL) */
  vat: number;
  ageDays: number;
  /** เดือนสุดท้ายที่ยังเคลมได้ ("YYYY-MM") · null = ไม่มีแถวในตาราง */
  lastClaimYm: string | null;
  lastClaimMonthTh: string | null;
  /** เหลืออีกกี่เดือนภาษี (รวมเดือนนี้) · ติดลบ = เลยมาแล้ว */
  monthsLeft: number | null;
  pastWindow: boolean;
  warning: LegalWarning | null;
};

export type PendingInputVatReport = {
  asOf: Date;
  limitMonths: number | null;
  source: string | null;
  rows: PendingInputVatRow[];
  total: { vat: number; count: number; pastWindowVat: number; pastWindowCount: number };
  warning: LegalWarning | null;
};

/** รายการภาษีซื้อที่รอใบกำกับ (เฉพาะที่ยังมียอดพัก) เรียงเก่า → ใหม่ */
export async function pendingInputVat(ctx: Ctx, opts: { asOf?: Date; sourceIds?: string[] } = {}): Promise<PendingInputVatReport> {
  const asOf = opts.asOf ?? accountNow();
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  const ptxs = await db.accountDocument.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      docType: "PURCHASE_TAX_INVOICE",
      status: "AWAITING_RECEIVE",
      sourceDocId: opts.sourceIds ? { in: opts.sourceIds } : { not: null },
    },
    select: { id: true, docNo: true, sourceDocId: true },
  });
  const srcIds = [...new Set(ptxs.map((p) => p.sourceDocId!).filter(Boolean))];
  const sources = srcIds.length
    ? await db.accountDocument.findMany({
        where: { tenantId: ctx.tenantId, systemId: ctx.systemId, id: { in: srcIds } },
        select: { id: true, docNo: true, docType: true, issueDate: true, contactSnapshot: true, contact: { select: { name: true, taxId: true } } },
      })
    : [];
  const srcMap = new Map(sources.map((s) => [s.id, s]));
  const pend = await pendingInputVatOf(ctx, srcIds);
  const rule = lateClaimRuleAt(bkkYmdOf(asOf));
  const limit = rule?.value ?? null;
  const nowYm = bkkYm(asOf);
  const rows: PendingInputVatRow[] = [];
  for (const p of ptxs) {
    const src = p.sourceDocId ? srcMap.get(p.sourceDocId) : undefined;
    if (!src) continue;
    const vat = Math.max(0, pend.get(src.id) ?? 0);
    if (vat <= 0) continue;
    const snap = (src.contactSnapshot ?? null) as { name?: string; taxId?: string } | null;
    const lastYm = limit === null ? null : addMonths(bkkYm(src.issueDate), limit);
    const monthsLeft = lastYm === null ? null : monthDiff(nowYm, lastYm);
    const pastWindow = monthsLeft !== null && monthsLeft < 0;
    rows.push({
      ptxId: p.id,
      ptxNo: p.docNo,
      sourceId: src.id,
      sourceDocNo: src.docNo,
      sourceDocType: src.docType,
      sourceDate: src.issueDate,
      contactName: snap?.name ?? src.contact?.name ?? null,
      contactTaxId: snap?.taxId ?? src.contact?.taxId ?? null,
      vat,
      ageDays: Math.max(0, Math.floor((asOf.getTime() - src.issueDate.getTime()) / DAY)),
      lastClaimYm: lastYm,
      lastClaimMonthTh: lastYm ? thaiMonthLabel(lastYm) : null,
      monthsLeft,
      pastWindow,
      warning: pastWindow
        ? legalWarning(
            "INPUT_VAT_PENDING_PAST_WINDOW",
            { vat: baht(vat), docNo: src.docNo ?? "-", date: thDate(src.issueDate), lastMonth: lastYm ? thaiMonthLabel(lastYm) : "-", limit: limit ?? "-" },
            { citation: rule?.source },
          )
        : null,
    });
  }
  rows.sort((a, b) => a.sourceDate.getTime() - b.sourceDate.getTime() || (a.sourceDocNo ?? "").localeCompare(b.sourceDocNo ?? ""));
  const total = { vat: 0, count: rows.length, pastWindowVat: 0, pastWindowCount: 0 };
  for (const r of rows) {
    total.vat += r.vat;
    if (r.pastWindow) {
      total.pastWindowVat += r.vat;
      total.pastWindowCount += 1;
    }
  }
  const first = rows.find((r) => r.pastWindow);
  const warning =
    total.pastWindowCount === 1 && first
      ? first.warning
      : total.pastWindowCount > 1
        ? legalWarning(
            "INPUT_VAT_PENDING_PAST_WINDOW",
            { vat: baht(total.pastWindowVat), docNo: `${total.pastWindowCount} ใบ`, date: "หลายวันที่", lastMonth: "เดือนสุดท้ายของแต่ละใบ", limit: limit ?? "-" },
            { citation: rule?.source },
          )
        : null;
  return { asOf, limitMonths: limit, source: rule?.source ?? null, rows, total, warning };
}

// ─────────────────── มุมมองภาษีซื้อของเอกสารหนึ่งใบ (หน้าเอกสาร · REST รายละเอียด) ───────────────────

export type InputVatDocView = {
  /** ใบซื้อ: VAT ต่อสถานะ (สตางค์ · ประมาณตามน้ำหนักบรรทัด — ยอดจริงดูแท็บบัญชี) */
  split: { claim: number; pending: number; noClaim: number } | null;
  summary: "CLAIM" | "PENDING" | "NO_CLAIM" | "MIXED" | null;
  noClaimReasons: string[];
  /** ใบซื้อที่ยังรอใบกำกับ: PTX ที่รอรับ + ยอดพักจริง (GL) */
  pendingPtx: { id: string; docNo: string | null; vat: number } | null;
  /** ใบกำกับภาษีซื้อ: วันที่ในใบ · วันที่ลงภาษีซื้อ · ข้อความเคลมข้ามเดือน · ต้นทาง */
  ptx: {
    vendorInvoiceDate: Date | null;
    claimDate: Date | null;
    lateNote: string | null;
    notClaimable: boolean;
    reason: string | null;
    source: { id: string; docNo: string | null; docType: string; issueDate: Date } | null;
    pendingVat: number | null;
    lastClaimMonthTh: string | null;
  } | null;
  /** ร่าง: คำเตือนภาษีซื้อ (ด่านจริงอยู่ที่ service) */
  draftWarnings: LegalWarning[];
};

export async function inputVatDocView(ctx: Ctx, docId: string): Promise<InputVatDocView | null> {
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  const doc = await db.accountDocument.findFirst({
    where: { id: docId, tenantId: ctx.tenantId, systemId: ctx.systemId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, contact: { select: { name: true, taxId: true } } },
  });
  if (!doc) return null;
  const empty: InputVatDocView = { split: null, summary: null, noClaimReasons: [], pendingPtx: null, ptx: null, draftWarnings: [] };
  if (doc.docType === "PURCHASE_TAX_INVOICE") {
    const src = doc.sourceDocId
      ? await db.accountDocument.findFirst({ where: { id: doc.sourceDocId, tenantId: ctx.tenantId, systemId: ctx.systemId }, select: { id: true, docNo: true, docType: true, issueDate: true } })
      : null;
    const pend = src && doc.status === "AWAITING_RECEIVE" ? ((await pendingInputVatOf(ctx, [src.id])).get(src.id) ?? 0) : null;
    const rule = lateClaimRuleAt(bkkYmdOf(accountNow()));
    const lastYm = src && rule?.value != null ? addMonths(bkkYm(src.issueDate), rule.value) : null;
    return {
      ...empty,
      ptx: {
        vendorInvoiceDate: doc.vendorInvoiceDate,
        claimDate: doc.inputVatClaimDate,
        lateNote: doc.inputVatLateNote,
        notClaimable: doc.inputVatStatus === "NO_CLAIM",
        reason: doc.lines[0]?.inputVatReason ?? null,
        source: src,
        pendingVat: pend,
        lastClaimMonthTh: lastYm ? thaiMonthLabel(lastYm) : null,
      },
    };
  }
  if (!["PURCHASE", "EXPENSE", "ASSET_PURCHASE"].includes(doc.docType)) return null;
  const explicit = !!doc.inputVatStatus || doc.lines.some((l) => !!l.inputVatStatus);
  const d = docDefaultStatus(doc);
  const parts = vatPerLine(doc.vatAmount, doc.lines);
  const split = { claim: 0, pending: 0, noClaim: 0 };
  const statuses: InputVatStatus[] = [];
  const reasons = new Set<string>();
  doc.lines.forEach((l, i) => {
    const st = lineStatusOf(l, d);
    statuses.push(st);
    const v = parts[i] ?? 0;
    if (st === "CLAIM") split.claim += v;
    else if (st === "PENDING") split.pending += v;
    else {
      split.noClaim += v;
      reasons.add(nonClaimReasonOf(l.inputVatReason)?.labelTh ?? "ไม่ระบุเหตุ");
    }
  });
  const ptxRow = await db.accountDocument.findFirst({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, docType: "PURCHASE_TAX_INVOICE", sourceDocId: doc.id, status: "AWAITING_RECEIVE" },
    select: { id: true, docNo: true },
  });
  const pendVat = ptxRow ? ((await pendingInputVatOf(ctx, [doc.id])).get(doc.id) ?? 0) : 0;
  let draftWarnings: LegalWarning[] = [];
  if (doc.status === "DRAFT") {
    const accIds = [...new Set(doc.lines.map((l) => l.accountId).filter((x): x is string => !!x))];
    const treat = new Map((accIds.length ? await db.accountLedger.findMany({ where: { systemId: ctx.systemId, id: { in: accIds } }, select: { id: true, vatTreatment: true } }) : []).map((l) => [l.id, l.vatTreatment]));
    draftWarnings = inputVatWarnings(doc, doc.lines.map((l) => ({ ...l, accountTreatment: l.accountId ? treat.get(l.accountId) : null })), doc.contact ? { name: doc.contact.name, taxId: doc.contact.taxId } : null);
  }
  return {
    ...empty,
    split: explicit || doc.vatAmount > 0 ? split : null,
    summary: summarizeStatuses(statuses),
    noClaimReasons: [...reasons],
    pendingPtx: ptxRow ? { ...ptxRow, vat: pendVat } : null,
    draftWarnings,
  };
}
