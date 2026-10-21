// POS P1.17 ▸ รายงานพื้นฐาน 7 ชุด + CSV + ตัวเลขการ์ดภาพรวม (ฝั่งเซิร์ฟเวอร์ · มติร่าง R1–R16 · ledger/pos-briefs/pos-brief-P1.17.md) ◂
// สัญญา = scripts/qc-pos-p1.17.mts · โน้ต ledger/wo-notes/pos-P1.17.md
// 🔴 อ่านอย่างเดียว: ไม่มีการเขียนแถวใด ๆ · ไม่ปิดกะ · ไม่คำนวณ VAT ใหม่ (VAT = คอลัมน์ PosSale.vatSatang ที่เก็บตอนขาย · R4)
// 🔴 ทุกฟังก์ชัน (ctx, actor, input, client?) "คืน" คำปฏิเสธ {ok:false, code, message} ไม่ throw · ขอบเขตผิด = NOT_FOUND (R13)
// 🔴 ทุกคิวรี PosSale กรอง tenantId + systemId + unitId IN + createdAt ⇒ ใช้ดัชนี (tenantId, unitId, createdAt) · จำนวนคิวรีคงที่ไม่ขึ้นกับจำนวนวัน (R15)
// 🔴 เงินเป็นสตางค์จำนวนเต็ม · ค่าบริการ = รายได้ (อยู่ในยอดสุทธิ) · ทิปไม่ใช่รายได้ (แสดงแยก ไม่บวกเข้ายอด/VAT)
//
// ค่าปริยายของคำถามเจ้าของ (รอยืนยัน — แต่ละข้อแก้ได้ที่จุดเดียวที่ระบุ):
//   Q17.1 ผู้ขาย = soldByUserId ?? ผู้เปิดกะ ?? ไม่ระบุ        → sellerOf()
//   Q17.2 ตัดวันเที่ยงคืนเวลาไทย                                → posDayCutoffMinutes ของระบบ (P1.18 · Scope.cutoffMin + bkkBusinessDate/dayStart)
//   Q17.3 กำไร = ยอดบรรทัดรวม VAT ก่อนส่วนลดท้ายบิล · ต้นทุนที่บันทึกตอนตัดสต็อก ก่อน ต้นทุนเฉลี่ยวันนี้ (ประมาณ) → lineCost() + reportMargin
//   Q17.4 รายงาน = pos.report.view · การ์ดวันนี้ = pos.sale.create → REPORT_PERMISSION / CARD_PERMISSION
import type { PosShift, PrismaClient } from "@prisma/client";
import { prisma } from "./db";
import { canAccessUnit, canViewPayroll, evaluate } from "@/lib/core/rbac"; // POS P3.5 ▸ + canViewPayroll (รายงานค่าคอมฯ · มติ 7) ◂
import { lineConsumption, PAY_TYPE_LABEL_TH, PAY_TYPE_ORDER } from "./service";
import { computeReport, type ShiftReport } from "./shift";
import type { RegisterActor } from "./register-shared";
import { posDayCutoffMinutes } from "./settings-shared"; // POS P1.18 ▸ มติ Q9 ตัดวันตามค่าตั้งของระบบ POS ◂
import { POS_ANOMALY_RULES, posAnomalyThresholds, type PosAnomalyRule } from "./settings-shared"; // POS P2.12 ▸ AN เกณฑ์จุดผิดปกติ (ตัวอ่านเดียว) ◂
import { channelFallbackName, defaultChannelCode } from "./channel-shared"; // POS P2.11 ▸ รายงานช่องทาง (รหัสของบิลเดิม · ชื่อสำรอง) ◂
import { hrAdjustmentStatuses, hrPayrollLinkedUserIds } from "./hr-link"; // POS P3.5 ▸ R11 noEmployee · สถานะใน HR ◂

type Db = PrismaClient;

// ═══════════ ค่าคงที่ (จุดเดียวของค่าปริยายเจ้าของ) ═══════════
/** Q17.4 — สิทธิ์ของ 7 รายงาน + CSV */
export const REPORT_PERMISSION = "pos.report.view";
/** Q17.4 — การ์ดยอดวันนี้ใช้สิทธิ์เดียวกับหน้า "ยอดวันนี้"/ปิดวันเดิม (posSalesScope) */
export const CARD_PERMISSION = "pos.sale.create";
// POS P2.12 ▸ มติ 4 (PDPA): รายงานจุดผิดปกติระบุตัวพนักงาน ⇒ ต้องมี pos.report.view "และ" คีย์นี้ที่สาขา (เจ้าของ/ผู้จัดการได้ตามบทบาท) ◂
export const ANOMALY_PERMISSION = "pos.report.anomaly";
/** POS P2.12 ▸ มติ 5: รายงานรายชั่วโมงเลือกช่วงได้ไม่เกิน 31 วัน (กราฟอ่านได้เฉพาะช่วงสั้น) · คาดการณ์ = เฉลี่ย 4 สัปดาห์ก่อน วันเดียวกัน ◂ */
export const HOURLY_MAX_DAYS = 31;
const FORECAST_WEEKS = 4;
// Q17.2 → POS P1.18 (มติ Q9): นาทีหลังเที่ยงคืนเวลาไทยที่เริ่มวันธุรกิจ = settings.pos.reports.dayCutoffMinutes ของระบบ POS
//   (ตัวอ่านเดียว posDayCutoffMinutes · 0–360 · ไม่ตั้ง = 0 เที่ยงคืน) — อ่านที่ scopeOf แล้วส่งต่อทุกจุดที่ตัดวัน ◂
/** R2 — ช่วงยาวสุดต่อคำขอ (วัน · รวมปลายทั้งสอง) */
export const REPORT_MAX_DAYS = 92;
/** R5 — จำนวนแถวสินค้า/กำไร (totals คิดจากทุกแถวเสมอ) */
const ROW_LIMIT_DEFAULT = 200;
const ROW_LIMIT_MAX = 1000;
/** R15 — ขนาดก้อนของ IN (…) */
const CHUNK = 1000;

const BKK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
const shiftOffsetMs = (cutoffMin: number): number => BKK_OFFSET_MS - cutoffMin * 60_000;

export const REPORT_KINDS = ["daily", "products", "staff", "payments", "margin", "shifts", "tax", "channels", "branches", "hourly", "anomalies", "commission", "credit"] as const; // POS P3.6 ▸ + credit (ลูกหนี้วางบิล · REST ไม่เปิด · R9) ◂ // POS P3.5 ▸ + commission (ผู้ดูเงินเดือนเท่านั้น · REST ไม่เปิด) ◂ · // POS P2.11 ▸ + channels ◂ · POS P2.12 ▸ + branches hourly anomalies ◂
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
  /** POS P2.14 ▸ RPT-2: ส่วนลดที่พนักงานคุมได้ (ฐาน A3 = บรรทัด + ท้ายบิล − คูปอง − สมาชิก) + ธง A3 ของผู้ขายคนนี้ (เพิ่มล้วน · แถวเท่านั้น) ◂ */
  staffDiscountSatang?: number;
  a3Flag?: boolean;
};
export type StaffTotals = Omit<StaffRow, "userId" | "name" | "staffDiscountSatang" | "a3Flag">;

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
// POS P2.11 ▸ รายงานช่องทาง (brief P2.11 §5 · มติ 5 16): แถวต่อรหัสช่องทาง (รวมข้ามสาขาด้วยรหัส · บิลเดิมไม่มีรหัส = STORE/WEB ตาม sourceModule) ·
//   billCount = บิลขายที่ไม่ VOIDED (PAID + REFUNDED) · ใบคืนเงินหักยอด + ค่าคอมฯ ส่วนของใบในวันที่คืน ·
//   net = gross − refund − commission − commissionVat · sharePct = ปัด 1 ตำแหน่งของ 100 × net / Σ net (Σ ≤ 0 = 0) ◂
export type ChannelRow = {
  channelCode: string;
  name: string;
  billCount: number;
  grossSatang: number;
  refundSatang: number;
  commissionSatang: number;
  commissionVatSatang: number;
  netSatang: number;
  sharePct: number;
};
export type ChannelTotals = Omit<ChannelRow, "channelCode" | "name" | "sharePct">;
// POS P2.12 ▸ BR (มติ 5 · CD-7): แถวต่อสาขาที่มีเอกสารหรือกะที่นับเงินปิดในช่วง · ตัวเลข = รายงานรายวัน/วิธีชำระ (CASH · PLATFORM)/ช่องทาง/กะ ของสาขานั้น ◂
export type BranchRow = {
  unitId: string;
  name: string;
  billCount: number;
  netSalesSatang: number;
  avgBillSatang: number;
  refundCount: number;
  refundTotalSatang: number;
  voidCount: number;
  voidTotalSatang: number;
  cashSatang: number;
  platformSatang: number;
  commissionSatang: number;
  commissionVatSatang: number;
  overShortSatang: number;
};
export type BranchTotals = Omit<BranchRow, "unitId" | "name">;
// POS P2.12 ▸ HR (มติ 5 · CD-8): 24 ชั่วโมงของวันธุรกิจ (เลื่อนตามเวลาตัดวัน · หลังเที่ยงคืน = +24) · label = ชั่วโมงนาฬิกา 2 หลัก ◂
export type HourlyRow = { hour: number; label: string; billCount: number; netSalesSatang: number; forecastSatang: number };
export type HourlyTotals = { billCount: number; netSalesSatang: number; forecastSatang: number };
// POS P2.12 ▸ AN (§3 · CD-4 CD-5): แถวจุดผิดปกติ — คีย์ตามสัญญาเท่านั้น (ไม่มีอีเมล/เบอร์ · userName = ชื่อแสดงผล) ◂
export type AnomalyRefType = "USER" | "PosSale" | "PosShift" | "UNIT";
export type AnomalyRow = {
  rule: PosAnomalyRule;
  unitId: string;
  businessDate: string | null;
  userId: string | null;
  userName: string | null;
  refType: AnomalyRefType;
  refId: string | null;
  value: number;
  threshold: Record<string, number>;
  count: number;
};
// POS P2.12 ▸ fix1 F1: unitNames = ชื่อสาขาของหน่วยที่อยู่ในแถวที่คืน (CSV/แบบพิมพ์แสดงชื่อแทนรหัส · คีย์แถวไม่เปลี่ยน) ◂
// POS P2.12 ▸ fix1 H4: a8SignedSatang = ค่าแบบมีเครื่องหมายของฝั่งที่ชนะของแถว A8 (คีย์ = PosShift id = refId · ติดลบ = ขาด · บวก = เกิน) — value ในแถวคงเป็นค่าสัมบูรณ์ ◂
// POS P3.5 ▸ R11 มติ 7: ค่าคอมฯ พนักงานขายต่อผู้ขาย (จากสมุด PosStaffCommission · แถวที่ลงในช่วง) — reversedSatang = ขนาด (≥ 0) ·
//   netSatang = accrued − reversed · sent/open = ผลรวมมีเครื่องหมายตามสถานะ · noEmployee = ยังไม่ผูกพนักงาน HR ที่มีโปรไฟล์เงินเดือน (แถวค้าง OPEN) ◂
export type CommissionRow = {
  userId: string;
  name: string | null;
  accruedSatang: number;
  reversedSatang: number;
  netSatang: number;
  sentSatang: number;
  openSatang: number;
  noEmployee: boolean;
  /** สถานะของรายการปรับเงินล่าสุดใน HR (PENDING/APPROVED/REJECTED · PAID = เข้ารอบจ่ายแล้ว) — ยังไม่เคยส่ง = ไม่มีคีย์ */
  hrStatus?: string;
};
export type CommissionTotals = { rowCount: number; accruedSatang: number; reversedSatang: number; netSatang: number; sentSatang: number; openSatang: number };
export type AnomalyTotals = { rowCount: number; byRule: Record<PosAnomalyRule, number>; unitNames: Record<string, string>; a8SignedSatang: Record<string, number> };

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
export type ChannelsReportResult = ReportResult<"channels", ChannelRow, ChannelTotals>; // POS P2.11 ◂
// POS P2.12 ▸ ◂
export type BranchesReportResult = ReportResult<"branches", BranchRow, BranchTotals>;
export type HourlyReportResult = ReportResult<"hourly", HourlyRow, HourlyTotals>;
export type AnomaliesReportResult = ReportResult<"anomalies", AnomalyRow, AnomalyTotals>;
export type CommissionReportResult = ReportResult<"commission", CommissionRow, CommissionTotals>; // POS P3.5 ◂
// POS P3.6 ▸ R9: ลูกหนี้วางบิล (เครดิตเทอม) ต่อบริษัท — บิล/ยอดวางบิล/ยอดคืนในช่วง (ฝั่ง POS) + ค้าง/เลยกำหนด/ครบกำหนดเก่าสุด ณ ตอนนี้ (สมุดบัญชี · สูตร aging) ◂
export type CreditRow = { partyId: string; name: string; bills: number; creditSatang: number; refundedSatang: number; outstandingSatang: number; overdueSatang: number; oldestDueDate: string | null };
export type CreditTotals = { rowCount: number; bills: number; creditSatang: number; refundedSatang: number; outstandingSatang: number; overdueSatang: number; bookLinked: boolean };
export type CreditReportResult = ReportResult<"credit", CreditRow, CreditTotals>;
export type AnyReportResult =
  | DailyReportResult
  | ProductsReportResult
  | StaffReportResult
  | PaymentsReportResult
  | MarginReportResult
  | ShiftsReportResult
  | TaxReportResult
  | ChannelsReportResult // POS P2.11 ◂
  | BranchesReportResult // POS P2.12 ◂
  | HourlyReportResult
  | AnomaliesReportResult
  | CommissionReportResult // POS P3.5 ◂
  | CreditReportResult; // POS P3.6 ◂
