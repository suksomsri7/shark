// POS P1.17 ▸ รายงานพื้นฐาน 7 ชุด + CSV + ตัวเลขการ์ดภาพรวม (ฝั่งเซิร์ฟเวอร์ · มติร่าง R1–R16 · ledger/pos-briefs/pos-brief-P1.17.md) ◂
// สัญญา = scripts/qc-pos-p1.17.mts · โน้ต ledger/wo-notes/pos-P1.17.md
// 🔴 อ่านอย่างเดียว: ไม่มีการเขียนแถวใด ๆ · ไม่ปิดกะ · ไม่คำนวณ VAT ใหม่ (VAT = คอลัมน์ PosSale.vatSatang ที่เก็บตอนขาย · R4)
// 🔴 ทุกฟังก์ชัน (ctx, actor, input, client?) "คืน" คำปฏิเสธ {ok:false, code, message} ไม่ throw · ขอบเขตผิด = NOT_FOUND (R13)
// 🔴 ทุกคิวรี PosSale กรอง tenantId + systemId + unitId IN + createdAt ⇒ ใช้ดัชนี (tenantId, unitId, createdAt) · จำนวนคิวรีคงที่ไม่ขึ้นกับจำนวนวัน (R15)
// 🔴 เงินเป็นสตางค์จำนวนเต็ม · ค่าบริการ = รายได้ (อยู่ในยอดสุทธิ) · ทิปไม่ใช่รายได้ (แสดงแยก ไม่บวกเข้ายอด/VAT)
//
// ค่าปริยายของคำถามเจ้าของ (รอยืนยัน — แต่ละข้อแก้ได้ที่จุดเดียวที่ระบุ):
//   Q17.1 ผู้ขาย = soldByUserId ?? ผู้เปิดกะ ?? ไม่ระบุ        → sellerOf()
//   Q17.2 ตัดวันเที่ยงคืนเวลาไทย                                → DAY_CUTOFF_MINUTES (+ bkkDate/dayStart)
//   Q17.3 กำไร = ยอดบรรทัดรวม VAT ก่อนส่วนลดท้ายบิล · ต้นทุนที่บันทึกตอนตัดสต็อก ก่อน ต้นทุนเฉลี่ยวันนี้ (ประมาณ) → lineCost() + reportMargin
//   Q17.4 รายงาน = pos.report.view · การ์ดวันนี้ = pos.sale.create → REPORT_PERMISSION / CARD_PERMISSION
import type { PosShift, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { canAccessUnit, evaluate } from "@/lib/core/rbac";
import { lineConsumption, PAY_TYPE_LABEL_TH, PAY_TYPE_ORDER } from "./service";
import { computeReport, type ShiftReport } from "./shift";
import type { RegisterActor } from "./register-shared";

type Db = PrismaClient;

// ═══════════ ค่าคงที่ (จุดเดียวของค่าปริยายเจ้าของ) ═══════════
/** Q17.4 — สิทธิ์ของ 7 รายงาน + CSV */
export const REPORT_PERMISSION = "pos.report.view";
/** Q17.4 — การ์ดยอดวันนี้ใช้สิทธิ์เดียวกับหน้า "ยอดวันนี้"/ปิดวันเดิม (posSalesScope) */
export const CARD_PERMISSION = "pos.sale.create";
/** Q17.2 — นาทีหลังเที่ยงคืนเวลาไทยที่ถือเป็นการเริ่มวันธุรกิจ (0 = เที่ยงคืน · ตั้งค่าต่อร้านได้ใน P1.18) */
const DAY_CUTOFF_MINUTES = 0;
/** R2 — ช่วงยาวสุดต่อคำขอ (วัน · รวมปลายทั้งสอง) */
export const REPORT_MAX_DAYS = 92;
/** R5 — จำนวนแถวสินค้า/กำไร (totals คิดจากทุกแถวเสมอ) */
const ROW_LIMIT_DEFAULT = 200;
const ROW_LIMIT_MAX = 1000;
/** R15 — ขนาดก้อนของ IN (…) */
const CHUNK = 1000;

const BKK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const SHIFT_OFFSET_MS = BKK_OFFSET_MS - DAY_CUTOFF_MINUTES * 60_000;

export const REPORT_KINDS = ["daily", "products", "staff", "payments", "margin", "shifts", "tax"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

// ═══════════ ชนิดข้อมูล ═══════════
export type ReportCtx = { tenantId: string; systemId: string; unitId?: string };
export type ReportRefusalCode = "VALIDATION" | "NOT_FOUND" | "PERMISSION_DENIED";
export type ReportRefusal = { ok: false; code: ReportRefusalCode; message: string };
export type ReportInput = { from: string; to: string; limit?: number };
export type Report<K extends ReportKind, R, T> = { kind: K; from: string; to: string; unitId: string | null; generatedAt: string; rows: R[]; totals: T };
export type ReportResult<K extends ReportKind, R, T> = { ok: true; report: Report<K, R, T> } | ReportRefusal;

export type DailyRow = {
  businessDate: string;
  billCount: number;
  grossSatang: number;
  discountSatang: number;
  serviceChargeSatang: number;
  netSalesSatang: number;
  vatSatang: number;
  netExVatSatang: number;
  tipSatang: number;
  voidCount: number;
  voidTotalSatang: number;
  /** P1.8 — ใบคืนเงินของวัน (จำนวน · ยอด) · netSalesSatang = ยอดสุทธิหลังหักคืนเงินและยกเลิกแล้ว */
  refundCount: number;
  refundTotalSatang: number;
  avgBillSatang: number;
};
export type DailyTotals = Omit<DailyRow, "businessDate">;

export type ProductRow = {
  key: string;
  productId: string | null;
  itemId: string | null;
  serviceId: string | null;
  name: string;
  qty: number;
  weightGrams: number;
  lineCount: number;
  billCount: number;
  grossSatang: number;
  lineDiscountSatang: number;
  salesSatang: number;
};
export type ProductTotals = { rowCount: number; qty: number; weightGrams: number; lineCount: number; billCount: number; grossSatang: number; lineDiscountSatang: number; salesSatang: number };

export type StaffRow = {
  userId: string | null;
  name: string | null;
  billCount: number;
  /** P1.8 — หักใบคืนเงินของบิลที่คนนี้ขายแล้ว (คืนในช่วงรายงาน) */
  netSalesSatang: number;
  discountSatang: number;
  tipSatang: number;
  voidCount: number;
  voidTotalSatang: number;
  avgBillSatang: number;
  /** P1.8 — ใบคืนเงินของบิลที่คนนี้ขาย (คืนในช่วงรายงาน · เพิ่มล้วน) */
  refundCount?: number;
  refundTotalSatang?: number;
};
export type StaffTotals = Omit<StaffRow, "userId" | "name">;

/** P1.8 — amountSatang = รับสุทธิหลังหักเงินคืนของวิธีนั้น · refundCount/refundSatang = ใบคืน (มีเฉพาะเมื่อมีการคืน) */
export type PaymentRow = { type: string; label: string; count: number; billCount: number; amountSatang: number; cashTenderedSatang?: number; changeSatang?: number; refundCount?: number; refundSatang?: number };
export type PaymentTotals = { totalPaidSatang: number; salesSatang: number; tipSatang: number; billCount: number };

export type MarginRow = {
  key: string;
  name: string;
  qty: number;
  revenueSatang: number;
  costedRevenueSatang: number;
  costSatang: number | null;
  estimatedCostSatang: number;
  uncostedLineCount: number;
  marginSatang: number | null;
  marginBp: number | null;
};
export type MarginTotals = {
  revenueSatang: number;
  costedRevenueSatang: number;
  costSatang: number;
  estimatedCostSatang: number;
  grossMarginSatang: number;
  grossMarginBp: number | null;
  uncostedRevenueSatang: number;
  uncostedLineCount: number;
  netExVatSatang: number;
  netMarginSatang: number;
};

export type ShiftRow = {
  shiftId: string;
  shiftNo: number;
  zNumber: number | null;
  unitId: string;
  unitName: string | null;
  deviceId: string;
  deviceLabel: string | null;
  status: string;
  openedByUserId: string;
  openedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  billCount: number;
  salesTotalSatang: number;
  tipSatang: number;
  expectedCashSatang: number | null;
  countedCashSatang: number | null;
  overShortSatang: number | null;
  forced: boolean;
  /** P1.9b — การนับย้อนหลัง (ไม่มี = null) · ไม่แก้ค่าขาด/เกินของ Z แช่แข็ง (R2-F2) */
  recountCountedCashSatang: number | null;
  recountVarianceSatang: number | null;
};
export type ShiftTotals = {
  shiftCount: number;
  billCount: number;
  salesTotalSatang: number;
  tipSatang: number;
  overShortSatang: number;
  shortCount: number;
  overCount: number;
  forcedCount: number;
  openCount: number;
  /** P1.9b — ผลรวมส่วนต่างของการนับย้อนหลัง (แยกจาก overShortSatang ที่มาจาก Z) + จำนวนกะที่นับใหม่ */
  recountVarianceSatang: number;
  recountCount: number;
};

export type TaxRow = {
  businessDate: string;
  unitId: string;
  unitName: string;
  firstReceiptNo: string | null;
  lastReceiptNo: string | null;
  billCount: number;
  grossSatang: number;
  vatSatang: number;
  baseSatang: number;
  vatableGrossSatang: number;
  nonVatGrossSatang: number;
  voidCount: number;
  voidReceiptNos: string[];
  /** P1.8 — ใบคืนเงิน/ใบลดหนี้ของวัน+สาขา (เพิ่มล้วน · ยอดขาย/VAT ข้างบนเป็นของใบเสร็จขาย) */
  refundCount?: number;
  refundGrossSatang?: number;
  refundVatSatang?: number;
  refundReceiptNos?: string[];
};
export type TaxTotals = { billCount: number; grossSatang: number; vatSatang: number; baseSatang: number; vatableGrossSatang: number; nonVatGrossSatang: number; voidCount: number; refundCount?: number; refundGrossSatang?: number; refundVatSatang?: number };

export type DashboardCard = {
  businessDate: string;
  netSalesSatang: number;
  billCount: number;
  avgBillSatang: number;
  voidCount: number;
  tipSatang: number;
  yesterdayNetSalesSatang: number;
  deltaBp: number | null;
  openShiftCount: number;
  topProduct: { key: string; name: string; qty: number; salesSatang: number } | null;
};
export type DashboardCardResult = { ok: true; card: DashboardCard } | ReportRefusal;
export type ReportCsvResult = { ok: true; filename: string; contentType: string; body: string } | ReportRefusal;

export type DailyReportResult = ReportResult<"daily", DailyRow, DailyTotals>;
export type ProductsReportResult = ReportResult<"products", ProductRow, ProductTotals>;
export type StaffReportResult = ReportResult<"staff", StaffRow, StaffTotals>;
export type PaymentsReportResult = ReportResult<"payments", PaymentRow, PaymentTotals>;
export type MarginReportResult = ReportResult<"margin", MarginRow, MarginTotals>;
export type ShiftsReportResult = ReportResult<"shifts", ShiftRow, ShiftTotals>;
export type TaxReportResult = ReportResult<"tax", TaxRow, TaxTotals>;
export type AnyReportResult =
  | DailyReportResult
  | ProductsReportResult
  | StaffReportResult
  | PaymentsReportResult
  | MarginReportResult
  | ShiftsReportResult
  | TaxReportResult;

// ═══════════ คำปฏิเสธ ═══════════
const MSG: Record<ReportRefusalCode, string> = {
  VALIDATION: "ช่วงวันที่ไม่ถูกต้อง — เลือกวันเริ่ม/วันสิ้นสุด (ไม่เกิน 92 วัน)",
  NOT_FOUND: "ไม่พบจุดขายหรือสาขานี้",
  PERMISSION_DENIED: "บัญชีนี้ยังไม่มีสิทธิ์ดูรายงาน — ขอสิทธิ์จากเจ้าของร้าน",
};
const refuse = (code: ReportRefusalCode, message?: string): ReportRefusal => ({ ok: false, code, message: message ?? MSG[code] });
const isRefusal = (v: unknown): v is ReportRefusal => !!v && typeof v === "object" && (v as { ok?: unknown }).ok === false;

// ═══════════ ตัวช่วย ═══════════
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200 && !v.includes("\u0000");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const sum = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((t, x) => t + f(x), 0);
const avg = (total: number, n: number): number => (n > 0 ? Math.floor(total / n) : 0);
function chunks<T>(xs: readonly T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Q17.2 — วันธุรกิจ (YYYY-MM-DD) ของเวลาหนึ่ง */
export function bkkBusinessDate(d: Date): string {
  return new Date(d.getTime() + SHIFT_OFFSET_MS).toISOString().slice(0, 10);
}
/** Q17.2 — เวลาเริ่มวันธุรกิจ (UTC) · cutoff 0 = [D−1 17:00Z, D 17:00Z) = bkkDayRange ของหน้าปิดวัน */
const dayStart = (date: string): Date => new Date(Date.parse(`${date}T00:00:00Z`) - SHIFT_OFFSET_MS);
const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

type Range = { from: string; to: string; start: Date; end: Date; limit: number };
/** R2 — YYYY-MM-DD จริง · from ≤ to · ≤ 92 วัน · limit (ถ้าส่ง) = จำนวนเต็ม 1…1000 */
function rangeOf(input: unknown): Range | ReportRefusal {
  if (!isRecord(input)) return refuse("VALIDATION");
  const { from, to, limit } = input;
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) return refuse("VALIDATION");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > REPORT_MAX_DAYS) return refuse("VALIDATION");
  if (limit !== undefined && !(typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= ROW_LIMIT_MAX)) {
    return refuse("VALIDATION", "จำนวนแถวต้องเป็น 1–1000");
  }
  return { from, to, start: dayStart(from), end: dayStart(addDays(to, 1)), limit: typeof limit === "number" ? limit : ROW_LIMIT_DEFAULT };
}

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

// ═══════════ ขอบเขต (R13) + สิทธิ์ (R12) ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string | null; unitIds: string[]; unitName: Map<string, string> };

/**
 * ระบบต้องเป็น AppSystem(POS) ของร้าน (ไม่สนว่าปิดใช้งานแล้ว — ประวัติต้องดูได้) · อื่น = NOT_FOUND
 * ctx.unitId: สาขาของร้าน (รวม archived) ที่ผู้ใช้เข้าได้ · ไม่ใช่/เข้าไม่ได้ = NOT_FOUND · เข้าได้แต่ไม่มีสิทธิ์ = PERMISSION_DENIED
 * ไม่ส่ง unitId: ทุกสาขาของร้าน (รวม archived) ที่มีสิทธิ์ · ไม่มีเลย = PERMISSION_DENIED
 */
async function scopeOf(db: Db, ctxRaw: unknown, actorRaw: unknown, permission: string): Promise<Scope | ReportRefusal> {
  if (!isRecord(ctxRaw) || !isId(ctxRaw.tenantId) || !isId(ctxRaw.systemId)) return refuse("NOT_FOUND");
  if (ctxRaw.unitId !== undefined && ctxRaw.unitId !== null && !isId(ctxRaw.unitId)) return refuse("NOT_FOUND");
  const tenantId = ctxRaw.tenantId;
  const systemId = ctxRaw.systemId;
  const unitId = isId(ctxRaw.unitId) ? ctxRaw.unitId : null;
  const actor = actorOf(actorRaw);
  if (!actor) return refuse("PERMISSION_DENIED");
  const sys = await db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true } });
  if (!sys) return refuse("NOT_FOUND");
  const can = (u: string) => evaluate(actor, { module: "pos", action: permission, unitId: u });
  if (unitId) {
    const unit = await db.businessUnit.findFirst({ where: { id: unitId, tenantId }, select: { id: true, name: true } });
    if (!unit || !canAccessUnit(actor, unitId)) return refuse("NOT_FOUND");
    if (!can(unitId)) return refuse("PERMISSION_DENIED");
    return { tenantId, systemId, unitId, unitIds: [unit.id], unitName: new Map([[unit.id, unit.name]]) };
  }
  const everyUnit = actor.role === "OWNER" || actor.unitAccess.includes("*");
  const units = await db.businessUnit.findMany({
    where: everyUnit ? { tenantId } : { tenantId, id: { in: actor.unitAccess } },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  const allowed = units.filter((u) => can(u.id));
  if (allowed.length === 0) return refuse("PERMISSION_DENIED");
  return { tenantId, systemId, unitId: null, unitIds: allowed.map((u) => u.id), unitName: new Map(allowed.map((u) => [u.id, u.name])) };
}

async function guard<T>(name: string, body: () => Promise<T | ReportRefusal>): Promise<T | ReportRefusal> {
  return body().catch((e: unknown) => {
    // อ่านอย่างเดียว — ความผิดพลาดที่ไม่คาดคิด (DB ล่ม ฯลฯ) ส่งต่อให้ action ตอบ INTERNAL · ไม่ "ปฏิเสธ" แทน
    console.error(`[pos/reports] ${name}`, e);
    throw e;
  });
}

/** scope + range ตามลำดับ R13 → R12 → R2 */
async function prepare(db: Db, ctx: unknown, actor: unknown, input: unknown, permission = REPORT_PERMISSION): Promise<{ s: Scope; r: Range } | ReportRefusal> {
  const s = await scopeOf(db, ctx, actor, permission);
  if (isRefusal(s)) return s;
  const r = rangeOf(input);
  if (isRefusal(r)) return r;
  return { s, r };
}

// ═══════════ ตัวโหลด (จำนวนคิวรีคงที่ · R15) ═══════════
type SaleRow = {
  id: string;
  unitId: string;
  status: string;
  receiptNo: string | null;
  createdAt: Date;
  subtotalSatang: number;
  discountSatang: number;
  vatSatang: number;
  grandTotalSatang: number;
  serviceChargeSatang: number;
  tipSatang: number;
  shiftId: string | null;
  soldByUserId: string | null;
  /** P1.8 — SALE = บิลขาย · REFUND = ใบคืนเงิน (ยอดบวก ตีความเป็นเงินออก · refSaleId = บิลเดิม) */
  docType: string;
  refSaleId: string | null;
};

/**
 * R3 — เอกสารของขอบเขต + ช่วง เรียงตามเวลา · ดัชนี (tenantId, unitId, createdAt)
 * POS P1.8 ▸ บิลขาย PAID + VOIDED + คืนครบ REFUNDED (ยังเป็นการขายของวันที่ขาย) + ใบคืนเงิน (หักในวันที่คืน) — ผู้อ่านแยกด้วย paidOf/voidedOf/refundsOf ◂
 */
async function loadSales(db: Db, s: Scope, start: Date, end: Date): Promise<SaleRow[]> {
  return db.posSale.findMany({
    where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, createdAt: { gte: start, lt: end }, status: { in: ["PAID", "VOIDED", "REFUNDED"] } },
    select: {
      id: true,
      unitId: true,
      status: true,
      receiptNo: true,
      createdAt: true,
      subtotalSatang: true,
      discountSatang: true,
      vatSatang: true,
      grandTotalSatang: true,
      serviceChargeSatang: true,
      tipSatang: true,
      shiftId: true,
      soldByUserId: true,
      docType: true,
      refSaleId: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

type LineRow = {
  id: string;
  saleId: string;
  name: string;
  qty: number;
  unitPriceSatang: number;
  discountSatang: number;
  lineTotalSatang: number;
  itemId: string | null;
  serviceId: string | null;
  productId: string | null;
  weightGrams: number | null;
  /** โหลดเฉพาะเมื่อขอ (รายงานกำไร) · อื่น ๆ = undefined */
  components?: unknown;
  /** P1.8 — บรรทัดของใบคืนเงิน (ค่าติดลบแล้ว · ไม่นับเป็นบิล) */
  refund?: boolean;
  refLineId?: string | null;
  restock?: boolean | null;
};
/** withComponents = เลือกคอลัมน์ JSON components ด้วย (รายงานกำไรเท่านั้น · R2-F4) */
async function loadLines(db: Db, tenantId: string, saleIds: string[], withComponents = false): Promise<LineRow[]> {
  const out: LineRow[] = [];
  for (const ids of chunks(saleIds)) {
    out.push(
      ...(await db.posSaleLine.findMany({
        where: { tenantId, saleId: { in: ids } },
        select: {
          id: true,
          saleId: true,
          name: true,
          qty: true,
          unitPriceSatang: true,
          discountSatang: true,
          lineTotalSatang: true,
          itemId: true,
          serviceId: true,
          productId: true,
          weightGrams: true,
          components: withComponents,
          refLineId: true,
          restock: true,
        },
        orderBy: { id: "asc" },
      })),
    );
  }
  return out;
}

/** บิลขายที่นับยอด (PAID หรือคืนครบ REFUNDED — การคืนถูกหักผ่าน refundsOf) */
const paidOf = (sales: SaleRow[]) => sales.filter((x) => x.docType === "SALE" && x.status !== "VOIDED");
const voidedOf = (sales: SaleRow[]) => sales.filter((x) => x.docType === "SALE" && x.status === "VOIDED");
/** POS P1.8 — ใบคืนเงินในช่วง */
const refundsOf = (sales: SaleRow[]) => sales.filter((x) => x.docType === "REFUND");
const envelope = <K extends ReportKind, R, T>(kind: K, s: Scope, r: Range, rows: R[], totals: T): { ok: true; report: Report<K, R, T> } => ({
  ok: true,
  report: { kind, from: r.from, to: r.to, unitId: s.unitId, generatedAt: new Date().toISOString(), rows, totals },
});

// ═══════════ 1. ยอดขายรายวัน (R5) ═══════════
function dailyTotalsOf(sales: SaleRow[]): DailyTotals {
  const paid = paidOf(sales);
  const voided = voidedOf(sales);
  const refunds = refundsOf(sales);
  // P1.8 ▸ ยอดสุทธิ "หลังหักคืนเงินและยกเลิก" (หัวจอ 08) — ใบคืน: subtotal = Σ ยอดบรรทัดที่คืน · ส่วนลด 0 · ค่าบริการส่วนที่คืน
  //   ⇒ gross − discount + ค่าบริการ = net ยังจริงหลังหัก · บิลคืนครบ (REFUNDED) + ใบคืนของมัน = 0 ◂
  const refundTotal = sum(refunds, (x) => x.grandTotalSatang);
  const net = sum(paid, (x) => x.grandTotalSatang) - refundTotal;
  const vat = sum(paid, (x) => x.vatSatang) - sum(refunds, (x) => x.vatSatang);
  return {
    billCount: paid.length,
    grossSatang: sum(paid, (x) => x.subtotalSatang) - sum(refunds, (x) => x.subtotalSatang),
    discountSatang: sum(paid, (x) => x.discountSatang),
    serviceChargeSatang: sum(paid, (x) => x.serviceChargeSatang) - sum(refunds, (x) => x.serviceChargeSatang),
    netSalesSatang: net,
    vatSatang: vat,
    netExVatSatang: net - vat,
    tipSatang: sum(paid, (x) => x.tipSatang),
    voidCount: voided.length,
    voidTotalSatang: sum(voided, (x) => x.grandTotalSatang),
    refundCount: refunds.length,
    refundTotalSatang: refundTotal,
    avgBillSatang: avg(net, paid.length),
  };
}

export async function reportDailySales(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<DailyReportResult> {
  return guard("reportDailySales", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const sales = await loadSales(db, s, r.start, r.end);
    const byDay = new Map<string, SaleRow[]>();
    for (const x of sales) {
      const d = bkkBusinessDate(x.createdAt);
      const day = byDay.get(d);
      if (day) day.push(x);
      else byDay.set(d, [x]);
    }
    const rows: DailyRow[] = daysOf(r.from, r.to).map((d) => ({ businessDate: d, ...dailyTotalsOf(byDay.get(d) ?? []) }));
    return envelope("daily", s, r, rows, dailyTotalsOf(sales));
  });
}

// ═══════════ 2. สินค้าขายดี (R5) ═══════════
/** คีย์สินค้า: p:<productId> › i:<itemId> › s:<serviceId> › n:<ชื่อบรรทัด> (ตัวแรกที่ไม่ว่าง) */
const productKey = (l: Pick<LineRow, "productId" | "itemId" | "serviceId" | "name">): string =>
  l.productId ? `p:${l.productId}` : l.itemId ? `i:${l.itemId}` : l.serviceId ? `s:${l.serviceId}` : `n:${l.name}`;

/**
 * บรรทัดของบิลที่นับยอด เรียงตามเวลาบิล (ชื่อของแถว = ชื่อบรรทัดล่าสุด)
 * P1.8 ▸ + บรรทัดของใบคืนเงินในช่วง เป็นค่าติดลบ (จำนวน/กรัม/ยอด) · refund = true (ไม่นับเป็นบิล) — บรรทัดใบคืนถือ productId/itemId/serviceId ของบรรทัดเดิม ◂
 */
async function paidLines(db: Db, s: Scope, sales: SaleRow[], withComponents = false): Promise<LineRow[]> {
  const docs = [...paidOf(sales), ...refundsOf(sales)].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || cmpStr(a.id, b.id));
  const order = new Map(docs.map((x, i) => [x.id, i]));
  const refundIds = new Set(refundsOf(sales).map((x) => x.id));
  const lines = await loadLines(db, s.tenantId, docs.map((x) => x.id), withComponents);
  return lines
    .map((l) =>
      refundIds.has(l.saleId)
        ? { ...l, qty: -l.qty, weightGrams: l.weightGrams === null ? null : -l.weightGrams, unitPriceSatang: l.unitPriceSatang, discountSatang: -l.discountSatang, lineTotalSatang: -l.lineTotalSatang, refund: true }
        : l,
    )
    .sort((a, b) => order.get(a.saleId)! - order.get(b.saleId)! || cmpStr(a.id, b.id));
}

function productRowsOf(lines: LineRow[]): { rows: ProductRow[]; totals: ProductTotals } {
  const m = new Map<string, ProductRow & { bills: Set<string> }>();
  for (const l of lines) {
    const key = productKey(l);
    const r =
      m.get(key) ??
      ({ key, productId: null, itemId: null, serviceId: null, name: l.name, qty: 0, weightGrams: 0, lineCount: 0, billCount: 0, grossSatang: 0, lineDiscountSatang: 0, salesSatang: 0, bills: new Set<string>() } as ProductRow & { bills: Set<string> });
    r.productId = l.productId;
    r.itemId = l.itemId;
    r.serviceId = l.serviceId;
    if (!l.refund) r.name = l.name;
    r.qty += l.qty;
    r.weightGrams += l.weightGrams ?? 0;
    // P1.8 ▸ บรรทัดใบคืน: หักจำนวน/ยอด แต่ไม่นับเป็นบรรทัด/บิลขาย ◂
    if (!l.refund) {
      r.lineCount += 1;
      r.bills.add(l.saleId);
    }
    r.grossSatang += l.unitPriceSatang * l.qty;
    r.lineDiscountSatang += l.discountSatang;
    r.salesSatang += l.lineTotalSatang;
    m.set(key, r);
  }
  const rows: ProductRow[] = [...m.values()]
    .map(({ bills, ...r }) => ({ ...r, billCount: bills.size }))
    .sort((a, b) => b.salesSatang - a.salesSatang || cmpStr(a.key, b.key));
  return {
    rows,
    totals: {
      rowCount: rows.length,
      qty: sum(rows, (x) => x.qty),
      weightGrams: sum(rows, (x) => x.weightGrams),
      lineCount: sum(rows, (x) => x.lineCount),
      billCount: new Set(lines.filter((l) => !l.refund).map((l) => l.saleId)).size,
      grossSatang: sum(rows, (x) => x.grossSatang),
      lineDiscountSatang: sum(rows, (x) => x.lineDiscountSatang),
      salesSatang: sum(rows, (x) => x.salesSatang),
    },
  };
}

export async function reportProducts(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<ProductsReportResult> {
  return guard("reportProducts", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const { rows, totals } = productRowsOf(await paidLines(db, s, await loadSales(db, s, r.start, r.end)));
    return envelope("products", s, r, rows.slice(0, r.limit), totals);
  });
}

// ═══════════ 3. ยอดต่อพนักงาน (R6 · Q17.1) ═══════════
async function userNames(db: Db, ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const part of chunks([...new Set(ids)])) {
    for (const u of await db.user.findMany({ where: { id: { in: part } }, select: { id: true, name: true, email: true } })) out.set(u.id, u.name || u.email || null);
  }
  return out;
}

/** Q17.1 — ผู้ขายของบิล = soldByUserId ?? ผู้เปิดกะของบิล ?? null ("ไม่ระบุ") */
function sellerOf(x: SaleRow, shiftOpener: Map<string, string>): string | null {
  return x.soldByUserId ?? (x.shiftId ? (shiftOpener.get(x.shiftId) ?? null) : null);
}

export async function reportStaff(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<StaffReportResult> {
  return guard("reportStaff", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const sales = await loadSales(db, s, r.start, r.end);
    // P1.8 ▸ ใบคืนเงินหักจากผู้ขายของบิลเดิม (บิลเดิมอาจอยู่นอกช่วง — อ่านเพิ่มคำสั่งเดียวต่อก้อน) ◂
    const refunds = refundsOf(sales);
    type Origin = { soldByUserId: string | null; shiftId: string | null };
    const origin = new Map<string, Origin>(sales.filter((x) => x.docType === "SALE").map((x) => [x.id, { soldByUserId: x.soldByUserId, shiftId: x.shiftId }]));
    const missing = [...new Set(refunds.map((x) => x.refSaleId).filter((id): id is string => !!id && !origin.has(id)))];
    for (const ids of chunks(missing)) {
      // บิลเดิมอยู่สาขาเดียวกับใบคืนและเกิดก่อนใบคืน ⇒ กรอง unitId + createdAt (ดัชนี tenantId, unitId, createdAt · R15)
      const rows = await db.posSale.findMany({ where: { tenantId: s.tenantId, unitId: { in: s.unitIds }, createdAt: { lt: r.end }, id: { in: ids } }, select: { id: true, soldByUserId: true, shiftId: true } });
      for (const o of rows) origin.set(o.id, { soldByUserId: o.soldByUserId, shiftId: o.shiftId });
    }
    const shiftIds = [...new Set([...origin.values()].filter((x) => !x.soldByUserId && x.shiftId).map((x) => x.shiftId as string))];
    const opener = new Map<string, string>();
    for (const part of chunks(shiftIds)) {
      for (const sh of await db.posShift.findMany({ where: { tenantId: s.tenantId, id: { in: part } }, select: { id: true, openedByUserId: true } })) opener.set(sh.id, sh.openedByUserId);
    }
    const m = new Map<string, StaffRow>();
    const rowOf = (uid: string | null): StaffRow => {
      const k = uid ?? "";
      const cur = m.get(k) ?? { userId: uid, name: null, billCount: 0, netSalesSatang: 0, discountSatang: 0, tipSatang: 0, voidCount: 0, voidTotalSatang: 0, avgBillSatang: 0 };
      m.set(k, cur);
      return cur;
    };
    for (const x of refunds) {
      const o = x.refSaleId ? origin.get(x.refSaleId) : undefined;
      const row = rowOf(o ? sellerOf({ ...x, soldByUserId: o.soldByUserId, shiftId: o.shiftId }, opener) : null);
      row.netSalesSatang -= x.grandTotalSatang;
      row.refundCount = (row.refundCount ?? 0) + 1;
      row.refundTotalSatang = (row.refundTotalSatang ?? 0) + x.grandTotalSatang;
    }
    for (const x of sales) {
      if (x.docType !== "SALE") continue;
      const row = rowOf(sellerOf(x, opener));
      if (x.status !== "VOIDED") {
        row.billCount += 1;
        row.netSalesSatang += x.grandTotalSatang;
        row.discountSatang += x.discountSatang;
        row.tipSatang += x.tipSatang;
      } else {
        // ผู้ยกเลิกไม่ถูกเก็บ ⇒ บิลยกเลิกนับให้ผู้ขายของบิล
        row.voidCount += 1;
        row.voidTotalSatang += x.grandTotalSatang;
      }
    }
    const names = await userNames(db, [...m.values()].map((x) => x.userId).filter((x): x is string => !!x));
    const rows = [...m.values()]
      .map((x) => ({ ...x, name: x.userId ? (names.get(x.userId) ?? null) : null, avgBillSatang: avg(x.netSalesSatang, x.billCount) }))
      .sort((a, b) => b.netSalesSatang - a.netSalesSatang || (a.userId === null ? 1 : b.userId === null ? -1 : cmpStr(a.userId, b.userId)));
    const net = sum(rows, (x) => x.netSalesSatang);
    const bills = sum(rows, (x) => x.billCount);
    return envelope("staff", s, r, rows, {
      billCount: bills,
      netSalesSatang: net,
      discountSatang: sum(rows, (x) => x.discountSatang),
      tipSatang: sum(rows, (x) => x.tipSatang),
      voidCount: sum(rows, (x) => x.voidCount),
      voidTotalSatang: sum(rows, (x) => x.voidTotalSatang),
      avgBillSatang: avg(net, bills),
      ...(refunds.length ? { refundCount: refunds.length, refundTotalSatang: sum(refunds, (x) => x.grandTotalSatang) } : {}),
    });
  });
}

// ═══════════ 4. วิธีชำระ (R7) ═══════════
export async function reportPayments(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<PaymentsReportResult> {
  return guard("reportPayments", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const all = await loadSales(db, s, r.start, r.end);
    const paid = paidOf(all);
    // P1.8 ▸ เงินคืนหักจากวิธีของมัน (amount สุทธิ) · count/billCount/tendered/change = ฝั่งรับเดิม ◂
    const refunds = refundsOf(all);
    const refundIds = new Set(refunds.map((x) => x.id));
    const agg = new Map<string, { count: number; bills: Set<string>; amount: number; tendered: number; change: number; rCount: number; rAmount: number }>();
    for (const ids of chunks([...paid, ...refunds].map((x) => x.id))) {
      const pays = await db.posPayment.findMany({
        where: { tenantId: s.tenantId, saleId: { in: ids } },
        select: { saleId: true, type: true, amountSatang: true, tenderedSatang: true, changeSatang: true },
      });
      for (const x of pays) {
        const a = agg.get(x.type) ?? { count: 0, bills: new Set<string>(), amount: 0, tendered: 0, change: 0, rCount: 0, rAmount: 0 };
        if (refundIds.has(x.saleId)) {
          a.amount -= x.amountSatang;
          a.rCount += 1;
          a.rAmount += x.amountSatang;
          agg.set(x.type, a);
          continue;
        }
        a.count += 1;
        a.bills.add(x.saleId);
        a.amount += x.amountSatang;
        a.tendered += x.tenderedSatang ?? x.amountSatang;
        a.change += x.changeSatang ?? 0;
        agg.set(x.type, a);
      }
    }
    const order: string[] = [...PAY_TYPE_ORDER, ...[...agg.keys()].filter((t) => !(PAY_TYPE_ORDER as string[]).includes(t)).sort()];
    const label = PAY_TYPE_LABEL_TH as Record<string, string>;
    const rows: PaymentRow[] = order
      .filter((t) => agg.has(t))
      .map((t) => {
        const a = agg.get(t)!;
        return {
          type: t,
          label: label[t] ?? t,
          count: a.count,
          billCount: a.bills.size,
          amountSatang: a.amount,
          ...(t === "CASH" ? { cashTenderedSatang: a.tendered, changeSatang: a.change } : {}),
          ...(a.rCount ? { refundCount: a.rCount, refundSatang: a.rAmount } : {}),
        };
      });
    return envelope("payments", s, r, rows, {
      totalPaidSatang: sum(rows, (x) => x.amountSatang),
      salesSatang: sum(paid, (x) => x.grandTotalSatang) - sum(refunds, (x) => x.grandTotalSatang),
      tipSatang: sum(paid, (x) => x.tipSatang),
      billCount: paid.length,
    });
  });
}

// ═══════════ 5. กำไรขั้นต้น (R8 · Q17.3) ═══════════
type LineCost = { kind: "stored"; cost: number } | { kind: "estimated"; cost: number } | { kind: "uncosted" };

/**
 * Q17.3 — ต้นทุนของบรรทัด: ① ต้นทุนที่บันทึกตอนตัดสต็อก (InvMovement ตามคีย์ของ lineConsumption ครบทุกส่วน)
 * ② ไม่ครบ + บรรทัดผูก itemId = ต้นทุนเฉลี่ยปัจจุบัน × (กรัม ?? จำนวน) "ประมาณ" ③ อื่น ๆ = ไม่มีต้นทุน
 * R2-F5: บรรทัดที่มีทั้ง itemId และ components แต่ movement มาแค่บางส่วน = ไม่มีต้นทุน (ไม่ประมาณจาก itemId อย่างเดียว)
 */
function lineCost(
  l: LineRow,
  parts: { itemId: string; qty: number; key: string }[],
  moved: Map<string, number>,
  itemCost: Map<string, number>,
): LineCost {
  if (parts.length > 0 && parts.every((x) => moved.has(x.key))) return { kind: "stored", cost: sum(parts, (x) => moved.get(x.key)!) };
  const hasComponents = parts.length > (l.itemId ? 1 : 0);
  if (l.itemId && hasComponents && parts.some((x) => moved.has(x.key))) return { kind: "uncosted" };
  if (l.itemId && itemCost.has(l.itemId)) return { kind: "estimated", cost: itemCost.get(l.itemId)! * (l.weightGrams ?? l.qty) };
  return { kind: "uncosted" };
}

export async function reportMargin(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<MarginReportResult> {
  return guard("reportMargin", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const sales = await loadSales(db, s, r.start, r.end);
    const paid = paidOf(sales);
    const lines = await paidLines(db, s, sales, true);
    const partsOf = new Map(lines.filter((l) => !l.refund).map((l) => [l.id, lineConsumption(l.saleId, { ...l, components: l.components ?? null })]));
    // P1.8 ▸ บรรทัดใบคืน: ยอดขายติดลบ · ต้นทุน = ของที่รับคืนจริง (IN คีย์ pos-refund-<ใบคืน>-<บรรทัด>[-<ของ>] ที่ต้นทุนเดิม · O12) ติดลบ ·
    //   ไม่รับคืน (restock false/ว่าง) = ต้นทุนคงเดิม (ความเสียหาย) ⇒ ทุกบรรทัดใบคืนนับเป็น "มีต้นทุน" ◂
    const refundLines = lines.filter((l) => l.refund);
    const returned = new Map<string, number>();
    for (const part of chunks(refundLines.filter((l) => l.restock === true))) {
      const mv = await db.invMovement.findMany({
        where: { tenantId: s.tenantId, type: "IN", OR: part.map((l) => ({ idempotencyKey: { startsWith: `pos-refund-${l.saleId}-${l.id}` } })) },
        select: { idempotencyKey: true, qtyDelta: true, costSatang: true },
      });
      for (const l of part) {
        const own = mv.filter((x) => x.idempotencyKey === `pos-refund-${l.saleId}-${l.id}` || x.idempotencyKey.startsWith(`pos-refund-${l.saleId}-${l.id}-`));
        returned.set(l.id, sum(own, (x) => Math.abs(x.qtyDelta) * x.costSatang));
      }
    }
    // ต้นทุนที่บันทึก: ค้นด้วยดัชนี unique (tenantId, idempotencyKey) เท่านั้น (InvMovement ไม่มีดัชนี refId)
    const moved = new Map<string, number>();
    for (const keys of chunks([...partsOf.values()].flat().map((x) => x.key))) {
      const mv = await db.invMovement.findMany({ where: { tenantId: s.tenantId, idempotencyKey: { in: keys } }, select: { idempotencyKey: true, qtyDelta: true, costSatang: true } });
      for (const x of mv) moved.set(x.idempotencyKey, Math.abs(x.qtyDelta) * x.costSatang);
    }
    const needEstimate = [...new Set(lines.filter((l) => !l.refund && l.itemId && !partsOf.get(l.id)!.every((x) => moved.has(x.key))).map((l) => l.itemId as string))];
    const itemCost = new Map<string, number>();
    for (const ids of chunks(needEstimate)) {
      for (const it of await db.invItem.findMany({ where: { tenantId: s.tenantId, id: { in: ids } }, select: { id: true, costSatang: true } })) itemCost.set(it.id, it.costSatang);
    }
    type Acc = { key: string; name: string; qty: number; revenue: number; costedRevenue: number; cost: number; costed: number; estimated: number; uncosted: number };
    const m = new Map<string, Acc>();
    for (const l of lines) {
      const key = productKey(l);
      const a = m.get(key) ?? { key, name: l.name, qty: 0, revenue: 0, costedRevenue: 0, cost: 0, costed: 0, estimated: 0, uncosted: 0 };
      a.name = l.name;
      a.qty += l.qty;
      a.revenue += l.lineTotalSatang;
      const c: LineCost = l.refund ? { kind: "stored", cost: -(returned.get(l.id) ?? 0) } : lineCost(l, partsOf.get(l.id)!, moved, itemCost);
      if (c.kind === "uncosted") a.uncosted += 1;
      else {
        a.costed += 1;
        a.cost += c.cost;
        a.costedRevenue += l.lineTotalSatang;
        if (c.kind === "estimated") a.estimated += c.cost;
      }
      m.set(key, a);
    }
    const all = [...m.values()];
    const rows: MarginRow[] = all
      .map((a) => {
        const costSatang = a.costed ? a.cost : null;
        const marginSatang = costSatang === null ? null : a.costedRevenue - costSatang;
        return {
          key: a.key,
          name: a.name,
          qty: a.qty,
          revenueSatang: a.revenue,
          costedRevenueSatang: a.costedRevenue,
          costSatang,
          estimatedCostSatang: a.estimated,
          uncostedLineCount: a.uncosted,
          marginSatang,
          marginBp: marginSatang === null || a.costedRevenue <= 0 ? null : Math.floor((marginSatang * 10_000) / a.costedRevenue),
        };
      })
      .sort((a, b) => b.revenueSatang - a.revenueSatang || cmpStr(a.key, b.key));
    const revenue = sum(all, (a) => a.revenue);
    const costedRevenue = sum(all, (a) => a.costedRevenue);
    const cost = sum(all, (a) => a.cost);
    const netExVat = sum(paid, (x) => x.grandTotalSatang - x.vatSatang) - sum(refundsOf(sales), (x) => x.grandTotalSatang - x.vatSatang);
    const grossMargin = costedRevenue - cost;
    return envelope("margin", s, r, rows.slice(0, r.limit), {
      revenueSatang: revenue,
      costedRevenueSatang: costedRevenue,
      costSatang: cost,
      estimatedCostSatang: sum(all, (a) => a.estimated),
      grossMarginSatang: grossMargin,
      grossMarginBp: costedRevenue > 0 ? Math.floor((grossMargin * 10_000) / costedRevenue) : null,
      uncostedRevenueSatang: revenue - costedRevenue,
      uncostedLineCount: sum(all, (a) => a.uncosted),
      netExVatSatang: netExVat,
      netMarginSatang: netExVat - cost,
    });
  });
}

// ═══════════ 6. กะ (R9) ═══════════
export async function reportShifts(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<ShiftsReportResult> {
  return guard("reportShifts", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    // กะที่ "วันเปิดกะ" (เวลาไทย) อยู่ในช่วง · ดัชนี (tenantId, unitId, status) ช่วยกรองสาขา
    const shifts: PosShift[] = await db.posShift.findMany({
      where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, openedAt: { gte: r.start, lt: r.end } },
      orderBy: [{ openedAt: "asc" }, { id: "asc" }],
    });
    const names = await userNames(db, shifts.map((x) => x.openedByUserId));
    // P1.9b — การนับย้อนหลัง (1 ต่อกะ) · คิวรีเดียวต่อก้อน (R2-F2)
    const recount = new Map<string, { counted: number; variance: number }>();
    for (const ids of chunks(shifts.map((x) => x.id))) {
      for (const x of await db.posShiftRecount.findMany({ where: { tenantId: s.tenantId, shiftId: { in: ids } }, select: { shiftId: true, countedCashSatang: true, varianceSatang: true } })) {
        recount.set(x.shiftId, { counted: x.countedCashSatang, variance: x.varianceSatang });
      }
    }
    const rows: ShiftRow[] = [];
    for (const sh of shifts) {
      // ปิดแล้ว = ค่าจาก Z แช่แข็ง + คอลัมน์ของแถว (ไม่คำนวณใหม่ · P1.9 S10) · OPEN = คำนวณสดแบบรายงาน X
      // (Z ว่างของกะที่ปิดแล้ว = เกิดไม่ได้ทาง finalizeClose → ใช้ค่าสดแทน 0 เพื่อไม่ให้ยอดหาย)
      const z: Partial<ShiftReport> | null = sh.status !== "OPEN" && isRecord(sh.zReport) ? (sh.zReport as unknown as Partial<ShiftReport>) : null;
      const live = z ? null : await computeReport(db, sh);
      const open = sh.status === "OPEN";
      rows.push({
        shiftId: sh.id,
        shiftNo: sh.shiftNo,
        zNumber: sh.zNumber,
        unitId: sh.unitId,
        unitName: s.unitName.get(sh.unitId) ?? null,
        deviceId: sh.deviceId,
        deviceLabel: sh.deviceLabel,
        status: sh.status,
        openedByUserId: sh.openedByUserId,
        openedByName: names.get(sh.openedByUserId) ?? null,
        openedAt: sh.openedAt.toISOString(),
        closedAt: sh.closedAt ? sh.closedAt.toISOString() : null,
        billCount: z ? num(z.billCount) : live!.billCount,
        salesTotalSatang: z ? num(z.salesTotalSatang) : live!.salesTotalSatang,
        tipSatang: z ? num(z.tipSatang) : live!.tipSatang,
        expectedCashSatang: open ? live!.expectedCashSatang : (sh.expectedCashSatang ?? numOrNull(z?.expectedCashSatang)),
        countedCashSatang: open ? null : sh.countedCashSatang,
        overShortSatang: open ? null : sh.overShortSatang,
        forced: sh.status === "FORCE_CLOSED",
        recountCountedCashSatang: recount.get(sh.id)?.counted ?? null,
        recountVarianceSatang: recount.get(sh.id)?.variance ?? null,
      });
    }
    const closed = rows.filter((x) => x.overShortSatang !== null);
    return envelope("shifts", s, r, rows, {
      shiftCount: rows.length,
      billCount: sum(rows, (x) => x.billCount),
      salesTotalSatang: sum(rows, (x) => x.salesTotalSatang),
      tipSatang: sum(rows, (x) => x.tipSatang),
      overShortSatang: sum(closed, (x) => x.overShortSatang ?? 0),
      shortCount: closed.filter((x) => (x.overShortSatang ?? 0) < 0).length,
      overCount: closed.filter((x) => (x.overShortSatang ?? 0) > 0).length,
      forcedCount: rows.filter((x) => x.forced).length,
      openCount: rows.filter((x) => x.status === "OPEN").length,
      recountVarianceSatang: sum(rows, (x) => x.recountVarianceSatang ?? 0),
      recountCount: rows.filter((x) => x.recountVarianceSatang !== null).length,
    });
  });
}

// ═══════════ 7. ภาษีขาย (R10) ═══════════
export async function reportTax(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<TaxReportResult> {
  return guard("reportTax", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const all = await loadSales(db, s, r.start, r.end); // เรียงตามเวลาแล้ว
    // P1.8 ▸ ใบคืนเงิน (= ใบลดหนี้) แยกคอลัมน์ refund* ของวัน+สาขา · เลขที่เริ่ม/สุดท้ายเป็นของใบเสร็จขายเท่านั้น ◂
    const sales = all.filter((x) => x.docType === "SALE");
    const refundGroups = new Map<string, SaleRow[]>();
    for (const x of refundsOf(all)) {
      const k = `${bkkBusinessDate(x.createdAt)}|${x.unitId}`;
      refundGroups.set(k, [...(refundGroups.get(k) ?? []), x]);
    }
    const groups = new Map<string, { date: string; unitId: string; bills: SaleRow[] }>();
    for (const [k, rs] of refundGroups) if (!groups.has(k)) groups.set(k, { date: k.split("|")[0]!, unitId: rs[0]!.unitId, bills: [] });
    for (const x of sales) {
      const date = bkkBusinessDate(x.createdAt);
      const k = `${date}|${x.unitId}`;
      const g = groups.get(k) ?? { date, unitId: x.unitId, bills: [] };
      g.bills.push(x);
      groups.set(k, g);
    }
    const rows: TaxRow[] = [...groups.values()]
      .map((g) => {
        const paid = paidOf(g.bills);
        const voided = voidedOf(g.bills);
        const gross = sum(paid, (x) => x.grandTotalSatang);
        const vat = sum(paid, (x) => x.vatSatang);
        const rs = refundGroups.get(`${g.date}|${g.unitId}`) ?? [];
        return {
          businessDate: g.date,
          unitId: g.unitId,
          unitName: s.unitName.get(g.unitId) ?? "",
          firstReceiptNo: g.bills[0]?.receiptNo ?? null,
          lastReceiptNo: g.bills[g.bills.length - 1]?.receiptNo ?? null,
          billCount: paid.length,
          grossSatang: gross,
          vatSatang: vat,
          baseSatang: gross - vat,
          vatableGrossSatang: sum(paid.filter((x) => x.vatSatang > 0), (x) => x.grandTotalSatang),
          nonVatGrossSatang: sum(paid.filter((x) => x.vatSatang === 0), (x) => x.grandTotalSatang),
          voidCount: voided.length,
          voidReceiptNos: voided.map((x) => x.receiptNo ?? "").filter((x) => x !== ""),
          ...(rs.length
            ? { refundCount: rs.length, refundGrossSatang: sum(rs, (x) => x.grandTotalSatang), refundVatSatang: sum(rs, (x) => x.vatSatang), refundReceiptNos: rs.map((x) => x.receiptNo ?? "").filter((x) => x !== "") }
            : {}),
        };
      })
      .sort((a, b) => cmpStr(a.businessDate, b.businessDate) || cmpStr(a.unitName, b.unitName) || cmpStr(a.unitId, b.unitId));
    return envelope("tax", s, r, rows, {
      billCount: sum(rows, (x) => x.billCount),
      grossSatang: sum(rows, (x) => x.grossSatang),
      vatSatang: sum(rows, (x) => x.vatSatang),
      baseSatang: sum(rows, (x) => x.baseSatang),
      vatableGrossSatang: sum(rows, (x) => x.vatableGrossSatang),
      nonVatGrossSatang: sum(rows, (x) => x.nonVatGrossSatang),
      voidCount: sum(rows, (x) => x.voidCount),
      ...(rows.some((x) => x.refundCount)
        ? { refundCount: sum(rows, (x) => x.refundCount ?? 0), refundGrossSatang: sum(rows, (x) => x.refundGrossSatang ?? 0), refundVatSatang: sum(rows, (x) => x.refundVatSatang ?? 0) }
        : {}),
    });
  });
}

// ═══════════ CSV (R11) ═══════════
const CSV_BOM = "﻿";
const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
const TOTAL_LABEL = "รวม";
/** R2-F1 — กันสูตรใน Excel/Sheets: ขึ้นต้น = + - @ TAB CR และไม่ใช่ตัวเลขล้วน ⇒ เติม ' นำหน้า (ตัวเลขติดลบคงเป็นตัวเลข) */
const CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;
const CSV_PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const csvEsc = (v: unknown): string => {
  const raw = v == null ? "" : String(v);
  const t = CSV_FORMULA_LEAD.test(raw) && !CSV_PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
/** สตางค์ → บาท 2 ตำแหน่ง (เลขจำนวนเต็มล้วน · ติดลบคงเครื่องหมาย) */
const baht = (satang: number | null | undefined): string => {
  if (satang === null || satang === undefined) return "";
  const a = Math.abs(satang);
  return `${satang < 0 ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
};
const pct = (bp: number | null): string => (bp === null ? "" : (bp / 100).toFixed(2));
/** เวลาไทย YYYY-MM-DD HH:mm */
const bkkTime = (isoStr: string | null): string => (isoStr ? new Date(Date.parse(isoStr) + BKK_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") : "");
const SHIFT_STATUS_TH: Record<string, string> = { OPEN: "เปิดอยู่", CLOSED: "ปิดแล้ว", FORCE_CLOSED: "ระบบปิดให้" };

export const CSV_HEADERS: Record<ReportKind, string[]> = {
  daily: ["วันที่", "จำนวนบิล", "ยอดก่อนส่วนลด", "ส่วนลด", "ค่าบริการ", "ยอดขายสุทธิ", "VAT", "ยอดก่อน VAT", "ทิป", "บิลยกเลิก", "ยอดบิลยกเลิก", "เฉลี่ยต่อบิล"],
  products: ["รหัส", "ชื่อ", "จำนวน", "น้ำหนัก (กรัม)", "จำนวนบิล", "ยอดเต็ม", "ส่วนลดรายการ", "ยอดขาย"],
  staff: ["รหัสผู้ใช้", "ชื่อ", "จำนวนบิล", "ยอดขายสุทธิ", "ส่วนลด", "ทิป", "บิลยกเลิก", "ยอดบิลยกเลิก", "เฉลี่ยต่อบิล"],
  payments: ["วิธีชำระ", "รหัส", "จำนวนรายการ", "จำนวนบิล", "ยอดรับ"],
  margin: ["รหัส", "ชื่อ", "จำนวน", "ยอดขาย", "ต้นทุน", "ต้นทุนประมาณการ", "กำไรขั้นต้น", "อัตรากำไร (%)"],
  shifts: ["กะที่", "Z ที่", "สาขา", "เครื่อง", "สถานะ", "เปิดโดย", "เวลาเปิด", "เวลาปิด", "จำนวนบิล", "ยอดขาย", "เงินที่ควรมี", "เงินที่นับได้", "ขาด/เกิน"],
  tax: ["วันที่", "สาขา", "เลขที่เริ่ม", "เลขที่สุดท้าย", "จำนวนบิล", "ยอดรวม VAT", "ฐานภาษี", "VAT", "ยอดไม่มี VAT", "บิลยกเลิก", "เลขที่ยกเลิก"],
};
type Cells = (string | number)[];
const dailyCells = (first: string, x: DailyTotals): Cells => [
  first,
  x.billCount,
  baht(x.grossSatang),
  baht(x.discountSatang),
  baht(x.serviceChargeSatang),
  baht(x.netSalesSatang),
  baht(x.vatSatang),
  baht(x.netExVatSatang),
  baht(x.tipSatang),
  x.voidCount,
  baht(x.voidTotalSatang),
  baht(x.avgBillSatang),
];

/** แถวข้อมูล + แถว "รวม" ของรายงานแต่ละชนิด */
function csvBodyRows(res: Exclude<AnyReportResult, ReportRefusal>): Cells[] {
  const rep = res.report;
  switch (rep.kind) {
    case "daily": {
      const x = rep as Report<"daily", DailyRow, DailyTotals>;
      return [...x.rows.map((r) => dailyCells(r.businessDate, r)), dailyCells(TOTAL_LABEL, x.totals)];
    }
    case "products": {
      const x = rep as Report<"products", ProductRow, ProductTotals>;
      return [
        ...x.rows.map((r) => [r.key, r.name, r.qty, r.weightGrams, r.billCount, baht(r.grossSatang), baht(r.lineDiscountSatang), baht(r.salesSatang)]),
        [TOTAL_LABEL, "", x.totals.qty, x.totals.weightGrams, x.totals.billCount, baht(x.totals.grossSatang), baht(x.totals.lineDiscountSatang), baht(x.totals.salesSatang)],
      ];
    }
    case "staff": {
      const x = rep as Report<"staff", StaffRow, StaffTotals>;
      const cells = (a: string, b: string, t: StaffTotals): Cells => [a, b, t.billCount, baht(t.netSalesSatang), baht(t.discountSatang), baht(t.tipSatang), t.voidCount, baht(t.voidTotalSatang), baht(t.avgBillSatang)];
      return [...x.rows.map((r) => cells(r.userId ?? "", r.userId ? (r.name ?? "") : "ไม่ระบุ", r)), cells(TOTAL_LABEL, "", x.totals)];
    }
    case "payments": {
      const x = rep as Report<"payments", PaymentRow, PaymentTotals>;
      return [
        ...x.rows.map((r) => [r.label, r.type, r.count, r.billCount, baht(r.amountSatang)]),
        [TOTAL_LABEL, "", sum(x.rows, (r) => r.count), x.totals.billCount, baht(x.totals.totalPaidSatang)],
      ];
    }
    case "margin": {
      const x = rep as Report<"margin", MarginRow, MarginTotals>;
      const t = x.totals;
      return [
        ...x.rows.map((r) => [r.key, r.name, r.qty, baht(r.revenueSatang), baht(r.costSatang), baht(r.estimatedCostSatang), baht(r.marginSatang), pct(r.marginBp)]),
        [TOTAL_LABEL, "", sum(x.rows, (r) => r.qty), baht(t.revenueSatang), baht(t.costSatang), baht(t.estimatedCostSatang), baht(t.grossMarginSatang), pct(t.grossMarginBp)],
      ];
    }
    case "shifts": {
      const x = rep as Report<"shifts", ShiftRow, ShiftTotals>;
      return [
        ...x.rows.map((r) => [
          r.shiftNo,
          r.zNumber ?? "",
          r.unitName ?? r.unitId,
          r.deviceLabel ?? r.deviceId,
          SHIFT_STATUS_TH[r.status] ?? r.status,
          r.openedByName ?? r.openedByUserId,
          bkkTime(r.openedAt),
          bkkTime(r.closedAt),
          r.billCount,
          baht(r.salesTotalSatang),
          baht(r.expectedCashSatang),
          baht(r.countedCashSatang),
          baht(r.overShortSatang),
        ]),
        [TOTAL_LABEL, "", "", "", "", "", "", "", x.totals.billCount, baht(x.totals.salesTotalSatang), "", "", baht(x.totals.overShortSatang)],
      ];
    }
    case "tax": {
      const x = rep as Report<"tax", TaxRow, TaxTotals>;
      const t = x.totals;
      return [
        ...x.rows.map((r) => [
          r.businessDate,
          r.unitName,
          r.firstReceiptNo ?? "",
          r.lastReceiptNo ?? "",
          r.billCount,
          baht(r.grossSatang),
          baht(r.baseSatang),
          baht(r.vatSatang),
          baht(r.nonVatGrossSatang),
          r.voidCount,
          r.voidReceiptNos.join(" "),
        ]),
        [TOTAL_LABEL, "", "", "", t.billCount, baht(t.grossSatang), baht(t.baseSatang), baht(t.vatSatang), baht(t.nonVatGrossSatang), t.voidCount, ""],
      ];
    }
  }
}

const REPORT_FN: Record<ReportKind, (ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db) => Promise<AnyReportResult>> = {
  daily: reportDailySales,
  products: reportProducts,
  staff: reportStaff,
  payments: reportPayments,
  margin: reportMargin,
  shifts: reportShifts,
  tax: reportTax,
};
export const isReportKind = (v: unknown): v is ReportKind => typeof v === "string" && (REPORT_KINDS as readonly string[]).includes(v);

/** R11 — CSV ของรายงานหนึ่งชนิด (BOM · บรรทัดคั่น \n · หัวตารางไทย · แถวท้าย "รวม") · สิทธิ์/ขอบเขต/ช่วง = ของรายงาน · แถวสินค้า/กำไรสูงสุด 1000 */
export async function reportCsv(ctx: ReportCtx, actor: RegisterActor, input: { kind: ReportKind; from: string; to: string }, client?: Db): Promise<ReportCsvResult> {
  if (!isRecord(input) || !isReportKind(input.kind)) return refuse("VALIDATION", "ไม่รู้จักชนิดรายงานนี้");
  const kind = input.kind;
  const res = await REPORT_FN[kind](ctx, actor, { from: input.from, to: input.to, limit: ROW_LIMIT_MAX }, client);
  if (!res.ok) return res;
  const lines = [CSV_HEADERS[kind], ...csvBodyRows(res)].map((row) => row.map(csvEsc).join(","));
  return { ok: true, filename: `pos-${kind}-${res.report.from}_${res.report.to}.csv`, contentType: CSV_CONTENT_TYPE, body: CSV_BOM + lines.join("\n") };
}

// ═══════════ การ์ดภาพรวม (R16) ═══════════
export async function posDashboardCard(ctx: ReportCtx, actor: RegisterActor, input: { now?: Date } = {}, client?: Db): Promise<DashboardCardResult> {
  return guard("posDashboardCard", async () => {
    const db = client ?? prisma;
    const s = await scopeOf(db, ctx, actor, CARD_PERMISSION);
    if (isRefusal(s)) return s;
    const nowRaw = isRecord(input) ? input.now : undefined;
    if (nowRaw !== undefined && !(nowRaw instanceof Date && Number.isFinite(nowRaw.getTime()))) return refuse("VALIDATION", "เวลาไม่ถูกต้อง");
    const now = nowRaw ?? new Date();
    const today = bkkBusinessDate(now);
    const yesterday = addDays(today, -1);
    const [sales, openShiftCount] = await Promise.all([
      loadSales(db, s, dayStart(yesterday), dayStart(addDays(today, 1))),
      db.posShift.count({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, status: "OPEN" } }),
    ]);
    const todays = sales.filter((x) => bkkBusinessDate(x.createdAt) === today);
    const t = dailyTotalsOf(todays);
    const y = dailyTotalsOf(sales.filter((x) => bkkBusinessDate(x.createdAt) === yesterday));
    const top = productRowsOf(await paidLines(db, s, todays)).rows[0] ?? null;
    return {
      ok: true,
      card: {
        businessDate: today,
        netSalesSatang: t.netSalesSatang,
        billCount: t.billCount,
        avgBillSatang: t.avgBillSatang,
        voidCount: t.voidCount,
        tipSatang: t.tipSatang,
        yesterdayNetSalesSatang: y.netSalesSatang,
        deltaBp: y.netSalesSatang > 0 ? Math.round(((t.netSalesSatang - y.netSalesSatang) * 10_000) / y.netSalesSatang) : null,
        openShiftCount,
        topProduct: top ? { key: top.key, name: top.name, qty: top.qty, salesSatang: top.salesSatang } : null,
      },
    };
  });
}
