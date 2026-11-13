// ─────────────────────────────────────────────────────────────
// purchase-tax-report.ts — รายงานภาษีซื้อ (ACC T1.6 · อ่านอย่างเดียว · ไม่โพสต์ GL)
//
// แบบเดียวกับรายงานภาษีขาย (T1.1 sales-tax-report.ts): หัวรายงาน · แถวรายใบจาก GL ตาม mapping · ข้อตรวจกระทบยอด
//   ตัวรายงาน = ส่วนที่หักได้: บรรทัดบัญชีภาษีซื้อ (VAT_INPUT) ของเดือน รวมต่อเอกสาร · ลำดับที่รันต่อเดือน เรียงตามวันที่ได้รับ
//   รายการปรับปรุงมือ (T1.9) แยกส่วน · ส่วนที่หักไม่ได้ (บัญชีภาษีซื้อไม่ขอคืน ตามเหตุ T1.4) + รอใบกำกับ (T1.5) แสดงต่อท้าย ไม่รวมยอด
// design note: ledger/wo-notes/T1.6.md
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import { DOC_SETTINGS_KEY } from "./settings-schema";
import { pendingInputVat } from "./input-vat";
import { docDefaultStatus, lineStatusOf, nonClaimReasonOf, parseInputVatSettings, type NonClaimPosting } from "./input-vat-shared";
import { vatLedgers } from "./pp30-return";
import { stdRateOfMonth, taxReportHeaderOf, TAX_HEADER_SETTINGS_SELECT } from "./sales-tax-report";
import { baseVatTolerance, partConsistent, compareDocNo, type SalesTaxHeader } from "./sales-tax-shared";

type Ctx = { tenantId: string; systemId: string };

export type PurchaseTaxRowKind = "DOC" | "JOURNAL";

export type PurchaseTaxRow = {
  key: string;
  kind: PurchaseTaxRowKind;
  /** ลำดับที่ (รันใหม่ทุกเดือน · เฉพาะแถวรายใบ) */
  seq: number | null;
  /** วันที่ได้รับ (ไทย YYYY-MM-DD) = วันที่ลงบัญชีภาษีซื้อ */
  receivedDate: string;
  /** วันที่ในใบกำกับภาษีของผู้ขาย */
  invoiceDate: string;
  /** เลขที่ใบกำกับภาษีของผู้ขาย (ไม่มี = เลขเอกสารของเรา) */
  invoiceNo: string;
  /** เลขเอกสารของเรา / เลขรายการบัญชี */
  docNo: string;
  docId: string | null;
  docType: string | null;
  vendorName: string;
  vendorTaxId: string;
  /** รหัสสาขาผู้ขาย 5 หลัก ("" = ไม่มีเลขผู้เสียภาษี) */
  vendorBranchCode: string;
  rateBp: number;
  base: number;
  vat: number;
  notes: string[];
  cancelled: boolean;
  /** JV ที่บันทึกเอง (T1.9) */
  manual?: boolean;
  flag?: string;
};

export type PurchaseTaxNonClaimRow = {
  key: string;
  date: string;
  docNo: string;
  docId: string | null;
  docType: string | null;
  vendorName: string;
  vendorTaxId: string;
  base: number;
  vat: number;
  notes: string[];
};

export type PurchaseTaxNonClaimGroup = {
  /** รหัสเหตุ (T1.4) · "UNSPECIFIED" = ไม่ระบุเหตุ */
  reason: string;
  labelTh: string;
  sectionTh: string;
  /** DEDUCTIBLE = รายจ่ายได้ (6950) · DISALLOWED = รายจ่ายต้องห้าม (6960) */
  group: "DEDUCTIBLE" | "DISALLOWED" | null;
  rows: PurchaseTaxNonClaimRow[];
  base: number;
  vat: number;
};

export type PurchaseTaxPendingRow = {
  ptxId: string;
  ptxNo: string | null;
  sourceId: string;
  sourceDocNo: string | null;
  sourceDocType: string;
  sourceDate: string;
  vendorName: string;
  vendorTaxId: string;
  vat: number;
  ageDays: number;
  lastClaimMonthTh: string | null;
  pastWindow: boolean;
};

