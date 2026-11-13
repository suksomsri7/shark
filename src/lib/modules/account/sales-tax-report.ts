// ─────────────────────────────────────────────────────────────
// sales-tax-report.ts — รายงานภาษีขาย (ACC T1.1 · อ่านอย่างเดียว · ไม่โพสต์ GL)
//
// ยอดภาษีทุกแถว = ผลรวมบรรทัดบัญชี 2200 ของต้นทางนั้นในเดือนภาษี (กระทบ GL เป๊ะ) · ฐานแยกกลุ่มอัตราจากเอกสาร (rateGroupsOf)
// ต้นทาง: AccountDocument (เอกสารบัญชี) · PosSale (บิล/ใบคืน/ใบรับมัดจำของ POS → เอกสารบัญชีที่ refType=PosSale) · อื่น ๆ = แถวรายการบัญชี
// ใบกำกับภาษีอย่างย่อรวมรายวันตามค่าตั้ง account.report.salesTaxAbbMode · ใบที่ยกเลิกมีหมายเหตุ · หัวรายงานครบ · ข้อตรวจกระทบยอด
// design note: ledger/wo-notes/T1.1.md
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { resolveBookSettings } from "@/lib/core/settings";
import { ACCOUNT_SETTING_KEYS } from "@/lib/core/settings/defs/account";
import { vatRateBpAt } from "./legal-values";
import { posBillMeta, type PosBillMeta } from "./pos-bill-meta";
import { vatLedgers } from "./pp30-return";
import {
  baseVatTolerance,
  groupByRate,
  headerWarningsTh,
  isSalesTaxAbbMode,
  partConsistent,
  rateGroupsOf,
  sellerBranchLabelTh,
  sortRows,
  sumParts,
  summarizeAbb,
  taxMonthLabelTh,
  type RateGroupView,
  type RatePart,
  type SalesTaxAbbMode,
  type SalesTaxCheck,
  type SalesTaxHeader,
  type SalesTaxRow,
} from "./sales-tax-shared";

type Ctx = { tenantId: string; systemId: string };

export type SalesTaxReport = {
  periodKey: string;
  header: SalesTaxHeader;
  abbMode: SalesTaxAbbMode;
  /** ค่าตั้งของสมุด (ก่อนสลับดูชั่วคราวด้วย ?abb=) */
  abbModeSetting: SalesTaxAbbMode;
  stdRateBp: number;
  /** แถวที่แสดง (ใบย่อรวมรายวันแล้วตามโหมด) เรียงวันที่ → เลขที่ */
  rows: SalesTaxRow[];
  groups: RateGroupView[];
  total: { base: number; vat: number };
  /** ยอดเคลื่อนไหวสุทธิฝั่งเครดิตของบัญชีภาษีขาย (ตาม mapping VAT_OUTPUT) ในเดือน (คิวรีแยก) */
  glVat: number;
  checks: SalesTaxCheck[];
  /** ACC T1.9 ▸ บัญชีภาษีขายที่รายงานอ่าน (ตาม mapping) — หัวตาราง/ข้อตรวจแสดงรหัส+ชื่อนี้ ◂ */
  outputLedger: { code: string; name: string } | null;
  /** ACC T1.9 ▸ รายการปรับปรุงมือ (JV ที่บันทึกเอง) ที่แตะบัญชีภาษีขายในเดือน ◂ */
  manualAdjustments: { count: number; vat: number };
};

const DOC_TYPE_TH: Record<string, string> = {
  TAX_INVOICE: "ใบกำกับภาษี",
  TAX_INVOICE_ABB: "ใบกำกับภาษีอย่างย่อ",
  RECEIPT: "ใบเสร็จรับเงิน/ใบกำกับภาษี",
  DEPOSIT_RECEIPT: "ใบรับเงินมัดจำ",
  CREDIT_NOTE: "ใบลดหนี้",
  DEBIT_NOTE: "ใบเพิ่มหนี้",
  INVOICE: "ใบแจ้งหนี้",
};

const bkkYmd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const fmtThDate = (d: Date) => {
  const [y, m, dd] = bkkYmd(d).split("-");
  return `${Number(dd)}/${Number(m)}/${Number(y) + 543}`;
};
const readStr = (cfg: unknown, key: string): string => {
  const v = cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>)[key] : undefined;
  return typeof v === "string" ? v.trim() : "";
};

