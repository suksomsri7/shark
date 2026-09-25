// deals-shared.ts — ค่าคงที่ · ชนิดข้อมูล · ตัวตรวจ/ตัวคำนวณบริสุทธิ์ของ "ดีล" (CRM v2 · ใบ C1.5)
//
// 🔴 ไฟล์นี้ปลอดภัยสำหรับ 'use client' — ไม่ import prisma / core db / server-only / next/headers / ./deals
//    กระดาน · ดีล 360 · ฟอร์มเพิ่มดีล import เพดานและตัวคำนวณจากที่นี่ ⇒ ตัวเลขบนจอกับตัวเลขที่บริการบันทึกมาจากสูตรเดียวกัน
// 🔴 เงิน = สตางค์ (จำนวนเต็ม) · วันที่คาดว่าจะปิด = "วันตามปฏิทินไทย" เก็บเป็นเที่ยงคืน UTC (แบบเดียวกับ engine ฟิลด์ DATE)

// ───────────────────────── เพดาน (มติ C28 · X6) ─────────────────────────

/** มูลค่าดีลสูงสุด ฿20,000,000 (มติ C28 — คอลัมน์ `valueSatang` เป็น Int) */
export const DEAL_VALUE_MAX_SATANG = 2_000_000_000;
/** จำนวนดีลต่อคำสั่งกลุ่ม (ย้ายขั้น · โอน · แท็ก) */
export const DEAL_BULK_MAX = 200;
/** เหตุผลของการกระทำอันตราย (ลบ · เปิดใหม่ · ย้าย/โอนเป็นกลุ่ม) อย่างน้อยกี่ตัวอักษร */
export const DEAL_REASON_MIN = 5;
export const DEAL_REASON_MAX = 500;
export const DEAL_TITLE_MAX = 200;
/** ขั้นถัดไป · โน้ตตอนย้ายขั้น · โน้ตเหตุผลที่แพ้ */
export const DEAL_NOTE_MAX = 2000;
export const DEAL_LINES_MAX = 200;
export const DEAL_LINE_NAME_MAX = 200;
export const DEAL_LINE_NOTE_MAX = 500;
/** Decimal(12,3) ของ `CrmDealLine.qty` */
export const DEAL_LINE_QTY_MAX = 999_999_999;
export const DEAL_TAGS_MAX = 50;
export const DEAL_TAG_MAX = 64;
export const DEAL_COLLABORATORS_MAX = 20;
/** เพดานส่วนลดเริ่มต้น (basis points) เมื่อสิทธิ์ของผู้ทำไม่มีค่า `crm._maxDealDiscountBp` — 1000 = 10 % */
export const DEAL_DISCOUNT_CAP_BP_DEFAULT = 1000;
export const DEAL_PAGE_MAX = 200;
export const DEAL_EXPORT_MAX_ROWS = 5000;
/** การ์ดต่อคอลัมน์บนกระดาน (ตัวเลขรวมของคอลัมน์นับจากทุกดีลเสมอ) */
export const DEAL_BOARD_CARDS_MAX = 60;
export const PIPELINE_NAME_MAX = 100;
export const PIPELINE_STAGES_MAX = 20;
export const LOST_REASON_LABEL_MAX = 100;

// ───────────────────────── ข้อผิดพลาด ─────────────────────────

export type DealErrorCode = "NOT_FOUND" | "VALIDATION" | "STAGE_REQUIREMENTS" | "APPROVAL_REQUIRED" | "CONFIRM_REQUIRED" | "CONFLICT" | "FORBIDDEN";