export type PurchaseTaxCheck = {
  key: "GL_INPUT" | "PP30" | "BASE_VAT";
  label: string;
  ok: boolean;
  expected: number;
  actual: number;
  detail?: string;
};

export type PurchaseTaxReport = {
  periodKey: string;
  header: SalesTaxHeader;
  stdRateBp: number;
  /** บัญชีภาษีซื้อที่รายงานอ่าน (mapping VAT_INPUT) */
  inputLedger: { code: string; name: string } | null;
  /** ตัวรายงาน: รายใบ (ลำดับที่ 1…n) */
  rows: PurchaseTaxRow[];
  /** รายการบัญชีที่ไม่มีเอกสารบนบัญชีภาษีซื้อ (JV มือ T1.9 ฯลฯ) — ฐาน 0 */
  adjustments: PurchaseTaxRow[];
  docsTotal: { base: number; vat: number };
  adjustmentsTotal: { count: number; vat: number };
  /** ยอดภาษีซื้อของรายงาน = รายใบ + ปรับปรุง */
  total: { base: number; vat: number };
  /** ยอดเคลื่อนไหวสุทธิฝั่งเดบิตของบัญชีภาษีซื้อในเดือน */
  glVat: number;
  checks: PurchaseTaxCheck[];
  /** ส่วนที่หักไม่ได้ (ไม่อยู่ในยอดรายงาน) */
  notClaimable: { posting: NonClaimPosting; groups: PurchaseTaxNonClaimGroup[]; total: { base: number; vat: number } };
  /** รอใบกำกับ ณ ตอนดู ของเอกสารที่ลงวันที่ถึงสิ้นเดือนนี้ (ไม่อยู่ในยอดรายงาน) */
  pending: { rows: PurchaseTaxPendingRow[]; vat: number };
};

const DOC_TYPE_TH: Record<string, string> = {
  PURCHASE: "ใบบันทึกซื้อ",
  EXPENSE: "ใบบันทึกค่าใช้จ่าย",
  ASSET_PURCHASE: "ใบซื้อสินทรัพย์",
  PURCHASE_TAX_INVOICE: "ใบกำกับภาษีซื้อ",
  CREDIT_NOTE_RECEIVED: "ใบลดหนี้รับ",
  DEBIT_NOTE_RECEIVED: "ใบเพิ่มหนี้รับ",
};
const NOTE_TYPES = new Set(["CREDIT_NOTE_RECEIVED", "DEBIT_NOTE_RECEIVED"]);

const bkkYmd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const fmtThDate = (d: Date) => {
  const [y, m, dd] = bkkYmd(d).split("-");
  return `${Number(dd)}/${Number(m)}/${Number(y) + 543}`;
};

/** แบ่งยอดตามน้ำหนัก (largest remainder · Σ = total เป๊ะ) */
function splitByWeight(total: number, weights: number[]): number[] {
  const W = weights.reduce((a, b) => a + b, 0);
  if (W <= 0 || weights.length === 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((w) => (total * w) / W);
  const out = raw.map((x) => Math.trunc(x));
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: Math.abs(x - Math.trunc(x)) })).sort((a, b) => b.f - a.f);
  for (let k = 0; rest !== 0 && k < order.length * 2; k++) {
    const i = order[k % order.length]!.i;
    out[i] += rest > 0 ? 1 : -1;
    rest += rest > 0 ? -1 : 1;
  }
  return out;
}

type Agg = {
  key: string;
  refId: string | null;
  vat: number;
  reversalVat: number;
  hasOriginal: boolean;
  firstDate: Date;
  reversalDate: Date | null;
  journalNo: string;
  memo: string | null;
  manual: boolean;
};