/** ACC T1.6 ▸ อัตรามาตรฐานของเดือนภาษี (ตารางค่ากฎหมาย ณ วันแรกของเดือน) — รายงานภาษีขาย/ซื้อใช้ร่วม ◂ */
export async function stdRateOfMonth(ctx: Ctx, periodKey: string): Promise<number> {
  const monthStart = new Date(`${periodKey}-01T00:00:00+07:00`);
  return vatRateBpAt(ctx, Number.isNaN(monthStart.getTime()) ? new Date() : monthStart);
}

/** ACC T1.6 ▸ หัวรายงานภาษี (ขาย/ซื้อ) จากค่าตั้งของสมุด — skill §18: เดือนภาษี ชื่อ เลขผู้เสียภาษี สำนักงานใหญ่/สาขา ◂ */
export function taxReportHeaderOf(
  settings: { orgName: string | null; taxId: string | null; branchCode: string | null; branchName: string | null; docConfig: unknown } | null,
  periodKey: string,
  report: string,
): SalesTaxHeader {
  const orgName = [readStr(settings?.docConfig, "orgPrefix"), (settings?.orgName ?? "").trim()].filter(Boolean).join(" ");
  const taxId = (settings?.taxId ?? "").trim();
  return {
    orgName,
    taxId,
    branchCode: (settings?.branchCode ?? "").trim() || "00000",
    branchLabel: sellerBranchLabelTh(settings?.branchCode, settings?.branchName),
    periodKey,
    monthLabel: taxMonthLabelTh(periodKey),
    warnings: headerWarningsTh({ orgName, taxId }, report),
  };
}

/** ACC T1.6 ▸ ค่าตั้งที่หัวรายงานภาษีอ่าน ◂ */
export const TAX_HEADER_SETTINGS_SELECT = { orgName: true, taxId: true, branchCode: true, branchName: true, docConfig: true } as const;

export async function salesTaxAbbModeOf(ctx: Ctx): Promise<SalesTaxAbbMode> {
  const r = await resolveBookSettings({ tenantId: ctx.tenantId }, [ACCOUNT_SETTING_KEYS.salesTaxAbbMode], ctx.systemId);
  const v = r[ACCOUNT_SETTING_KEYS.salesTaxAbbMode]?.value;
  return isSalesTaxAbbMode(v) ? v : "DAILY_DEVICE";
}

type SourceAgg = {
  key: string;
  refType: "AccountDocument" | "PosSale" | "JOURNAL";
  refId: string;
  /** ภาษีสุทธิทั้งหมดในเดือน (เครดิต − เดบิต) */
  vat: number;
  /** ภาษีของรายการกลับรายการ (reversal) ในเดือน */
  reversalVat: number;
  /** มีรายการต้นทาง (ไม่ใช่ reversal) ในเดือนนี้ */
  hasOriginal: boolean;
  firstDate: Date;
  reversalDate: Date | null;
  journalNo: string;
  memo: string | null;
  /** ACC T1.3: เอกสารขายที่มีแต่บรรทัด 0%/ยกเว้น (ไม่มียอดภาษี) */
  zeroOnly?: boolean;
  /** ACC T1.3: เอกสาร 0%/ยกเว้น ที่มีรายการกลับรายการในเดือน */
  zeroReversed?: boolean;
  /** ACC T1.9: JV ที่บันทึกเอง (รายการปรับปรุงมือ) */
  manual?: boolean;
};

/** ชนิดเอกสารฝั่งขายที่ลงรายงานภาษีขายได้แม้ไม่มีภาษี (ยอดขาย 0% / ยกเว้น) */
const ZERO_RATED_SALES_DOC_TYPES = ["TAX_INVOICE", "RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"] as const;

