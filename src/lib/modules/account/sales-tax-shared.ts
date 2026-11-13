// ─────────────────────────────────────────────────────────────
// sales-tax-shared.ts — รายงานภาษีขาย (ACC T1.1) ส่วน "บริสุทธิ์" (ไม่มี prisma) — ทดสอบด้วยตัวเลขมือได้ตรง ๆ
//
// กฎ (skill shark-thai-law · common-vat-invoice.md §18 · domain-shark-accounting-cases.md §1.3 §1.5 §1.6):
//   หัวรายงาน = เดือนภาษี ชื่อ เลขผู้เสียภาษี สำนักงานใหญ่/สาขา · รายใบ = วันที่ เลขที่ ชื่อผู้ซื้อ เลขผู้เสียภาษี+สาขาผู้ซื้อ มูลค่า VAT
//   ใบย่อ/POS ลงยอดรวมต่อวัน "เลขที่...ถึงเลขที่..." (1 แถว/วัน/สาขา หรือ/เครื่อง) · ใบลดหนี้/ใบที่ยกเลิกมีหมายเหตุ ·
//   ใบเต็มรูปที่ออกแทนใบย่อไม่นับซ้ำ
// ยอดภาษีของทุกแถว = GL 2200 (แหล่งความจริง) · ฐาน = คิดจากเอกสารแยกกลุ่มอัตรา ให้สอดคล้องกับภาษี (ดู rateGroupsOf)
// design note: ledger/wo-notes/T1.1.md
// ─────────────────────────────────────────────────────────────
import type { AccountVatMode } from "@prisma/client";
import { allocateProportional, computeTotals } from "./totals";
import { legalWarning, type LegalWarning } from "@/lib/core/settings/legal/warnings";
import {
  SALES_TAX_ABB_MODES,
  SALES_TAX_ABB_MODE_LABEL_TH,
  type SalesTaxAbbMode,
} from "@/lib/core/settings/defs/account";

export { SALES_TAX_ABB_MODES, SALES_TAX_ABB_MODE_LABEL_TH, type SalesTaxAbbMode };

export function isSalesTaxAbbMode(v: unknown): v is SalesTaxAbbMode {
  return typeof v === "string" && (SALES_TAX_ABB_MODES as readonly string[]).includes(v);
}

/** อัตรา: > 0 = basis point (700 = 7%) · 0 = อัตรา 0% · −1 = ยกเว้น */
export const RATE_ZERO = 0;
export const RATE_EXEMPT = -1;

export type RatePart = { rateBp: number; base: number; vat: number };

