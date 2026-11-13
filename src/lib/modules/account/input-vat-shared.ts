// ─────────────────────────────────────────────────────────────
// input-vat-shared.ts — สถานะภาษีซื้อ (ACC T1.4) + เคลมข้ามเดือน (ACC T1.5) · pure ล้วน (gl · expense · ฟอร์ม client · ข้อสอบ)
//
// กฎ (skill shark-thai-law · references/common-vat-invoice.md §17 · domain-business-income-tax.md §ก4):
//   ภาษีซื้อต้องห้าม ม.82/5 [V] · เคลมได้เมื่อมีใบกำกับเต็มรูป (checklist C1) · หมวดต้องห้ามค่าเริ่มไม่เคลม (C2)
//   ภาษีซื้อต้องห้าม (4)(6) เป็นรายจ่ายได้ · (1)(2)(3)(5) เป็นรายจ่ายไม่ได้ (6 ทวิ) ⇒ บัญชีภาษีซื้อไม่ขอคืน 2 ชนิด
//   เคลมข้ามเดือน ≤ 6 เดือนนับแต่เดือนถัดจากเดือนที่ออกใบ + ข้อความ "ถือเป็นภาษีซื้อในเดือนภาษี…" (ฉ.4 ข้อ 2)
// ตัวเลข/เหตุ/มาตรามาจากตารางค่ากฎหมาย `core/settings/legal/th-tax-2569.ts` — ไฟล์นี้ไม่ฝังค่า
// design note: ledger/wo-notes/T1.4.md · T1.5.md
// ─────────────────────────────────────────────────────────────
import {
  INPUT_VAT_NONCLAIM_DEFAULT_REASON,
  INPUT_VAT_NONCLAIM_REASONS,
  lateClaimRuleAt,
  nonClaimReasonOf,
  type InputVatLateClaimRow,
  type NonClaimGroup,
} from "@/lib/core/settings/legal/th-tax-2569";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";

export { INPUT_VAT_NONCLAIM_REASONS, nonClaimReasonOf, type NonClaimGroup };

export const INPUT_VAT_STATUSES = ["CLAIM", "PENDING", "NO_CLAIM"] as const;
export type InputVatStatus = (typeof INPUT_VAT_STATUSES)[number];

export const INPUT_VAT_STATUS_LABEL_TH: Record<InputVatStatus, string> = {
  CLAIM: "มีใบกำกับเต็มรูป (เคลม)",
  PENDING: "ยังไม่ได้รับใบกำกับ (พักรอ)",
  NO_CLAIM: "เคลมไม่ได้",
};
export const INPUT_VAT_STATUS_SHORT_TH: Record<InputVatStatus, string> = { CLAIM: "เคลม", PENDING: "รอใบกำกับ", NO_CLAIM: "เคลมไม่ได้" };

export const isInputVatStatus = (v: unknown): v is InputVatStatus => typeof v === "string" && (INPUT_VAT_STATUSES as readonly string[]).includes(v);

/** โหมดเดิมของ REST/ฟอร์มเก่า (`vatPurchaseMode`) ↔ สถานะ */
export function statusFromPurchaseMode(m: string | null | undefined): InputVatStatus | null {
  if (m === "CLAIM") return "CLAIM";
  if (m === "AWAITING" || m === "PENDING") return "PENDING";
  if (m === "NO_CLAIM") return "NO_CLAIM";
  return null;
}

// ─────────────────── ค่าตั้ง (docConfig.inputVat) ───────────────────

export type NonClaimPosting = "SEPARATE_ACCOUNT" | "INTO_COST";
export type InputVatSettings = {
  /** ภาษีซื้อเคลมไม่ได้: บัญชีภาษีซื้อไม่ขอคืน 2 ชนิด (TAX §ก4) หรือรวมเข้าค่าใช้จ่าย/ต้นทุนของบรรทัด (checklist C2) */
  nonClaimPosting: NonClaimPosting;
  /** คู่ค้าไม่มีเลขผู้เสียภาษี (หรือไม่มีคู่ค้า): ค่าเริ่มของสถานะ — skill ไม่ได้บอก ⇒ ระบบเลือก PENDING */
  vendorNoTaxIdDefault: "PENDING" | "NO_CLAIM";
};
export const DEFAULT_INPUT_VAT_SETTINGS: InputVatSettings = { nonClaimPosting: "SEPARATE_ACCOUNT", vendorNoTaxIdDefault: "PENDING" };