export async function salesTaxReport(
  ctx: Ctx,
  periodKey: string,
  opts?: { abbMode?: SalesTaxAbbMode | null; /** ACC T1.3: บัญชีภาษีขายจาก mapping (ผู้เรียกที่หาไว้แล้วส่งมา) */ outputLedgerId?: string | null },
): Promise<SalesTaxReport> {
  const db = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  const [settings, ledger, abbModeSetting] = await Promise.all([
    db.accountSettings.findFirst({
      where: {},
      select: { orgName: true, taxId: true, branchCode: true, branchName: true, docConfig: true },
    }),
    // ACC T1.3 ▸ บัญชีภาษีขายตาม mapping VAT_OUTPUT (ไม่ใช่รหัส 2200 ตายตัว) ◂
    opts?.outputLedgerId ? Promise.resolve({ id: opts.outputLedgerId }) : vatLedgers(ctx).then((l) => (l.VAT_OUTPUT ? { id: l.VAT_OUTPUT.id } : null)),
    salesTaxAbbModeOf(ctx),
  ]);
  const abbMode = opts?.abbMode && isSalesTaxAbbMode(opts.abbMode) ? opts.abbMode : abbModeSetting;
  const stdRateBp = await stdRateOfMonth(ctx, periodKey);
  const header = taxReportHeaderOf(settings, periodKey, "รายงานภาษีขาย");

  const outputLedger = ledger ? await db.accountLedger.findFirst({ where: { id: ledger.id }, select: { code: true, name: true } }) : null;
  const empty = (glVat = 0): SalesTaxReport => ({
    periodKey, header, abbMode, abbModeSetting, stdRateBp, rows: [], groups: [], total: { base: 0, vat: 0 }, glVat,
    checks: buildChecks([], 0, glVat, null, outputLedger), outputLedger, manualAdjustments: { count: 0, vat: 0 },
  });
  if (!ledger) return empty();

  // ── 1) บรรทัด 2200 ของเดือน → รวมตามต้นทาง ──
  const lines = await db.accountJournalLine.findMany({
    where: { accountId: ledger.id, entry: { periodKey } },
    select: {
      debit: true,
      credit: true,
      entry: { select: { id: true, refType: true, refId: true, date: true, docNo: true, reversalOfId: true, memo: true, source: true } },
    },
  });
  const glVat = lines.reduce((n, l) => n + l.credit - l.debit, 0);
  const sources = new Map<string, SourceAgg>();
  for (const l of lines) {
    const v = l.credit - l.debit;
    const e = l.entry;
    const refType = e.refType === "AccountDocument" || e.refType === "PosSale" ? e.refType : "JOURNAL";
    const refId = refType === "JOURNAL" ? e.id : (e.refId ?? e.id);
    const key = `${refType}:${refId}`;
    const s =
      sources.get(key) ??
      ({ key, refType, refId, vat: 0, reversalVat: 0, hasOriginal: false, firstDate: e.date, reversalDate: null, journalNo: e.docNo, memo: e.memo } as SourceAgg);
    if (refType === "JOURNAL" && e.source === "MANUAL") s.manual = true;
    s.vat += v;
    if (e.reversalOfId) {
      s.reversalVat += v;
      s.reversalDate = s.reversalDate && s.reversalDate > e.date ? s.reversalDate : e.date;
    } else {
      s.hasOriginal = true;
      if (e.date < s.firstDate) s.firstDate = e.date;
    }
    sources.set(key, s);
  }

  // ── 1b) ACC T1.3 ▸ เอกสารขายที่มีแต่บรรทัด 0% / ยกเว้น (ไม่มีบรรทัด 2200 จึงไม่อยู่ในข้อ 1) ──
  //   ยอดขาย 0% / ยกเว้น ของ ภ.พ.30 ต้องนับด้วย (skill §19) · เอาเฉพาะใบชนิดภาษีขายที่ลงบัญชีในเดือน และไม่มีบรรทัดอัตราบวกเลย
  //   (ใบที่มีบรรทัด 7% แต่ไม่มีภาษีขายในเดือน = ภาษีพัก/ยังไม่ถึงจุดรับผิด — ไม่ใช่ยอดขาย 0%) ◂
  const zeroEntries = await db.accountJournalEntry.findMany({
    where: { periodKey, refType: "AccountDocument" },
    select: { refId: true, date: true, docNo: true, memo: true, reversalOfId: true },
  });
  const zeroCand = zeroEntries.filter((e) => e.refId && !sources.has(`AccountDocument:${e.refId}`));
  if (zeroCand.length) {
    const zDocs = await db.accountDocument.findMany({
      where: {
        id: { in: [...new Set(zeroCand.map((e) => e.refId!))] },
        docType: { in: [...ZERO_RATED_SALES_DOC_TYPES] },
        status: { not: "DRAFT" },
        lines: { some: { vatRateBp: { lte: 0 } }, none: { vatRateBp: { gt: 0 } } },
      },
      select: { id: true },
    });
    const ok = new Set(zDocs.map((d) => d.id));
    for (const e of zeroCand) {
      if (!ok.has(e.refId!)) continue;
      const key = `AccountDocument:${e.refId}`;
      const z =
        sources.get(key) ??
        ({ key, refType: "AccountDocument", refId: e.refId!, vat: 0, reversalVat: 0, hasOriginal: false, firstDate: e.date, reversalDate: null, journalNo: e.docNo, memo: e.memo, zeroOnly: true } as SourceAgg);
      if (e.reversalOfId) {
        z.zeroReversed = true;
        z.reversalDate = z.reversalDate && z.reversalDate > e.date ? z.reversalDate : e.date;
      } else {
        z.hasOriginal = true;
        if (e.date < z.firstDate) z.firstDate = e.date;
      }
      sources.set(key, z);
    }
  }

  // ── 2) เอกสารบัญชี + บิล POS ──
  const docIds = [...sources.values()].filter((s) => s.refType === "AccountDocument").map((s) => s.refId);
  const saleIds = [...sources.values()].filter((s) => s.refType === "PosSale").map((s) => s.refId);
  const docSelect = {
    id: true,
    docType: true,
    docNo: true,
    status: true,
    issueDate: true,
    vatMode: true,
    discountAmount: true,
    grandTotal: true,
    voidedAt: true,
    voidReason: true,
    supersededByDocId: true,
    sourceDocId: true,
    refType: true,
    refId: true,
    adjustReason: true,
    contactSnapshot: true,
    contact: { select: { name: true, taxId: true, branchCode: true } },
    lines: { select: { amount: true, vatRateBp: true }, orderBy: { sortOrder: "asc" as const } },
  };
  const [docs, posDocs, posLinks] = await Promise.all([
    docIds.length ? db.accountDocument.findMany({ where: { id: { in: docIds } }, select: docSelect }) : [],
    saleIds.length ? db.accountDocument.findMany({ where: { refType: "PosSale", refId: { in: saleIds } }, select: { ...docSelect, refSystemId: true } }) : [],
    saleIds.length ? db.accountSystemLink.findMany({ where: { linkedKind: "POS" }, select: { linkedId: true } }) : [],
  ]);
  const posMeta = await posBillMeta(ctx.tenantId, [...posDocs.map((d) => d.refSystemId ?? ""), ...posLinks.map((l) => l.linkedId)], saleIds);
  type Doc = (typeof docs)[number];
  const docMap = new Map<string, Doc>(docs.map((d) => [d.id, d]));
  const posDocsBySale = new Map<string, Doc[]>();
  for (const d of posDocs) {
    const arr = posDocsBySale.get(d.refId!) ?? [];
    arr.push(d);
    posDocsBySale.set(d.refId!, arr);
  }
  // เลขที่ของเอกสารต้นทาง (ใบลดหนี้อ้างใบเดิม · ใบเต็มรูปแทนใบย่อ)
  const refDocIds = [...docs, ...posDocs].map((d) => d.sourceDocId).filter((x): x is string => !!x);
  const abbOfTx = new Map<string, Doc>(); // TX id → ABB ที่ถูกแทน
  for (const d of posDocs) if (d.docType === "TAX_INVOICE_ABB" && d.supersededByDocId) abbOfTx.set(d.supersededByDocId, d);
  const refDocs = refDocIds.length
    ? await db.accountDocument.findMany({ where: { id: { in: refDocIds } }, select: { id: true, docNo: true, docType: true, issueDate: true } })
    : [];
  const refDocMap = new Map(refDocs.map((d) => [d.id, d]));

  const buyerOf = (d: Doc | undefined) => {
    const snap = (d?.contactSnapshot ?? null) as { name?: string; taxId?: string; branchCode?: string } | null;
    const taxId = (snap?.taxId ?? d?.contact?.taxId ?? "").trim();
    return {
      buyerName: (snap?.name ?? d?.contact?.name ?? "").trim(),
      buyerTaxId: taxId,
      // สาขาผู้ซื้อมีความหมายเมื่อผู้ซื้อมีเลขผู้เสียภาษี (ผู้ประกอบการจดทะเบียน) เท่านั้น
      buyerBranchCode: taxId ? (snap?.branchCode ?? d?.contact?.branchCode ?? "00000").trim() || "00000" : "",
    };
  };

  // ── 3) แถวรายใบ ──
  const docRows: SalesTaxRow[] = [];
  const abbBills: SalesTaxRow[] = [];
  for (const s of sources.values()) {
    if (s.vat === 0 && !s.hasOriginal && !s.zeroReversed) continue; // ไม่มีอะไรในเดือนนี้
    const reversed = s.reversalVat !== 0 || !!s.zeroReversed;
    const sameMonthCancel = s.hasOriginal && reversed && s.vat === 0;
    const laterMonthCancel = !s.hasOriginal && reversed;
    if (s.vat === 0 && !sameMonthCancel && !s.zeroOnly) continue; // คู่บวกลบอื่น (ไม่ใช่การยกเลิก) — ไม่มียอดให้รายงาน

    let doc: Doc | undefined;
    let meta: PosBillMeta | undefined;
    if (s.refType === "AccountDocument") doc = docMap.get(s.refId);
    if (s.refType === "PosSale") {
      meta = posMeta.get(s.refId);
      const cands = posDocsBySale.get(s.refId) ?? [];
      const live = (d: Doc) => d.status !== "CANCELLED" && d.status !== "VOIDED";
      const abb = cands.find((d) => d.docType === "TAX_INVOICE_ABB");
      const full = abb?.supersededByDocId ? cands.find((d) => d.id === abb.supersededByDocId) : undefined;
      doc =
        full ??
        cands.find((d) => d.docType !== "TAX_INVOICE_ABB" && live(d)) ??
        abb ??
        cands.find((d) => d.docType !== "TAX_INVOICE_ABB") ??
        undefined;
    }

    const notes: string[] = [];
    const isAbb = s.refType === "PosSale" && (doc?.docType === "TAX_INVOICE_ABB" || (!doc && meta?.docType === "SALE" && meta.sourceModule !== "POS_DEPOSIT"));
    const docNo = doc?.docNo ?? meta?.receiptNo ?? s.journalNo;
    const date = laterMonthCancel ? (s.reversalDate ?? s.firstDate) : doc?.issueDate ?? meta?.paidAt ?? s.firstDate;
    const sign: 1 | -1 = doc?.docType === "CREDIT_NOTE" || meta?.docType === "REFUND" ? -1 : 1;

    let parts: RatePart[];
    if (sameMonthCancel) {
      const p = rateGroupsOf(doc ? { vatMode: doc.vatMode, discountAmount: doc.discountAmount, grandTotal: doc.grandTotal, lines: doc.lines } : null, 0, stdRateBp, { sign, grossFallback: meta?.grandTotalSatang });
      parts = (p.length ? p : [{ rateBp: stdRateBp, base: 0, vat: 0 }]).map((x) => ({ rateBp: x.rateBp, base: 0, vat: 0 }));
    } else {
      parts = rateGroupsOf(
        doc ? { vatMode: doc.vatMode, discountAmount: doc.discountAmount, grandTotal: doc.grandTotal, lines: doc.lines } : null,
        s.vat,
        stdRateBp,
        { sign, grossFallback: meta?.grandTotalSatang },
      );
      // ACC T1.3 ▸ ใบ 0%/ยกเว้น ที่ถูกยกเลิกข้ามเดือน: ไม่มียอดภาษีให้กลับทิศ ⇒ กลับทิศฐานเอง ◂
      if (s.zeroOnly && laterMonthCancel) parts = parts.map((x) => ({ ...x, base: -x.base }));
    }
    // ACC T1.9 ▸ รายการบัญชีที่ไม่มีเอกสาร (JV มือ ฯลฯ) = ปรับยอดภาษีอย่างเดียว ไม่มีมูลค่าขาย ⇒ ฐาน 0
    //   (เดิมเดาฐานจากยอดภาษี → ยอดขายใน ภ.พ.30 เพี้ยน + ข้อตรวจฐาน×อัตราแดง — ภาพจอ T1.7: JV −50 ได้ฐาน 50) ◂
    if (s.refType === "JOURNAL") parts = [{ rateBp: stdRateBp, base: 0, vat: s.vat }];

    // หมายเหตุ
    const cancelReason = doc?.voidReason ? ` (${doc.voidReason})` : "";
    if (sameMonthCancel) notes.push(`ยกเลิกภายในเดือนนี้ — ไม่มียอดภาษี${cancelReason}`);
    if (laterMonthCancel) {
      const origDate = doc?.issueDate ?? meta?.paidAt ?? null;
      notes.push(`ยกเลิก${DOC_TYPE_TH[doc?.docType ?? ""] ?? "เอกสาร"}เลขที่ ${docNo}${origDate ? ` ลงวันที่ ${fmtThDate(origDate)}` : ""} (ลงไว้ในเดือนก่อน)${cancelReason}`);
    }
    if (doc && (doc.docType === "CREDIT_NOTE" || doc.docType === "DEBIT_NOTE") && doc.sourceDocId) {
      const src = refDocMap.get(doc.sourceDocId);
      notes.push(`${DOC_TYPE_TH[doc.docType]} อ้างอิง${DOC_TYPE_TH[src?.docType ?? ""] ?? "เอกสาร"}เลขที่ ${src?.docNo ?? "-"}${src ? ` ลงวันที่ ${fmtThDate(src.issueDate)}` : ""}${doc.adjustReason ? ` · ${doc.adjustReason}` : ""}`);
    }
    const replacedAbb = doc ? abbOfTx.get(doc.id) : undefined;
    if (replacedAbb) notes.push(`ออกใบกำกับภาษีเต็มรูปแทนใบกำกับภาษีอย่างย่อเลขที่ ${replacedAbb.docNo ?? "-"} (ใบย่อไม่นับซ้ำ)`);
    if (doc?.docType === "DEPOSIT_RECEIPT") notes.push("รับเงินมัดจำ (ภาษีเกิดเมื่อรับชำระ)");
    if (s.refType === "PosSale" && !doc) notes.push("บิล POS ไม่มีเอกสารบัญชี — ฐานจากยอดบิล");
    if (s.refType === "JOURNAL")
      notes.push(s.manual ? `รายการปรับปรุงมือ ${s.journalNo}${s.memo ? ` · ${s.memo}` : ""} (JV ที่บันทึกเอง — ไม่มีใบกำกับ)` : `รายการบัญชี ${s.journalNo}${s.memo ? ` · ${s.memo}` : ""} (ไม่มีเอกสาร)`);

    const sum = sumParts(parts);
    const row: SalesTaxRow = {
      key: s.key,
      kind: s.refType === "JOURNAL" ? "JOURNAL" : isAbb && !laterMonthCancel ? "ABB" : "DOC",
      date: bkkYmd(date),
      docNo,
      docType: doc?.docType ?? (meta ? (meta.docType === "REFUND" ? "POS_REFUND" : "POS_SALE") : undefined),
      ...(isAbb ? { buyerName: buyerOf(doc).buyerName, buyerTaxId: "", buyerBranchCode: "" } : buyerOf(doc)),
      parts,
      base: sum.base,
      vat: sum.vat,
      notes,
      cancelled: sameMonthCancel || laterMonthCancel,
      docId: doc?.id,
      unitId: meta?.unitId ?? null,
      unitName: meta?.unitName ?? null,
      deviceCode: meta?.deviceCode ?? null,
      deviceName: meta?.deviceName ?? null,
      posRegNo: meta?.posRegNo ?? null,
      posVat: meta ? (meta.docType === "REFUND" ? -meta.vatSatang : meta.vatSatang) : null,
      posHasDeposit: meta?.hasDeposit ?? false,
      ...(s.manual ? { manual: true, buyerName: "รายการปรับปรุงมือ" } : {}),
    };
    const bad = row.kind === "JOURNAL" ? undefined : parts.find((p) => !partConsistent(p, baseVatTolerance(row)));
    if (bad) row.flag = `ฐาน ${(bad.base / 100).toFixed(2)} × อัตรา ไม่ตรงกับภาษี ${(bad.vat / 100).toFixed(2)}`;
    if (row.kind === "ABB") abbBills.push(row);
    else docRows.push(row);
  }

  const rows = sortRows([...docRows, ...summarizeAbb(abbBills, abbMode)]);
  for (const r of rows) {
    if (r.kind !== "ABB_SUMMARY" || r.flag) continue;
    const bad = r.parts.find((p) => !partConsistent(p, baseVatTolerance(r)));
    if (bad) r.flag = `ฐาน × อัตรา ไม่ตรงกับภาษี`;
  }
  const { groups } = groupByRate(rows, stdRateBp);
  const total = sumParts(rows.flatMap((r) => r.parts));
  const manualRows = rows.filter((r) => r.manual);
  return {
    periodKey, header, abbMode, abbModeSetting, stdRateBp, rows, groups, total, glVat,
    checks: buildChecks(rows, total.vat, glVat, null, outputLedger),
    outputLedger,
    manualAdjustments: { count: manualRows.length, vat: manualRows.reduce((n, r) => n + r.vat, 0) },
  };
}