/** บรรทัดของบัญชีในเดือน → รวมต่อต้นทาง (เอกสาร / รายการบัญชี) · ทิศ: เดบิตสุทธิ = + */
async function aggregate(ctx: Ctx, ledgerIds: string[], periodKey: string): Promise<{ aggs: Agg[]; gl: number }> {
  if (ledgerIds.length === 0) return { aggs: [], gl: 0 };
  const lines = await tenantDb(ctx).accountJournalLine.findMany({
    where: { accountId: { in: ledgerIds }, entry: { periodKey } },
    select: { debit: true, credit: true, entry: { select: { id: true, refType: true, refId: true, date: true, docNo: true, reversalOfId: true, memo: true, source: true } } },
  });
  const m = new Map<string, Agg>();
  let gl = 0;
  for (const l of lines) {
    const v = l.debit - l.credit;
    gl += v;
    const e = l.entry;
    const isDoc = e.refType === "AccountDocument" && !!e.refId;
    const key = isDoc ? `doc:${e.refId}` : `jv:${e.id}`;
    const a = m.get(key) ?? { key, refId: isDoc ? e.refId : null, vat: 0, reversalVat: 0, hasOriginal: false, firstDate: e.date, reversalDate: null, journalNo: e.docNo, memo: e.memo, manual: false };
    if (!isDoc && e.source === "MANUAL") a.manual = true;
    a.vat += v;
    if (e.reversalOfId) {
      a.reversalVat += v;
      a.reversalDate = a.reversalDate && a.reversalDate > e.date ? a.reversalDate : e.date;
    } else {
      a.hasOriginal = true;
      if (e.date < a.firstDate) a.firstDate = e.date;
    }
    m.set(key, a);
  }
  return { aggs: [...m.values()], gl };
}

const docSelect = {
  id: true,
  docType: true,
  docNo: true,
  status: true,
  issueDate: true,
  reference: true,
  vendorInvoiceDate: true,
  inputVatLateNote: true,
  inputVatStatus: true,
  vatMode: true,
  vatTiming: true,
  taxPointBasis: true,
  subTotal: true,
  discountAmount: true,
  vatAmount: true,
  voidReason: true,
  sourceDocId: true,
  adjustReason: true,
  contactSnapshot: true,
  contact: { select: { name: true, taxId: true, branchCode: true } },
  lines: { select: { amount: true, vatRateBp: true, inputVatStatus: true, inputVatReason: true }, orderBy: { sortOrder: "asc" as const } },
} as const;

/** บัญชีภาษีซื้อไม่ขอคืน 2 ชนิด (mapping · ไม่มี = รหัสผังเริ่มต้น 6950/6960 — ทางเดียวกับ coa.ts) */
async function nonClaimLedgers(ctx: Ctx): Promise<{ deductible: string | null; disallowed: string | null }> {
  const db = tenantDb(ctx);
  const maps = await db.accountMapping.findMany({ where: { key: { in: ["VAT_INPUT_NONCLAIM", "VAT_INPUT_NONCLAIM_DISALLOWED"] } }, select: { key: true, accountId: true } });
  const byKey = new Map(maps.map((x) => [x.key, x.accountId]));
  const missing = [["VAT_INPUT_NONCLAIM", "6950"], ["VAT_INPUT_NONCLAIM_DISALLOWED", "6960"]].filter(([k]) => !byKey.has(k!));
  if (missing.length) {
    const ls = await db.accountLedger.findMany({ where: { code: { in: missing.map(([, c]) => c!) } }, select: { id: true, code: true } });
    for (const [k, c] of missing) {
      const l = ls.find((x) => x.code === c);
      if (l) byKey.set(k!, l.id);
    }
  }
  return { deductible: byKey.get("VAT_INPUT_NONCLAIM") ?? null, disallowed: byKey.get("VAT_INPUT_NONCLAIM_DISALLOWED") ?? null };
}