/** ข้อผิดพลาดของบริการดีล — `.code` ให้ผู้เรียกตัดสิน · ข้อความไทยที่ไม่โทษผู้ใช้ · ไม่มีข้อมูลของร้าน/ระบบอื่น */
export class DealsError extends Error {
  readonly code: DealErrorCode;
  /** STAGE_REQUIREMENTS: key ของฟิลด์ที่ยังขาด + "LINES" / "QUOTATION" */
  readonly missing?: string[];
  /** APPROVAL_REQUIRED: คำขออนุมัติที่เปิดไว้ */
  readonly approvalRequestId?: string;
  constructor(code: DealErrorCode, message: string, extra: { missing?: string[]; approvalRequestId?: string } = {}) {
    super(message);
    this.name = "DealsError";
    this.code = code;
    if (extra.missing) this.missing = extra.missing;
    if (extra.approvalRequestId) this.approvalRequestId = extra.approvalRequestId;
  }
}

// ───────────────────────── ป้ายไทย ─────────────────────────

export const FORECAST_CATEGORIES = ["PIPELINE", "BEST_CASE", "COMMIT", "OMITTED"] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];
export const FORECAST_CATEGORY_LABEL: Record<ForecastCategory, string> = {
  PIPELINE: "อยู่ในไปป์ไลน์",
  BEST_CASE: "มีลุ้น",
  COMMIT: "มั่นใจ",
  OMITTED: "ไม่นับ",
};

export type DealKind = "OPEN" | "WON" | "LOST";
export const DEAL_KIND_LABEL: Record<DealKind, string> = { OPEN: "เปิดอยู่", WON: "ชนะ", LOST: "แพ้" };

export const DEAL_VIEWS = ["board", "table", "forecast"] as const;
export type DealView = (typeof DEAL_VIEWS)[number];

export const DEAL_SORTS = ["-createdAt", "createdAt", "-valueSatang", "expectedCloseAt", "-stageEnteredAt", "title"] as const;
export type DealSort = (typeof DEAL_SORTS)[number];
export const DEAL_SORT_LABEL: Record<DealSort, string> = {
  "-createdAt": "เพิ่มล่าสุด",
  createdAt: "เพิ่มก่อน",
  "-valueSatang": "มูลค่ามากสุด",
  expectedCloseAt: "ใกล้วันปิด",
  "-stageEnteredAt": "ย้ายขั้นล่าสุด",
  title: "ชื่อ ก–ฮ",
};

export const FORECAST_GROUPS = ["month", "owner", "team"] as const;
export type ForecastGroup = (typeof FORECAST_GROUPS)[number];
/** กลุ่มของดีลที่ไม่มีวันที่คาดว่าจะปิด / ไม่มีผู้ดูแล / ไม่มีทีม */
export const FORECAST_NONE_KEY = "none";

/** ฟิลด์ระบบที่ตั้งเป็น "ต้องกรอกก่อนเข้าขั้น" ได้ (นอกจากนี้ = key ของฟิลด์กำหนดเองของดีล) */
export const STAGE_REQUIRABLE_SYSTEM_KEYS = ["expectedCloseAt", "nextStep", "probabilityOverride", "companyId", "valueSatang", "ownerUserId", "tags"] as const;
export const STAGE_REQUIRABLE_LABEL: Record<(typeof STAGE_REQUIRABLE_SYSTEM_KEYS)[number], string> = {
  expectedCloseAt: "วันที่คาดว่าจะปิด",
  nextStep: "ขั้นถัดไป",
  probabilityOverride: "โอกาสปิด (%)",
  companyId: "บริษัท",
  valueSatang: "มูลค่าดีล",
  ownerUserId: "ผู้ดูแล",
  tags: "แท็ก",
};
/** ฟิลด์ระบบที่กรอกได้จากโมดัล "เงื่อนไขก่อนเข้าขั้น" (ที่เหลือแก้จากหน้าดีล 360) */
export const STAGE_FILLABLE_SYSTEM_KEYS = ["expectedCloseAt", "nextStep", "probabilityOverride"] as const;

// ───────────────────────── ชนิดข้อมูล (DTO) ─────────────────────────

