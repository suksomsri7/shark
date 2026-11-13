// ─────────────────────────────────────────────────────────────
// tax-point.ts — ภาษีขายที่ค้างพัก (ACC T1.2): รายการตามใบ + คำเตือนข้ามเดือน + ปล่อย VAT ที่พักของข้อมูลเก่า
//
// แหล่งความจริง = GL (gl.parkedVatOf: Σ เครดิต−เดบิต ของ 2205/2210 ต่อใบแจ้งหนี้รวมใบกำกับที่อ้างใบนั้น)
// กฎ: ม.78(1) สินค้าเกิดเมื่อส่งมอบ · ม.86 ออกใบกำกับทันที [V] (skill §4 §13)
//     วันที่ของใบกำกับที่ออกตามหลัง: skill ไม่ได้บอก [U] → ร้านเลือก (วันนี้ / วันที่ใบแจ้งหนี้) + คำเตือนที่ต้องกดยืนยัน
// ─────────────────────────────────────────────────────────────
import { tenantDb } from "@/lib/core/db";
import {
  LegalAckRequiredError,
  isLegalAckRequiredError,
  legalWarning,
  unacknowledged,
  type LegalAck,
  type LegalAckRequired,
  type LegalWarning,
} from "@/lib/core/settings/legal/warnings";
import { parkedVatOf } from "./gl";
import { legalAckResult } from "./legal-gate";
import { safeReason } from "./errors";
import { accountNow } from "./clock";
import { bkkMonthKey } from "./tax-point-shared";
import { getSettings, releaseParkedVatOne } from "./service";

type Ctx = { tenantId: string; systemId: string };

const baht = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thDate = (d: Date) => {
  const t = new Date(d.getTime() + 7 * 3_600_000);
  return `${t.getUTCDate()}/${t.getUTCMonth() + 1}/${t.getUTCFullYear() + 543}`;
};
const DAY = 86_400_000;

export type ParkedVatRow = {
  documentId: string;
  docNo: string | null;
  issueDate: Date;
  status: string;
  contactName: string | null;
  grandTotal: number;
  /** VAT ที่ยังพัก (สตางค์) */
  goods: number;
  service: number;
  /** อายุ (วัน) นับจากวันที่ใบแจ้งหนี้ถึง asOf */
  ageDays: number;
  /** เดือนของใบแจ้งหนี้ < เดือนของ asOf (เวลาไทย) */
  pastMonth: boolean;
  /** คำเตือน (เฉพาะ VAT สินค้าที่ค้างข้ามเดือน) */
  warning: LegalWarning | null;
};

export type ParkedVatReport = {
  asOf: Date;
  rows: ParkedVatRow[];
  total: { goods: number; service: number; goodsPastMonth: number; countPastMonth: number };
  /** คำเตือนรวมของสมุด (null = ไม่มีสินค้าค้างข้ามเดือน) */
  warning: LegalWarning | null;
};

/** คำเตือนของใบเดียว (pure) — null ถ้าไม่มี VAT สินค้าค้างข้ามเดือน */
export function parkedWarningOf(row: { docNo: string | null; issueDate: Date; goods: number }, asOf: Date): LegalWarning | null {
  if (row.goods <= 0) return null;
  if (bkkMonthKey(row.issueDate) >= bkkMonthKey(asOf)) return null;
  return legalWarning("OUTPUT_VAT_PARKED_PAST_MONTH", {
    vat: baht(row.goods),
    docNo: row.docNo ?? "-",
    date: thDate(row.issueDate),
    days: Math.max(0, Math.floor((asOf.getTime() - row.issueDate.getTime()) / DAY)),
  });
}

/**
 * รายการภาษีขายที่ค้างพักต่อใบแจ้งหนี้ (เฉพาะใบที่ยังมียอดพัก) เรียงเก่า → ใหม่
 * `asOf` ค่าเริ่ม = นาฬิกาของโมดูลบัญชี · `onlyPastMonth` = เฉพาะที่ค้างข้ามเดือน
 */
export async function parkedOutputVat(ctx: Ctx, opts: { asOf?: Date; onlyPastMonth?: boolean; documentIds?: string[] } = {}): Promise<ParkedVatReport> {
  const asOf = opts.asOf ?? accountNow();
  const invoices = await tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId }).accountDocument.findMany({
    where: {
      tenantId: ctx.tenantId,
      systemId: ctx.systemId,
      docType: "INVOICE",
      status: { notIn: ["DRAFT", "CANCELLED", "VOIDED"] },
      issueDate: { lte: asOf },
      ...(opts.documentIds ? { id: { in: opts.documentIds } } : {}),
    },
    select: { id: true, docNo: true, issueDate: true, status: true, grandTotal: true, contactSnapshot: true, contact: { select: { name: true } } },
    orderBy: [{ issueDate: "asc" }, { docNo: "asc" }],
  });
  const parked = await parkedVatOf(ctx, invoices.map((d) => d.id));
  const rows: ParkedVatRow[] = [];
  for (const d of invoices) {
    const p = parked.get(d.id);
    const goods = Math.max(0, p?.goods ?? 0);
    const service = Math.max(0, p?.service ?? 0);
    if (goods + service <= 0) continue;
    const pastMonth = bkkMonthKey(d.issueDate) < bkkMonthKey(asOf);
    if (opts.onlyPastMonth && !pastMonth) continue;
    const snap = (d.contactSnapshot ?? null) as { name?: string } | null;
    rows.push({
      documentId: d.id,
      docNo: d.docNo,
      issueDate: d.issueDate,
      status: d.status,
      contactName: snap?.name ?? d.contact?.name ?? null,
      grandTotal: d.grandTotal,
      goods,
      service,
      ageDays: Math.max(0, Math.floor((asOf.getTime() - d.issueDate.getTime()) / DAY)),
      pastMonth,
      warning: parkedWarningOf({ docNo: d.docNo, issueDate: d.issueDate, goods }, asOf),
    });
  }
  const total = { goods: 0, service: 0, goodsPastMonth: 0, countPastMonth: 0 };
  for (const r of rows) {
    total.goods += r.goods;
    total.service += r.service;
    if (r.pastMonth && r.goods > 0) {
      total.goodsPastMonth += r.goods;
      total.countPastMonth += 1;
    }
  }
  const warning = total.countPastMonth > 0 ? legalWarning("OUTPUT_VAT_PARKED_PAST_MONTH", { count: total.countPastMonth, vat: baht(total.goodsPastMonth) }) : null;
  return { asOf, rows, total, warning };
}