/** POS P2.12 ▸ รายงานที่สำเร็จ (ใช้กับแบบพิมพ์ report-print-shared.ts) ◂ */
export type AnyReport = Extract<AnyReportResult, { ok: true }>["report"];

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

/** Q17.2 — วันธุรกิจ (YYYY-MM-DD) ของเวลาหนึ่ง · cutoffMin = นาทีตัดวัน (P1.18 · ไม่ส่ง = เที่ยงคืน) */
export function bkkBusinessDate(d: Date, cutoffMin = 0): string {
  return new Date(d.getTime() + shiftOffsetMs(cutoffMin)).toISOString().slice(0, 10);
}
/** Q17.2 — เวลาเริ่มวันธุรกิจ (UTC) · วัน D = [D 00:00 + cutoff, D+1 00:00 + cutoff) เวลาไทย = bkkDayRange ของหน้าปิดวัน */
const dayStart = (date: string, cutoffMin = 0): Date => new Date(Date.parse(`${date}T00:00:00Z`) - shiftOffsetMs(cutoffMin));
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
function rangeOf(input: unknown, cutoffMin = 0): Range | ReportRefusal {
  if (!isRecord(input)) return refuse("VALIDATION");
  const { from, to, limit } = input;
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) return refuse("VALIDATION");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > REPORT_MAX_DAYS) return refuse("VALIDATION");
  if (limit !== undefined && !(typeof limit === "number" && Number.isInteger(limit) && limit >= 1 && limit <= ROW_LIMIT_MAX)) {
    return refuse("VALIDATION", "จำนวนแถวต้องเป็น 1–1000");
  }
  return { from, to, start: dayStart(from, cutoffMin), end: dayStart(addDays(to, 1), cutoffMin), limit: typeof limit === "number" ? limit : ROW_LIMIT_DEFAULT };
}

function actorOf(a: unknown): RegisterActor | null {
  if (!isRecord(a) || !isId(a.userId)) return null;
  if (a.role !== "OWNER" && a.role !== "MANAGER" && a.role !== "STAFF") return null;
  if (!Array.isArray(a.unitAccess) || !a.unitAccess.every((x) => typeof x === "string")) return null;
  if (!isRecord(a.permissions)) return null;
  return { userId: a.userId, role: a.role, unitAccess: [...(a.unitAccess as string[])], permissions: a.permissions };
}