export function rateLabelTh(rateBp: number): string {
  if (rateBp === RATE_EXEMPT) return "ยกเว้นภาษีมูลค่าเพิ่ม";
  if (rateBp === RATE_ZERO) return "อัตราร้อยละ 0";
  return `อัตราร้อยละ ${(rateBp / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}

/** ลำดับกลุ่มอัตรา: อัตราบวกจากมากไปน้อย → 0% → ยกเว้น */
export function rateOrder(a: number, b: number): number {
  const k = (x: number) => (x > 0 ? 0 : x === 0 ? 1 : 2);
  return k(a) - k(b) || b - a;
}

// ─────────────────── ฐานภาษีแยกกลุ่มอัตรา ───────────────────

export type RateGroupDoc = {
  vatMode: AccountVatMode;
  discountAmount: number;
  /** ยอดสุทธิของเอกสาร (หลังหักมัดจำแล้ว) — บวกเสมอ */
  grandTotal: number;
  lines: { amount: number; vatRateBp: number | null }[];
};

/**
 * ฐาน/ภาษีแยกกลุ่มอัตราของเอกสารหนึ่งใบ — ภาษีของกลุ่มที่มีภาษี = ยอดจาก GL (`glVat` · มีเครื่องหมาย) เสมอ
 *
 * 1. บรรทัด → computeTotals (สูตรเดียวกับตอนออกเอกสาร) → net/vat ต่อบรรทัด
 * 2. กลุ่ม 0% / ยกเว้น: ฐาน = net ของบรรทัด
 * 3. กลุ่มที่มีภาษี: ภาษี = |glVat| · ฐาน = (grandTotal − ยอดของกลุ่ม 0%/ยกเว้น) − ภาษี
 *    ⇒ ใบที่หักมัดจำ (grandTotal หลังหักมัดจำ) ได้ฐานที่ตรงกับภาษีเสมอ ไม่ว่าเอกสารเก็บ subTotal แบบก่อนหรือหลังหักมัดจำ
 *    หลายอัตราบวก: เกลี่ยภาษีตามสัดส่วนภาษีของบรรทัด · เกลี่ยยอดรวมตามสัดส่วนยอดรวมของบรรทัด
 * 4. เครื่องหมาย: ตาม glVat (ติดลบ = ใบลดหนี้/ใบคืน/รายการยกเลิก) · glVat = 0 ใช้ `sign`
 * ไม่มีบรรทัด → ทั้งก้อนเป็นกลุ่ม `stdRateBp`
 */
export function rateGroupsOf(doc: RateGroupDoc | null, glVat: number, stdRateBp: number, opts?: { sign?: 1 | -1; grossFallback?: number }): RatePart[] {
  const sign = glVat < 0 ? -1 : glVat > 0 ? 1 : (opts?.sign ?? 1);
  const absVat = Math.abs(glVat);
  const grand = Math.abs(doc ? doc.grandTotal : (opts?.grossFallback ?? 0));
  const lines = doc?.lines ?? [];
  if (!doc || lines.length === 0) {
    if (grand === 0 && absVat === 0) return [];
    return [{ rateBp: stdRateBp, base: sign * (grand - absVat), vat: sign * absVat }];
  }
  const vatMode: AccountVatMode = doc.vatMode;
  const t = computeTotals({
    lines: lines.map((l) => ({ description: "", qty: 1, unitPrice: l.amount, vatRateBp: l.vatRateBp ?? stdRateBp })),
    discountAmount: doc.discountAmount,
    vatMode: vatMode === "NONE" ? "EXCLUDE" : vatMode,
    vatRegistered: true,
    vatRateBp: stdRateBp,
  });
  const nonStd = new Map<number, number>(); // rate → base
  const std = new Map<number, { vat: number; gross: number }>();
  lines.forEach((l, i) => {
    const bp = l.vatRateBp ?? stdRateBp;
    const b = t.lines[i];
    if (bp > 0 && vatMode !== "NONE") {
      const g = std.get(bp) ?? { vat: 0, gross: 0 };
      g.vat += b.vat;
      g.gross += b.gross;
      std.set(bp, g);
    } else {
      const key = vatMode === "NONE" && bp > 0 ? stdRateBp : bp;
      nonStd.set(key, (nonStd.get(key) ?? 0) + b.net);
    }
  });
  const out: RatePart[] = [];
  let nonStdGross = 0;
  for (const [bp, base] of nonStd) {
    if (bp > 0) continue; // vatMode NONE + อัตราบวก: รวมเข้ากลุ่มมีภาษีด้านล่าง
    nonStdGross += base;
    out.push({ rateBp: bp, base: sign * base, vat: 0 });
  }
  if (absVat > 0 && std.size === 0) std.set(stdRateBp, { vat: absVat, gross: Math.max(0, grand - nonStdGross) });
  const stdGross = Math.max(0, grand - nonStdGross);
  const keys = [...std.keys()].sort((a, b) => b - a);
  if (keys.length > 0) {
    const vats: number[] = keys.length === 1 ? [absVat] : allocateProportional(absVat, keys.map((k) => Math.max(0, std.get(k)!.vat)));
    const grosses: number[] = keys.length === 1 ? [stdGross] : allocateProportional(stdGross, keys.map((k) => Math.max(0, std.get(k)!.gross)));
    // allocateProportional คืน 0 ทั้งหมดเมื่อน้ำหนักรวม 0 — ให้ก้อนทั้งหมดไปกลุ่มแรก
    if (keys.length > 1 && !vats.some((v) => v !== 0) && absVat > 0) vats[0] = absVat;
    if (keys.length > 1 && !grosses.some((v) => v !== 0) && stdGross > 0) grosses[0] = stdGross;
    keys.forEach((bp, i) => out.push({ rateBp: bp, base: sign * (grosses[i] - vats[i]), vat: sign * vats[i] }));
  }
  return out.sort((a, b) => rateOrder(a.rateBp, b.rateBp));
}

export function sumParts(parts: RatePart[]): { base: number; vat: number } {
  return parts.reduce((s, p) => ({ base: s.base + p.base, vat: s.vat + p.vat }), { base: 0, vat: 0 });
}

export function mergeParts(a: RatePart[], b: RatePart[]): RatePart[] {
  const m = new Map<number, RatePart>();
  for (const p of [...a, ...b]) {
    const g = m.get(p.rateBp) ?? { rateBp: p.rateBp, base: 0, vat: 0 };
    g.base += p.base;
    g.vat += p.vat;
    m.set(p.rateBp, g);
  }
  return [...m.values()].sort((x, y) => rateOrder(x.rateBp, y.rateBp));
}

/** ฐานสอดคล้องภาษีไหม (กลุ่มอัตราบวก): |ฐาน × อัตรา − ภาษี| ≤ ค่าคลาดที่ยอมได้ (สตางค์) */
export function partConsistent(p: RatePart, toleranceSatang: number): boolean {
  if (p.rateBp <= 0) return p.vat === 0;
  return Math.abs(Math.round((p.base * p.rateBp) / 10000) - p.vat) <= toleranceSatang;
}

// ─────────────────── แถวรายงาน ───────────────────

export type SalesTaxRowKind =
  | "DOC" // เอกสารบัญชีรายใบ (ใบกำกับเต็มรูป ใบเสร็จขายสด ใบรับมัดจำ ใบลดหนี้/เพิ่มหนี้ ใบคืน POS ฯลฯ)
  | "ABB" // ใบกำกับภาษีอย่างย่อรายใบ (บิล POS)
  | "ABB_SUMMARY" // ใบกำกับภาษีอย่างย่อรวมรายวัน
  | "JOURNAL"; // รายการบัญชีที่ไม่มีเอกสาร (JV มือ ฯลฯ)

export type SalesTaxRow = {
  key: string;
  kind: SalesTaxRowKind;
  /** วันที่ตามปฏิทินไทย YYYY-MM-DD */
  date: string;
  docNo: string;
  /** ใบสรุปรายวัน: เลขที่สุดท้ายของช่วง */
  docNoTo?: string;
  /** ใบสรุปรายวัน: จำนวนใบในช่วง (รวมใบที่ยกเลิก) · ยกเลิกกี่ใบ */
  count?: number;
  cancelledCount?: number;
  docType?: string;
  buyerName: string;
  buyerTaxId: string;
  /** รหัสสาขาผู้ซื้อ 5 หลัก ("" = ไม่ระบุ) */
  buyerBranchCode: string;
  parts: RatePart[];
  base: number;
  vat: number;
  notes: string[];
  cancelled?: boolean;
  /** ฐานไม่สอดคล้องภาษี (ตรวจข้อ 4) */
  flag?: string;
  /** เอกสารบัญชีของแถว (ทำลิงก์ที่หน้าจอ) */
  docId?: string;
  /** ใบสรุปรายวัน: รายใบสำหรับกดดู */
  bills?: SalesTaxRow[];
  // ── ข้อมูลจัดกลุ่มใบย่อ (ภายใน) ──
  unitId?: string | null;
  unitName?: string | null;
  deviceCode?: string | null;
  deviceName?: string | null;
  posRegNo?: string | null;
  /** บิล POS: ยอดบิลต้นทาง (ตรวจข้อ 4) */
  posVat?: number | null;
  posHasDeposit?: boolean;
};

export function buyerBranchLabelTh(code: string): string {
  const c = (code ?? "").trim();
  if (!c) return "";
  if (/^0+$/.test(c)) return "สำนักงานใหญ่";
  return `สาขาที่ ${c}`;
}

/** ช่วงเลขที่: เรียงแบบตัวเลขในสตริง (202611-0002 < 202611-0010) */
export function compareDocNo(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true });
}

export function sortRows(rows: SalesTaxRow[]): SalesTaxRow[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || compareDocNo(a.docNo, b.docNo));
}

/**
 * รวมใบย่อรายวัน — DAILY_DEVICE: วัน × สาขา × เครื่อง · DAILY_BRANCH: วัน × สาขา · PER_BILL: คืนรายใบเดิม
 * ใบที่ยกเลิกในเดือนเดียวกัน (ยอด 0) ยังนับในช่วงเลข + หมายเหตุ "ยกเลิก n ใบ"
 */
export function summarizeAbb(bills: SalesTaxRow[], mode: SalesTaxAbbMode): SalesTaxRow[] {
  if (mode === "PER_BILL") return bills;
  const groups = new Map<string, SalesTaxRow[]>();
  for (const b of bills) {
    const k = [b.date, b.unitId ?? "", mode === "DAILY_DEVICE" ? (b.deviceCode ?? "") : ""].join("|");
    const arr = groups.get(k) ?? [];
    arr.push(b);
    groups.set(k, arr);
  }
  const out: SalesTaxRow[] = [];
  for (const [k, arr0] of groups) {
    const arr = [...arr0].sort((a, b) => compareDocNo(a.docNo, b.docNo));
    const first = arr[0];
    const last = arr[arr.length - 1];
    const parts = arr.reduce<RatePart[]>((p, b) => mergeParts(p, b.parts), []);
    const { base, vat } = sumParts(parts);
    const cancelled = arr.filter((b) => b.cancelled);
    const where: string[] = [];
    if (mode === "DAILY_DEVICE") {
      where.push(first.deviceCode ? `เครื่อง ${first.deviceName || first.deviceCode}${first.posRegNo ? ` (เลขประจำเครื่อง ${first.posRegNo})` : ""}` : "ไม่ระบุเครื่อง (บิลนอกกะ)");
    }
    if (first.unitName) where.push(`สาขา ${first.unitName}`);
    const notes = [where.join(" · ")].filter(Boolean);
    if (cancelled.length) notes.push(`ยกเลิก ${cancelled.length} ใบ: ${cancelled.map((c) => c.docNo).join(", ")}`);
    for (const b of arr) for (const n of b.notes) if (n.startsWith("ออกใบกำกับภาษีเต็มรูปแทน")) notes.push(`${b.docNo}: ${n}`);
    out.push({
      key: `abbsum:${k}`,
      kind: "ABB_SUMMARY",
      date: first.date,
      docNo: first.docNo,
      docNoTo: last.docNo,
      count: arr.length,
      cancelledCount: cancelled.length,
      docType: "TAX_INVOICE_ABB",
      buyerName: "ขายปลีกตามใบกำกับภาษีอย่างย่อ",
      buyerTaxId: "",
      buyerBranchCode: "",
      parts,
      base,
      vat,
      notes,
      bills: arr,
      unitId: first.unitId,
      unitName: first.unitName,
      deviceCode: mode === "DAILY_DEVICE" ? first.deviceCode : null,
      deviceName: mode === "DAILY_DEVICE" ? first.deviceName : null,
      posRegNo: mode === "DAILY_DEVICE" ? first.posRegNo : null,
    });
  }
  return out;
}

export type RateGroupView = {
  rateBp: number;
  label: string;
  /** แถวในกลุ่ม พร้อมยอดเฉพาะส่วนของอัตรานี้ */
  rows: { row: SalesTaxRow; part: RatePart; seq: number }[];
  base: number;
  vat: number;
};

/**
 * จัดแถวเข้ากลุ่มอัตรา (หัวกลุ่ม → แถวของกลุ่ม → รวมกลุ่ม) · แถวที่มีหลายอัตราขึ้นทุกกลุ่มที่เกี่ยวด้วยยอดส่วนนั้น
 * แถวที่ไม่มียอด (ยกเลิกในเดือนเดียวกัน) อยู่กลุ่มอัตรามาตรฐาน · ลำดับที่ (seq) นับต่อเนื่องทั้งรายงานตามวันที่/เลขที่
 */
export function groupByRate(rows: SalesTaxRow[], stdRateBp: number): { groups: RateGroupView[]; seqOf: Map<string, number> } {
  const sorted = sortRows(rows);
  const seqOf = new Map<string, number>();
  sorted.forEach((r, i) => seqOf.set(r.key, i + 1));
  const m = new Map<number, RateGroupView>();
  const add = (rateBp: number, row: SalesTaxRow, part: RatePart) => {
    const g = m.get(rateBp) ?? { rateBp, label: rateLabelTh(rateBp), rows: [], base: 0, vat: 0 };
    g.rows.push({ row, part, seq: seqOf.get(row.key)! });
    g.base += part.base;
    g.vat += part.vat;
    m.set(rateBp, g);
  };
  for (const r of sorted) {
    const parts = r.parts.filter((p) => p.base !== 0 || p.vat !== 0);
    if (parts.length === 0) add(r.parts[0]?.rateBp ?? stdRateBp, r, { rateBp: r.parts[0]?.rateBp ?? stdRateBp, base: 0, vat: 0 });
    else for (const p of parts) add(p.rateBp, r, p);
  }
  return { groups: [...m.values()].sort((a, b) => rateOrder(a.rateBp, b.rateBp)), seqOf };
}

// ─────────────────── หัวรายงาน ───────────────────

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/** "2026-09" → "กันยายน 2569" */
export function taxMonthLabelTh(periodKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) return periodKey;
  return `${TH_MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[1]) + 543}`;
}

export type SalesTaxHeader = {
  orgName: string;
  taxId: string;
  branchCode: string;
  /** "สำนักงานใหญ่" หรือ "สาขาที่ 00001 ชื่อ" */
  branchLabel: string;
  periodKey: string;
  monthLabel: string;
  /** คำเตือนหัวรายงาน — จากทะเบียนกลาง (T0.4) รูปเดียวกับจอ/REST/AI */
  warnings: LegalWarning[];
};

export function sellerBranchLabelTh(code: string | null | undefined, name: string | null | undefined): string {
  const c = (code ?? "").trim() || "00000";
  if (/^0+$/.test(c)) return "สำนักงานใหญ่";
  const n = (name ?? "").trim();
  return `สาขาที่ ${c}${n ? ` (${n})` : ""}`;
}

/** คำเตือนหัวรายงานภาษี (ขาย/ซื้อ/ภ.พ.30) — ทะเบียนกลาง T0.4 · ไม่บล็อก */
export function headerWarningsTh(h: { orgName: string; taxId: string }, report = "รายงานภาษีขาย"): LegalWarning[] {
  const w: LegalWarning[] = [];
  if (!h.orgName.trim()) w.push(legalWarning("TAX_REPORT_ORG_NAME_MISSING", { report }));
  if (!/^\d{13}$/.test(h.taxId.trim())) w.push(legalWarning("TAX_REPORT_TAX_ID_MISSING", { report }));
  return w;
}

// ─────────────────── ข้อตรวจกระทบยอด ───────────────────

export type SalesTaxCheck = {
  key: "GL_2200" | "PP30" | "BASE_VAT" | "POS_BILLS";
  label: string;
  ok: boolean;
  expected: number;
  actual: number;
  detail?: string;
};

/** ค่าคลาดที่ยอมได้ของ "ฐาน × อัตรา ≈ ภาษี" — ปัดเศษได้ไม่เกินครึ่งสตางค์ต่อบรรทัด/ใบ + 1 บาท */
export function baseVatTolerance(row: SalesTaxRow): number {
  return 100 + (row.count ?? 1);
}