export function parseInputVatSettings(v: unknown): InputVatSettings {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return {
    nonClaimPosting: o.nonClaimPosting === "INTO_COST" ? "INTO_COST" : "SEPARATE_ACCOUNT",
    vendorNoTaxIdDefault: o.vendorNoTaxIdDefault === "NO_CLAIM" ? "NO_CLAIM" : "PENDING",
  };
}

// ─────────────────── ธงต่อบัญชี (AccountLedger.vatTreatment) ───────────────────

/** ธงบัญชีที่หมายถึงหมวดภาษีซื้อต้องห้าม → รหัสเหตุ (ตาราง INPUT_VAT_NONCLAIM_REASONS) */
export const TREATMENT_REASON: Record<string, string> = {
  NON_CLAIMABLE: INPUT_VAT_NONCLAIM_DEFAULT_REASON,
  NON_CLAIMABLE_ENTERTAINMENT: "ENTERTAINMENT",
  NON_CLAIMABLE_PASSENGER_CAR: "PASSENGER_CAR",
  NON_CLAIMABLE_NOT_BUSINESS: "NOT_BUSINESS",
};

/** ค่าเริ่มจากธงของบัญชี · null = ธงไม่ได้บอก (ตัดสินต่อด้วยคู่ค้า) */
export function statusFromTreatment(t: string | null | undefined): { status: InputVatStatus; reason: string | null; explicitReason: boolean } | null {
  if (!t) return null;
  if (t === "PENDING_INVOICE") return { status: "PENDING", reason: null, explicitReason: false };
  if (t in TREATMENT_REASON) return { status: "NO_CLAIM", reason: TREATMENT_REASON[t]!, explicitReason: t !== "NON_CLAIMABLE" };
  return null;
}

/** เลขผู้เสียภาษี 13 หลัก (นับเฉพาะตัวเลข) */
export function hasVendorTaxId(taxId: string | null | undefined): boolean {
  return (taxId ?? "").replace(/\D/g, "").length === 13;
}

export type DefaultStatusSource = "ACCOUNT" | "VENDOR" | "DEFAULT";

/** ค่าเริ่มของสถานะภาษีซื้อต่อบรรทัด (ลำดับ: ธงบัญชี → คู่ค้าไม่มีเลข → เคลม) */
export function defaultInputVatStatus(input: {
  accountTreatment?: string | null;
  vendorTaxId?: string | null;
  settings?: InputVatSettings;
}): { status: InputVatStatus; reason: string | null; source: DefaultStatusSource } {
  const t = statusFromTreatment(input.accountTreatment);
  if (t) return { status: t.status, reason: t.reason, source: "ACCOUNT" };
  if (!hasVendorTaxId(input.vendorTaxId)) {
    const d = (input.settings ?? DEFAULT_INPUT_VAT_SETTINGS).vendorNoTaxIdDefault;
    return { status: d, reason: d === "NO_CLAIM" ? "NO_TAX_INVOICE" : null, source: "VENDOR" };
  }
  return { status: "CLAIM", reason: null, source: "DEFAULT" };
}

/** สถานะเริ่มของใบก่อน T1.4 (inputVatStatus null) — อ่านแบบเดิม: NONE = ไม่เคลม · ON_PAYMENT = รอใบกำกับ · อื่น = เคลม */
export function legacyDocStatus(doc: { vatMode: string; vatTiming?: string | null; taxPointBasis?: string | null; status?: string }): InputVatStatus {
  if (doc.vatMode === "NONE") return "NO_CLAIM";
  if (doc.status === "AWAITING_RECEIVE" || (doc.taxPointBasis ?? doc.vatTiming) === "ON_PAYMENT") return "PENDING";
  return "CLAIM";
}

export function docDefaultStatus(doc: { inputVatStatus?: string | null; vatMode: string; vatTiming?: string | null; taxPointBasis?: string | null; status?: string }): InputVatStatus {
  return isInputVatStatus(doc.inputVatStatus) ? doc.inputVatStatus : legacyDocStatus(doc);
}

export function lineStatusOf(line: { inputVatStatus?: string | null }, docDefault: InputVatStatus): InputVatStatus {
  return isInputVatStatus(line.inputVatStatus) ? line.inputVatStatus : docDefault;
}