// ═══════════ ขอบเขต (R13) + สิทธิ์ (R12) ═══════════
type Scope = { tenantId: string; systemId: string; unitId: string | null; unitIds: string[]; unitName: Map<string, string>; cutoffMin: number; settings: unknown }; // POS P2.12 ▸ + settings (เกณฑ์จุดผิดปกติ) ◂

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
  const sys = await db.appSystem.findFirst({ where: { id: systemId, tenantId, type: "POS" }, select: { id: true, settings: true } });
  if (!sys) return refuse("NOT_FOUND");
  const cutoffMin = posDayCutoffMinutes(sys.settings); // POS P1.18 ◂
  const can = (u: string) => evaluate(actor, { module: "pos", action: permission, unitId: u });
  if (unitId) {
    const unit = await db.businessUnit.findFirst({ where: { id: unitId, tenantId }, select: { id: true, name: true } });
    if (!unit || !canAccessUnit(actor, unitId)) return refuse("NOT_FOUND");
    if (!can(unitId)) return refuse("PERMISSION_DENIED");
    return { tenantId, systemId, unitId, unitIds: [unit.id], unitName: new Map([[unit.id, unit.name]]), cutoffMin, settings: sys.settings };
  }
  const everyUnit = actor.role === "OWNER" || actor.unitAccess.includes("*");
  const units = await db.businessUnit.findMany({
    where: everyUnit ? { tenantId } : { tenantId, id: { in: actor.unitAccess } },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  const allowed = units.filter((u) => can(u.id));
  if (allowed.length === 0) return refuse("PERMISSION_DENIED");
  return { tenantId, systemId, unitId: null, unitIds: allowed.map((u) => u.id), unitName: new Map(allowed.map((u) => [u.id, u.name])), cutoffMin, settings: sys.settings };
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
  const r = rangeOf(input, s.cutoffMin);
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
  /** POS P2.9b ▸ fix1 มติ 4: POS_DEPOSIT = ใบรับ/ใบคืนเงินมัดจำ (ไม่ใช่ยอดขาย — รายงานยอดขาย/พนักงานตัดออก) ◂ */
  sourceModule?: string | null;
  /** POS P2.12 ▸ BR: คอลัมน์สำเนาช่องทางของบิล (ค่าคอมฯ ต่อสาขา · ตัวรวมเดียวกับรายงานช่องทาง) ◂ */
  channelCode?: string | null;
  channelCommissionSatang?: number;
  channelCommissionVatSatang?: number;
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
      sourceModule: true, // POS P2.9b ▸ fix1 มติ 4 ◂
      // POS P2.12 ▸ BR ◂
      channelCode: true,
      channelCommissionSatang: true,
      channelCommissionVatSatang: true,
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
/** POS P2.9b ▸ fix1 มติ 4: ตัดใบรับมัดจำ + ใบคืนเงินมัดจำ (sourceModule POS_DEPOSIT) ออกจากรายงานยอดขาย ◂ */
// POS P2.12 ▸ CH1: ใช้กับแถวที่เลือกคอลัมน์มาเอง (รายงานช่องทาง) ได้ด้วย — ชนิดทั่วไป ◂
const notDeposit = <T extends { sourceModule?: string | null }>(sales: T[]): T[] => sales.filter((x) => x.sourceModule !== "POS_DEPOSIT");
const envelope = <K extends ReportKind, R, T>(kind: K, s: Scope, r: Range, rows: R[], totals: T): { ok: true; report: Report<K, R, T> } => ({
  ok: true,
  report: { kind, from: r.from, to: r.to, unitId: s.unitId, generatedAt: new Date().toISOString(), rows, totals },
});

// ═══════════ 1. ยอดขายรายวัน (R5) ═══════════
function dailyTotalsOf(salesAll: SaleRow[]): DailyTotals {
  const sales = notDeposit(salesAll); // POS P2.9b ▸ fix1 มติ 4 (hunt D3): ใบรับ/ใบคืนเงินมัดจำไม่ใช่ยอดขาย (แบบปิดวัน) ◂
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
      const d = bkkBusinessDate(x.createdAt, s.cutoffMin);
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

/**
 * POS P2.12 ▸ ผู้ขายของบิล/ใบคืน (กติกาเดิมของรายงานพนักงาน P1.8 · ยกมาเป็นตัวช่วยเดียว): ใบคืน = ผู้ขายของบิลเดิม (บิลเดิมนอกช่วงอ่านเพิ่มต่อก้อน) ·
 * ไม่มี soldByUserId = ผู้เปิดกะของบิล (Q17.1) ◂
 */
async function sellerResolver(db: Db, s: Scope, end: Date, sales: SaleRow[]): Promise<{ ofSale: (x: SaleRow) => string | null; ofRefund: (x: SaleRow) => string | null }> {
  const refunds = refundsOf(sales);
  type Origin = { soldByUserId: string | null; shiftId: string | null };
  const origin = new Map<string, Origin>(sales.filter((x) => x.docType === "SALE").map((x) => [x.id, { soldByUserId: x.soldByUserId, shiftId: x.shiftId }]));
  const missing = [...new Set(refunds.map((x) => x.refSaleId).filter((id): id is string => !!id && !origin.has(id)))];
  for (const ids of chunks(missing)) {
    // บิลเดิมอยู่สาขาเดียวกับใบคืนและเกิดก่อนใบคืน ⇒ กรอง unitId + createdAt (ดัชนี tenantId, unitId, createdAt · R15)
    const rows = await db.posSale.findMany({ where: { tenantId: s.tenantId, unitId: { in: s.unitIds }, createdAt: { lt: end }, id: { in: ids } }, select: { id: true, soldByUserId: true, shiftId: true } });
    for (const o of rows) origin.set(o.id, { soldByUserId: o.soldByUserId, shiftId: o.shiftId });
  }
  const shiftIds = [...new Set([...origin.values()].filter((x) => !x.soldByUserId && x.shiftId).map((x) => x.shiftId as string))];
  const opener = new Map<string, string>();
  for (const part of chunks(shiftIds)) {
    for (const sh of await db.posShift.findMany({ where: { tenantId: s.tenantId, id: { in: part } }, select: { id: true, openedByUserId: true } })) opener.set(sh.id, sh.openedByUserId);
  }
  return {
    ofSale: (x) => sellerOf(x, opener),
    ofRefund: (x) => {
      const o = x.refSaleId ? origin.get(x.refSaleId) : undefined;
      return o ? sellerOf({ ...x, soldByUserId: o.soldByUserId, shiftId: o.shiftId }, opener) : null;
    },
  };
}

export async function reportStaff(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<StaffReportResult> {
  return guard("reportStaff", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const sales = notDeposit(await loadSales(db, s, r.start, r.end)); // POS P2.9b ▸ fix1 มติ 4 ◂
    // P1.8 ▸ ใบคืนเงินหักจากผู้ขายของบิลเดิม (บิลเดิมอาจอยู่นอกช่วง — อ่านเพิ่มคำสั่งเดียวต่อก้อน) ◂
    const refunds = refundsOf(sales);
    const seller = await sellerResolver(db, s, r.end, sales); // POS P2.12 ▸ ย้ายเป็นตัวช่วยเดียว (จุดผิดปกติ A3/A4/A6 ใช้ผู้ขายแบบเดียวกัน) ◂
    const m = new Map<string, StaffRow>();
    const rowOf = (uid: string | null): StaffRow => {
      const k = uid ?? "";
      const cur = m.get(k) ?? { userId: uid, name: null, billCount: 0, netSalesSatang: 0, discountSatang: 0, tipSatang: 0, voidCount: 0, voidTotalSatang: 0, avgBillSatang: 0 };
      m.set(k, cur);
      return cur;
    };
    for (const x of refunds) {
      const row = rowOf(seller.ofRefund(x));
      row.netSalesSatang -= x.grandTotalSatang;
      row.refundCount = (row.refundCount ?? 0) + 1;
      row.refundTotalSatang = (row.refundTotalSatang ?? 0) + x.grandTotalSatang;
    }
    for (const x of sales) {
      if (x.docType !== "SALE") continue;
      const row = rowOf(seller.ofSale(x));
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
    // POS P2.14 ▸ RPT-2 (R2): ฐาน A3 ต่อผู้ขาย (staffDiscountSatang) + ธง a3Flag (staffDiscount × 10000 > net × A3.bp · net > 0) — ภาพรวมใช้ธงนี้แทนการเทียบ Σ ส่วนลดทั้งหมด ◂
    const staffDisc = await staffDiscountBySale(db, s, r, sales.filter((x) => x.docType === "SALE" && x.status !== "VOIDED"));
    const sd = new Map<string, number>();
    for (const x of sales) if (x.docType === "SALE" && x.status !== "VOIDED") sd.set(seller.ofSale(x) ?? "", (sd.get(seller.ofSale(x) ?? "") ?? 0) + (staffDisc.get(x.id) ?? 0));
    const a3bp = posAnomalyThresholds(s.settings).rules.A3.bp;
    const names = await userNames(db, [...m.values()].map((x) => x.userId).filter((x): x is string => !!x));
    // POS P2.13 ▸ fix1 F4: ผู้ขายที่เป็นคีย์ API (soldByUserId = keyId · มติ 3) = "API: <ชื่อคีย์>" — เฉพาะ id ที่ไม่ใช่ผู้ใช้ · คำสั่งเดียวต่อก้อน (ร้านนี้เท่านั้น) ◂
    for (const part of chunks([...m.values()].map((x) => x.userId).filter((x): x is string => !!x && !names.has(x)))) {
      for (const k of await db.apiKey.findMany({ where: { tenantId: s.tenantId, id: { in: part } }, select: { id: true, name: true } })) names.set(k.id, `API: ${k.name}`);
    }
    const rows = [...m.values()]
      .map((x) => {
        const staffDiscountSatang = sd.get(x.userId ?? "") ?? 0; // POS P2.14 ▸ RPT-2 ◂
        return { ...x, name: x.userId ? (names.get(x.userId) ?? null) : null, avgBillSatang: avg(x.netSalesSatang, x.billCount), staffDiscountSatang, a3Flag: x.netSalesSatang > 0 && staffDiscountSatang * 10_000 > x.netSalesSatang * a3bp };
      })
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
      const k = `${bkkBusinessDate(x.createdAt, s.cutoffMin)}|${x.unitId}`;
      refundGroups.set(k, [...(refundGroups.get(k) ?? []), x]);
    }
    const groups = new Map<string, { date: string; unitId: string; bills: SaleRow[] }>();
    for (const [k, rs] of refundGroups) if (!groups.has(k)) groups.set(k, { date: k.split("|")[0]!, unitId: rs[0]!.unitId, bills: [] });
    for (const x of sales) {
      const date = bkkBusinessDate(x.createdAt, s.cutoffMin);
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

// POS P2.12 ▸ ตัวรวมช่องทาง (บริสุทธิ์) — reportChannels + ค่าคอมฯ ต่อสาขาของ reportBranches ใช้ตัวเดียวกัน ·
//   docs = บิลขายที่ไม่ VOIDED + ใบคืนเงิน (ตัดมัดจำแล้ว) · ใบคืนหักยอด/ค่าคอมฯ ส่วนของใบ · name/net/share เติมทีหลัง ◂
type ChannelDoc = { docType: string; channelCode: string | null; sourceModule: string | null; grandTotalSatang: number; channelCommissionSatang: number; channelCommissionVatSatang: number };
function channelRowsOf(docs: readonly ChannelDoc[]): ChannelRow[] {
  const by = new Map<string, ChannelRow>();
  for (const d of docs) {
    const code = d.channelCode ?? defaultChannelCode(d.sourceModule);
    const row = by.get(code) ?? { channelCode: code, name: "", billCount: 0, grossSatang: 0, refundSatang: 0, commissionSatang: 0, commissionVatSatang: 0, netSatang: 0, sharePct: 0 };
    const refund = d.docType === "REFUND";
    if (refund) row.refundSatang += d.grandTotalSatang;
    else {
      row.billCount += 1;
      row.grossSatang += d.grandTotalSatang;
    }
    row.commissionSatang += (refund ? -1 : 1) * d.channelCommissionSatang;
    row.commissionVatSatang += (refund ? -1 : 1) * d.channelCommissionVatSatang;
    by.set(code, row);
  }
  return [...by.values()];
}

// ═══════════ POS P2.11 ▸ 8. รายงานช่องทาง (§5 · ภาพ 08 "ช่องทางการขาย % ของยอด · หักค่าคอมมิชชันแล้ว") ◂ ═══════════
/**
 * อ่านอย่างเดียว · ขอบเขต/สิทธิ์/ช่วง/ตัดวัน = prepare เดียวกับรายงานอื่น (REPORT_PERMISSION · ไม่ส่งสาขา = ทุกสาขาที่มีสิทธิ์)
 * แหล่ง = คอลัมน์สำเนาของบิล (PosSale.channelCode · channelCommission*) — ไม่คิดค่าคอมฯ ใหม่ · ชื่อ = ช่องทางรหัสนั้นของสาขาที่เลือก
 * (ทุกสาขา = สาขาแรกในขอบเขตที่มีรหัสนี้ · ช่องทางที่ใช้งานอยู่ก่อนที่เก็บถาวร) · ไม่มีแถวช่องทาง = ชื่อสำรอง (builtin ไทย · อื่น = รหัส)
 * เรียง net มาก → น้อย แล้วรหัส
 */
export async function reportChannels(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<ChannelsReportResult> {
  return guard("reportChannels", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    // POS P2.12 ▸ CH1 (⚠️2 มติ 1): ใบรับ/ใบคืนเงินมัดจำไม่ใช่ยอดขาย — ตัดออกแบบรายงานรายวัน/พนักงาน (บิลที่ใช้มัดจำนับครั้งเดียว) ◂
    const docs = notDeposit(
      await db.posSale.findMany({
        where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, createdAt: { gte: r.start, lt: r.end }, status: { in: ["PAID", "REFUNDED"] } },
        select: { unitId: true, docType: true, channelCode: true, sourceModule: true, grandTotalSatang: true, channelCommissionSatang: true, channelCommissionVatSatang: true },
      }),
    );
    const rows = channelRowsOf(docs); // POS P2.12 ▸ ตัวรวมเดียวกับรายงานสาขา ◂
    if (rows.length) {
      const chs = await db.salesChannel.findMany({
        where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, code: { in: rows.map((x) => x.channelCode) } },
        select: { unitId: true, code: true, name: true, archivedAt: true },
      });
      const rank = (c: (typeof chs)[number]) => (c.unitId === s.unitId ? 0 : 2) + (c.archivedAt ? 1 : 0);
      const unitOrder = new Map(s.unitIds.map((u, i) => [u, i]));
      for (const x of rows) {
        const best = chs
          .filter((c) => c.code === x.channelCode && !!c.name.trim())
          .sort((a, b) => rank(a) - rank(b) || (unitOrder.get(a.unitId) ?? 0) - (unitOrder.get(b.unitId) ?? 0))[0];
        x.name = best?.name ?? channelFallbackName(x.channelCode);
      }
    }
    for (const x of rows) x.netSatang = x.grossSatang - x.refundSatang - x.commissionSatang - x.commissionVatSatang;
    const totalNet = sum(rows, (x) => x.netSatang);
    for (const x of rows) x.sharePct = totalNet > 0 ? Math.round((1000 * x.netSatang) / totalNet) / 10 : 0;
    rows.sort((a, b) => b.netSatang - a.netSatang || a.channelCode.localeCompare(b.channelCode));
    const totals: ChannelTotals = {
      billCount: sum(rows, (x) => x.billCount),
      grossSatang: sum(rows, (x) => x.grossSatang),
      refundSatang: sum(rows, (x) => x.refundSatang),
      commissionSatang: sum(rows, (x) => x.commissionSatang),
      commissionVatSatang: sum(rows, (x) => x.commissionVatSatang),
      netSatang: totalNet,
    };
    return envelope("channels", s, r, rows, totals);
  });
}

// ═══════════ POS P2.12 ▸ 9. รายงานสาขา (§1 BR · มติ 5 · CD-7) ◂ ═══════════
/** ตัวเลข 12 ช่องของชุดเอกสาร/การชำระ/กะ — ตัวรวมเดียวกับรายงานรายวัน (dailyTotalsOf) · ช่องทาง (channelRowsOf) · กะ (Σ ขาด/เกินของกะที่นับเงินปิด) */
function branchNumbersOf(docs: SaleRow[], pay: { cash: number; platform: number }, shifts: { overShortSatang: number | null }[]): BranchTotals {
  const d = dailyTotalsOf(docs);
  const ch = channelRowsOf(
    notDeposit(docs.filter((x) => x.status !== "VOIDED")).map((x) => ({
      docType: x.docType,
      channelCode: x.channelCode ?? null,
      sourceModule: x.sourceModule ?? null,
      grandTotalSatang: x.grandTotalSatang,
      channelCommissionSatang: x.channelCommissionSatang ?? 0,
      channelCommissionVatSatang: x.channelCommissionVatSatang ?? 0,
    })),
  );
  return {
    billCount: d.billCount,
    netSalesSatang: d.netSalesSatang,
    avgBillSatang: d.avgBillSatang,
    refundCount: d.refundCount,
    refundTotalSatang: d.refundTotalSatang,
    voidCount: d.voidCount,
    voidTotalSatang: d.voidTotalSatang,
    cashSatang: pay.cash,
    platformSatang: pay.platform,
    commissionSatang: sum(ch, (x) => x.commissionSatang),
    commissionVatSatang: sum(ch, (x) => x.commissionVatSatang),
    overShortSatang: sum(shifts, (x) => x.overShortSatang ?? 0),
  };
}

/**
 * เปรียบเทียบสาขา — ขอบเขต/สิทธิ์/ช่วง = prepare เดียวกับรายงานอื่น (ไม่ส่งสาขา = ทุกสาขาที่มีสิทธิ์ รวม archived · R13)
 * คิวรีคงที่: loadSales 1 ครั้ง + การชำระต่อก้อน + กะ 1 ครั้ง ทั้งขอบเขต แล้วแยกต่อสาขาในหน่วยความจำ ⇒ แถวสาขา = รายงานรายวัน/วิธีชำระ/ช่องทาง/กะ ของสาขานั้น
 * cash/platform = ยอดรับสุทธิของวิธี CASH / PLATFORM แบบ reportPayments (รวมเงินสดใบรับมัดจำ) · ขาด/เกิน = กะ "วันเปิดกะ" ในช่วงที่นับเงินปิดแล้ว (แบบ reportShifts)
 * แถว = สาขาที่มีเอกสาร (บิล/ใบคืน/ใบมัดจำ/บิลยกเลิก) หรือกะที่นับเงินปิด (overShort ไม่ว่าง) ในช่วง · เรียง net มาก → น้อย แล้วชื่อ · totals = ทั้งขอบเขต
 */
export async function reportBranches(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<BranchesReportResult> {
  return guard("reportBranches", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const sales = await loadSales(db, s, r.start, r.end);
    const paidIds = new Set(paidOf(sales).map((x) => x.id));
    const refundIds = new Set(refundsOf(sales).map((x) => x.id));
    const unitOfDoc = new Map(sales.map((x) => [x.id, x.unitId]));
    // วิธีชำระ: ฝั่งรับของบิลที่นับยอด − เงินคืนของใบคืน (amount สุทธิแบบ reportPayments)
    const pay = new Map<string, { cash: number; platform: number }>();
    const payOf = (u: string) => {
      const v = pay.get(u) ?? { cash: 0, platform: 0 };
      pay.set(u, v);
      return v;
    };
    for (const ids of chunks([...paidIds, ...refundIds])) {
      const rows = await db.posPayment.findMany({ where: { tenantId: s.tenantId, saleId: { in: ids }, type: { in: ["CASH", "PLATFORM"] } }, select: { saleId: true, type: true, amountSatang: true } });
      for (const x of rows) {
        const u = unitOfDoc.get(x.saleId);
        if (!u) continue;
        const sign = refundIds.has(x.saleId) ? -1 : 1;
        const a = payOf(u);
        if (x.type === "CASH") a.cash += sign * x.amountSatang;
        else a.platform += sign * x.amountSatang;
      }
    }
    const shifts = await db.posShift.findMany({
      where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, openedAt: { gte: r.start, lt: r.end }, status: { not: "OPEN" } },
      select: { unitId: true, overShortSatang: true },
    });
    const rows: BranchRow[] = [];
    for (const u of s.unitIds) {
      const docs = sales.filter((x) => x.unitId === u);
      const sh = shifts.filter((x) => x.unitId === u);
      if (docs.length === 0 && !sh.some((x) => x.overShortSatang !== null)) continue;
      rows.push({ unitId: u, name: s.unitName.get(u) ?? "", ...branchNumbersOf(docs, pay.get(u) ?? { cash: 0, platform: 0 }, sh) });
    }
    rows.sort((a, b) => b.netSalesSatang - a.netSalesSatang || cmpStr(a.name, b.name) || cmpStr(a.unitId, b.unitId));
    const all = { cash: sum([...pay.values()], (x) => x.cash), platform: sum([...pay.values()], (x) => x.platform) };
    return envelope("branches", s, r, rows, branchNumbersOf(sales, all, shifts));
  });
}

// ═══════════ POS P2.12 ▸ 10. รายชั่วโมง + คาดการณ์ 4 สัปดาห์ (§1 HR · มติ 5 · CD-8) ◂ ═══════════
/**
 * 24 แถวเสมอ = ชั่วโมงของวันธุรกิจ (hour = ชั่วโมงนาฬิกาไทยนับจากเที่ยงคืนของวันธุรกิจ · หลังเที่ยงคืน = +24 · ตัดวัน 04:00 ⇒ 4…27)
 * ยอด = กติการายงานรายวัน (ตัดมัดจำ · บิลยกเลิกไม่นับ · ใบคืนหักในชั่วโมงที่คืน) ⇒ Σ แถว = reportDailySales ของช่วงเดียวกัน
 * forecast(h) = ปัดครึ่งขึ้นของ Σ_{วัน d ในช่วง} Σ_{k=1..4} ยอดชั่วโมง h ของวัน d−7k ÷ 4 (สัปดาห์ที่ไม่มีขาย = 0)
 * โหลดเอกสาร 1 ครั้งตั้งแต่ from−28 วันถึงปลายช่วง (อ่านอย่างเดียว) · ช่วงเกิน 31 วัน = VALIDATION
 * ตัดวันที่ไม่ลงชั่วโมงพอดี (เช่น 00:30) ⇒ เศษชั่วโมงสุดท้ายของวัน (ชั่วโมงนาฬิกาเดียวกับแถวแรก) รวมไว้ในแถวแรก (label เดียวกัน)
 */
export async function reportHourly(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<HourlyReportResult> {
  return guard("reportHourly", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const days = daysOf(r.from, r.to);
    if (days.length > HOURLY_MAX_DAYS) return refuse("VALIDATION", `รายงานรายชั่วโมงเลือกช่วงได้ไม่เกิน ${HOURLY_MAX_DAYS} วัน`);
    const first = Math.floor(s.cutoffMin / 60);
    const docs = notDeposit(await loadSales(db, s, dayStart(addDays(r.from, -7 * FORECAST_WEEKS), s.cutoffMin), r.end));
    const inRange = new Set(days);
    const cur = new Map<number, { bills: number; net: number }>();
    const hist = new Map<string, number>();
    for (const x of docs) {
      if (x.docType === "SALE" && x.status === "VOIDED") continue;
      const d = bkkBusinessDate(x.createdAt, s.cutoffMin);
      let h = Math.floor((x.createdAt.getTime() + BKK_OFFSET_MS - Date.parse(`${d}T00:00:00Z`)) / 3_600_000);
      if (h > first + 23) h = first;
      const refund = x.docType === "REFUND";
      const amount = refund ? -x.grandTotalSatang : x.grandTotalSatang;
      hist.set(`${d}|${h}`, (hist.get(`${d}|${h}`) ?? 0) + amount);
      if (!inRange.has(d)) continue;
      const c = cur.get(h) ?? { bills: 0, net: 0 };
      if (!refund) c.bills += 1;
      c.net += amount;
      cur.set(h, c);
    }
    const rows: HourlyRow[] = Array.from({ length: 24 }, (_, i) => {
      const hour = first + i;
      let past = 0;
      for (const d of days) for (let k = 1; k <= FORECAST_WEEKS; k++) past += hist.get(`${addDays(d, -7 * k)}|${hour}`) ?? 0;
      const c = cur.get(hour) ?? { bills: 0, net: 0 };
      // ปัดครึ่งขึ้นของ past ÷ 4 แบบจำนวนเต็ม (ติดลบได้เมื่อมีแต่ใบคืน)
      return { hour, label: String(hour % 24).padStart(2, "0"), billCount: c.bills, netSalesSatang: c.net, forecastSatang: Math.floor((past + FORECAST_WEEKS / 2) / FORECAST_WEEKS) };
    });
    return envelope("hourly", s, r, rows, { billCount: sum(rows, (x) => x.billCount), netSalesSatang: sum(rows, (x) => x.netSalesSatang), forecastSatang: sum(rows, (x) => x.forecastSatang) });
  });
}

// ═══════════ POS P2.12 ▸ 11. จุดผิดปกติของพนักงาน A1–A10 (§3 · มติ 3 4 · CD-4 CD-5) ◂ ═══════════
/** ป้ายไทยของกฎ (CSV/แบบพิมพ์) — จอใช้ pos.report.anomaly.rules.* */
export const ANOMALY_RULE_LABEL_TH: Readonly<Record<PosAnomalyRule, string>> = {
  A1: "ยกเลิกบิลบ่อย",
  A2: "คืนเงินบ่อย",
  A3: "ส่วนลดสูง (พนักงาน)",
  A4: "ส่วนลดสูง (บิล)",
  A5: "ใช้สิทธิ์เกินเพดาน",
  A6: "ราคากำหนดเอง",
  A7: "พิมพ์สำเนาซ้ำ",
  A8: "เงินขาด/เกิน",
  A9: "เงินขาดซ้ำ",
  A10: "ยกเลิก/ปฏิเสธออเดอร์",
  A11: "ข้ามตารางงานบ่อย", // POS P3.9 ▸ R11 ◂
};
const ANOMALY_AUDIT_ACTIONS = ["pos.sale.void", "pos.discount.override", "pos.approval.pin_override", "pos.receipt.reprint"];
const ANOMALY_DENIED = "บัญชีนี้ยังไม่มีสิทธิ์ดูรายงานจุดผิดปกติของพนักงาน — ขอสิทธิ์จากเจ้าของร้าน";

/**
 * POS P2.12 ▸ fix1 H2 (มติ 3): ตัดแถวต่อกฎ — แถวเรียงตามกฎแล้ว · แบ่งที่นั่งแบบวนทีละกฎตามลำดับกฎ (A1 → A10) จนครบ limit ⇒
 *   ในรอบแบ่งเท่า กฎละไม่เกิน ⌈limit / จำนวนกฎที่มีแถว⌉ · ที่นั่งของกฎที่มีแถวน้อยกว่าส่วนแบ่งถูกเติมให้กฎถัดไปตามลำดับกฎ ·
 *   limit ≥ จำนวนกฎที่มีแถว ⇒ ไม่มีกฎหาย · ผลลัพธ์ ≤ limit แถว และคงลำดับเดิม (แถวต้น ๆ ของแต่ละกฎ) · ไม่เกิน limit = คืนเดิม ◂
 */
function capPerRule(rows: AnomalyRow[], limit: number): AnomalyRow[] {
  if (rows.length <= limit) return rows;
  const groups: AnomalyRow[][] = [];
  for (const x of rows) {
    const g = groups[groups.length - 1];
    if (g && g[0]!.rule === x.rule) g.push(x);
    else groups.push([x]);
  }
  const take = groups.map(() => 0);
  let left = limit;
  for (let moved = true; left > 0 && moved; ) {
    moved = false;
    for (let i = 0; i < groups.length && left > 0; i++) {
      if ((take[i] ?? 0) < groups[i]!.length) {
        take[i] = (take[i] ?? 0) + 1;
        left -= 1;
        moved = true;
      }
    }
  }
  return groups.flatMap((g, i) => g.slice(0, take[i]));
}

/** POS P2.12 ▸ fix1 H1: ส่วนลดสมาชิกของบิล = Σ discountSatang ของ memberBenefits.lines (ไม่รวม COUPON — คูปองอยู่ใน CouponRedemption) · รูปไม่ถูก = 0 ◂ */
function memberBenefitDiscount(v: unknown): number {
  if (!isRecord(v) || !Array.isArray(v.lines)) return 0;
  let t = 0;
  for (const l of v.lines as unknown[]) if (isRecord(l) && l.kind !== "COUPON" && Number.isInteger(l.discountSatang) && (l.discountSatang as number) > 0) t += l.discountSatang as number;
  return t;
}

/**
 * POS P2.14 ▸ RPT-2 (R2): ส่วนลดที่พนักงานคุมได้ต่อบิล (ฐานเดียวกับ A3/A4 ของจุดผิดปกติ) = Σ ส่วนลดบรรทัด + max(0, ส่วนลดท้ายบิล − คูปอง − สมาชิก) ·
 * คิวรีคงที่ต่อก้อน (บรรทัดที่มีส่วนลด · คูปองที่ไม่ RELEASED · memberBenefits ของบิลที่มีส่วนลดท้ายบิล) · อ่านอย่างเดียว ◂
 */
async function staffDiscountBySale(db: Db, s: Scope, r: Range, paid: readonly SaleRow[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const lineDisc = new Map<string, number>();
  for (const ids of chunks(paid.map((x) => x.id))) {
    const g = await db.posSaleLine.groupBy({ by: ["saleId"], where: { tenantId: s.tenantId, saleId: { in: ids }, discountSatang: { gt: 0 } }, _sum: { discountSatang: true } });
    for (const x of g) lineDisc.set(x.saleId, (lineDisc.get(x.saleId) ?? 0) + (x._sum.discountSatang ?? 0));
  }
  const notStaff = new Map<string, number>();
  const seen = new Set<string>();
  for (const ids of chunks(paid.filter((x) => x.discountSatang > 0).map((x) => x.id))) {
    const inChunk = new Set(ids);
    const reds = await db.couponRedemption.findMany({
      where: { tenantId: s.tenantId, status: { not: "RELEASED" }, OR: [{ saleId: { in: ids } }, { refType: "PosSale", refId: { in: ids } }] },
      select: { id: true, saleId: true, refId: true, discountSatang: true },
    });
    for (const c of reds) {
      const sid = c.saleId && inChunk.has(c.saleId) ? c.saleId : c.refId;
      if (!sid || seen.has(c.id)) continue;
      seen.add(c.id);
      notStaff.set(sid, (notStaff.get(sid) ?? 0) + c.discountSatang);
    }
    const mem = await db.posSale.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, createdAt: { gte: r.start, lt: r.end }, id: { in: ids } }, select: { id: true, memberBenefits: true } });
    for (const x of mem) {
      const m = memberBenefitDiscount(x.memberBenefits);
      if (m > 0) notStaff.set(x.id, (notStaff.get(x.id) ?? 0) + m);
    }
  }
  for (const x of paid) out.set(x.id, (lineDisc.get(x.id) ?? 0) + Math.max(0, x.discountSatang - (notStaff.get(x.id) ?? 0)));
  return out;
}

/** ชื่อแสดงผลเท่านั้น (PDPA มติ 4: ไม่ถอยไปใช้อีเมล) · ไม่มีชื่อ = null */
async function displayNames(db: Db, ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const part of chunks([...new Set(ids)])) {
    for (const u of await db.user.findMany({ where: { id: { in: part } }, select: { id: true, name: true } })) out.set(u.id, u.name?.trim() ? u.name.trim() : null);
  }
  return out;
}

/**
 * จุดผิดปกติตามกติกา (ไม่ใช่ AI · P3.9) — สิทธิ์ = pos.report.view (prepare) "และ" pos.report.anomaly ต่อสาขา · ไม่เหลือสาขา = PERMISSION_DENIED
 * แหล่ง (อ่านอย่างเดียว · ทุกคิวรีมี tenantId + ช่วงเวลา/รายการ id · audit ไม่มีสาขา ⇒ เชื่อมผ่าน PosSale ของ targetId ในขอบเขต):
 *   A1 audit pos.sale.void (ผู้ยกเลิก + ผู้ขอผ่าน PIN นับคนละ 1) · A2 ใบคืน (ผู้คืน = soldByUserId ของใบคืน) · A3 ตัวเลขแบบรายงานพนักงาน ต่อสาขา+ผู้ขาย ทั้งช่วง ·
 *   A4 บิลเดียว ส่วนลดพนักงาน/ยอดก่อนส่วนลดบรรทัด (POS P2.12 ▸ fix1 H1: A3/A4 = ส่วนลดบรรทัด + ท้ายบิล − คูปอง − สมาชิก ◂) · A5 pos.discount.override ∪ pos.approval.pin_override ต่อผู้อนุมัติ (บิล+ชนิดเดียวกัน = 1 ครั้ง) · A6 บรรทัด CUSTOM ·
 *   A7 pos.receipt.reprint ต่อบิล · A8 กะ (max |ขาด/เกิน|, |ผลต่างนับย้อนหลัง|) · A9 ผู้เปิดกะเงินขาดซ้ำ · A10 ออเดอร์ REJECTED|CANCELLED ต่อสาขา/วัน (receivedAt)
 * วันธุรกิจตามเวลาตัดวันของระบบ · มัดจำไม่นับ · บิลยกเลิกนับเฉพาะ A1 · เรียง กฎ → สาขา → วัน → ผู้ใช้ → ref · enabled false = ok แถวว่าง
 */
export async function reportAnomalies(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<AnomaliesReportResult> {
  return guard("reportAnomalies", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const a = actorOf(actor)!;
    const unitIds = p.s.unitIds.filter((u) => evaluate(a, { module: "pos", action: ANOMALY_PERMISSION, unitId: u }));
    if (unitIds.length === 0) return refuse("PERMISSION_DENIED", ANOMALY_DENIED);
    const s: Scope = { ...p.s, unitIds, unitName: new Map(unitIds.map((u) => [u, p.s.unitName.get(u) ?? ""])) };
    const r = p.r;
    const T = posAnomalyThresholds(s.settings);
    const byRule = Object.fromEntries(POS_ANOMALY_RULES.map((x) => [x, 0])) as Record<PosAnomalyRule, number>;
    if (!T.enabled) return envelope("anomalies", s, r, [] as AnomalyRow[], { rowCount: 0, byRule, unitNames: {}, a8SignedSatang: {} }); // POS P2.12 ▸ fix1 F1 H4 ◂
    const day = (t: Date) => bkkBusinessDate(t, s.cutoffMin);
    const inScope = new Set(s.unitIds);

    // ── แหล่งข้อมูล (จำนวนคิวรีคงที่ต่อก้อน) ──
    const sales = notDeposit(await loadSales(db, s, r.start, r.end));
    const paid = paidOf(sales);
    const refunds = refundsOf(sales);
    const seller = await sellerResolver(db, s, r.end, sales);
    const audits = await db.auditLog.findMany({
      where: { tenantId: s.tenantId, createdAt: { gte: r.start, lt: r.end }, targetType: "PosSale", action: { in: ANOMALY_AUDIT_ACTIONS } },
      select: { action: true, actorId: true, targetId: true, after: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const target = new Map<string, { unitId: string; grandTotalSatang: number }>();
    for (const ids of chunks([...new Set(audits.map((x) => x.targetId).filter(isId))])) {
      // บิลเป้าหมายเกิดก่อน audit (< ปลายช่วง) · อยู่ในสาขาของขอบเขตเท่านั้น
      const rows = await db.posSale.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, createdAt: { lt: r.end }, id: { in: ids } }, select: { id: true, unitId: true, grandTotalSatang: true } });
      for (const x of rows) target.set(x.id, { unitId: x.unitId, grandTotalSatang: x.grandTotalSatang });
    }
    // POS P2.12 ▸ fix1 H1 (มติ 2): groupBy เดิมของ A6 ขยายเป็น (บิล, priceSource) + _sum ส่วนลดบรรทัด — บรรทัด CUSTOM ทุกบรรทัด ∪ บรรทัดที่มีส่วนลด ◂
    const custom = new Map<string, number>();
    const lineDisc = new Map<string, number>();
    for (const ids of chunks(paid.map((x) => x.id))) {
      const g = await db.posSaleLine.groupBy({
        by: ["saleId", "priceSource"],
        where: { tenantId: s.tenantId, saleId: { in: ids }, OR: [{ priceSource: "CUSTOM" }, { discountSatang: { gt: 0 } }] },
        _count: { _all: true },
        _sum: { discountSatang: true },
      });
      for (const x of g) {
        if (x.priceSource === "CUSTOM") custom.set(x.saleId, (custom.get(x.saleId) ?? 0) + x._count._all);
        lineDisc.set(x.saleId, (lineDisc.get(x.saleId) ?? 0) + (x._sum.discountSatang ?? 0));
      }
    }
    // POS P2.12 ▸ fix1 H1: ส่วนลดท้ายบิลที่ไม่ใช่ของพนักงาน — PosSale.discountSatang = ท้ายบิล + คูปอง + สมาชิก (service.ts createSale) ·
    //   คูปอง = CouponRedemption.discountSatang (ไม่ RELEASED · saleId หรือ refType/refId) · สมาชิก = Σ PosSale.memberBenefits.lines[].discountSatang (ไม่รวม COUPON) ·
    //   อ่านเฉพาะบิลขายที่มีส่วนลดท้ายบิล (จำนวนคิวรีคงที่ต่อก้อน) ◂
    const notStaff = new Map<string, number>();
    const seenRedemption = new Set<string>();
    for (const ids of chunks(paid.filter((x) => x.discountSatang > 0).map((x) => x.id))) {
      const inChunk = new Set(ids);
      const reds = await db.couponRedemption.findMany({
        where: { tenantId: s.tenantId, status: { not: "RELEASED" }, OR: [{ saleId: { in: ids } }, { refType: "PosSale", refId: { in: ids } }] },
        select: { id: true, saleId: true, refId: true, discountSatang: true },
      });
      for (const c of reds) {
        const sid = c.saleId && inChunk.has(c.saleId) ? c.saleId : c.refId;
        if (!sid || seenRedemption.has(c.id)) continue;
        seenRedemption.add(c.id);
        notStaff.set(sid, (notStaff.get(sid) ?? 0) + c.discountSatang);
      }
      const mem = await db.posSale.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, createdAt: { gte: r.start, lt: r.end }, id: { in: ids } }, select: { id: true, memberBenefits: true } });
      for (const x of mem) {
        const m = memberBenefitDiscount(x.memberBenefits);
        if (m > 0) notStaff.set(x.id, (notStaff.get(x.id) ?? 0) + m);
      }
    }
    /** ส่วนลดที่พนักงานคุมได้ = Σ ส่วนลดบรรทัด + (ส่วนลดท้ายบิล − คูปอง − สมาชิก) */
    const staffDiscOf = (x: SaleRow) => (lineDisc.get(x.id) ?? 0) + Math.max(0, x.discountSatang - (notStaff.get(x.id) ?? 0));
    const shifts = await db.posShift.findMany({
      where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, openedAt: { gte: r.start, lt: r.end }, status: { not: "OPEN" } },
      select: { id: true, unitId: true, openedByUserId: true, openedAt: true, overShortSatang: true },
      orderBy: [{ openedAt: "asc" }, { id: "asc" }],
    });
    const recount = new Map<string, number>();
    for (const ids of chunks(shifts.map((x) => x.id))) {
      for (const x of await db.posShiftRecount.findMany({ where: { tenantId: s.tenantId, shiftId: { in: ids } }, select: { shiftId: true, varianceSatang: true } })) recount.set(x.shiftId, x.varianceSatang);
    }
    const orders = await db.posOrder.findMany({
      where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, receivedAt: { gte: r.start, lt: r.end }, status: { in: ["REJECTED", "CANCELLED"] } },
      select: { unitId: true, receivedAt: true },
    });

    // ── กลุ่ม (ไม่มีชื่อ — เติมทีหลัง) ──
    type Hit = Omit<AnomalyRow, "userName">;
    const out: Hit[] = [];
    type Acc = { unitId: string; businessDate: string | null; userId: string | null; count: number; value: number; keys?: Set<string> };
    const acc = (m: Map<string, Acc>, unitId: string, businessDate: string | null, userId: string | null): Acc => {
      const k = `${unitId}|${businessDate ?? ""}|${userId ?? ""}`;
      const v = m.get(k) ?? { unitId, businessDate, userId, count: 0, value: 0 };
      m.set(k, v);
      return v;
    };
    const emit = (rule: PosAnomalyRule, refType: AnomalyRefType, g: Acc, refId: string | null, value: number, count: number) =>
      out.push({ rule, unitId: g.unitId, businessDate: g.businessDate, userId: g.userId, refType, refId, value, threshold: { ...(T.rules[rule] as Record<string, number>) }, count });
    const afterOf = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});

    // A1 ยกเลิกบิลบ่อย — ผู้ยกเลิก (actorId) + ผู้ขอผ่าน PIN (after.requestedByUserId) คนละ 1 ครั้ง · ยอด = ยอดบิล
    const g1 = new Map<string, Acc>();
    for (const au of audits) {
      if (au.action !== "pos.sale.void") continue;
      const t = au.targetId ? target.get(au.targetId) : undefined;
      if (!t) continue;
      const req = afterOf(au.after).requestedByUserId;
      for (const u of new Set([au.actorId, typeof req === "string" ? req : null].filter(isId))) {
        const g = acc(g1, t.unitId, day(au.createdAt), u);
        g.count += 1;
        g.value += t.grandTotalSatang;
      }
    }
    for (const g of g1.values()) if (g.count >= T.rules.A1.count || g.value >= T.rules.A1.satang) emit("A1", "USER", g, null, g.value, g.count);

    // A2 คืนเงินบ่อย — ผู้คืน = soldByUserId ของใบคืน (ไม่ใช่ผู้ขายเดิม)
    const g2 = new Map<string, Acc>();
    for (const x of refunds) {
      if (!x.soldByUserId) continue;
      const g = acc(g2, x.unitId, day(x.createdAt), x.soldByUserId);
      g.count += 1;
      g.value += x.grandTotalSatang;
    }
    for (const g of g2.values()) if (g.count >= T.rules.A2.count || g.value >= T.rules.A2.satang) emit("A2", "USER", g, null, g.value, g.count);

    // A3 ส่วนลดสูงต่อพนักงาน — ตัวเลขแบบรายงานพนักงาน ต่อสาขา+ผู้ขาย ทั้งช่วง: Σ ส่วนลด × 10000 > net × bp (net > 0)
    const g3 = new Map<string, Acc & { disc: number }>();
    const acc3 = (unitId: string, userId: string | null) => {
      const k = `${unitId}|${userId ?? ""}`;
      const v = g3.get(k) ?? { unitId, businessDate: null, userId, count: 0, value: 0, disc: 0 };
      g3.set(k, v);
      return v;
    };
    for (const x of paid) {
      const g = acc3(x.unitId, seller.ofSale(x));
      g.count += 1;
      g.disc += staffDiscOf(x); // POS P2.12 ▸ fix1 H1 ◂
      g.value += x.grandTotalSatang;
    }
    for (const x of refunds) acc3(x.unitId, seller.ofRefund(x)).value -= x.grandTotalSatang;
    for (const g of g3.values()) {
      if (!g.userId || g.value <= 0 || !(g.disc * 10_000 > g.value * T.rules.A3.bp)) continue;
      emit("A3", "USER", g, null, Math.round((g.disc * 10_000) / g.value), g.count);
    }

    // A4 ส่วนลดสูงบิลเดียว — ส่วนลดพนักงาน × 10000 ≥ ยอดก่อนส่วนลดบรรทัด × bp (เทียบจำนวนเต็ม ไม่ปัด)
    // POS P2.12 ▸ fix1 H1: ฐาน = Σ ยอดเต็มของบรรทัด (subtotal หลังส่วนลดบรรทัด + ส่วนลดบรรทัด) · คูปอง/สมาชิกล้วนไม่ขึ้นแถว · บิลลดบรรทัด 100% ขึ้นแถว ◂
    for (const x of paid) {
      const disc = staffDiscOf(x);
      const base = x.subtotalSatang + (lineDisc.get(x.id) ?? 0);
      if (base <= 0 || !(disc * 10_000 >= base * T.rules.A4.bp)) continue;
      emit("A4", "PosSale", { unitId: x.unitId, businessDate: day(x.createdAt), userId: seller.ofSale(x), count: 1, value: 0 }, x.id, Math.round((disc * 10_000) / base), 1);
    }

    // A5 ใช้สิทธิ์เกินเพดาน — ต่อผู้อนุมัติ/สาขา/วัน · ครั้ง = (บิล, ชนิด) ไม่ซ้ำ (ส่วนลดผ่าน PIN เขียนสองแถว = 1 ครั้ง)
    const g5 = new Map<string, Acc>();
    for (const au of audits) {
      if (au.action !== "pos.discount.override" && au.action !== "pos.approval.pin_override") continue;
      const t = au.targetId ? target.get(au.targetId) : undefined;
      if (!t || !isId(au.actorId)) continue;
      const act = afterOf(au.after).action;
      const kind = au.action === "pos.discount.override" || act === "POS_DISCOUNT_OVER" ? "DISCOUNT" : String(act ?? "");
      const g = acc(g5, t.unitId, day(au.createdAt), au.actorId);
      (g.keys ??= new Set<string>()).add(`${au.targetId}|${kind}`);
    }
    // POS P2.14 ▸ RPT-1 (R1): override ด้วย PIN ผู้จัดการบนแผนแยกบิล (targetType PosTableSplit) นับรวม A5 ด้วย — สาขาจากแถวแผน (ในขอบเขต) ·
    //   ครั้ง = (แผน, ชนิด) ไม่ซ้ำ (กติกาเดียวกับบิล) · อ่านอย่างเดียว ◂
    const splitAudits = await db.auditLog.findMany({
      where: { tenantId: s.tenantId, createdAt: { gte: r.start, lt: r.end }, targetType: "PosTableSplit", action: { in: ["pos.discount.override", "pos.approval.pin_override"] } },
      select: { action: true, actorId: true, targetId: true, after: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const splitUnit = new Map<string, string>();
    for (const ids of chunks([...new Set(splitAudits.map((x) => x.targetId).filter(isId))])) {
      for (const x of await db.posTableSplit.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, id: { in: ids } }, select: { id: true, unitId: true } })) splitUnit.set(x.id, x.unitId);
    }
    for (const au of splitAudits) {
      const u = au.targetId ? splitUnit.get(au.targetId) : undefined;
      if (!u || !isId(au.actorId)) continue;
      const act = afterOf(au.after).action;
      const kind = au.action === "pos.discount.override" || act === "POS_DISCOUNT_OVER" ? "DISCOUNT" : String(act ?? "");
      const g = acc(g5, u, day(au.createdAt), au.actorId);
      (g.keys ??= new Set<string>()).add(`split:${au.targetId}|${kind}`);
    }
    // ◂
    for (const g of g5.values()) {
      const n = g.keys?.size ?? 0;
      if (n >= T.rules.A5.count) emit("A5", "USER", g, null, n, n);
    }

    // A6 ราคากำหนดเอง — บรรทัด priceSource CUSTOM ของบิลขายที่นับยอด ต่อผู้ขาย/สาขา/วัน
    const g6 = new Map<string, Acc>();
    for (const x of paid) {
      const n = custom.get(x.id) ?? 0;
      const u = seller.ofSale(x);
      if (!n || !u) continue;
      acc(g6, x.unitId, day(x.createdAt), u).count += n;
    }
    for (const g of g6.values()) if (g.count >= T.rules.A6.count) emit("A6", "USER", g, null, g.count, g.count);

    // A7 พิมพ์สำเนาซ้ำ — ต่อบิล ทั้งช่วง
    const g7 = new Map<string, { unitId: string; count: number }>();
    for (const au of audits) {
      if (au.action !== "pos.receipt.reprint" || !au.targetId) continue;
      const t = target.get(au.targetId);
      if (!t) continue;
      const g = g7.get(au.targetId) ?? { unitId: t.unitId, count: 0 };
      g.count += 1;
      g7.set(au.targetId, g);
    }
    for (const [saleId, g] of g7) if (g.count >= T.rules.A7.count) emit("A7", "PosSale", { unitId: g.unitId, businessDate: null, userId: null, count: g.count, value: g.count }, saleId, g.count, g.count);

    // A8 เงินขาด/เกินต่อกะ — max(|ขาด/เกินของ Z|, |ผลต่างการนับย้อนหลัง|) · A9 ผู้เปิดกะเดิมเงินขาด (overShort < 0) ≥ N กะ ต่อสาขา
    const g9 = new Map<string, Acc>();
    const a8Signed = new Map<string, number>(); // POS P2.12 ▸ fix1 H4 ◂
    for (const sh of shifts) {
      const v = Math.max(Math.abs(sh.overShortSatang ?? 0), Math.abs(recount.get(sh.id) ?? 0));
      if (v >= T.rules.A8.satang) {
        emit("A8", "PosShift", { unitId: sh.unitId, businessDate: day(sh.openedAt), userId: sh.openedByUserId, count: 1, value: v }, sh.id, v, 1);
        // POS P2.12 ▸ fix1 H4: ฝั่งที่ชนะ max (เท่ากัน = ขาด/เกินของ Z) — เก็บค่ามีเครื่องหมายไว้ให้ CSV/แบบพิมพ์ ◂
        const os = sh.overShortSatang ?? 0;
        a8Signed.set(sh.id, Math.abs(os) >= Math.abs(recount.get(sh.id) ?? 0) ? os : (recount.get(sh.id) ?? 0));
      }
      if ((sh.overShortSatang ?? 0) < 0) {
        const g = acc(g9, sh.unitId, null, sh.openedByUserId);
        g.count += 1;
        g.value += -(sh.overShortSatang ?? 0);
      }
    }
    for (const g of g9.values()) if (g.count >= T.rules.A9.count) emit("A9", "USER", g, null, g.value, g.count);

    // A10 ออเดอร์ปฏิเสธ/ยกเลิก ต่อสาขา/วันที่รับออเดอร์
    const g10 = new Map<string, Acc>();
    for (const o of orders) acc(g10, o.unitId, day(o.receivedAt), null).count += 1;
    for (const g of g10.values()) if (g.count >= T.rules.A10.count) emit("A10", "UNIT", g, null, g.count, g.count);

    // POS P3.9 ▸ R11 มติ 6 (CD-5) A11 ข้ามตารางงานบ่อย — audit pos.staff.schedule_override ต่อผู้อนุมัติ (actorId) / สาขา / วัน ≥ count ·
    //   สาขา = after.unitId · หรือ targetType PosDevice → สาขาของเครื่อง · หรือ after.deviceId (รหัสเครื่อง — รูปที่ P3.5 เขียนจริง) → สาขาของเครื่องในระบบนี้ ·
    //   นอกขอบเขตสาขา/หาสาขาไม่ได้ = ไม่นับ · อ่านอย่างเดียว ◂
    const overrides = await db.auditLog.findMany({
      where: { tenantId: s.tenantId, createdAt: { gte: r.start, lt: r.end }, action: "pos.staff.schedule_override" },
      select: { actorId: true, targetType: true, targetId: true, after: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    // POS P3.9 ▸ fix1 F1 (=N3 · CD-P39c): ลำดับหาสาขา = after.unitId → แถว PIN (targetType PosStaffPin = รูปที่ P3.5 เขียน · @@unique(unitId,userId)) →
    //   แถวเครื่อง (targetType PosDevice) → รหัสเครื่อง **เฉพาะเมื่อรหัสนั้นอยู่สาขาเดียว** (รหัสเดียวกันได้หลายสาขา — @@unique(unitId, deviceCode)) · กำกวม = ไม่นับ ◂
    const devById = new Map<string, string>();
    const pinUnit = new Map<string, string>();
    const devByCode = new Map<string, Set<string>>();
    const devIds = [...new Set(overrides.filter((x) => x.targetType === "PosDevice").map((x) => x.targetId).filter(isId))];
    const pinIds = [...new Set(overrides.filter((x) => x.targetType === "PosStaffPin").map((x) => x.targetId).filter(isId))];
    const devCodes = [...new Set(overrides.map((x) => afterOf(x.after).deviceId).filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64))];
    for (const ids of chunks(devIds)) for (const d of await db.posDevice.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, id: { in: ids } }, select: { id: true, unitId: true } })) devById.set(d.id, d.unitId);
    for (const ids of chunks(pinIds)) for (const x of await db.posStaffPin.findMany({ where: { tenantId: s.tenantId, id: { in: ids } }, select: { id: true, unitId: true } })) pinUnit.set(x.id, x.unitId);
    for (const codes of chunks(devCodes)) {
      for (const d of await db.posDevice.findMany({ where: { tenantId: s.tenantId, systemId: s.systemId, deviceCode: { in: codes } }, select: { deviceCode: true, unitId: true } })) {
        devByCode.set(d.deviceCode, (devByCode.get(d.deviceCode) ?? new Set<string>()).add(d.unitId));
      }
    }
    const oneUnitOf = (code: string): string | undefined => {
      const us = devByCode.get(code);
      return us && us.size === 1 ? [...us][0] : undefined;
    };
    const g11 = new Map<string, Acc>();
    for (const au of overrides) {
      if (!isId(au.actorId)) continue;
      const a11 = afterOf(au.after);
      const code = typeof a11.deviceId === "string" ? a11.deviceId : "";
      const u =
        (typeof a11.unitId === "string" && a11.unitId) ||
        (au.targetType === "PosStaffPin" && au.targetId ? pinUnit.get(au.targetId) : undefined) ||
        (au.targetType === "PosDevice" && au.targetId ? devById.get(au.targetId) : undefined) ||
        (code ? oneUnitOf(code) : undefined);
      if (!u || !inScope.has(u)) continue;
      acc(g11, u, day(au.createdAt), au.actorId).count += 1;
    }
    for (const g of g11.values()) if (g.count >= T.rules.A11.count) emit("A11", "USER", g, null, g.count, g.count);

    // ── ชื่อ + เรียง + totals ──
    const kept = out.filter((x) => inScope.has(x.unitId));
    const names = await displayNames(db, kept.map((x) => x.userId).filter(isId));
    const rank = new Map(POS_ANOMALY_RULES.map((x, i) => [x, i]));
    const rows: AnomalyRow[] = kept
      .map((x) => ({ rule: x.rule, unitId: x.unitId, businessDate: x.businessDate, userId: x.userId, userName: x.userId ? (names.get(x.userId) ?? null) : null, refType: x.refType, refId: x.refId, value: x.value, threshold: x.threshold, count: x.count }))
      .sort(
        (p1, p2) =>
          rank.get(p1.rule)! - rank.get(p2.rule)! ||
          cmpStr(p1.unitId, p2.unitId) ||
          cmpStr(p1.businessDate ?? "", p2.businessDate ?? "") ||
          cmpStr(p1.userId ?? "", p2.userId ?? "") ||
          cmpStr(p1.refId ?? "", p2.refId ?? ""),
      );
    for (const x of rows) byRule[x.rule] += 1;
    const shown = capPerRule(rows, r.limit); // POS P2.12 ▸ fix1 H2: ตัดต่อกฎ (เดิม slice ทั้งก้อน ⇒ กฎท้าย ๆ หายเงียบ) ◂
    // POS P2.12 ▸ fix1 F1: ชื่อสาขาจากขอบเขต (s.unitName) เฉพาะหน่วยที่อยู่ในแถวที่คืน ◂
    const unitNames: Record<string, string> = {};
    for (const x of shown) unitNames[x.unitId] ??= s.unitName.get(x.unitId) ?? "";
    // POS P2.12 ▸ fix1 H4: เครื่องหมายเฉพาะแถว A8 ที่คืน ◂
    const a8SignedSatang: Record<string, number> = {};
    for (const x of shown) if (x.rule === "A8" && x.refId && a8Signed.has(x.refId)) a8SignedSatang[x.refId] = a8Signed.get(x.refId)!;
    return envelope("anomalies", s, r, shown, { rowCount: rows.length, byRule, unitNames, a8SignedSatang });
  });
}

