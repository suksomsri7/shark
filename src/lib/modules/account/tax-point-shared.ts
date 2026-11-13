import type { AccountVatMode } from "@prisma/client";
import { allocateProportional, computeTotals } from "./totals";

// ─────────────────────────────────────────────────────────────
// tax-point-shared.ts — จุดรับผิด VAT ต่อชนิดบรรทัด (ACC T1.2) · pure ล้วน (ใช้ได้ทั้ง gl · service · ฟอร์ม client)
//
// กฎ (skill shark-thai-law · references/common-vat-invoice.md):
//   สินค้า ม.78(1) [V] — ความรับผิดเกิดเมื่อส่งมอบ (หรือก่อนนั้นถ้าโอนกรรมสิทธิ์/รับเงิน/ออกใบกำกับ) §13
//   บริการ ม.78/1(1) [V] — เกิดเมื่อรับชำระ (หรือก่อนนั้นถ้าออกใบกำกับ/ใช้บริการ) §4
//   ม.86 [V] — ออกใบกำกับ "ในทันทีที่ความรับผิดเกิดขึ้น" §4
//   ใบแจ้งหนี้สินค้า = วันส่งมอบ: skill ไม่ได้บอก → ค่าเริ่มต้นของระบบ [S] (ปิดได้ที่ค่าตั้ง goodsOnIssue)
// ─────────────────────────────────────────────────────────────

export type LineKind = "GOODS" | "SERVICE";

export const LINE_KIND_LABEL_TH: Record<LineKind, string> = { GOODS: "สินค้า", SERVICE: "บริการ" };

/** ชนิดเริ่มของใบ (บรรทัดที่ไม่มีชนิด = แถวเดิมก่อน T1.2) — ON_PAYMENT → บริการ · อื่น → สินค้า (พฤติกรรมเดิมเป๊ะ) */
export function kindFromTiming(timing: string | null | undefined): LineKind {
  return timing === "ON_PAYMENT" ? "SERVICE" : "GOODS";
}

/** ชนิดสินค้าในทะเบียน → ชนิดบรรทัด (ชุด/BUNDLE = ของที่ส่งมอบ = สินค้า) */
export function kindFromProductType(t: string | null | undefined): LineKind | null {
  if (t === "SERVICE") return "SERVICE";
  if (t === "GOODS" || t === "BUNDLE") return "GOODS";
  return null;
}

/** ลำดับ: ค่าที่เลือกบนบรรทัด → ชนิดสินค้า → ชนิดเริ่มของใบ */
export function resolveLineKind(explicit: string | null | undefined, productType: string | null | undefined, docTiming: string | null | undefined): LineKind {
  if (explicit === "GOODS" || explicit === "SERVICE") return explicit;
  return kindFromProductType(productType) ?? kindFromTiming(docTiming);
}

export type KindSplit = { goods: number; service: number };

/**
 * VAT ดิบต่อชนิด (สตางค์) จากบรรทัดของเอกสาร — ใช้ breakdown ของ computeTotals (รวมการกระจายส่วนลดท้ายบิล)
 * `amount` = ฐานบรรทัดที่บันทึก (qty×ราคา−ส่วนลด) · ใช้เป็นน้ำหนักแบ่งยอดจริงเท่านั้น (ยอดจริงมาจาก doc.vatAmount)
 */
export function rawVatByKind(input: {
  lines: { amount: number; vatRateBp: number; lineKind: string | null | undefined }[];
  vatMode: AccountVatMode | string;
  discountAmount: number;
  vatRateBp: number;
  docTiming: string | null | undefined;
}): KindSplit {
  const t = computeTotals({
    lines: input.lines.map((l) => ({ description: "", qty: 1, unitPrice: l.amount, discount: 0, vatRateBp: l.vatRateBp })),
    discountAmount: input.discountAmount,
    vatMode: input.vatMode as AccountVatMode,
    vatRegistered: true,
    vatRateBp: input.vatRateBp,
  });
  const out: KindSplit = { goods: 0, service: 0 };
  input.lines.forEach((l, i) => {
    const k = l.lineKind === "GOODS" || l.lineKind === "SERVICE" ? l.lineKind : kindFromTiming(input.docTiming);
    if (k === "GOODS") out.goods += t.lines[i]?.vat ?? 0;
    else out.service += t.lines[i]?.vat ?? 0;
  });
  return out;
}