/** คำเตือนของใบแจ้งหนี้ใบเดียว (หน้าเอกสาร · REST รายละเอียดเอกสาร) */
export async function parkedWarningForDocument(ctx: Ctx, documentId: string, asOf?: Date): Promise<{ goods: number; service: number; warning: LegalWarning | null } | null> {
  const r = await parkedOutputVat(ctx, { asOf, documentIds: [documentId] });
  const row = r.rows[0];
  if (!row) return null;
  return { goods: row.goods, service: row.service, warning: row.warning };
}

export type ReleaseDateChoice = "TODAY" | "INVOICE_DATE";

export type ReleaseResult =
  | { ok: true; released: { documentId: string; docNo: string | null; taxInvoiceId: string; taxInvoiceNo: string; vat: number; goods: number; service: number; date: Date }[]; skipped: { documentId: string; reason: string }[] }
  | { ok: false; reason: string; legal?: LegalAckRequired };

/**
 * ปล่อยภาษีขายที่ค้างพัก (ข้อมูลเก่า / ใบที่ปิดสวิตช์ไว้) — ออกใบกำกับของยอดที่ยังพักทีละใบ (เป็นชุดได้) ไม่ลบ/แก้ของเดิม
 *   `date` ต้องเลือก (ไม่มีค่าเริ่ม): TODAY = ใบกำกับลงวันนี้ · INVOICE_DATE = ลงวันที่ใบแจ้งหนี้ (ภาษีเข้าเดือนเดิม)
 *   ทั้งสองทางต้องกดยืนยันคำเตือน TAX_INVOICE_LATE_DATE_CHOICE [U] · ผู้ยืนยันลง AuditLog ต่อใบ
 *   `kinds` ค่าเริ่ม = สินค้าเท่านั้น (บริการยังพักรอรับเงินตาม ม.78/1 — ร้านเลือกปล่อยได้)
 *   วันที่อยู่ในช่วงล็อก = ข้ามใบนั้น (บอกเหตุผล) · ทำทีละใบในธุรกรรมของใบนั้น (ใบหนึ่งล้มไม่พาใบอื่นล้ม)
 */
export async function releaseParkedVat(
  ctx: Ctx,
  documentIds: readonly string[],
  opts: { date: ReleaseDateChoice | null | undefined; kinds?: { goods: boolean; service: boolean }; ack?: LegalAck | null },
): Promise<ReleaseResult> {
  if (opts.date !== "TODAY" && opts.date !== "INVOICE_DATE")
    return { ok: false, reason: "เลือกวันที่ของใบกำกับก่อน: วันนี้ หรือ วันที่ใบแจ้งหนี้" };
  if (documentIds.length === 0) return { ok: false, reason: "ยังไม่ได้เลือกใบแจ้งหนี้" };
  if (documentIds.length > 200) return { ok: false, reason: "เลือกได้ครั้งละไม่เกิน 200 ใบ" };
  const kinds = opts.kinds ?? { goods: true, service: false };
  if (!kinds.goods && !kinds.service) return { ok: false, reason: "เลือกชนิดที่จะปล่อย (สินค้า/บริการ) อย่างน้อย 1 ชนิด" };
  const settings = await getSettings(ctx.tenantId, ctx.systemId);
  if (!settings.vatRegistered) return { ok: false, reason: "สมุดนี้ตั้งค่าว่าไม่จด VAT — ไม่มีภาษีขายให้ปล่อย" };
  const warning = legalWarning("TAX_INVOICE_LATE_DATE_CHOICE", { choice: opts.date === "TODAY" ? "เลือก: ลงวันที่วันนี้" : "เลือก: ลงวันที่ใบแจ้งหนี้" });
  if (unacknowledged([warning], opts.ack?.codes).length > 0)
    return legalAckResult(new LegalAckRequiredError([warning]));

  const released: Extract<ReleaseResult, { ok: true }>["released"] = [];
  const skipped: { documentId: string; reason: string }[] = [];
  const now = accountNow();
  for (const id of documentIds) {
    try {
      released.push(
        await releaseParkedVatOne(ctx, id, {
          kinds,
          date: opts.date === "TODAY" ? now : "INVOICE_DATE",
          note: `ออกตามหลังเพื่อปล่อยภาษีขายที่ค้างพัก (${opts.date === "TODAY" ? "ลงวันที่วันนี้" : "ลงวันที่ใบแจ้งหนี้"})`,
          ack: opts.ack as LegalAck,
          warning,
          lockBeforeDate: settings.policy.lockBeforeDate,
        }),
      );
    } catch (e) {
      if (isLegalAckRequiredError(e)) return legalAckResult(e);
      skipped.push({ documentId: id, reason: safeReason(e, "ปล่อยภาษีขายไม่สำเร็จ") });
    }
  }
  return { ok: true, released, skipped };
}