/** ถังบัญชีของ VAT ต่อบรรทัด: CLAIM → 1150 · PENDING → 1155 · NO_CLAIM → ภาษีซื้อไม่ขอคืนตามกลุ่ม */
export type VatBucket = "CLAIM" | "PENDING" | "NC_DEDUCTIBLE" | "NC_DISALLOWED";

export function bucketOf(status: InputVatStatus, reason: string | null | undefined): VatBucket {
  if (status === "CLAIM") return "CLAIM";
  if (status === "PENDING") return "PENDING";
  const r = nonClaimReasonOf(reason) ?? nonClaimReasonOf(INPUT_VAT_NONCLAIM_DEFAULT_REASON);
  return r?.group === "DEDUCTIBLE" ? "NC_DEDUCTIBLE" : "NC_DISALLOWED";
}

/** สรุปสถานะของทั้งใบ (ป้ายบนจอ) */
export function summarizeStatuses(statuses: InputVatStatus[]): InputVatStatus | "MIXED" | null {
  const u = [...new Set(statuses)];
  if (u.length === 0) return null;
  return u.length === 1 ? u[0]! : "MIXED";
}

// ─────────────────── คำเตือนภาษีซื้อของใบ (ด่านตอนออก + ฟอร์ม) ───────────────────

const satangTh = (v: number) => (v / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** VAT ต่อบรรทัด (น้ำหนักฐาน × อัตรา · Σ = vatAmount) — สำหรับคำเตือน/ยอดรอใบกำกับ (ยอดลงบัญชีจริงคิดใน gl.ts แบบเดียวกัน) */
export function vatPerLine(vatAmount: number, lines: { amount: number; vatRateBp: number }[]): number[] {
  const w = lines.map((l) => Math.max(0, l.amount) * Math.max(0, l.vatRateBp));
  const sum = w.reduce((a, b) => a + b, 0);
  if (vatAmount <= 0 || sum <= 0) return lines.map(() => 0);
  const raw = w.map((x) => (vatAmount * x) / sum);
  const out = raw.map(Math.floor);
  let rem = vatAmount - out.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rem <= 0) break;
    out[i]! += 1;
    rem -= 1;
  }
  return out;
}

/**
 * คำเตือนภาษีซื้อของใบ (pure-ish: ผู้เรียกส่งข้อมูลที่โหลดแล้ว) — ใช้ทั้งตอนออก (ด่าน) และฟอร์ม/หน้าเอกสาร (แสดง)
 */
export function inputVatWarnings(
  doc: { docType: string; vatAmount: number; inputVatStatus: string | null; vatMode: string; vatTiming?: string | null; taxPointBasis?: string | null; contactId: string | null },
  lines: { description: string; amount: number; vatRateBp: number; inputVatStatus: string | null; inputVatReason: string | null; accountTreatment?: string | null }[],
  vendor: { name: string; taxId: string | null } | null,
): LegalWarning[] {
  const out: LegalWarning[] = [];
  if (!["PURCHASE", "EXPENSE", "ASSET_PURCHASE"].includes(doc.docType)) return out;
  if (!doc.contactId) out.push(legalWarning("EXPENSE_PAYEE_MISSING"));
  if (!doc.inputVatStatus && !lines.some((l) => l.inputVatStatus)) return out; // ใบก่อน T1.4
  if (doc.vatAmount <= 0) return out;
  const d = docDefaultStatus(doc);
  const parts = vatPerLine(doc.vatAmount, lines);
  const sum = (pred: (st: InputVatStatus, i: number) => boolean) => parts.reduce((a, v, i) => a + (pred(lineStatusOf(lines[i]!, d), i) ? v : 0), 0);
  const noTax = !hasVendorTaxId(vendor?.taxId);
  const vName = vendor?.name ?? "";
  const claimVat = sum((st) => st === "CLAIM");
  if (noTax && claimVat > 0) out.push(legalWarning("INPUT_VAT_CLAIM_WITHOUT_VENDOR_TAX_ID", { vendor: vName, vat: satangTh(claimVat) }));
  else if (noTax) {
    const st = sum((x) => x === "PENDING") > 0 ? "PENDING" : "NO_CLAIM";
    out.push(legalWarning("INPUT_VAT_VENDOR_NO_TAX_ID", { vendor: vName, vat: satangTh(doc.vatAmount), status: INPUT_VAT_STATUS_SHORT_TH[st] }));
  }
  lines.forEach((l, i) => {
    const st = lineStatusOf(l, d);
    const t = statusFromTreatment(l.accountTreatment);
    if (st === "CLAIM" && t?.status === "NO_CLAIM" && (parts[i] ?? 0) > 0) {
      const r = nonClaimReasonOf(t.reason);
      out.push(legalWarning("INPUT_VAT_CLAIM_PROHIBITED_CATEGORY", { line: l.description.split("\n")[0] ?? "", reason: r?.labelTh ?? "-", section: r?.sectionTh ?? "ม.82/5", vat: satangTh(parts[i] ?? 0) }));
    }
  });
  const ncNoReason = sum((st, i) => st === "NO_CLAIM" && !nonClaimReasonOf(lines[i]!.inputVatReason));
  if (ncNoReason > 0) out.push(legalWarning("INPUT_VAT_NONCLAIM_REASON_DEFAULTED", { vat: satangTh(ncNoReason) }));
  return out;
}