export type DealDto = {
  id: string;
  systemId: string;
  title: string;
  contactId: string;
  companyId: string | null;
  pipelineId: string;
  stageId: string;
  kind: DealKind;
  valueSatang: number;
  wonValueSatang: number | null;
  discountBp: number;
  currency: string;
  /** "YYYY-MM-DD" (วันตามปฏิทินไทย) */
  expectedCloseAt: string | null;
  closedAt: string | null;
  ownerUserId: string | null;
  teamId: string | null;
  collaboratorUserIds: string[];
  forecastCategory: ForecastCategory;
  probabilityOverride: number | null;
  nextStep: string | null;
  lostReasonId: string | null;
  lostNote: string | null;
  tags: string[];
  stageEnteredAt: string;
  stalledAt: string | null;
  reopenedCount: number;
  quotationDocId: string | null;
  invoiceDocId: string | null;
  pendingApprovalRequestId: string | null;
  hasPendingLines: boolean;
  sourceKind: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DealLineInput = {
  name: string;
  qty: number;
  unitPriceSatang: number;
  discountBp?: number | null;
  productId?: string | null;
  vatRateBp?: number | null;
  note?: string | null;
};

export type DealLineDto = {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitPriceSatang: number;
  discountBp: number;
  vatRateBp: number | null;
  note: string | null;
  amountSatang: number;
  /** R-A: ราคาในคลังเปลี่ยนหลังบันทึกรายการนี้ (ป้าย "ราคาเปลี่ยน") */
  priceChanged: boolean;
  currentPriceSatang: number | null;
};

export type DealCardDto = {
  id: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  contactName: string;
  valueSatang: number;
  ownerUserId: string | null;
  ownerName: string | null;
  expectedCloseAt: string | null;
  stale: boolean;
  stalledAt: string | null;
  /** คะแนนของผู้ติดต่อหลัก (C2.8 เติมเหตุผล) */
  score: number;
  nextActivityAt: string | null;
  nextStep: string | null;
  kind: DealKind;
  stageId: string;
  probability: number;
  tags: string[];
};

export type StageDto = {
  id: string;
  name: string;
  kind: DealKind;
  probability: number;
  sortOrder: number;
  staleDays: number | null;
  requireFields: string[];
  requireLines: boolean;
  requireQuotation: boolean;
  color: string | null;
  description: string | null;
};

export type PipelineDto = { id: string; name: string; isDefault: boolean; archivedAt: string | null; stages: StageDto[] };

export type BoardColumnDto = {
  stageId: string;
  name: string;
  kind: DealKind;
  probability: number;
  count: number;
  sumSatang: number;
  weightedSatang: number;
  cards: DealCardDto[];
};

export type BoardDto = { pipeline: PipelineDto; columns: BoardColumnDto[] };

export type DealListInput = {
  pipelineId?: string | null;
  owner?: string | null;
  team?: string | null;
  stage?: string | null;
  closeFrom?: string | null;
  closeTo?: string | null;
  stale?: boolean | null;
  tag?: string | null;
  q?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  kind?: DealKind | null;
  f?: Record<string, string> | null;
  savedViewId?: string | null;
  sort?: string | null;
  cursor?: string | null;
  pageSize?: number | null;
};

export type DealListRow = DealCardDto & { pipelineId: string; stageName: string; forecastCategory: ForecastCategory };
export type DealListResult = { items: DealListRow[]; nextCursor: string | null };

export type ForecastRow = { key: string; label: string; valueSatang: number; weightedSatang: number; count: number };
export type ForecastResult = { groupBy: ForecastGroup; rows: ForecastRow[] };

export type DealHistoryRow = {
  id: string;
  fromStageId: string | null;
  fromStageName: string | null;
  toStageId: string;
  toStageName: string;
  byUserId: string | null;
  byName: string | null;
  bySource: string;
  enteredAt: string;
  leftAt: string | null;
  durationSec: number | null;
  note: string | null;
};

export type DealDocRow = { id: string; docType: string; docNo: string | null; status: string; grandTotal: number; paidTotal: number };
export type DealTimelineItem = { at: string; kind: "STAGE" | "ACTIVITY" | "DOC" | "CREATED"; title: string; detail: string | null };

export type Deal360 = {
  deal: DealDto;
  pipeline: { id: string; name: string };
  stages: (StageDto & { current: boolean })[];
  lines: DealLineDto[];
  pendingLines: DealLineInput[] | null;
  subtotalSatang: number;
  discountSatang: number;
  history: DealHistoryRow[];
  company: { id: string; name: string } | null;
  contact: { id: string; name: string };
  owner: { id: string; name: string } | null;
  collaborators: { id: string; name: string }[];
  lostReason: { id: string; label: string } | null;
  docs: DealDocRow[];
  timeline: DealTimelineItem[];
  /** §11.3: รายการเปลี่ยนหลังออกใบเสนอราคา ⇒ ป้าย "ต่างจากใบเสนอราคา" */
  quotationDiffers: boolean;
  // CRM C2.7 ▸ เอกสารบัญชีของดีลถูกยกเลิก (ธง = แท็ก `DEAL_VOIDED_TAG` ของดีล — ไม่มีคอลัมน์ · R-C.1) ◂
  documentVoided: boolean;
  /** CRM C2.7 ▸ เงินที่รับจริงของดีล (Σ แถวเงินที่ถูกนับ · สตางค์) — 0 = ยังไม่มีเงินเข้า ⇒ หน้าดีลไม่แสดงช่องนี้ ◂ */
  paidSatang: number;
  /** วันที่อยู่ในขั้นปัจจุบัน */
  daysInStage: number;
};

// ───────────────────────── วันที่ (ปฏิทินไทย → เที่ยงคืน UTC) ─────────────────────────

const TH_OFFSET_MS = 7 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "YYYY-MM-DD" | Date → เที่ยงคืน UTC ของ "วันตามปฏิทินไทย" (null = ไม่ระบุ)
 * Date = วันไทยของขณะนั้น (00:30 น. เวลาไทยวันที่ 31 = วันที่ 31 ไม่ใช่ 30) · สตริงต้องเป็นวันที่มีจริง
 * 🔴 ไม่ใช้ getDay()/getDate() ของเครื่อง — คิดจาก UTC + 7 ชม. เสมอ
 * คืน `undefined` เมื่อค่าที่ส่งมาอ่านไม่ออก (ผู้เรียกแปลงเป็นข้อความไทย)
 */
export function thaiDayUtc(v: unknown): Date | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return undefined;
    const t = new Date(v.getTime() + TH_OFFSET_MS);
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  }
  if (typeof v !== "string") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const out = new Date(Date.UTC(y, mo - 1, d));
  if (out.getUTCFullYear() !== y || out.getUTCMonth() !== mo - 1 || out.getUTCDate() !== d) return undefined;
  if (y < 2000 || y > 2200) return undefined;
  return out;
}