/**
 * ข้อตรวจกระทบยอด (ไม่บล็อก): ① รายงาน = GL 2200 ② รายงาน = ภาษีขายของ ภ.พ.30 ③ ฐานสอดคล้องภาษีทุกแถว ④ ภาษีบิล POS = ภาษีบนบิลต้นทาง
 * pp30Vat = null ⇒ ใช้ glVat (ผู้เรียก pp30 ส่งยอดของตัวเองมาเทียบ)
 */
export function buildChecks(
  rows: SalesTaxRow[],
  reportVat: number,
  glVat: number,
  pp30Vat: number | null,
  /** ACC T1.9 ▸ บัญชีภาษีขายตาม mapping (ป้ายข้อตรวจ) — ไม่ส่ง = ป้ายกลาง ◂ */
  ledger?: { code: string; name: string } | null,
): SalesTaxCheck[] {
  const flat = rows.flatMap((r) => (r.kind === "ABB_SUMMARY" ? (r.bills ?? []) : [r]));
  const flagged = rows.filter((r) => r.flag);
  const posRows = flat.filter((r) => r.posVat !== null && r.posVat !== undefined && !r.cancelled && !r.posHasDeposit);
  const posMismatch = posRows.filter((r) => r.vat !== r.posVat);
  const posVatSum = posRows.reduce((n, r) => n + (r.posVat ?? 0), 0);
  const posRepSum = posRows.reduce((n, r) => n + r.vat, 0);
  return [
    { key: "GL_2200", label: `ภาษีขายในรายงาน = ยอดเคลื่อนไหวบัญชี${ledger ? ` ${ledger.code} ${ledger.name}` : "ภาษีขาย"} ของเดือน`, ok: reportVat === glVat, expected: glVat, actual: reportVat },
    { key: "PP30", label: "ภาษีขายในรายงาน = ภาษีขายของ ภ.พ.30", ok: reportVat === (pp30Vat ?? glVat), expected: pp30Vat ?? glVat, actual: reportVat },
    {
      key: "BASE_VAT",
      label: "ฐานภาษีสอดคล้องกับภาษีทุกแถว (ฐาน × อัตรา ≈ ภาษี)",
      ok: flagged.length === 0,
      expected: 0,
      actual: flagged.length,
      ...(flagged.length ? { detail: flagged.map((r) => r.docNo).join(", ") } : {}),
    },
    {
      key: "POS_BILLS",
      label: "ภาษีของบิล POS ในรายงาน = ภาษีบนบิลต้นทาง (ไม่รวมบิลที่ยกเลิก/จ่ายด้วยมัดจำ)",
      ok: posMismatch.length === 0,
      expected: posVatSum,
      actual: posRepSum,
      ...(posMismatch.length ? { detail: posMismatch.map((r) => r.docNo).join(", ") } : {}),
    },
  ];
}