// ═══════════ POS P3.5 ▸ R11 ค่าคอมฯ พนักงานขาย (มติ 7: pos.report.view และ canViewPayroll · MANAGER ไม่ผ่านโดยบทบาท) ◂ ═══════════
const COMMISSION_DENIED = "บัญชีนี้ยังไม่มีสิทธิ์ดูค่าคอมฯ พนักงาน — เฉพาะเจ้าของร้านหรือผู้ได้รับสิทธิ์ดูเงินเดือน";
export async function reportStaffCommission(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<CommissionReportResult> {
  return guard("reportStaffCommission", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const a = actorOf(actor);
    if (!a || !canViewPayroll(a)) return refuse("PERMISSION_DENIED", COMMISSION_DENIED);
    const { s, r } = p;
    const ledger = await db.posStaffCommission.findMany({
      where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, createdAt: { gte: r.start, lt: r.end } },
      select: { userId: true, kind: true, status: true, amountSatang: true, hrPayAdjustmentId: true, sentAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100_000,
    });
    const m = new Map<string, CommissionRow & { lastAdj: { id: string; at: number } | null }>();
    for (const x of ledger) {
      const row = m.get(x.userId) ?? { userId: x.userId, name: null, accruedSatang: 0, reversedSatang: 0, netSatang: 0, sentSatang: 0, openSatang: 0, noEmployee: false, lastAdj: null };
      if (x.kind === "ACCRUE") row.accruedSatang += x.amountSatang;
      else row.reversedSatang -= x.amountSatang;
      if (x.status === "SENT") row.sentSatang += x.amountSatang;
      else row.openSatang += x.amountSatang;
      const at = x.sentAt?.getTime() ?? 0;
      if (x.hrPayAdjustmentId && (!row.lastAdj || at >= row.lastAdj.at)) row.lastAdj = { id: x.hrPayAdjustmentId, at };
      m.set(x.userId, row);
    }
    const ids = [...m.keys()];
    const [names, linked, statuses] = await Promise.all([
      userNames(db, ids),
      ids.length ? hrPayrollLinkedUserIds(s.tenantId, ids) : Promise.resolve(new Set<string>()),
      hrAdjustmentStatuses(s.tenantId, [...new Set([...m.values()].map((x) => x.lastAdj?.id).filter((x): x is string => !!x))]),
    ]);
    const rows: CommissionRow[] = [...m.values()]
      .map(({ lastAdj, ...x }) => {
        const st = lastAdj ? statuses.get(lastAdj.id) : undefined;
        const hrStatus = st ? (st.runId ? "IN_RUN" : st.status) : undefined;
        return { ...x, name: names.get(x.userId) ?? null, netSatang: x.accruedSatang - x.reversedSatang, noEmployee: !linked.has(x.userId), ...(hrStatus ? { hrStatus } : {}) };
      })
      .sort((x, y) => y.netSatang - x.netSatang || cmpStr(x.userId, y.userId));
    return envelope("commission", s, r, rows, {
      rowCount: rows.length,
      accruedSatang: sum(rows, (x) => x.accruedSatang),
      reversedSatang: sum(rows, (x) => x.reversedSatang),
      netSatang: sum(rows, (x) => x.netSatang),
      sentSatang: sum(rows, (x) => x.sentSatang),
      openSatang: sum(rows, (x) => x.openSatang),
    });
  });
}