/** เที่ยงคืน UTC (วันไทย) → "YYYY-MM-DD" */
export function dayKey(d: Date | null | undefined): string | null {
  if (!d) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** วันนี้ตามปฏิทินไทย ("YYYY-MM-DD") */
export function thaiToday(now: Date = new Date()): string {
  return dayKey(thaiDayUtc(now) ?? null) ?? "";
}

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-10-31" → "31 ต.ค. 2569" */
export function formatThaiDay(key: string | null | undefined): string {
  const d = thaiDayUtc(key ?? null);
  if (!d) return "—";
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

/** "2026-10" → "ต.ค. 2569" */
export function formatThaiMonth(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key === FORECAST_NONE_KEY ? "ไม่ระบุวันปิด" : key;
  return `${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

/** สตางค์ → "฿1,234" (ไม่มีเศษเมื่อลงตัว) */
export function formatBaht(satang: number | null | undefined): string {
  const v = Number(satang ?? 0) / 100;
  return `฿${v.toLocaleString("th-TH", { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// ───────────────────────── รายการสินค้า (สูตรเดียวของทั้งระบบ) ─────────────────────────

/** ยอดของบรรทัด (สุทธิหลังส่วนลดบรรทัด · ก่อน VAT) = round(qty × unit × (10000 − bp) / 10000) */
export function lineAmountSatang(l: { qty: number; unitPriceSatang: number; discountBp?: number | null }): number {
  return Math.round((l.qty * l.unitPriceSatang * (10_000 - (l.discountBp ?? 0))) / 10_000);
}

/** ยอดก่อนหักส่วนลดของบรรทัด = round(qty × unit) (ใช้แปลงเป็น "ส่วนลดเป็นสตางค์" ของเอกสารบัญชี) */
export function lineGrossSatang(l: { qty: number; unitPriceSatang: number }): number {
  return Math.round(l.qty * l.unitPriceSatang);
}

/** มูลค่าดีล (สุทธิ ก่อน VAT) = Σ ยอดบรรทัด − round(Σ × ส่วนลดท้ายดีล / 10000) */
export function dealTotals(lines: { qty: number; unitPriceSatang: number; discountBp?: number | null }[], dealDiscountBp: number): { subtotalSatang: number; discountSatang: number; valueSatang: number } {
  const subtotalSatang = lines.reduce((s, l) => s + lineAmountSatang(l), 0);
  const discountSatang = Math.round((subtotalSatang * (dealDiscountBp || 0)) / 10_000);
  return { subtotalSatang, discountSatang, valueSatang: subtotalSatang - discountSatang };
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

/** ส่วนลด (bp) ผิดรูป → ข้อความไทย · ถูก → null */
export function discountBpProblem(v: unknown, what: string): string | null {
  if (v === undefined || v === null) return null;
  if (!isInt(v) || v < 0 || v > 10_000) return `ส่วนลด${what}ต้องเป็นจำนวนเต็ม 0–10000 (หน่วย 0.01 %) — เช่น 500 = 5 %`;
  return null;
}

/** บรรทัดที่ผ่านการตรวจแล้ว (พร้อมบันทึก) */
export type NormalizedDealLine = { name: string; qty: number; unitPriceSatang: number; discountBp: number; productId: string | null; vatRateBp: number | null; note: string | null };

/**
 * ตรวจชุดรายการสินค้า (X6) — คืนรายการที่ปรับรูปแล้ว + ยอด หรือข้อความไทยของปัญหาแรกที่เจอ
 * ใช้ทั้งฝั่งจอ (ตรวจก่อนกดบันทึก) และฝั่งบริการ (ตัวตัดสินจริง)
 */
export function checkDealLines(
  raw: unknown,
  dealDiscountBp: unknown,
): { ok: true; lines: NormalizedDealLine[]; dealDiscountBp: number; subtotalSatang: number; discountSatang: number; valueSatang: number } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "รายการสินค้าต้องเป็นรายการ (อาจว่างได้)" };
  if (raw.length > DEAL_LINES_MAX) return { ok: false, error: `ดีลหนึ่งใส่รายการได้ไม่เกิน ${DEAL_LINES_MAX} บรรทัด — แยกเป็นหลายดีลหรือรวมบรรทัดที่เหมือนกัน` };
  const dbpProblem = discountBpProblem(dealDiscountBp, "ท้ายดีล");
  if (dbpProblem) return { ok: false, error: dbpProblem };
  const dbp = isInt(dealDiscountBp) ? dealDiscountBp : 0;
  const lines: NormalizedDealLine[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const at = `บรรทัดที่ ${i + 1}`;
    const l = raw[i] as Record<string, unknown> | null;
    if (!l || typeof l !== "object") return { ok: false, error: `${at}: ข้อมูลรายการอ่านไม่ออก — ลองกรอกใหม่` };
    const name = typeof l.name === "string" ? l.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return { ok: false, error: `${at}: ใส่ชื่อสินค้า/บริการก่อน` };
    if (name.length > DEAL_LINE_NAME_MAX) return { ok: false, error: `${at}: ชื่อยาวเกิน ${DEAL_LINE_NAME_MAX} ตัวอักษร — ย่อให้สั้นลง` };
    const qty = typeof l.qty === "number" ? l.qty : Number.NaN;
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: `${at}: จำนวนต้องมากกว่า 0` };
    if (qty > DEAL_LINE_QTY_MAX) return { ok: false, error: `${at}: จำนวนสูงเกินที่ระบบเก็บได้ (ไม่เกิน ${DEAL_LINE_QTY_MAX.toLocaleString("th-TH")})` };
    const q3 = Math.round(qty * 1000) / 1000;
    if (q3 <= 0) return { ok: false, error: `${at}: จำนวนต้องมากกว่า 0 (ละเอียดได้ 3 ตำแหน่ง)` };
    const unit = l.unitPriceSatang;
    if (!isInt(unit) || unit < 0) return { ok: false, error: `${at}: ราคาต่อหน่วยต้องเป็นจำนวนเต็มสตางค์ตั้งแต่ 0 ขึ้นไป` };
    if (unit > DEAL_VALUE_MAX_SATANG) return { ok: false, error: `${at}: ราคาต่อหน่วยเกินเพดานมูลค่าดีล ${formatBaht(DEAL_VALUE_MAX_SATANG)}` };
    const bpProblem = discountBpProblem(l.discountBp, `ของ${at}`);
    if (bpProblem) return { ok: false, error: bpProblem };
    const bp = isInt(l.discountBp) ? l.discountBp : 0;
    const vat = l.vatRateBp;
    if (vat !== undefined && vat !== null && (!isInt(vat) || vat < -1 || vat > 10_000)) return { ok: false, error: `${at}: อัตราภาษีต้องเป็นจำนวนเต็ม (0 = 0 % · -1 = ยกเว้น · 700 = 7 %)` };
    const productId = typeof l.productId === "string" && l.productId.trim() ? l.productId.trim() : null;
    const note = typeof l.note === "string" && l.note.trim() ? l.note.trim() : null;
    if (note && note.length > DEAL_LINE_NOTE_MAX) return { ok: false, error: `${at}: หมายเหตุยาวเกิน ${DEAL_LINE_NOTE_MAX} ตัวอักษร` };
    if (lineGrossSatang({ qty: q3, unitPriceSatang: unit }) > DEAL_VALUE_MAX_SATANG) return { ok: false, error: `${at}: ยอดของบรรทัดเกินเพดานมูลค่าดีล ${formatBaht(DEAL_VALUE_MAX_SATANG)}` };
    lines.push({ name, qty: q3, unitPriceSatang: unit, discountBp: bp, productId, vatRateBp: isInt(vat) ? vat : null, note });
  }
  const t = dealTotals(lines, dbp);
  if (t.subtotalSatang > DEAL_VALUE_MAX_SATANG || t.valueSatang > DEAL_VALUE_MAX_SATANG) {
    return { ok: false, error: `มูลค่ารวม ${formatBaht(t.valueSatang)} เกินเพดานต่อดีล ${formatBaht(DEAL_VALUE_MAX_SATANG)} — แยกเป็นหลายดีล` };
  }
  return { ok: true, lines, dealDiscountBp: dbp, ...t };
}

/** ชุดรายการ → ลายนิ้วมือ (เทียบ "ต่างจากใบเสนอราคา") — ลำดับบรรทัดมีผล */
export function linesFingerprint(lines: { name: string; qty: number; unitPriceSatang: number; discountBp?: number | null }[], dealDiscountBp: number): string {
  return JSON.stringify([dealDiscountBp || 0, ...lines.map((l) => [l.name, Number(l.qty), l.unitPriceSatang, l.discountBp ?? 0])]);
}

/** บาท (ข้อความที่ผู้ใช้พิมพ์) → สตางค์ (null = อ่านไม่ออก) */
export function bahtTextToSatang(v: string): number | null {
  const s = v.replace(/[,\s฿]/g, "");
  if (!s) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return Number.isSafeInteger(n) ? n : null;
}