export async function purchaseTaxReport(
  ctx: Ctx,
  periodKey: string,
  opts?: { /** ภาษีซื้อของ ภ.พ.30 (ผู้เรียก pp30 ส่งมาเทียบ) · ไม่ส่ง = ยอด GL */ pp30Vat?: number | null },
): Promise<PurchaseTaxReport> {
  const db = tenantDb(ctx);
  const [settings, ledgers, stdRateBp, nc] = await Promise.all([
    db.accountSettings.findFirst({ where: {}, select: TAX_HEADER_SETTINGS_SELECT }),
    vatLedgers(ctx),
    stdRateOfMonth(ctx, periodKey),
    nonClaimLedgers(ctx),
  ]);
  const header = taxReportHeaderOf(settings, periodKey, "รายงานภาษีซื้อ");
  const root = (settings?.docConfig ?? {}) as Record<string, unknown>;
  const ivs = parseInputVatSettings(((root[DOC_SETTINGS_KEY] ?? {}) as Record<string, unknown>).inputVat);
  const input = ledgers.VAT_INPUT ?? null;
  const inputLedger = input ? { code: input.code, name: input.name } : null;

  const [claim, ncDed, ncDis] = await Promise.all([
    aggregate(ctx, input ? [input.id] : [], periodKey),
    aggregate(ctx, nc.deductible ? [nc.deductible] : [], periodKey),
    aggregate(ctx, nc.disallowed ? [nc.disallowed] : [], periodKey),
  ]);

  // ── เอกสาร (ต้นทางของแถว + ใบเดิมของใบลด/เพิ่มหนี้) ──
  const docIds = [...new Set([...claim.aggs, ...ncDed.aggs, ...ncDis.aggs].map((a) => a.refId).filter((x): x is string => !!x))];
  const docs = docIds.length ? await db.accountDocument.findMany({ where: { id: { in: docIds } }, select: docSelect }) : [];
  const refIds = [...new Set(docs.map((d) => d.sourceDocId).filter((x): x is string => !!x))].filter((id) => !docIds.includes(id));
  const refDocs = refIds.length ? await db.accountDocument.findMany({ where: { id: { in: refIds } }, select: docSelect }) : [];
  type Doc = (typeof docs)[number];
  const docMap = new Map<string, Doc>([...docs, ...refDocs].map((d) => [d.id, d]));

  const vendorOf = (d: Doc | undefined) => {
    const snap = (d?.contactSnapshot ?? null) as { name?: string; taxId?: string; branchCode?: string } | null;
    const taxId = (snap?.taxId ?? d?.contact?.taxId ?? "").trim();
    return {
      vendorName: (snap?.name ?? d?.contact?.name ?? "").trim(),
      vendorTaxId: taxId,
      // สาขาผู้ขายมีความหมายเมื่อผู้ขายมีเลขผู้เสียภาษี (แบบเดียวกับฝั่งผู้ซื้อ T1.1) · ไม่ระบุ = สำนักงานใหญ่
      vendorBranchCode: taxId ? (snap?.branchCode ?? d?.contact?.branchCode ?? "00000").trim() || "00000" : "",
    };
  };
  /** ฐานของส่วนนี้ = ฐานเอกสาร × (ภาษีส่วนนี้ ÷ ภาษีทั้งใบ) · ทิศตามภาษี */
  const baseOf = (d: Doc | undefined, vat: number) => {
    if (!d) return 0;
    const docBase = Math.abs(d.subTotal - d.discountAmount);
    const docVat = Math.abs(d.vatAmount);
    const b = docVat > 0 ? Math.round((docBase * Math.abs(vat)) / docVat) : docBase;
    return vat < 0 ? -b : b;
  };
  const noteRefOf = (d: Doc): string | null => {
    if (!NOTE_TYPES.has(d.docType) || !d.sourceDocId) return null;
    const src = docMap.get(d.sourceDocId);
    return `${DOC_TYPE_TH[d.docType]} อ้างอิง${DOC_TYPE_TH[src?.docType ?? ""] ?? "เอกสาร"}เลขที่ ${src?.reference || src?.docNo || "-"}${src ? ` ลงวันที่ ${fmtThDate(src.vendorInvoiceDate ?? src.issueDate)}` : ""}${d.adjustReason ? ` · ${d.adjustReason}` : ""}`;
  };
  const cancelNotes = (a: Agg, d: Doc | undefined, docNo: string): { notes: string[]; cancelled: boolean; skip: boolean } => {
    const reversed = a.reversalVat !== 0;
    const sameMonth = a.hasOriginal && reversed && a.vat === 0;
    const laterMonth = !a.hasOriginal && reversed;
    if (a.vat === 0 && !sameMonth) return { notes: [], cancelled: false, skip: true };
    const why = d?.voidReason ? ` (${d.voidReason})` : "";
    const receiveUndo = d?.docType === "PURCHASE_TAX_INVOICE" && d.status !== "VOIDED" && d.status !== "CANCELLED";
    const notes: string[] = [];
    if (sameMonth) notes.push(receiveUndo ? `ยกเลิกการรับใบกำกับภายในเดือนนี้ — ไม่มียอดภาษี${why}` : `ยกเลิกภายในเดือนนี้ — ไม่มียอดภาษี${why}`);
    if (laterMonth)
      notes.push(
        `${receiveUndo ? "ยกเลิกการรับ" : "ยกเลิก"}${DOC_TYPE_TH[d?.docType ?? ""] ?? "เอกสาร"}เลขที่ ${docNo}${d ? ` ลงวันที่ ${fmtThDate(d.issueDate)}` : ""} (ลงไว้ในเดือนก่อน)${why}`,
      );
    return { notes, cancelled: sameMonth || laterMonth, skip: false };
  };

  // ── 1) ตัวรายงาน: รายใบ + ปรับปรุง ──
  const rows: PurchaseTaxRow[] = [];
  const adjustments: PurchaseTaxRow[] = [];
  for (const a of claim.aggs) {
    if (!a.refId) {
      if (a.vat === 0) continue;
      adjustments.push({
        key: a.key, kind: "JOURNAL", seq: null, receivedDate: bkkYmd(a.firstDate), invoiceDate: bkkYmd(a.firstDate), invoiceNo: "", docNo: a.journalNo, docId: null, docType: null,
        vendorName: a.manual ? "รายการปรับปรุงมือ" : "รายการบัญชี", vendorTaxId: "", vendorBranchCode: "", rateBp: stdRateBp, base: 0, vat: a.vat,
        notes: [a.manual ? `รายการปรับปรุงมือ ${a.journalNo}${a.memo ? ` · ${a.memo}` : ""} (JV ที่บันทึกเอง — ไม่มีใบกำกับ)` : `รายการบัญชี ${a.journalNo}${a.memo ? ` · ${a.memo}` : ""} (ไม่มีเอกสาร)`],
        cancelled: false, ...(a.manual ? { manual: true } : {}),
      });
      continue;
    }
    const d = docMap.get(a.refId);
    const docNo = d?.docNo ?? a.journalNo;
    const c = cancelNotes(a, d, docNo);
    if (c.skip) continue;
    const received = c.cancelled && !a.hasOriginal ? (a.reversalDate ?? a.firstDate) : a.firstDate;
    const notes = [...c.notes];
    if (d?.inputVatLateNote) notes.push(d.inputVatLateNote);
    if (d) {
      const nr = noteRefOf(d);
      if (nr) notes.push(nr);
      if (!d.reference) notes.push("ไม่ได้บันทึกเลขที่ใบกำกับของผู้ขาย — แสดงเลขเอกสารของร้าน");
    }
    const base = c.cancelled && a.vat === 0 ? 0 : baseOf(d, a.vat);
    const rateBp = base !== 0 ? Math.round((a.vat / base) * 10000) : stdRateBp;
    const row: PurchaseTaxRow = {
      key: a.key, kind: "DOC", seq: null, receivedDate: bkkYmd(received), invoiceDate: bkkYmd(d?.vendorInvoiceDate ?? d?.issueDate ?? a.firstDate),
      invoiceNo: d?.reference || docNo, docNo, docId: d?.id ?? null, docType: d?.docType ?? null, ...vendorOf(d),
      rateBp, base, vat: a.vat, notes, cancelled: c.cancelled,
    };
    if (!partConsistent({ rateBp: stdRateBp, base, vat: a.vat }, baseVatTolerance({ count: 1 } as never)) && !(base === 0 && a.vat === 0))
      row.flag = `ฐาน ${(base / 100).toFixed(2)} × อัตรา ไม่ตรงกับภาษี ${(a.vat / 100).toFixed(2)}`;
    rows.push(row);
  }
  // เรียงตามวันที่ได้รับ → เลขที่ใบกำกับ → เลขเอกสาร · ลำดับที่รันใหม่ต่อเดือน
  rows.sort((x, y) => x.receivedDate.localeCompare(y.receivedDate) || compareDocNo(x.invoiceNo, y.invoiceNo) || compareDocNo(x.docNo, y.docNo));
  rows.forEach((r, i) => (r.seq = i + 1));
  adjustments.sort((x, y) => x.receivedDate.localeCompare(y.receivedDate) || compareDocNo(x.docNo, y.docNo));

  const docsTotal = rows.reduce((t, r) => ({ base: t.base + r.base, vat: t.vat + r.vat }), { base: 0, vat: 0 });
  const adjVat = adjustments.reduce((n, r) => n + r.vat, 0);
  const total = { base: docsTotal.base, vat: docsTotal.vat + adjVat };
  const flagged = rows.filter((r) => r.flag);
  const pp30Vat = opts?.pp30Vat ?? claim.gl;
  const checks: PurchaseTaxCheck[] = [
    { key: "GL_INPUT", label: `ภาษีซื้อในรายงาน (รายใบ + รายการปรับปรุง) = ยอดเคลื่อนไหวบัญชี${inputLedger ? ` ${inputLedger.code} ${inputLedger.name}` : "ภาษีซื้อ"} ของเดือน`, ok: total.vat === claim.gl, expected: claim.gl, actual: total.vat },
    { key: "PP30", label: "ภาษีซื้อในรายงาน = ภาษีซื้อของ ภ.พ.30", ok: total.vat === pp30Vat, expected: pp30Vat, actual: total.vat },
    { key: "BASE_VAT", label: "ฐานภาษีสอดคล้องกับภาษีทุกแถว (ฐาน × อัตรา ≈ ภาษี)", ok: flagged.length === 0, expected: 0, actual: flagged.length, ...(flagged.length ? { detail: flagged.map((r) => r.docNo).join(", ") } : {}) },
  ];

  // ── 2) ส่วนที่หักไม่ได้ (ตามเหตุ T1.4) ──
  const groups = new Map<string, PurchaseTaxNonClaimGroup>();
  const addNc = (reason: string | null, bucket: "DEDUCTIBLE" | "DISALLOWED", row: PurchaseTaxNonClaimRow) => {
    const r = nonClaimReasonOf(reason);
    const code = r?.code ?? `UNSPECIFIED_${bucket}`;
    const g =
      groups.get(code) ??
      ({
        reason: r?.code ?? "UNSPECIFIED",
        labelTh: r?.labelTh ?? `ไม่ระบุเหตุ (${bucket === "DEDUCTIBLE" ? "บัญชีรายจ่ายได้" : "บัญชีรายจ่ายต้องห้าม"})`,
        sectionTh: r?.sectionTh ?? "",
        group: r?.group === "DEDUCTIBLE" || r?.group === "DISALLOWED" ? r.group : bucket,
        rows: [],
        base: 0,
        vat: 0,
      } as PurchaseTaxNonClaimGroup);
    g.rows.push(row);
    g.base += row.base;
    g.vat += row.vat;
    groups.set(code, g);
  };
  /** เหตุของส่วนที่เคลมไม่ได้ของใบ: บรรทัดที่เคลมไม่ได้ (น้ำหนัก ฐาน × อัตรา) · ใบกำกับภาษีซื้อ = เหตุที่บันทึก · ใบลด/เพิ่มหนี้ = ของใบเดิม */
  const reasonsOf = (d: Doc | undefined): { reason: string | null; w: number }[] => {
    if (!d) return [{ reason: null, w: 1 }];
    if (d.docType === "PURCHASE_TAX_INVOICE") return [{ reason: d.lines[0]?.inputVatReason ?? null, w: 1 }];
    const own = d.lines
      .filter((l) => lineStatusOf(l, docDefaultStatus(d)) === "NO_CLAIM")
      .map((l) => ({ reason: l.inputVatReason, w: Math.max(0, Math.abs(l.amount)) * Math.max(1, l.vatRateBp) }));
    if (own.length) return own;
    if (NOTE_TYPES.has(d.docType) && d.sourceDocId) return reasonsOf(docMap.get(d.sourceDocId));
    return [{ reason: null, w: 1 }];
  };
  for (const [bucket, agg] of [["DEDUCTIBLE", ncDed], ["DISALLOWED", ncDis]] as const) {
    for (const a of agg.aggs) {
      const d = a.refId ? docMap.get(a.refId) : undefined;
      const docNo = d?.docNo ?? a.journalNo;
      const c = cancelNotes(a, d, docNo);
      if (c.skip) continue;
      const notes = [...c.notes];
      if (d) {
        const nr = noteRefOf(d);
        if (nr) notes.push(nr);
      } else notes.push(a.manual ? `รายการปรับปรุงมือ ${a.journalNo}${a.memo ? ` · ${a.memo}` : ""}` : `รายการบัญชี ${a.journalNo}`);
      const rs = reasonsOf(d);
      // รวมเหตุซ้ำ แล้วแบ่งภาษีของใบตามน้ำหนัก
      const byReason = new Map<string | null, number>();
      for (const r of rs) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + r.w);
      const keys = [...byReason.keys()];
      const vats = splitByWeight(a.vat, keys.map((k) => byReason.get(k)!));
      keys.forEach((reason, i) => {
        const vat = vats[i] ?? 0;
        if (vat === 0 && !c.cancelled) return;
        const v = vendorOf(d);
        addNc(reason, bucket, {
          key: `${a.key}:${reason ?? "-"}`,
          date: bkkYmd(c.cancelled && !a.hasOriginal ? (a.reversalDate ?? a.firstDate) : a.firstDate),
          docNo,
          docId: d?.id ?? null,
          docType: d?.docType ?? null,
          vendorName: v.vendorName || (d ? "" : "รายการบัญชี"),
          vendorTaxId: v.vendorTaxId,
          base: c.cancelled && a.vat === 0 ? 0 : baseOf(d, vat),
          vat,
          notes: keys.length > 1 ? [...notes, `ใบนี้มีหลายเหตุ — แบ่งภาษีตามบรรทัด`] : notes,
        });
      });
    }
  }
  const ncGroups = [...groups.values()].sort((x, y) => (x.group === y.group ? x.labelTh.localeCompare(y.labelTh, "th") : x.group === "DEDUCTIBLE" ? -1 : 1));
  for (const g of ncGroups) g.rows.sort((x, y) => x.date.localeCompare(y.date) || compareDocNo(x.docNo, y.docNo));
  const ncTotal = ncGroups.reduce((t, g) => ({ base: t.base + g.base, vat: t.vat + g.vat }), { base: 0, vat: 0 });

  // ── 3) รอใบกำกับ (ณ ตอนดู) ของเอกสารที่ลงวันที่ถึงสิ้นเดือนนี้ ──
  const monthEnd = new Date(new Date(`${periodKey}-01T00:00:00+07:00`).getTime());
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const pend = Number.isNaN(monthEnd.getTime()) ? { rows: [] } : await pendingInputVat(ctx);
  const pendingRows: PurchaseTaxPendingRow[] = pend.rows
    .filter((r) => r.sourceDate < monthEnd)
    .map((r) => ({
      ptxId: r.ptxId,
      ptxNo: r.ptxNo,
      sourceId: r.sourceId,
      sourceDocNo: r.sourceDocNo,
      sourceDocType: r.sourceDocType,
      sourceDate: bkkYmd(r.sourceDate),
      vendorName: r.contactName ?? "",
      vendorTaxId: r.contactTaxId ?? "",
      vat: r.vat,
      ageDays: r.ageDays,
      lastClaimMonthTh: r.lastClaimMonthTh,
      pastWindow: r.pastWindow,
    }))
    .sort((x, y) => x.sourceDate.localeCompare(y.sourceDate) || compareDocNo(x.sourceDocNo ?? "", y.sourceDocNo ?? ""));

  return {
    periodKey,
    header,
    stdRateBp,
    inputLedger,
    rows,
    adjustments,
    docsTotal,
    adjustmentsTotal: { count: adjustments.length, vat: adjVat },
    total,
    glVat: claim.gl,
    checks,
    notClaimable: { posting: ivs.nonClaimPosting, groups: ncGroups, total: ncTotal },
    pending: { rows: pendingRows, vat: pendingRows.reduce((n, r) => n + r.vat, 0) },
  };
}