// ═══════════ POS P3.6 ▸ R9 ลูกหนี้วางบิล (เครดิตเทอม) ต่อบริษัท — pos.report.view · ไม่ใช่ชนิดของ REST ใน P3.6 ═══════════
//   ฝั่ง POS (ช่วง + สาขาที่เห็น): บิล SALE ที่มีแถว ON_ACCOUNT ของ customerPartyId · ยอดวางบิล · ยอดคืน ON_ACCOUNT ของใบคืนที่อ้างบิลเหล่านั้น
//   ฝั่งสมุด (ณ ตอนนี้ · account.posCreditAging = สูตร agingReport): ค้าง · เลยกำหนด · ครบกำหนดเก่าสุด · ชื่อ = ผู้ติดต่อในสมุด → ผู้ซื้อบนบิล → partyId
//   ไม่มีข้อมูลติดต่อ/วงเงิน (R14 · CD-4) · POS ไม่ผูกสมุด = ยอดฝั่งสมุด 0 + bookLinked false ◂
export async function reportCredit(ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db): Promise<CreditReportResult> {
  return guard("reportCredit", async () => {
    const db = client ?? prisma;
    const p = await prepare(db, ctx, actor, input);
    if (isRefusal(p)) return p;
    const { s, r } = p;
    const bills = await db.posSale.findMany({
      where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, docType: "SALE", customerPartyId: { not: null }, createdAt: { gte: r.start, lt: r.end }, status: { in: ["PAID", "REFUNDED"] }, payments: { some: { type: "ON_ACCOUNT" } } },
      select: { id: true, customerPartyId: true, taxInvoice: true, payments: { where: { type: "ON_ACCOUNT" }, select: { amountSatang: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100_000,
    });
    const by = new Map<string, CreditRow>();
    const partyOfBill = new Map<string, string>();
    for (const b of bills) {
      const pid = b.customerPartyId!;
      partyOfBill.set(b.id, pid);
      const buyer = isRecord(b.taxInvoice) && typeof b.taxInvoice.name === "string" ? b.taxInvoice.name : "";
      const row = by.get(pid) ?? { partyId: pid, name: buyer, bills: 0, creditSatang: 0, refundedSatang: 0, outstandingSatang: 0, overdueSatang: 0, oldestDueDate: null };
      row.bills += 1;
      row.creditSatang += b.payments.reduce((t, x) => t + x.amountSatang, 0);
      if (!row.name && buyer) row.name = buyer;
      by.set(pid, row);
    }
    for (const ids of chunks([...partyOfBill.keys()])) {
      const back = await db.posSale.findMany({ where: { tenantId: s.tenantId, docType: "REFUND", refSaleId: { in: ids } }, select: { refSaleId: true, payments: { where: { type: "ON_ACCOUNT" }, select: { amountSatang: true } } } });
      for (const x of back) {
        const row = by.get(partyOfBill.get(x.refSaleId ?? "") ?? "");
        if (row) row.refundedSatang += x.payments.reduce((t, y) => t + Math.abs(y.amountSatang), 0);
      }
    }
    const aging = by.size ? await (await import("@/lib/modules/account")).posCreditAging({ tenantId: s.tenantId, sourceSystemId: s.systemId, partyIds: [...by.keys()] }) : null;
    for (const row of by.values()) {
      const a = aging?.get(row.partyId);
      if (!a) continue;
      row.outstandingSatang = a.outstandingSatang;
      row.overdueSatang = a.overdueSatang;
      row.oldestDueDate = a.oldestDueDate;
      if (a.contactName) row.name = a.contactName;
    }
    const rows = [...by.values()].map((x) => ({ ...x, name: x.name || x.partyId })).sort((a, b) => b.outstandingSatang - a.outstandingSatang || b.creditSatang - a.creditSatang || cmpStr(a.partyId, b.partyId));
    return envelope("credit", s, r, rows, {
      rowCount: rows.length,
      bills: sum(rows, (x) => x.bills),
      creditSatang: sum(rows, (x) => x.creditSatang),
      refundedSatang: sum(rows, (x) => x.refundedSatang),
      outstandingSatang: sum(rows, (x) => x.outstandingSatang),
      overdueSatang: sum(rows, (x) => x.overdueSatang),
      bookLinked: aging !== null || by.size === 0,
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
  daily: ["วันที่", "จำนวนบิล", "ยอดก่อนส่วนลด", "ส่วนลด", "ค่าบริการ", "ยอดขายสุทธิ", "VAT", "ยอดก่อน VAT", "ทิป", "บิลยกเลิก", "ยอดบิลยกเลิก", "เฉลี่ยต่อบิล", "จำนวนคืนเงิน", "ยอดคืนเงิน"], // POS P2.14 ▸ API-11: คอลัมน์คืนเงินของ JSON (refundCount · refundTotalSatang) · fix1 F11: ต่อท้าย (คอลัมน์เดิมไม่เลื่อน) ◂
  products: ["รหัส", "ชื่อ", "จำนวน", "น้ำหนัก (กรัม)", "จำนวนบิล", "ยอดเต็ม", "ส่วนลดรายการ", "ยอดขาย"],
  staff: ["รหัสผู้ใช้", "ชื่อ", "จำนวนบิล", "ยอดขายสุทธิ", "ส่วนลด", "ทิป", "บิลยกเลิก", "ยอดบิลยกเลิก", "เฉลี่ยต่อบิล"],
  payments: ["วิธีชำระ", "รหัส", "จำนวนรายการ", "จำนวนบิล", "ยอดรับ"],
  margin: ["รหัส", "ชื่อ", "จำนวน", "ยอดขาย", "ต้นทุน", "ต้นทุนประมาณการ", "กำไรขั้นต้น", "อัตรากำไร (%)"],
  shifts: ["กะที่", "Z ที่", "สาขา", "เครื่อง", "สถานะ", "เปิดโดย", "เวลาเปิด", "เวลาปิด", "จำนวนบิล", "ยอดขาย", "เงินที่ควรมี", "เงินที่นับได้", "ขาด/เกิน"],
  tax: ["วันที่", "สาขา", "เลขที่เริ่ม", "เลขที่สุดท้าย", "จำนวนบิล", "ยอดรวม VAT", "ฐานภาษี", "VAT", "ยอดไม่มี VAT", "บิลยกเลิก", "เลขที่ยกเลิก"],
  channels: ["รหัสช่องทาง", "ช่องทาง", "จำนวนบิล", "ยอดขาย", "ยอดคืนเงิน", "ค่าคอมมิชชัน", "VAT ค่าคอมมิชชัน", "ยอดสุทธิหลังหักค่าคอมฯ", "สัดส่วน (%)"], // POS P2.11 ◂
  // POS P2.12 ▸ BR HR AN (CD-7: สาขา/รายชั่วโมงมีแถว "รวม" · จุดผิดปกติไม่มี) ◂
  branches: ["สาขา", "จำนวนบิล", "ยอดขายสุทธิ", "เฉลี่ยต่อบิล", "ใบคืนเงิน", "ยอดคืนเงิน", "บิลยกเลิก", "ยอดบิลยกเลิก", "เงินสด", "แพลตฟอร์ม", "ค่าคอมมิชชัน", "VAT ค่าคอมมิชชัน", "ขาด/เกิน"],
  hourly: ["ชั่วโมง", "จำนวนบิล", "ยอดขายสุทธิ", "คาดการณ์ (เฉลี่ย 4 สัปดาห์)"],
  anomalies: ["กฎ", "จุดสังเกต", "สาขา", "วันที่", "พนักงาน", "ชนิดอ้างอิง", "รหัสอ้างอิง", "ค่า", "เกณฑ์", "จำนวน"], // POS P2.12 ▸ fix1 F1: ชื่อสาขา (เดิม รหัสสาขา) ◂
  commission: ["รหัสผู้ใช้", "ชื่อ", "ค่าคอมฯ ที่ได้", "กลับรายการ", "สุทธิ", "ส่งเข้างวดแล้ว", "ยังไม่ส่ง", "ยังไม่ผูกพนักงาน HR", "สถานะใน HR"], // POS P3.5 ▸ R11 ◂
  credit: ["รหัสบริษัท (Party)", "บริษัท", "จำนวนบิลวางบิล", "ยอดวางบิล", "ยอดคืน", "ค้างชำระ", "เลยกำหนด", "ครบกำหนดเก่าสุด"], // POS P3.6 ▸ R9 ◂
};
/** POS P2.12 ▸ fix1 F2: ชนิดที่แถวท้ายของ CSV/แบบพิมพ์เป็นแถว "รวม" เสมอ (ตัดสินจากชนิด ไม่ใช่ข้อความในช่อง) — channels/anomalies ไม่มีแถวรวม ◂ */
export const REPORT_TOTAL_ROW_KINDS: ReadonlySet<ReportKind> = new Set<ReportKind>(["daily", "products", "staff", "payments", "margin", "shifts", "tax", "branches", "hourly", "commission"]); // POS P3.5 ▸ + commission ◂
// POS P2.12 ▸ ค่าของแถวจุดผิดปกติในตาราง: เงิน (A1 A2 A8 A9) = บาท · สัดส่วน (A3 A4) = % · อื่น = จำนวน ◂
const ANOMALY_MONEY_RULES: ReadonlySet<string> = new Set(["A1", "A2", "A8", "A9"]);
const ANOMALY_BP_RULES: ReadonlySet<string> = new Set(["A3", "A4"]);
const anomalyValueText = (rule: string, v: number): string => (ANOMALY_MONEY_RULES.has(rule) ? baht(v) : ANOMALY_BP_RULES.has(rule) ? pct(v) : String(v));
/** POS P2.12 ▸ fix1 H4: ช่องค่าของ A8 = "ขาด −150.00" / "เกิน +150.00" จากฝั่งที่ชนะ (ไม่มีค่ามีเครื่องหมาย = บาทเดิม) ◂ */
const a8ValueText = (signed: number | undefined, v: number): string =>
  signed === undefined || signed === 0 ? baht(v) : signed < 0 ? `ขาด \u2212${baht(-signed)}` : `เกิน +${baht(signed)}`;
const anomalyThresholdText = (rule: string, t: Record<string, number>): string =>
  Object.entries(t)
    .map(([f, v]) => (f === "satang" ? `≥ ${baht(v)}` : f === "bp" ? `${rule === "A3" ? ">" : "≥"} ${pct(v)}%` : `≥ ${v}`))
    .join(" หรือ ");
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
  x.refundCount, // POS P2.14 ▸ API-11 · fix1 F11: ต่อท้าย ◂
  baht(x.refundTotalSatang), // POS P2.14 ▸ API-11 · fix1 F11: ต่อท้าย ◂
];

/**
 * POS P2.12 ▸ fix1 H2: บรรทัดแจ้งเมื่อรายงานถูกตัดแถว (จุดผิดปกติ: totals.rowCount > rows.length) — "แสดง N จาก M แถว" / "Showing N of M rows" ·
 *   CSV = บรรทัดท้ายช่องเดียว · แบบพิมพ์ = model.notice (ไม่อยู่ในตาราง) · ไม่ถูกตัด = null ◂
 */
export function reportRowsNotice(report: AnyReport, locale: "th" | "en" = "th"): string | null {
  if (report.kind !== "anomalies") return null;
  const total = (report.totals as AnomalyTotals).rowCount;
  const shown = report.rows.length;
  if (!(typeof total === "number" && total > shown)) return null;
  return locale === "en" ? `Showing ${shown} of ${total} rows` : `แสดง ${shown} จาก ${total} แถว`;
}
/** แถว CSV ทั้งหมดใต้หัวตาราง = แถวตาราง + บรรทัดแจ้ง (ถ้าถูกตัด) — POS P2.12 ▸ fix1 H2 ◂ */
function csvBodyRows(res: Exclude<AnyReportResult, ReportRefusal>): Cells[] {
  const notice = reportRowsNotice(res.report);
  return notice ? [...csvTableRows(res), [notice]] : csvTableRows(res);
}
/** แถวข้อมูล + แถว "รวม" ของรายงานแต่ละชนิด */
function csvTableRows(res: Exclude<AnyReportResult, ReportRefusal>): Cells[] {
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
      // POS P2.14 ▸ U2 O-9: ผู้ขายที่เป็นคีย์ API (ชื่อ "API: <ชื่อคีย์>" จากด้านบน) = รหัสสั้นของคีย์ ("API …ท้าย 6 ตัว") แทน cuid เต็มในช่องรหัสผู้ใช้ (CSV · หน้าพิมพ์) ◂
      const idCell = (r: StaffRow) => (r.userId && r.name?.startsWith("API: ") ? `API …${r.userId.slice(-6)}` : (r.userId ?? ""));
      return [...x.rows.map((r) => cells(idCell(r), r.userId ? (r.name ?? "") : "ไม่ระบุ", r)), cells(TOTAL_LABEL, "", x.totals)];
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
    // POS P2.11 ▸ ช่องทาง: แถวต่อรหัส (ไม่มีแถว "รวม" — จำนวนบรรทัด = หัว + แถวรายงาน · totals อยู่ในรายงาน) ◂
    case "channels": {
      const x = rep as Report<"channels", ChannelRow, ChannelTotals>;
      return x.rows.map((r) => [r.channelCode, r.name, r.billCount, baht(r.grossSatang), baht(r.refundSatang), baht(r.commissionSatang), baht(r.commissionVatSatang), baht(r.netSatang), r.sharePct.toFixed(1)]);
    }
    // POS P2.12 ▸ สาขา + แถว "รวม" (ทั้งขอบเขต) ◂
    case "branches": {
      const x = rep as Report<"branches", BranchRow, BranchTotals>;
      const cells = (first: string, t: BranchTotals): Cells => [
        first,
        t.billCount,
        baht(t.netSalesSatang),
        baht(t.avgBillSatang),
        t.refundCount,
        baht(t.refundTotalSatang),
        t.voidCount,
        baht(t.voidTotalSatang),
        baht(t.cashSatang),
        baht(t.platformSatang),
        baht(t.commissionSatang),
        baht(t.commissionVatSatang),
        baht(t.overShortSatang),
      ];
      return [...x.rows.map((r) => cells(r.name || r.unitId, r)), cells(TOTAL_LABEL, x.totals)];
    }
    // POS P2.12 ▸ รายชั่วโมง 24 แถว + แถว "รวม" ◂
    case "hourly": {
      const x = rep as Report<"hourly", HourlyRow, HourlyTotals>;
      return [
        ...x.rows.map((r) => [`${r.label}:00`, r.billCount, baht(r.netSalesSatang), baht(r.forecastSatang)]),
        [TOTAL_LABEL, x.totals.billCount, baht(x.totals.netSalesSatang), baht(x.totals.forecastSatang)],
      ];
    }
    // POS P2.12 ▸ จุดผิดปกติ: แถวล้วน (ไม่มี "รวม") · ชื่อแสดงผลเท่านั้น ◂
    case "anomalies": {
      const x = rep as Report<"anomalies", AnomalyRow, AnomalyTotals>;
      return x.rows.map((r) => [
        r.rule,
        ANOMALY_RULE_LABEL_TH[r.rule],
        x.totals.unitNames?.[r.unitId] ?? r.unitId, // POS P2.12 ▸ fix1 F1 ◂
        r.businessDate ?? "",
        r.userName ?? "",
        r.refType,
        r.refId ?? "",
        r.rule === "A8" ? a8ValueText(r.refId ? x.totals.a8SignedSatang?.[r.refId] : undefined, r.value) : anomalyValueText(r.rule, r.value), // POS P2.12 ▸ fix1 H4 ◂
        anomalyThresholdText(r.rule, r.threshold),
        r.count,
      ]);
    }
    // POS P3.5 ▸ R11: ค่าคอมฯ ต่อผู้ขาย + แถว "รวม" ◂
    case "commission": {
      const x = rep as Report<"commission", CommissionRow, CommissionTotals>;
      return [
        ...x.rows.map((r) => [r.userId, r.name ?? "", baht(r.accruedSatang), baht(r.reversedSatang), baht(r.netSatang), baht(r.sentSatang), baht(r.openSatang), r.noEmployee ? "ใช่" : "", r.hrStatus ?? ""]),
        [TOTAL_LABEL, "", baht(x.totals.accruedSatang), baht(x.totals.reversedSatang), baht(x.totals.netSatang), baht(x.totals.sentSatang), baht(x.totals.openSatang), "", ""],
      ];
    }
    // POS P3.6 ▸ R9: ลูกหนี้วางบิลต่อบริษัท (ไม่มีแถวรวม — ยอดค้างเป็นภาพ ณ ตอนนี้ ไม่ใช่ผลรวมของช่วง) ◂
    case "credit": {
      const x = rep as Report<"credit", CreditRow, CreditTotals>;
      return x.rows.map((r) => [r.partyId, r.name, r.bills, baht(r.creditSatang), baht(r.refundedSatang), baht(r.outstandingSatang), baht(r.overdueSatang), r.oldestDueDate ?? ""]);
    }
  }
}
/** POS P2.12 ▸ PD: แถว CSV (ข้อมูล + "รวม") ของรายงานที่สำเร็จ เป็นข้อความทีละช่อง — แบบพิมพ์ใช้ชุดเดียวกับ CSV (report-print-shared.ts) ◂ */
export function reportCsvRows(report: AnyReport): string[][] {
  return csvBodyRows({ ok: true, report } as Exclude<AnyReportResult, ReportRefusal>).map((row) => row.map((c) => String(c)));
}
/** POS P2.12 ▸ fix1 H2: แถวตาราง (ข้อมูล + "รวม") ไม่รวมบรรทัดแจ้ง — แบบพิมพ์ใช้ตัวนี้ + reportRowsNotice ◂ */
export function reportTableRows(report: AnyReport): string[][] {
  return csvTableRows({ ok: true, report } as Exclude<AnyReportResult, ReportRefusal>).map((row) => row.map((c) => String(c)));
}

const REPORT_FN: Record<ReportKind, (ctx: ReportCtx, actor: RegisterActor, input: ReportInput, client?: Db) => Promise<AnyReportResult>> = {
  daily: reportDailySales,
  products: reportProducts,
  staff: reportStaff,
  payments: reportPayments,
  margin: reportMargin,
  shifts: reportShifts,
  tax: reportTax,
  channels: reportChannels, // POS P2.11 ◂
  // POS P2.12 ◂
  branches: reportBranches,
  hourly: reportHourly,
  anomalies: reportAnomalies,
  commission: reportStaffCommission, // POS P3.5 ◂
  credit: reportCredit, // POS P3.6 ◂
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

// POS P2.12 ▸ PD: ชื่อร้าน + ชื่อสาขาสำหรับหัวแบบพิมพ์ (อ่านอย่างเดียว · เรียกหลังรายงานผ่านด่านขอบเขตแล้ว) ◂
// POS P2.12 ▸ fix1 H3 (มติ 4): ไม่ส่ง unitId + ขอบเขตของผู้ใช้ไม่ใช่ทุกสาขาของร้าน ⇒ unitName = ชื่อสาขาในขอบเขต (เรียง id แบบ scopeOf · คั่น ", ") ·
//   ขอบเขต = กติกาเดียวกับ scopeOf (OWNER / "*" = ทุกสาขา · อื่น = unitAccess) ∩ pos.report.view (+ pos.report.anomaly สำหรับ anomalies) · ครบทุกสาขา = null ("ทุกสาขา") ◂
export async function reportPrintNames(ctx: ReportCtx, client?: Db, scope?: { actor: RegisterActor; kind: ReportKind }): Promise<{ shopName: string; unitName: string | null }> {
  const db = client ?? prisma;
  const [t, u, all] = await Promise.all([
    db.tenant.findFirst({ where: { id: ctx.tenantId }, select: { name: true } }),
    ctx.unitId ? db.businessUnit.findFirst({ where: { id: ctx.unitId, tenantId: ctx.tenantId }, select: { name: true } }) : null,
    !ctx.unitId && scope ? db.businessUnit.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, name: true }, orderBy: { id: "asc" } }) : null,
  ]);
  let scoped: string | null = null;
  const a = scope ? actorOf(scope.actor) : null;
  if (all && a) {
    const everyUnit = a.role === "OWNER" || a.unitAccess.includes("*");
    const perms = scope!.kind === "anomalies" ? [REPORT_PERMISSION, ANOMALY_PERMISSION] : [REPORT_PERMISSION];
    const mine = all.filter((x) => (everyUnit || a.unitAccess.includes(x.id)) && perms.every((p) => evaluate(a, { module: "pos", action: p, unitId: x.id })));
    if (mine.length > 0 && mine.length < all.length) scoped = mine.map((x) => x.name).join(", ");
  }
  return { shopName: t?.name ?? "", unitName: u?.name ?? scoped };
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
    const today = bkkBusinessDate(now, s.cutoffMin);
    const yesterday = addDays(today, -1);
    const [sales, openShiftCount] = await Promise.all([
      loadSales(db, s, dayStart(yesterday, s.cutoffMin), dayStart(addDays(today, 1), s.cutoffMin)),
      db.posShift.count({ where: { tenantId: s.tenantId, systemId: s.systemId, unitId: { in: s.unitIds }, status: "OPEN" } }),
    ]);
    const todays = sales.filter((x) => bkkBusinessDate(x.createdAt, s.cutoffMin) === today);
    const t = dailyTotalsOf(todays);
    const y = dailyTotalsOf(sales.filter((x) => bkkBusinessDate(x.createdAt, s.cutoffMin) === yesterday));
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