/**
 * แบ่งยอด `total` (VAT ที่พักจริง) เป็นสินค้า/บริการตามน้ำหนัก — ผลรวม = total เป๊ะเสมอ
 * น้ำหนักเป็น 0 ทั้งคู่ (เช่นทุกบรรทัดยกเว้น แต่ยังมียอด) ⇒ ทั้งก้อนไปชนิดเริ่มของใบ
 */
export function splitByKind(total: number, raw: KindSplit, fallback: LineKind): KindSplit {
  if (total <= 0) return { goods: 0, service: 0 };
  if (raw.goods <= 0 && raw.service <= 0) return fallback === "GOODS" ? { goods: total, service: 0 } : { goods: 0, service: total };
  if (raw.service <= 0) return { goods: total, service: 0 };
  if (raw.goods <= 0) return { goods: 0, service: total };
  const [g, s] = allocateProportional(total, [raw.goods, raw.service]);
  return { goods: g, service: s };
}

/** โหมดใบกำกับอัตโนมัติของบรรทัดบริการ (ค่าตั้งเดิม `autoTaxInvoice.mode`) */
export type ServiceTaxInvoiceMode = "MANUAL" | "ON_PAYMENT" | "ON_INVOICE";

/**
 * ชนิดที่ "ออกใบกำกับพร้อมใบแจ้งหนี้" (ตอนออกใบแจ้งหนี้)
 *   ต่อใบ true  = ทุกชนิด (บริการ = ออกใบกำกับก่อนรับเงิน ม.78/1(1)(ก))
 *   ต่อใบ false = ไม่ออกตอนนี้
 *   ต่อใบ null  = ตามค่าตั้ง: สินค้า ถ้า goodsOnIssue · บริการ ถ้าโหมด ON_INVOICE
 */
export function kindsAtIssue(docToggle: boolean | null | undefined, settings: { goodsOnIssue: boolean; mode: ServiceTaxInvoiceMode }): { goods: boolean; service: boolean } {
  if (docToggle === true) return { goods: true, service: true };
  if (docToggle === false) return { goods: false, service: false };
  return { goods: settings.goodsOnIssue, service: settings.mode === "ON_INVOICE" };
}

/** สวิตช์ต่อใบที่ฟอร์มแสดง (ค่าที่มีผล) — ใบที่มีบรรทัดของชนิดที่จะออกพร้อมกันอย่างน้อย 1 ชนิด */
export function effectiveIssueToggle(
  docToggle: boolean | null | undefined,
  settings: { goodsOnIssue: boolean; mode: ServiceTaxInvoiceMode },
  kinds: { goods: boolean; service: boolean },
): boolean {
  if (docToggle === true || docToggle === false) return docToggle;
  const k = kindsAtIssue(null, settings);
  return (k.goods && kinds.goods) || (k.service && kinds.service);
}

/** ข้อความอธิบายผลของค่าตั้ง/สวิตช์ต่อชนิด (ใต้สวิตช์ในฟอร์ม) */
export function taxPointHintTh(
  docToggle: boolean | null | undefined,
  settings: { goodsOnIssue: boolean; mode: ServiceTaxInvoiceMode },
  kinds: { goods: boolean; service: boolean },
): string {
  const k = kindsAtIssue(docToggle, settings);
  const parts: string[] = [];
  if (kinds.goods) parts.push(`สินค้า: ${k.goods ? "ออกใบกำกับพร้อมใบแจ้งหนี้" : "ยังไม่ออก (ภาษีขายพักไว้ — ระบบเตือนเมื่อค้างข้ามเดือน)"}`);
  if (kinds.service)
    parts.push(
      `บริการ: ${k.service ? "ออกใบกำกับพร้อมใบแจ้งหนี้" : settings.mode === "ON_PAYMENT" ? "ออกใบกำกับเมื่อรับชำระ (ตามงวด)" : "ร้านกดออกเอง"}`,
    );
  return parts.join(" · ");
}

/** เดือน (ไทย, UTC+7) ของวันที่ → "YYYY-MM" */
export function bkkMonthKey(d: Date): string {
  const t = new Date(d.getTime() + 7 * 3_600_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}