// ─────────────────── เคลมข้ามเดือน (T1.5) ───────────────────

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/** "YYYY-MM" ตามเวลาไทย */
export function bkkYm(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 7);
}
export function bkkYmdOf(d: Date): string {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
/** "2026-11" → "พฤศจิกายน 2569" */
export function thaiMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${THAI_MONTHS[(m ?? 1) - 1]} ${(y ?? 0) + 543}`;
}
/** จำนวนเดือนจาก a ถึง b ("YYYY-MM") — b ก่อน a = ติดลบ */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return ((by ?? 0) - (ay ?? 0)) * 12 + ((bm ?? 0) - (am ?? 0));
}
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = (y ?? 0) * 12 + ((m ?? 1) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** ข้อความที่ต้องระบุบนใบเมื่อเคลมข้ามเดือน (ฉ.4 ข้อ 2) */
export function lateClaimNoteText(claimYm: string): string {
  return `ถือเป็นภาษีซื้อในเดือนภาษี ${thaiMonthLabel(claimYm)}`;
}

export type LateClaimCheck = {
  invoiceYm: string;
  claimYm: string;
  /** เดือนที่นับแต่เดือนถัดจากเดือนที่ออกใบ (0 = เดือนเดียวกัน) */
  months: number;
  /** เพดาน (เดือน) จากตาราง · null = ไม่มีแถวในตาราง */
  limit: number | null;
  /** เดือนสุดท้ายที่เคลมได้ · null = ไม่มีแถว */
  lastYm: string | null;
  /** ข้อความ "ถือเป็นภาษีซื้อในเดือนภาษี…" (เคลมข้ามเดือน) · null = เดือนเดียวกัน */
  note: string | null;
  outOfWindow: boolean;
  beforeInvoice: boolean;
  warnings: LegalWarning[];
  rule: InputVatLateClaimRow | null;
};

/** ตรวจเดือนที่เคลมเทียบเดือนของใบกำกับ ตามแถวเพดานในตาราง ณ วันที่เคลม */
export function checkLateClaim(invoiceDate: Date, claimDate: Date): LateClaimCheck {
  const invoiceYm = bkkYm(invoiceDate);
  const claimYm = bkkYm(claimDate);
  const months = monthDiff(invoiceYm, claimYm);
  const rule = lateClaimRuleAt(bkkYmdOf(claimDate));
  const limit = rule?.value ?? null;
  const lastYm = limit === null ? null : addMonths(invoiceYm, limit);
  const note = months !== 0 ? lateClaimNoteText(claimYm) : null;
  const warnings: LegalWarning[] = [];
  const p = { invoiceMonth: thaiMonthLabel(invoiceYm), claimMonth: thaiMonthLabel(claimYm), months, limit: limit ?? "-", note: note ?? "" };
  const outOfWindow = limit !== null && months > limit;
  const beforeInvoice = months < 0;
  if (beforeInvoice) warnings.push(legalWarning("INPUT_VAT_CLAIM_BEFORE_INVOICE_MONTH", p));
  else if (outOfWindow) warnings.push(legalWarning("INPUT_VAT_LATE_CLAIM_OUT_OF_WINDOW", p, { citation: rule?.source }));
  else if (months > 0) warnings.push(legalWarning("INPUT_VAT_LATE_CLAIM", p, { citation: rule?.source }));
  if (months > 0 && limit === null) warnings.push(legalWarning("NO_ROW"));
  return { invoiceYm, claimYm, months, limit, lastYm, note, outOfWindow, beforeInvoice, warnings, rule };
}
