import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/core/db";
import type { Prisma, PrismaClient, PosPayType } from "@prisma/client";
import * as coupon from "@/lib/modules/coupon/service";
import * as inventory from "@/lib/modules/inventory/service";
import { systemForUnit } from "@/lib/modules/system/service";
import { emitOutbox } from "@/lib/core/outbox";
import { scheduleDrain } from "@/lib/outbox-consumers";
// POS P1.6 ▸ ถอด VAT สูตรเดียวกับสะพานบัญชี (R1) ◂
import { splitIncludedVat } from "@/lib/money/vat";
import { parsePosPaymentSettings } from "./payment-settings";
// POS P1.9 ▸ ค่าตั้งกะ (otherSources) — ตัวอ่านเดียวกับ shift.ts ◂
import { parseShiftSettings } from "./shift";

// POS createSale — contract 2.1 (จุดตัดเงินกลาง). MVP: PAID_NOW
//
// ── M2.8: อะไรอยู่ใน tx ของบิล อะไรไปคิว (§9.1) ─────────────────────────────
// ใน tx (ต้องอะตอมมิกกับการรับเงิน — พลาดแล้วลูกค้าเสียของ/จ่ายเกิน):
//   คูปอง redeem · `member.applyOnSale` (voucher USED · แต้ม BURN · ตัดยอดบัตรกำนัล) · ยอดที่ต้องจ่าย
// นอก tx ผ่านคิว `pos.sale.paid` → `src/lib/member-bridges.ts` (ของแถมที่มาช้าได้):
//   ยอดใช้จ่ายสะสม · แต้มที่ได้ · สแตมป์ · ที่มาซื้อครั้งแรก · เลื่อนระดับ · ไทม์ไลน์
// 🔴 เหตุผล: กฎแต้ม/สแตมป์/ระดับพัง **ห้ามทำให้ขายของไม่ได้** — เงินเข้าก่อนเสมอ
//    ⇒ `pointEarned` ตอน commit จึงเป็น 0 เสมอ แล้วสะพานเขียนทับหลังคิวระบาย
type Client = PrismaClient | Prisma.TransactionClient;

async function withTx<T>(client: Client, fn: (tx: Client) => Promise<T>): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") {
    // POS P1.6 ▸ BLOCK รอล็อกแถวสินค้าในtx (คิวขายชิ้นสุดท้าย) — เวลา 5 วิปริยายของ Prisma ไม่พอ ◂
    return (client as PrismaClient).$transaction((tx) => fn(tx), { timeout: 20_000, maxWait: 10_000 });
  }
  return fn(client);
}

function bkkPeriod(): string {
  const d = new Date(Date.now() + 7 * 3600000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * สิทธิ์สมาชิกที่พนักงาน/ลูกค้า "เลือกใช้" กับบิลนี้ (M2.8 · §9.1)
 * ส่วนลดระดับไม่ต้องเลือก — ใช้อัตโนมัติทุกบิลของสมาชิก · ลำดับ/กันซ้อนอยู่ที่ `member.quoteApply`
 */
export type MemberSaleChoices = {
  voucherIds?: string[];
  points?: number;
  giftCard?: { number: string; pin: string; satang: number };
};

/** POS P1.2 R4: ตัวเลือกที่เลือกบนบรรทัด (สำเนา ณ เวลาขาย · priceDeltaSatang รวมอยู่ใน unitPriceSatang ของบรรทัดแล้ว) */
export type SaleLineOption = { choiceId: string; groupId: string; groupName: string; choiceName: string; priceDeltaSatang: number };
/** POS P1.2 R8: ส่วนประกอบของชุดต่อ 1 หน่วย (ตัดสต็อก qty × line.qty) */
export type SaleLineComponent = { invItemId: string; qty: number };

export type CreateSaleInput = {
  tenantId: string;
  unitId: string;
  systemId: string; // ระบบ POS
  pointSystemId?: string; // ระบบแต้ม (สำหรับสะสม) — null = ไม่สะสม
  memberId?: string;
  /** ระบบสมาชิกของบิลนี้ — ไม่ส่ง = หาจากสาขาเอง (บิลเดิมที่ส่งแค่ memberId ยังทำงานเหมือนเดิม) */
  memberSystemId?: string;
  /** สิทธิ์ที่เลือกใช้ — ไม่ส่ง = ได้ส่วนลดระดับอัตโนมัติอย่างเดียว */
  memberChoices?: MemberSaleChoices;
  sourceModule?: string;
  sourceId?: string;
  idempotencyKey: string;
  // itemId = InvItem.id ที่ผูก → ตัดสต็อก + COGS perpetual (null/ไม่ระบุ = รายการเพิ่มเอง/บริการ ไม่ตัดสต็อก)
  // serviceId = BookingService.id (บริการ) → ใช้แยกยอดสินค้า/บริการในรายงาน · ไม่ตัดสต็อก
  // productId = PosProduct.id (POS P1.3 ▸ หน้าขายใหม่ส่งมา · ฟิลด์เพิ่มแบบไม่บังคับ — ผู้เรียกเดิมไม่ส่ง = null เหมือนเดิม ◂)
  // note = หมายเหตุบรรทัด/เหตุผลส่วนลด (POS P1.6 R5 · ≤500 ตัว · ไม่ส่ง = null)
  // POS P1.2 (เพิ่มล้วน · ไม่ส่ง = เหมือนเดิม): options = สำเนาตัวเลือก → PosSaleLineOption · components = ส่วนประกอบชุด (ตัดสต็อกต่อส่วนประกอบ) ·
  //   weightGrams = น้ำหนักบรรทัดชั่ง (qty ต้องเป็น 1 · ตัดสต็อก itemId เป็นกรัม)
  lines: {
    name: string;
    qty: number;
    unitPriceSatang: number;
    discountSatang?: number;
    itemId?: string;
    serviceId?: string;
    productId?: string;
    note?: string;
    options?: SaleLineOption[];
    components?: SaleLineComponent[];
    weightGrams?: number;
  }[];
  billDiscountSatang?: number;
  // คูปอง (contract 2.3) — ต้องมาคู่กันเสมอ · ระบุแล้วใช้ไม่ได้ = โยน error (ห้ามขายต่อเงียบ ๆ)
  couponSystemId?: string;
  couponCode?: string;
  // POS P1.6 (เพิ่มล้วน · ไม่ส่ง = พฤติกรรมเดิม):
  //   cashTenderedSatang = เงินที่รับจริงของแถว CASH (≥ ยอดแถว · ทอน = รับ − ยอดแถว เก็บบนแถวนั้น) · reference = เลขอ้างอิงบัตร/EDC
  payMethods: { type: PosPayType; amountSatang: number; refSaleId?: string; cashTenderedSatang?: number; reference?: string }[];
  /** หมายเหตุบิล (≤500 ตัว) */
  note?: string;
  /** ค่าบริการ (สตางค์ · รวมอยู่ใน grandTotal และฐาน VAT) — ผู้เรียกคิดเอง · ไม่ส่ง = 0 (ผู้เรียกเดิมที่มีบรรทัดค่าบริการของตัวเองไม่โดนคิดซ้ำ) */
  serviceChargeSatang?: number;
  /** ทิป (สตางค์ · ไม่ใช่รายได้ · ไม่อยู่ใน grandTotal/ฐาน VAT) ⇒ Σ payMethods = grandTotal + tip (มติ §8 ข้อ 1) */
  tipSatang?: number;
  /**
   * POS P1.9 (S5/S6 · เพิ่มล้วน): กะที่บิลนี้ผูก — string = ล็อกแถวกะ FOR SHARE ในtx ของบิล (ไม่พบ/คนละร้าน-สาขา-ระบบ = SHIFT_REQUIRED ·
   * ไม่ OPEN = SHIFT_CLOSED) · null = ผู้เรียก (หน้าขาย) ตัดสินแล้วว่านอกกะ · ไม่ส่ง = ผู้เรียกเดิม: นอกกะเหมือนวันนี้ เว้นแต่ค่าตั้ง
   * `pos.shift.required.otherSources` เปิด (0 กะเปิด = SHIFT_REQUIRED · 1 กะ = ผูกกะนั้น · 2+ = นอกกะ)
   */
  shiftId?: string | null;
  /**
   * POS P1.17 (R6 · Q17.1 · เพิ่มล้วน): ผู้ขายของบิล (User.id) — เก็บตามที่ส่ง · ไม่ส่ง = null (ผู้เรียกเดิมไม่กระทบ)
   * ไม่อยู่ใน payload ของคีย์ซ้ำ (samePayload) ⇒ ความหมาย idempotency เดิมทุกไบต์ · รายงานพนักงาน (reports.ts) อ่าน
   */
  soldByUserId?: string;
};

export type SaleResult = {
  saleId: string;
  receiptNo: string | null;
  grandTotalSatang: number;
  pointEarned: number;
  /** POS P1.6 R6: สถานะของบิล — คีย์ซ้ำคืนบิลเดิมพร้อมสถานะจริง (บิลที่ถูก void = "VOIDED" ให้ผู้เรียกตัดสินเอง) */
  status?: string;
};

// ── POS P1.6: รหัสปฏิเสธของ createSale (โยนเป็น error ที่มี .code คงที่ · ข้อความไทยไม่มีศัพท์เทคนิค) ──
export type PosSaleErrorCode =
  | "VALIDATION"
  | "SPLIT_INVALID"
  | "PAYMENT_MISMATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "UNIT_SYSTEM_MISMATCH"
  | "STOCK_INSUFFICIENT"
  // POS P1.9: ไม่มีกะที่ใช้ได้ / กะปิดแล้ว (ขาย · void)
  | "SHIFT_REQUIRED"
  | "SHIFT_CLOSED"
  // POS P1.8 (§7 CD1): บิลที่คืนเงินไปแล้วบางส่วน void ทั้งใบไม่ได้ (ใช้การคืนส่วนที่เหลือแทน)
  | "HAS_REFUNDS";
export class PosSaleError extends Error {
  readonly code: PosSaleErrorCode;
  constructor(code: PosSaleErrorCode, message: string) {
    // PAYMENT_MISMATCH คงรูปข้อความเดิม ("PAYMENT_MISMATCH: …") — ผู้เรียกเดิมตรวจด้วย startsWith
    super(code === "PAYMENT_MISMATCH" ? `PAYMENT_MISMATCH: ${message}` : message);
    this.name = "PosSaleError";
    this.code = code;
  }
}
const MAX_PAY_METHODS = 10; // R2
const MAX_NOTE = 500; // R5
const MAX_REFERENCE = 100;
/** POS P1.2: เพดานตัวเลือก/ส่วนประกอบต่อบรรทัด (กันคำขอผิดปกติ) */
const MAX_LINE_OPTIONS = 20;
const MAX_LINE_COMPONENTS = 50;
/** ข้อความ O21 — ร้านมี POS หลายจุดแต่สาขานี้ไม่ได้ผูกกับจุดใด */
export const UNIT_SYSTEM_AMBIGUOUS_TH = "เลือกจุดขายก่อน — ร้านนี้มีจุดขายหลายจุด แต่สาขานี้ยังไม่ได้ผูกกับจุดขายใด";

const isNonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** ตรวจโครงฟิลด์ใหม่ของ P1.6 (ก่อนแตะตัวนับ) — ฟิลด์เดิมของผู้เรียกเดิมไม่ถูกตรวจเพิ่ม (กันผู้เรียกเดิมล้ม) */
function validateSaleInput(input: CreateSaleInput): void {
  const bad = (m: string) => new PosSaleError("VALIDATION", m);
  if (input.note !== undefined && input.note !== null && (typeof input.note !== "string" || input.note.length > MAX_NOTE)) throw bad(`หมายเหตุบิลยาวเกิน ${MAX_NOTE} ตัวอักษร`);
  for (const l of input.lines) {
    if (l.note !== undefined && l.note !== null && (typeof l.note !== "string" || l.note.length > MAX_NOTE)) throw bad(`หมายเหตุรายการยาวเกิน ${MAX_NOTE} ตัวอักษร`);
    // POS P1.2: ตรวจเฉพาะเมื่อส่งมา (ผู้เรียกเดิมไม่ส่ง = ไม่ถูกตรวจเพิ่ม)
    if (l.options !== undefined && l.options !== null) {
      const okText = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 200;
      if (!Array.isArray(l.options) || l.options.length > MAX_LINE_OPTIONS) throw bad(`ตัวเลือกต่อรายการได้ไม่เกิน ${MAX_LINE_OPTIONS}`);
      for (const o of l.options) {
        if (!o || !okText(o.choiceId) || !okText(o.groupId) || !okText(o.groupName) || !okText(o.choiceName) || !Number.isInteger(o.priceDeltaSatang)) throw bad("ข้อมูลตัวเลือกของรายการไม่ครบ");
      }
    }
    if (l.components !== undefined && l.components !== null) {
      if (!Array.isArray(l.components) || l.components.length > MAX_LINE_COMPONENTS) throw bad(`ส่วนประกอบต่อรายการได้ไม่เกิน ${MAX_LINE_COMPONENTS}`);
      const seen = new Set<string>();
      for (const c of l.components) {
        if (!c || typeof c.invItemId !== "string" || !c.invItemId || !Number.isInteger(c.qty) || c.qty < 1 || seen.has(c.invItemId)) throw bad("ส่วนประกอบของชุดไม่ถูกต้อง");
        seen.add(c.invItemId);
      }
    }
    if (l.weightGrams !== undefined && l.weightGrams !== null && (!Number.isInteger(l.weightGrams) || l.weightGrams < 1 || l.qty !== 1)) {
      throw bad("น้ำหนักต้องเป็นจำนวนเต็มกรัมตั้งแต่ 1 และจำนวนต้องเป็น 1");
    }
  }
  if (input.serviceChargeSatang !== undefined && !isNonNegInt(input.serviceChargeSatang)) throw bad("ค่าบริการต้องเป็นจำนวนเต็มสตางค์ ไม่ติดลบ");
  if (input.tipSatang !== undefined && !isNonNegInt(input.tipSatang)) throw bad("ทิปต้องเป็นจำนวนเต็มสตางค์ ไม่ติดลบ");
  if (!Array.isArray(input.payMethods)) throw bad("ไม่มีรายการชำระเงิน");
  if (input.payMethods.length > MAX_PAY_METHODS) throw new PosSaleError("SPLIT_INVALID", `แบ่งจ่ายได้ไม่เกิน ${MAX_PAY_METHODS} รายการ`);
  for (const p of input.payMethods) {
    if (!Number.isInteger(p.amountSatang)) throw bad("ยอดชำระต้องเป็นจำนวนเต็มสตางค์");
    if (p.reference !== undefined && p.reference !== null && (typeof p.reference !== "string" || p.reference.length > MAX_REFERENCE)) throw bad(`เลขอ้างอิงยาวเกิน ${MAX_REFERENCE} ตัวอักษร`);
    if (p.cashTenderedSatang === undefined || p.cashTenderedSatang === null) continue;
    if (p.type !== "CASH") throw bad("เงินที่รับมาใส่ได้เฉพาะรายการเงินสด");
    if (!isNonNegInt(p.cashTenderedSatang)) throw bad("เงินที่รับมาต้องเป็นจำนวนเต็มสตางค์");
    // R3: รับน้อยกว่าส่วนเงินสด = ยอดไม่ครบ (PAYMENT_MISMATCH ตามมติ — ไม่มีรหัส TENDER_TOO_LOW)
    if (p.cashTenderedSatang < p.amountSatang) throw new PosSaleError("PAYMENT_MISMATCH", `เงินที่รับ ${p.cashTenderedSatang} น้อยกว่าส่วนเงินสด ${p.amountSatang}`);
  }
}

/** payload ของคีย์ซ้ำเท่ากันไหม (R6) — ถุงบรรทัด (ราคา|จำนวน|ส่วนลด ไม่สนลำดับ) · ถุงวิธีจ่าย (ชนิด|ยอด) · สาขา/ระบบ · ค่าบริการ/ทิป */
function samePayload(
  input: CreateSaleInput,
  dup: {
    unitId: string;
    systemId: string;
    memberId: string | null;
    serviceChargeSatang: number;
    tipSatang: number;
    lines: { qty: number; unitPriceSatang: number; discountSatang: number; itemId: string | null; productId: string | null; serviceId: string | null; weightGrams: number | null }[];
    payments: { type: string; amountSatang: number }[];
  },
): boolean {
  const bag = (xs: string[]) => [...xs].sort().join(",");
  // R2 F6: บรรทัดเทียบ ราคา|จำนวน|ส่วนลด|สินค้าคลัง|สินค้า POS|บริการ · สมาชิกของบิลด้วย · P1.2: + น้ำหนัก (ไม่ส่ง = ว่าง = เทียบเหมือนเดิม)
  const tup = (l: { unitPriceSatang: number; qty: number; discountSatang?: number | null; itemId?: string | null; productId?: string | null; serviceId?: string | null; weightGrams?: number | null }) =>
    `${l.unitPriceSatang}|${l.qty}|${l.discountSatang ?? 0}|${l.itemId ?? ""}|${l.productId ?? ""}|${l.serviceId ?? ""}|${l.weightGrams ?? ""}`;
  return (
    dup.unitId === input.unitId &&
    dup.systemId === input.systemId &&
    (dup.memberId ?? null) === (input.memberId ?? null) &&
    dup.serviceChargeSatang === (input.serviceChargeSatang ?? 0) &&
    dup.tipSatang === (input.tipSatang ?? 0) &&
    bag(dup.lines.map(tup)) === bag(input.lines.map(tup)) &&
    bag(dup.payments.map((p) => `${p.type}|${p.amountSatang}`)) === bag(input.payMethods.map((p) => `${p.type}|${p.amountSatang}`))
  );
}

/**
 * R7 + O21 (มติเจ้าของ 4 ต.ค.) — ตัวตัดสินเดียวว่าบิลของสาขานี้ไปลง POS ไหน (createSale + ด่าน POS ก่อน claim ของผู้เรียก · R2 F1):
 *   สาขาผูก POS = POS นั้น (ส่ง systemId อื่นมา = ปฏิเสธ)
 *   สาขาไม่ผูก POS ใด: ร้านมี POS ใช้งาน 1 ตัว = ตัวนั้น (ส่ง systemId อื่นมา = ปฏิเสธ · R2 F6) · 0 ตัว = NO_POS · 2+ ตัว = "เลือกจุดขายก่อน"
 * อ่านอย่างเดียว · ไม่โยน
 */
export type PosSystemForSale =
  | { ok: true; systemId: string }
  | { ok: false; code: "NO_POS" | "UNIT_SYSTEM_MISMATCH"; message: string };
export async function posSystemForSale(tenantId: string, unitId: string, systemId?: string, db: Client = prisma): Promise<PosSystemForSale> {
  const link = await db.appSystemUnit.findUnique({
    where: { tenantId_unitId_type: { tenantId, unitId, type: "POS" } },
    select: { systemId: true },
  });
  if (link) {
    if (!systemId || link.systemId === systemId) return { ok: true, systemId: link.systemId };
    return { ok: false, code: "UNIT_SYSTEM_MISMATCH", message: "สาขานี้ผูกกับจุดขายอื่น — เลือกจุดขายของสาขานี้ก่อน" };
  }
  const pos = await db.appSystem.findMany({ where: { tenantId, type: "POS", active: true }, select: { id: true }, take: 2 });
  if (pos.length === 0) return { ok: false, code: "NO_POS", message: "ยังไม่ได้เปิดระบบขาย (POS)" };
  if (pos.length >= 2) return { ok: false, code: "UNIT_SYSTEM_MISMATCH", message: UNIT_SYSTEM_AMBIGUOUS_TH };
  if (systemId && pos[0]!.id !== systemId) return { ok: false, code: "UNIT_SYSTEM_MISMATCH", message: "จุดขายนี้ไม่ใช่จุดขายของร้านนี้ — เลือกจุดขายก่อน" };
  return { ok: true, systemId: pos[0]!.id };
}

async function assertUnitOfSystem(tx: Client, input: CreateSaleInput): Promise<void> {
  const r = await posSystemForSale(input.tenantId, input.unitId, input.systemId, tx);
  // ร้านไม่มี POS ใช้งานเลยแต่ผู้เรียกส่ง systemId มาเอง = พฤติกรรมเดิม (ไม่มีอะไรให้สับสน · ไม่เพิ่มคำปฏิเสธนอกมติ)
  if (!r.ok && r.code !== "NO_POS") throw new PosSaleError("UNIT_SYSTEM_MISMATCH", r.message);
}

/** R2 F2: สถานะของบิลที่ถือคีย์นี้ (null = ยังไม่มี) — ผู้เรียกใช้ตัดสินว่าจะออกคีย์ใหม่ไหม (เช่น ร้านอาหาร re-checkout หลัง void) */
export async function saleStatusByKey(tenantId: string, idempotencyKey: string, db: Client = prisma): Promise<string | null> {
  const s = await db.posSale.findUnique({ where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } }, select: { status: true } });
  return s?.status ?? null;
}

/**
 * อัตรา VAT (bp) ของบิลบนระบบ POS นี้ — กติกาเดียวกับสะพานบัญชี (applyExternalSale): ผูกสมุดที่เปิดการเชื่อมอยู่ + จด VAT
 * (ค่าปริยายของสมุดที่ไม่มีแถวตั้งค่า = จด 7% แบบเดียวกับ vatConfigOf) · ไม่ผูก/ไม่จด/อัตราผิดรูป = 0
 */
export async function posVatRateBp(db: Client, tenantId: string, posSystemId: string): Promise<number> {
  const link = await db.accountSystemLink.findFirst({
    where: { tenantId, linkedKind: "POS", linkedId: posSystemId, archivedAt: null, enabled: true },
    select: { systemId: true },
  });
  if (!link) return 0;
  const st = await db.accountSettings.findFirst({ where: { systemId: link.systemId }, select: { vatRegistered: true, vatRateBp: true } });
  const registered = st?.vatRegistered ?? true;
  const rate = st?.vatRateBp ?? 700;
  return registered && Number.isInteger(rate) && rate > 0 && rate <= 10_000 ? rate : 0;
}

/** R8: นโยบายขายเกินสต็อกของสาขา (`BusinessUnit.settings.pos.stock.oversellPolicy`) · ไม่ตั้ง/ค่าแปลก = ALLOW_NEGATIVE (วันนี้) */
export type OversellPolicy = "ALLOW_NEGATIVE" | "BLOCK";
export async function unitOversellPolicy(db: Client, tenantId: string, unitId: string): Promise<OversellPolicy> {
  const u = await db.businessUnit.findFirst({ where: { id: unitId, tenantId }, select: { settings: true } });
  const st = u?.settings as { pos?: { stock?: { oversellPolicy?: unknown } } } | null | undefined;
  return st?.pos?.stock?.oversellPolicy === "BLOCK" ? "BLOCK" : "ALLOW_NEGATIVE";
}

const isUniqueViolation = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";

/**
 * POS P1.9 (S5/S6): กะของบิล — เรียกในtx ของบิล หลังค้นคีย์ซ้ำ (ลองซ้ำบิลที่ commit ในกะที่ปิดไปแล้ว = คืนบิลเดิม) และก่อนตัวนับใบเสร็จ
 * ล็อกแถวกะ FOR SHARE ⇒ closeShift (FOR UPDATE) รอบิลที่กำลังบันทึก · บิลที่ commit แล้วทุกใบอยู่ใน Z
 */
async function bindSaleShift(tx: Client, input: CreateSaleInput): Promise<string | null> {
  if (typeof input.shiftId === "string") {
    const rows = await tx.$queryRaw<{ status: string; tenantId: string; unitId: string; systemId: string }[]>`
      SELECT status::text AS status, "tenantId", "unitId", "systemId" FROM "PosShift" WHERE id = ${input.shiftId} FOR SHARE`;
    const r = rows[0];
    if (!r || r.tenantId !== input.tenantId || r.unitId !== input.unitId || r.systemId !== input.systemId) {
      throw new PosSaleError("SHIFT_REQUIRED", "ไม่พบกะของเครื่องนี้ — เปิดกะก่อนเริ่มขาย");
    }
    if (r.status !== "OPEN") throw new PosSaleError("SHIFT_CLOSED", "กะนี้ปิดแล้ว — เปิดกะใหม่ก่อนขาย");
    return input.shiftId;
  }
  if (input.shiftId === null) return null;
  // ผู้เรียกเดิม (ไม่ส่ง shiftId): ค่าปริยาย otherSources = false ⇒ นอกกะเหมือนวันนี้ ไม่ถูกปฏิเสธ
  const sys = await tx.appSystem.findFirst({ where: { id: input.systemId, tenantId: input.tenantId }, select: { settings: true } });
  if (!parseShiftSettings(sys?.settings).requiredOtherSources) return null;
  const open = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "PosShift" WHERE "tenantId" = ${input.tenantId} AND "unitId" = ${input.unitId} AND status = 'OPEN'
    ORDER BY "openedAt", id LIMIT 2 FOR SHARE`;
  if (open.length === 0) throw new PosSaleError("SHIFT_REQUIRED", "สาขานี้ยังไม่มีกะที่เปิดอยู่ — เปิดกะก่อนรับเงิน");
  return open.length === 1 ? open[0]!.id : null; // 2+ ลิ้นชักเปิดอยู่ = ไม่เดา (นอกกะ · O24)
}

type MemberFacade = typeof import("@/lib/modules/member");
type AppliedRights = Awaited<ReturnType<MemberFacade["applyOnSale"]>>;

/**
 * ใช้สิทธิ์สมาชิกกับบิล — คืน `null` เมื่อ "แนบชื่อลูกค้าไว้เฉย ๆ แต่คนนี้ไม่ได้อยู่ในระบบสมาชิกของสาขานี้"
 *
 * 🔴 ทำไมต้องยอมข้าม: บิลเดิมจำนวนมาก (โรงแรม/ร้านอาหาร/คลินิก) แนบ `memberId` ของลูกค้าที่อยู่คนละ
 *    ระบบสมาชิก หรือร้านเพิ่งเปิดระบบสมาชิกทีหลัง — ก่อน M2.8 บิลพวกนี้ขายผ่าน ถ้าจู่ ๆ ล้มทั้งใบ
 *    จะกลายเป็น "เก็บเงินลูกค้าไม่ได้" เพราะเรื่องสะสมแต้ม
 * 🔴 แต่ถ้าพนักงาน **สั่งใช้สิทธิ์มาจริง** (voucher/แต้ม/บัตรกำนัล) ต้องโยนเสมอ — เงียบ = ลูกค้าจ่ายเต็ม
 *    ทั้งที่หน้าจอบอกว่าได้ส่วนลด
 */
async function applyMemberRights(
  member: MemberFacade,
  askedNothing: boolean,
  run: () => Promise<AppliedRights>,
): Promise<AppliedRights | null> {
  try {
    return await run();
  } catch (e) {
    if (askedNothing && e instanceof member.MemberNotFoundError) return null;
    throw e;
  }
}

export async function createSale(input: CreateSaleInput, client: Client = prisma): Promise<SaleResult> {
  // เราเปิด tx เอง (client = prisma) → drain outbox ได้หลัง commit · ถ้าถูกเรียกใน tx ผู้อื่น ปล่อยให้ cron เก็บ
  const ownsTx = "$transaction" in client && typeof (client as PrismaClient).$transaction === "function";
  // POS P1.6 I7: คีย์เดียวกันพร้อมกันถูกเรียงคิวด้วย advisory lock ต่อ (ร้าน, คีย์) ก่อนค้นคีย์ซ้ำ (R2 F4 · ทั้งสองโหมด) ⇒ ไม่มี P2002 ของคีย์
  //   ที่ยังเหลือ: P2002 ของแถวตัวนับใบเสร็จเดือนใหม่ (สองบิลคนละคีย์ upsert แถวเดียวกันพร้อมกัน) — ลองใหม่ได้เฉพาะเมื่อเราเป็นเจ้าของ tx
  for (let attempt = 0; ; attempt++) {
    try {
      return await createSaleOnce(input, client, ownsTx);
    } catch (e) {
      if (ownsTx && attempt < 3 && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}

async function createSaleOnce(input: CreateSaleInput, client: Client, ownsTx: boolean): Promise<SaleResult> {
  const result = await withTx(client, async (tx): Promise<SaleResult> => {
    // R2 F4: เรียงคิวคีย์เดียวกัน (ปล่อยเองตอน tx จบ · ใช้ได้ทั้ง tx ของเราและของผู้เรียก)
    await tx.$queryRaw`SELECT 1 AS x FROM (SELECT pg_advisory_xact_lock(hashtext(${input.tenantId}::text || ':' || ${input.idempotencyKey}::text))) l`;
    // idempotent (R6 · มติ §8 ข้อ 3): payload เดิม = คืนบิลเดิมพร้อมสถานะจริง (VOIDED ก็คืน — ผู้เรียกตัดสินเอง) · payload ต่าง = IDEMPOTENCY_CONFLICT
    const dup = await tx.posSale.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
      include: {
        lines: { select: { qty: true, unitPriceSatang: true, discountSatang: true, itemId: true, productId: true, serviceId: true, weightGrams: true } },
        payments: { select: { type: true, amountSatang: true } },
      },
    });
    if (dup) {
      if (!samePayload(input, dup)) {
        throw new PosSaleError("IDEMPOTENCY_CONFLICT", "มีบิลของรหัสรายการนี้อยู่แล้วแต่รายการ/ยอด/วิธีจ่ายไม่ตรงกัน — ตรวจบิลเดิมก่อน ห้ามขายซ้ำ");
      }
      return {
        saleId: dup.id,
        receiptNo: dup.receiptNo,
        grandTotalSatang: dup.grandTotalSatang,
        pointEarned: dup.pointEarned,
        status: dup.status,
      };
    }

    // ── P1.6: โครงฟิลด์ใหม่ + สาขา↔ระบบ (R7/O21) — ทั้งหมดก่อนแตะตัวนับใบเสร็จ ──
    validateSaleInput(input);
    await assertUnitOfSystem(tx, input);
    // R4 H5: ทิปต้องเปิดที่ค่าตั้งของ POS นี้ (ผู้เรียกเดิมข้ามหน้าขายไม่ได้) — ปิด = VALIDATION ก่อนแตะตัวนับ
    if ((input.tipSatang ?? 0) > 0) {
      const sys = await tx.appSystem.findFirst({ where: { id: input.systemId, tenantId: input.tenantId }, select: { settings: true } });
      if (!parsePosPaymentSettings(sys?.settings).tip.enabled) throw new PosSaleError("VALIDATION", "จุดขายนี้ยังไม่เปิดรับทิป");
    }
    // POS P1.9 ▸ กะ (S5/S6) — หลังค้นคีย์ซ้ำ · ก่อนล็อกสินค้า/ตัวนับใบเสร็จ ◂
    const shiftId = await bindSaleShift(tx, input);

    const lines = input.lines.map((l) => ({
      ...l,
      discountSatang: l.discountSatang ?? 0,
      lineTotalSatang: l.unitPriceSatang * l.qty - (l.discountSatang ?? 0),
    }));
    const subtotal = lines.reduce((s, l) => s + l.lineTotalSatang, 0);
    const billDiscount = input.billDiscountSatang ?? 0;

    // ── คูปอง (contract 2.1/2.3): หักก่อน VAT · ฐาน = subtotal หลังส่วนลดบรรทัด+ท้ายบิล ──
    // validate (read-only) ที่นี่เพื่อได้ยอดส่วนลด + ล้มเสียงดังก่อนสร้างบิล · redeem ตัวจริงอยู่ใน tx หลังสร้างบิล
    const couponBase = subtotal - billDiscount;
    const hasCoupon = !!(input.couponSystemId || input.couponCode);
    let couponDiscount = 0;
    if (hasCoupon) {
      if (!input.couponSystemId || !input.couponCode) {
        throw new Error("คูปองใช้ไม่ได้: ต้องระบุทั้งระบบคูปองและโค้ดคูปอง");
      }
      const v = await coupon.validate({
        code: input.couponCode,
        tenantId: input.tenantId,
        systemId: input.couponSystemId,
        memberId: input.memberId ?? null,
        amountSatang: couponBase,
        unitId: input.unitId,
      });
      if (!v.ok) throw new Error(`คูปองใช้ไม่ได้: ${coupon.couponReasonText(v.reason)}`);
      couponDiscount = v.discountSatang;
    }

    // R4: ค่าบริการอยู่ในยอดบิล+ฐาน VAT · ทิปอยู่นอกยอดบิล (Σจ่าย = ยอด + ทิป · มติ §8 ข้อ 1)
    const serviceCharge = input.serviceChargeSatang ?? 0;
    const tip = input.tipSatang ?? 0;
    // R1: VAT ถอดจากยอดสุทธิด้วยสูตรเดียวกับสะพานบัญชี (ราคารวม VAT แล้ว ⇒ ไม่บวกเพิ่ม)
    const vatRateBp = await posVatRateBp(tx, input.tenantId, input.systemId);
    const paidSum = input.payMethods.reduce((s, p) => s + p.amountSatang, 0) - tip;
    const beforeMember = subtotal - billDiscount - couponDiscount + serviceCharge;

    // ── ระบบสมาชิกของบิลนี้ (M2.8) ──
    // ไม่มี memberId = ไม่ยิง query เพิ่มแม้แต่ครั้งเดียว ⇒ บิล walk-in เดินเส้นทางเดิมทุกประการ
    const memberSystemId = input.memberId
      ? (input.memberSystemId ?? (await systemForUnit(input.tenantId, input.unitId, "MEMBER", tx)))
      : null;

    // ไม่มีสิทธิ์สมาชิกให้หัก → ตัดจบก่อนแตะตัวนับเลขใบเสร็จ (พฤติกรรมเดิมของ PAYMENT_MISMATCH)
    if (!memberSystemId && paidSum !== beforeMember) {
      throw new Error(`PAYMENT_MISMATCH: จ่าย ${paidSum} ≠ ยอด ${beforeMember}`);
    }

    // POS P1.2 R2 F1: ส่วนประกอบชุดต้องอยู่ในคลังของสาขาที่ขายทุกชิ้น (ผู้เรียกอื่นนอกหน้าขายก็เช่นกัน) — สาขาไม่มีคลัง/ชิ้นนอกคลัง = VALIDATION ไม่มีบิล
    const compIds = [...new Set(lines.flatMap((l) => (l.components ?? []).map((c) => c.invItemId)))];
    if (compIds.length) {
      const compInv = await systemForUnit(input.tenantId, input.unitId, "INVENTORY", tx);
      const here = compInv ? await tx.invItem.count({ where: { tenantId: input.tenantId, systemId: compInv, id: { in: compIds } } }) : 0;
      if (here !== compIds.length) throw new PosSaleError("VALIDATION", "ชุดนี้มีส่วนประกอบที่ไม่อยู่ในคลังของสาขานี้ — ขายชุดนี้ที่สาขานี้ไม่ได้");
    }

    // ── R8 BLOCK: ล็อกแถวสินค้า (ลำดับ id ตายตัว · ก่อนตัวนับ ⇒ ลำดับล็อกเดียวกันทุกบิล ไม่ deadlock) แล้วตรวจยอดคงเหลือ ──
    let blockInv: { tenantId: string; systemId: string } | null = null;
    // R2 F3: ตัดในtx เฉพาะสินค้าที่อยู่ในชุดที่ล็อกได้และไม่ใช่บริการ — ที่เหลือ (ไม่พบในคลังนี้/บริการ) เดินทางเดิมหลัง commit ไม่ทำให้บิลล้ม
    const blockItemIds = new Set<string>();
    // POS P1.2: ความต้องการสต็อกต่อ InvItem = บรรทัดผูกคลัง (จำนวน หรือ กรัมของบรรทัดชั่ง) + ส่วนประกอบชุด (qty × จำนวน)
    const stockParts = lines.flatMap((l) => lineConsumption("", { id: "", itemId: l.itemId ?? null, qty: l.qty, weightGrams: l.weightGrams ?? null, components: l.components ?? null }));
    if (stockParts.length > 0 && (await unitOversellPolicy(tx, input.tenantId, input.unitId)) === "BLOCK") {
      const invSystemId = await systemForUnit(input.tenantId, input.unitId, "INVENTORY", tx);
      if (invSystemId) {
        blockInv = { tenantId: input.tenantId, systemId: invSystemId };
        const need = new Map<string, number>();
        for (const p of stockParts) need.set(p.itemId, (need.get(p.itemId) ?? 0) + Math.round(p.qty));
        await inventory.lockItemsInTx(tx as Prisma.TransactionClient, blockInv, [...need.keys()]);
        const items = await tx.invItem.findMany({
          where: { tenantId: input.tenantId, systemId: invSystemId, id: { in: [...need.keys()] } },
          select: { id: true, name: true, onHand: true, kind: true },
        });
        for (const it of items) {
          if (it.kind === "SERVICE") continue; // บริการไม่มีสต็อก (ตัดไม่ได้อยู่แล้ว)
          blockItemIds.add(it.id);
          const want = need.get(it.id) ?? 0;
          if (it.onHand < want) throw new PosSaleError("STOCK_INSUFFICIENT", `สินค้าในสต็อกไม่พอ: "${it.name}" เหลือ ${it.onHand} ต้องการ ${want}`);
        }
      }
    }

    // เลขใบเสร็จรันต่อ unit/เดือน
    const period = bkkPeriod();
    const counter = await tx.posReceiptCounter.upsert({
      where: { unitId_period: { unitId: input.unitId, period } },
      create: { tenantId: input.tenantId, unitId: input.unitId, period, seq: 1 },
      update: { seq: { increment: 1 } },
    });
    const receiptNo = `${period}-${String(counter.seq).padStart(4, "0")}`;

    const sale = await tx.posSale.create({
      data: {
        tenantId: input.tenantId,
        unitId: input.unitId,
        systemId: input.systemId,
        memberId: input.memberId,
        sourceModule: input.sourceModule ?? "POS",
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        receiptNo,
        status: "PAID",
        subtotalSatang: subtotal,
        discountSatang: billDiscount + couponDiscount,
        vatSatang: splitIncludedVat(beforeMember, vatRateBp).vatSatang,
        grandTotalSatang: beforeMember,
        serviceChargeSatang: serviceCharge,
        tipSatang: tip,
        note: input.note ?? null,
        paidAt: new Date(),
        shiftId,
        soldByUserId: input.soldByUserId ?? null, // POS P1.17 ▸ R6 ◂
      },
    });
    // POS P1.2: บรรทัดที่มีตัวเลือกต้องรู้ id ตั้งแต่ตอนเขียน (ผูก PosSaleLineOption ในtx เดียวกัน)
    //   R2 F2: บิลที่มีตัวเลือก = ตั้ง id ให้ "ทุกบรรทัด" แบบเรียงตามลำดับบรรทัด (ฐานเดียวกัน + เลขลำดับความยาวคงที่) ⇒ อ่านกลับ orderBy id
    //   ได้ลำดับตะกร้าเดิม (ไม่ปน UUID/cuid) · บิลที่ไม่มีตัวเลือกใช้ id ปริยายแบบเดิม (ผู้เรียกเดิมไม่เปลี่ยน)
    const lineIds = lines.some((l) => l.options && l.options.length) ? orderedLineIds(lines.length) : lines.map(() => undefined);
    await tx.posSaleLine.createMany({
      data: lines.map((l, i) => ({
        ...(lineIds[i] ? { id: lineIds[i] } : {}),
        tenantId: input.tenantId, unitId: input.unitId, saleId: sale.id, name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, discountSatang: l.discountSatang, lineTotalSatang: l.lineTotalSatang, itemId: l.itemId ?? null, serviceId: l.serviceId ?? null, productId: l.productId ?? null, note: l.note ?? null,
        weightGrams: l.weightGrams ?? null,
        ...(l.components && l.components.length ? { components: l.components.map((c) => ({ invItemId: c.invItemId, qty: c.qty })) } : {}),
      })),
    });
    const optionRows = lines.flatMap((l, i) =>
      (l.options ?? []).map((o) => ({ tenantId: input.tenantId, saleId: sale.id, lineId: lineIds[i]!, choiceId: o.choiceId, groupId: o.groupId, groupName: o.groupName, choiceName: o.choiceName, priceDeltaSatang: o.priceDeltaSatang })),
    );
    if (optionRows.length) await tx.posSaleLineOption.createMany({ data: optionRows });

    // ── ใช้สิทธิ์สมาชิกจริง (M2.8 · §9.1) — ในtx เดียวกับบิล ──
    // 🔴 บิลถูกเขียนก่อนเพราะ voucher/แต้ม/บัตรกำนัลต้องผูก `saleId` ที่มีอยู่จริง (ร่องรอยย้อนกลับได้)
    //    ยอดที่ต้องจ่ายจึงถูก "แก้ทีหลัง" ในtx เดียวกัน — ผิดเมื่อไหร่ rollback ทั้งใบ ไม่มีบิลค้าง
    // 🔴 ส่ง `cart` เข้าไปเสมอ (หนี้จาก M2.7): ส่วนลดระดับคิดจากยอดตะกร้า ห้ามให้ฝั่งสมาชิกไปเดาเอง
    let memberDiscount = 0;
    let tierDiscountSatang = 0;
    let voucherUseIds: string[] = [];
    let giftCardTxnId: string | null = null;
    if (input.memberId && memberSystemId) {
      // dynamic import: `member/index` → wallet → giftcard → `pos/index` = วงกลมของโมดูล
      // (เรียกตอนใช้งานเท่านั้น ⇒ ลำดับการโหลดไฟล์ไม่มีทางได้ facade ที่ยังประกอบไม่เสร็จ)
      const member = await import("@/lib/modules/member");
      const mctx = { tenantId: input.tenantId, systemId: memberSystemId, actorUserId: null };
      const customerId = input.memberId;
      const ch = input.memberChoices ?? {};
      // "ไม่ได้สั่งใช้สิทธิ์อะไรเลย" = แนบชื่อลูกค้าไว้เฉย ๆ (ทางเดิมของ POS ตั้งแต่ก่อน M2.8)
      const askedNothing = (ch.voucherIds ?? []).length === 0 && !(ch.points && ch.points > 0) && !ch.giftCard;
      const applied = await applyMemberRights(member, askedNothing, () =>
        member.applyOnSale(
          mctx,
          {
            saleId: sale.id,
            customerId,
            unitId: input.unitId,
            choices: ch,
            cart: {
              unitId: input.unitId,
              // ส่งโค้ดคูปองไปด้วยเพื่อให้กติกา "ห้ามใช้ voucher ซ้อนคูปอง" ตัดสินได้ (§11.5)
              // — ตัวส่วนลดคูปองยังเป็นของ POS เหมือนเดิม (หักออกจากยอดสิทธิ์ด้านล่าง ไม่นับซ้ำ)
              couponCode: hasCoupon ? input.couponCode : null,
              lines: lines.map((l) => ({
                name: l.name,
                qty: l.qty,
                unitPriceSatang: l.unitPriceSatang,
                discountSatang: l.discountSatang,
                itemId: l.itemId ?? null,
                serviceId: l.serviceId ?? null,
              })),
            },
          },
          tx as Prisma.TransactionClient,
        ),
      );
      if (applied) {
        // voucher ที่ใช้อยู่ห้ามซ้อนคูปอง → ล้มทั้งบิลพร้อมเหตุผลไทย (ห้ามตัด voucher แล้วขายต่อเงียบ ๆ)
        const couponConflict = applied.conflicts.find((c) => c.kind === "COUPON");
        if (hasCoupon && couponConflict && applied.voucherUseIds.length > 0) {
          throw new Error(couponConflict.message);
        }
        // ส่วนลดคูปองถูกคิดที่ POS ไปแล้ว — หักบรรทัดคูปองออกจากยอดสิทธิ์ ไม่งั้นลดสองรอบ
        const couponLine = applied.lines.find((l) => l.kind === "COUPON");
        memberDiscount = applied.totalDiscountSatang - (couponLine?.discountSatang ?? 0);
        tierDiscountSatang = applied.tierDiscountSatang;
        voucherUseIds = applied.voucherUseIds;
        giftCardTxnId = applied.giftCardTxnId;
      }
    }

    const grandTotal = beforeMember - memberDiscount;
    if (paidSum !== grandTotal) {
      throw new Error(`PAYMENT_MISMATCH: จ่าย ${paidSum} ≠ ยอด ${grandTotal}`);
    }
    if (memberDiscount > 0 || tierDiscountSatang > 0 || voucherUseIds.length > 0 || giftCardTxnId) {
      await tx.posSale.update({
        where: { id: sale.id },
        data: {
          discountSatang: billDiscount + couponDiscount + memberDiscount,
          grandTotalSatang: grandTotal,
          vatSatang: splitIncludedVat(grandTotal, vatRateBp).vatSatang,
          tierDiscountSatang,
          voucherUseIds,
          giftCardTxnId,
        },
      });
    }

    await tx.posPayment.createMany({
      data: input.payMethods.map((p) => {
        // R3 (มติ §8 ข้อ 2): เงินรับ/ทอนอยู่บนแถว CASH ของตัวเอง · แถวอื่น/ไม่ส่ง = null
        const tendered = p.type === "CASH" && isNonNegInt(p.cashTenderedSatang) ? p.cashTenderedSatang : null;
        return {
          tenantId: input.tenantId,
          unitId: input.unitId,
          saleId: sale.id,
          type: p.type,
          amountSatang: p.amountSatang,
          refSaleId: p.refSaleId,
          reference: p.reference ?? null,
          tenderedSatang: tendered,
          changeSatang: tendered === null ? null : tendered - p.amountSatang,
        };
      }),
    });

    // R8 BLOCK: ตัดสต็อกในtx เดียวกับบิล (ล็อกถือไว้แล้ว) — คีย์ต่อบรรทัดเดียวกับการตัดหลัง commit ⇒ ตัวหลัง commit เจอคีย์เดิม
    //   ไม่ตัดซ้ำ แต่ยังโพสต์ต้นทุน (GL) + sync สินค้าบัญชีให้ (inventory.consume เส้นเดิม)
    if (blockInv) {
      // POS P1.2: ส่วนประกอบชุดตัดต่อส่วนประกอบ (คีย์ pos-consume-<sale>-<line>-<invItem>) · บรรทัดชั่งตัดเป็นกรัม — คีย์เดียวกับการตัดหลัง commit
      const saved = await tx.posSaleLine.findMany({ where: { saleId: sale.id }, select: { id: true, itemId: true, qty: true, weightGrams: true, components: true } });
      for (const part of saved.flatMap((l) => lineConsumption(sale.id, l))) {
        if (!blockItemIds.has(part.itemId)) continue;
        await inventory.consumeInTx(tx as Prisma.TransactionClient, blockInv, {
          itemId: part.itemId,
          qty: part.qty,
          sourceModule: "POS",
          refType: "PosSale",
          refId: sale.id,
          idempotencyKey: part.key,
        });
      }
    }

    // คูปอง: redeem ตัวจริง (atomic re-validate) ผูกกับบิล — ใน tx เดียวกัน · ล้ม = rollback ทั้งบิล
    if (hasCoupon) {
      const r = await coupon.redeem(
        {
          code: input.couponCode!,
          tenantId: input.tenantId,
          systemId: input.couponSystemId!,
          memberId: input.memberId ?? null,
          amountSatang: couponBase,
          unitId: input.unitId,
          saleId: sale.id,
          refType: "PosSale",
          refId: sale.id,
          status: "REDEEMED",
        },
        tx as Prisma.TransactionClient,
      );
      if (!r.ok) throw new Error(`คูปองใช้ไม่ได้: ${coupon.couponReasonText(r.reason)}`);
    }

    // outbox: ยอดขาย → บัญชี (contract 2.4) + สะพานสมาชิก (M2.8) — เขียน event ใน tx เดียวกับบิล (atomic)
    await emitOutbox(tx as Prisma.TransactionClient, {
      tenantId: input.tenantId,
      type: "pos.sale.paid",
      idempotencyKey: `PosSale#${sale.id}#PAID`,
      payload: { saleId: sale.id },
      systemId: input.systemId,
      unitId: input.unitId,
    });

    // 🔴 แต้ม/ยอดสะสม/ไทม์ไลน์ **ไม่อยู่ที่นี่แล้ว** (M2.8) — ดูหมายเหตุหัวไฟล์
    //    `pointEarned` = 0 ตอน commit เสมอ · `src/lib/member-bridges.ts` เขียนค่าจริงหลังคิวระบาย
    return { saleId: sale.id, receiptNo, grandTotalSatang: grandTotal, pointEarned: 0, status: "PAID" };
  });

  // ── หลัง tx commit: ตัดสต็อก (perpetual) + post บัญชี ──
  // ทำเฉพาะเมื่อ createSale เป็นเจ้าของ tx (ownsTx = commit แน่แล้ว) — ถ้าถูกเรียกใน tx ผู้อื่น
  //   ปล่อยให้ flow นั้นจัดการ (เลี่ยง orphan movement ถ้า tx นอกโดน rollback)
  if (ownsTx) {
    // ตัดสต็อกเฉพาะบิลที่มี line ผูก itemId — inventory.consume เปิด tx เอง + โพสต์ COGS หลัง tx
    //   (P1.6 BLOCK: ตัดไปแล้วในtx ของบิล — คีย์เดิมคืนรายการเดิม ไม่ตัดซ้ำ แต่ยังโพสต์ COGS ให้)
    //   (Dr5000/Cr1200 ผ่าน bridge) จึงทำนอก tx ของบิล = เลี่ยง nested tx
    if (input.lines.some((l) => l.itemId || (l.components && l.components.length))) await consumeSaleInventory(input.tenantId, input.unitId, result.saleId);
    scheduleDrain(); // post ยอดขาย→บัญชี · cron /api/cron/outbox เก็บตกถ้าล้ม
  }
  return result;
}

// HF-INV-1 ▸ R3.3: รหัสสั้นของสาเหตุ (SQLSTATE/รหัส Prisma/ชื่อ error) สำหรับบรรทัด log — ไม่ใส่ข้อความ (อาจมีชื่อสินค้า) ◂
function stockErrorCode(e: unknown): string {
  for (let cur: unknown = e, d = 0; cur && typeof cur === "object" && d < 5; d++) {
    const o = cur as { code?: unknown; cause?: unknown; meta?: { code?: unknown } };
    if (typeof o.code === "string" && o.code) return o.meta && typeof o.meta.code === "string" ? `${o.code}/${o.meta.code}` : o.code;
    cur = o.cause;
  }
  return e instanceof Error ? e.name : "unknown";
}

/**
 * POS P1.2 R2 F2: id บรรทัดของบิลหนึ่งที่เรียงตามลำดับบรรทัดเสมอ — `c` + เวลา (base36 ยาวคงที่) + สุ่ม 12 hex + ลำดับ 4 หลัก
 * (ตัวเลข/อักษรเล็กล้วน ความยาวเท่ากันทุกตัว ⇒ เรียงแบบสตริงตรงกับลำดับบรรทัดในทุก collation)
 */
function orderedLineIds(n: number): string[] {
  const base = `c${Date.now().toString(36).padStart(9, "0")}${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  return Array.from({ length: n }, (_, i) => `${base}${String(i).padStart(4, "0")}`);
}

// ── ตัดสต็อกของบิล (perpetual) — เรียกหลัง createSale commit เท่านั้น ──
// เฉพาะบิล PAID + line ที่ผูก itemId · idempotent ต่อ line (pos-consume-<saleId>-<lineId>) → retry/replay ไม่ตัดซ้ำ
//   (ดึง line จาก DB → รองรับ retry หลัง crash: บิลถูกสร้างแล้วแต่ยังไม่ตัดสต็อก ก็ตัดครบ)
// ไม่มีระบบ INVENTORY ผูก unit → ไม่ตัด (ขายบริการ/ร้านไม่ใช้คลัง — ปกติ ไม่ error)
// สต็อกไม่พอ → inventory.consume ยอมติดลบ ไม่ block (เงินสำคัญกว่า · ตั้งธง needsReview ให้ร้านเคลียร์)
// ตัดล้มรายบรรทัด (เช่น item ถูกลบ) → catch ไว้ (บิลชำระแล้ว ห้าม rollback การขาย)
/**
 * POS P1.2 — การตัดสต็อกของบรรทัดหนึ่ง (ตัวกำหนดเดียว: ตัดหลัง commit · ตัดในtx แบบ BLOCK · registerStatus นับคีย์เดียวกัน)
 *   บรรทัดผูกคลัง (itemId) = 1 ส่วน จำนวน = กรัม (บรรทัดชั่ง) หรือ qty · คีย์ `pos-consume-<saleId>-<lineId>` (เดิม)
 *   ส่วนประกอบชุด = 1 ส่วนต่อ InvItem จำนวน = qty × line.qty · คีย์ `pos-consume-<saleId>-<lineId>-<invItemId>` (R8)
 *   components ที่อ่านจาก DB ผิดรูป = ข้ามรายการนั้น (บิลชำระแล้ว ห้ามล้ม)
 */
export function lineConsumption(
  saleId: string,
  l: { id: string; itemId: string | null; qty: number; weightGrams: number | null; components: unknown },
): { itemId: string; qty: number; key: string }[] {
  const out: { itemId: string; qty: number; key: string }[] = [];
  if (l.itemId) out.push({ itemId: l.itemId, qty: l.weightGrams ?? l.qty, key: `pos-consume-${saleId}-${l.id}` });
  if (Array.isArray(l.components)) {
    for (const c of l.components as unknown[]) {
      const x = c as { invItemId?: unknown; qty?: unknown } | null;
      if (!x || typeof x.invItemId !== "string" || !x.invItemId || typeof x.qty !== "number" || !Number.isInteger(x.qty) || x.qty < 1) continue;
      out.push({ itemId: x.invItemId, qty: x.qty * l.qty, key: `pos-consume-${saleId}-${l.id}-${x.invItemId}` });
    }
  }
  return out;
}

async function consumeSaleInventory(tenantId: string, unitId: string, saleId: string): Promise<void> {
  const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId }, select: { status: true } });
  if (!sale || sale.status !== "PAID") return; // void แล้ว = อย่าตัด
  // POS P1.2: ทุกบรรทัดของบิล (บรรทัดชุดไม่มี itemId แต่มี components) → ส่วนที่ต้องตัด
  const lines = await prisma.posSaleLine.findMany({
    where: { tenantId, saleId },
    select: { id: true, itemId: true, qty: true, weightGrams: true, components: true },
  });
  const parts = lines.flatMap((l) => lineConsumption(saleId, l));
  if (parts.length === 0) return;
  const inventorySystemId = await systemForUnit(tenantId, unitId, "INVENTORY");
  if (!inventorySystemId) return;
  const invCtx = { tenantId, systemId: inventorySystemId };
  for (const p of parts) {
    try {
      await inventory.consume(invCtx, {
        itemId: p.itemId,
        qty: p.qty,
        sourceModule: "POS",
        refType: "PosSale",
        refId: saleId,
        idempotencyKey: p.key,
      });
    } catch (e) {
      // ตัดสต็อกล้ม → บิลชำระแล้ว ปล่อยผ่าน (ไม่ล้มการขาย)
      // HF-INV-1 ▸ R3.3: แต่ต้องทิ้งร่องรอย (เดิมเงียบ — ตอนนี้ล้มได้จริงเมื่อสินค้าถูกล็อกนาน ≈10 วิ) · ไม่มีข้อมูลลูกค้า ◂
      console.error("[pos] stock cut failed — sale committed without stock movement", { saleId, itemId: p.itemId, qty: p.qty, code: stockErrorCode(e) });
    }
  }
}

// void: กลับรายการ (คืนแต้ม + สถานะ)
export async function voidSale(tenantId: string, unitId: string, saleId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const sale = await tx.posSale.findFirst({ where: { id: saleId, tenantId, unitId } });
    // POS P1.8 ▸ ใบคืนเงิน (docType REFUND) void ไม่ได้ (มติ R1 · คืนของใบคืน = นอกขอบเขต) ◂
    if (!sale || sale.status !== "PAID" || sale.docType !== "SALE") throw new Error("บิลนี้ void ไม่ได้");
    // POS P1.8 ▸ §7 CD1: คืนเงินไปแล้วบางส่วน ⇒ void ทั้งใบจะกลับรายการส่วนที่คืนไปแล้วซ้ำ (JV · แต้ม · สต็อก) — ปฏิเสธก่อนเขียนอะไร (ทุกผู้เรียก) ◂
    if (sale.refundedSatang > 0) throw new PosSaleError("HAS_REFUNDS", "บิลนี้มีการคืนเงินแล้ว — ยกเลิกทั้งใบไม่ได้ ใช้การคืนเงินส่วนที่เหลือแทน");
    // POS P1.9 ▸ S11: บิลในกะที่ปิดแล้ว void ไม่ได้ (คืนเงินเท่านั้น) · ล็อกแถวกะ FOR SHARE แบบ createSale · บิลนอกกะ (null) = เดิม ◂
    // POS P1.9 R2 F4 ▸ เฉพาะบิลหน้าขาย (sourceModule "POS") · บิลของโมดูลอื่น (คืนเงินโรงแรม/จอง/… เคลมฝั่งตัวเองก่อนแล้วค่อย void) ไม่ถูกปฏิเสธ — ปฏิเสธ = ค้างครึ่งทาง ◂
    if (sale.shiftId && sale.sourceModule === "POS") {
      const sh = await tx.$queryRaw<{ status: string }[]>`SELECT status::text AS status FROM "PosShift" WHERE id = ${sale.shiftId} FOR SHARE`;
      if (sh[0]?.status !== "OPEN") throw new PosSaleError("SHIFT_CLOSED", "กะของบิลนี้ปิดแล้ว — ยกเลิกบิลไม่ได้ ใช้การคืนเงินแทน");
    }
    // POS P1.8 ▸ เขียนแบบมีเงื่อนไข: ใบคืนที่ commit ระหว่างนี้ (ล็อกบิล FOR UPDATE) ทำให้ไม่ตรง ⇒ ปฏิเสธ ไม่ทับสถานะ ◂
    const flipped = await tx.posSale.updateMany({ where: { id: saleId, status: "PAID", refundedSatang: 0 }, data: { status: "VOIDED" } });
    if (flipped.count !== 1) throw new PosSaleError("HAS_REFUNDS", "บิลนี้มีการคืนเงินแล้ว — ยกเลิกทั้งใบไม่ได้ ใช้การคืนเงินส่วนที่เหลือแทน");
    // outbox: void → กลับรายการบัญชี (contract 2.4)
    await emitOutbox(tx, {
      tenantId,
      type: "pos.sale.voided",
      idempotencyKey: `PosSale#${saleId}#VOIDED`,
      payload: { saleId },
      systemId: sale.systemId,
      unitId,
    });
    // คูปอง: คืนสิทธิ์ทุกใบที่ผูกกับบิลนี้ (status → RELEASED, usedCount ลด) — contract 2.3
    const redeemedSystems = await tx.couponRedemption.findMany({
      where: { tenantId, refType: "PosSale", refId: saleId, status: { in: ["RESERVED", "REDEEMED"] } },
      select: { systemId: true },
      distinct: ["systemId"],
    });
    for (const { systemId } of redeemedSystems) {
      await coupon.release({ tenantId, systemId, refType: "PosSale", refId: saleId, reason: "void บิล POS" }, tx);
    }

    // 🔴 M2.8: การคืนของฝั่งสมาชิก (voucher · แต้มที่เผา · แต้มที่ได้ · บัตรกำนัล · สแตมป์ · ยอดสะสม ·
    //    ไทม์ไลน์) ย้ายไปคิว `pos.sale.voided` → `src/lib/member-bridges.ts#onPosSaleVoided`
    //    เหตุผลเดียวกับตอนปิดบิล: การยกเลิกบิลต้องสำเร็จเสมอแม้ฝั่งสมาชิกมีปัญหา
    //    (ของเดิมกลับแต้มด้วยคีย์ `pos-void-<saleId>` — คีย์เดียวกับที่ `member.releaseOnVoid` ใช้
    //     ⇒ ถ้าปล่อยไว้ทั้งสองที่ ตัวหนึ่งจะกลืนอีกตัวเงียบ ๆ แล้วล็อตแต้มไม่ถูกย้อน)
  });

  // best-effort หลัง commit — cron เก็บตกถ้าล้ม
  scheduleDrain();

  // คืนสต็อก + กลับ COGS (perpetual) — นอก tx (inventory.receive เปิด tx เอง + โพสต์ Dr1200/Cr5000 หลัง tx)
  await restoreVoidedInventory(tenantId, unitId, saleId);
}

// ── คืนสต็อกของบิลที่ถูก void (perpetual) — mirror consumeSaleInventory ──
// วนตาม InvMovement OUT ที่ตัดจริงตอนขาย (refType PosSale, sourceModule POS) → คืนตรงเป๊ะกับที่ตัด
//   (แม้ line ซ้ำ itemId ก็คืนครบ) · คืนที่ต้นทุนปัจจุบันของ item → ต้นทุนถัวเฉลี่ยไม่เพี้ยน
// idempotent ต่อ movement (pos-refund-<saleId>-<movementId>) → void/retry ซ้ำไม่คืนเบิ้ล
//   (voidSale โยน error ถ้าบิลไม่ใช่ PAID อยู่แล้ว แต่ receive key ยังกันเบิ้ลอีกชั้น)
// idempotencyKey มี "refund" + sourceModule POS → bridge ลง Dr1200/Cr5000 (กลับต้นทุนขาย)
// ไม่มีระบบ INVENTORY / item ถูกลบ / receive ล้ม → ข้ามเงียบ (บัญชีขาย void แล้ว ห้ามล้มการคืนเงิน)
async function restoreVoidedInventory(tenantId: string, unitId: string, saleId: string): Promise<void> {
  const inventorySystemId = await systemForUnit(tenantId, unitId, "INVENTORY");
  if (!inventorySystemId) return;
  const invCtx = { tenantId, systemId: inventorySystemId };
  const outMoves = await prisma.invMovement.findMany({
    where: { tenantId, systemId: inventorySystemId, type: "OUT", refType: "PosSale", refId: saleId, sourceModule: "POS" },
    select: { id: true, itemId: true, qtyDelta: true },
  });
  // N+1: เดิมยิงหา InvItem ทีละแถวในลูป → บิล 20 บรรทัด = 20 รอบเดินทางไป DB ระหว่างที่ลูกค้ารอ "ยกเลิกบิล"
  // ดึงชุดเดียวด้วย id in [] (แพตเทิร์นเดียวกับที่ใช้ปิด N+1 ตะกร้าร้านค้า/สั่งอาหาร)
  const itemIds = [...new Set(outMoves.map((m) => m.itemId).filter((id): id is string => !!id))];
  const costById = new Map(
    (
      await prisma.invItem.findMany({
        where: { id: { in: itemIds }, tenantId },
        select: { id: true, costSatang: true },
      })
    ).map((i) => [i.id, i.costSatang]),
  );
  for (const mv of outMoves) {
    const returnQty = -mv.qtyDelta; // qtyDelta ติดลบตอนตัด → คืนเท่าที่ตัดจริง
    if (returnQty <= 0) continue;
    const costSatang = mv.itemId ? costById.get(mv.itemId) : undefined;
    if (costSatang === undefined) continue; // สินค้าถูกลบจากคลัง → ไม่มีที่ให้คืน
    try {
      await inventory.receive(invCtx, {
        itemId: mv.itemId,
        qty: returnQty,
        costSatang, // คืนที่ต้นทุนปัจจุบัน → ต้นทุนถัวเฉลี่ยไม่เพี้ยน
        idempotencyKey: `pos-refund-${saleId}-${mv.id}`,
        sourceModule: "POS",
        refType: "PosSale",
        refId: saleId,
        note: "คืนสต็อกจากการยกเลิกบิล POS",
      });
    } catch (e) {
      // คืนล้ม → ปล่อยผ่าน (บัญชีขาย void แล้ว)
      // HF-INV-1 ▸ R3.3: ทิ้งร่องรอยแบบเดียวกับตอนตัด (ไม่มีข้อมูลลูกค้า) ◂
      console.error("[pos] stock restore failed — void committed without stock movement", { saleId, itemId: mv.itemId, qty: returnQty, code: stockErrorCode(e) });
    }
  }
}

// รายการขาย (dashboard)
export async function listSales(tenantId: string, unitId: string, sinceDateStr: string) {
  const since = new Date(sinceDateStr + "T00:00:00Z");
  return prisma.posSale.findMany({
    // POS P1.8 ▸ R3: รายการ "บิลขาย" เท่านั้น (ใบคืนเงิน docType REFUND ไม่ใช่บิลขาย) ◂
    where: { tenantId, unitId, docType: "SALE", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
    take: 200,
  });
}

// สรุปยอดขายวันนี้ (BKK)
export async function daySummary(tenantId: string, unitId: string): Promise<{ count: number; totalSatang: number }> {
  const d = new Date(Date.now() + 7 * 3600000);
  const dateStr = d.toISOString().slice(0, 10);
  const start = new Date(new Date(dateStr + "T00:00:00Z").getTime() - 7 * 3600000);
  // POS P1.8 ▸ R3: ยอดสุทธิ = บิลขายที่ไม่ถูกยกเลิก (PAID + คืนครบ REFUNDED) − ใบคืนเงินของวันนี้ · จำนวน = บิลขายเท่านั้น ◂
  const sales = await prisma.posSale.findMany({
    where: { tenantId, unitId, status: { not: "VOIDED" }, createdAt: { gte: start } },
    select: { grandTotalSatang: true, docType: true },
  });
  const bills = sales.filter((x) => x.docType === "SALE");
  const refunds = sales.filter((x) => x.docType === "REFUND");
  return {
    count: bills.length,
    totalSatang: bills.reduce((s, x) => s + x.grandTotalSatang, 0) - refunds.reduce((s, x) => s + x.grandTotalSatang, 0),
  };
}

// ═══════════════════════════ ปิดวัน / สรุปยอดสิ้นวัน (read-only) ═══════════════════════════
// สรุปยอดของ "ระบบ POS" (scope tenantId+systemId — ครอบทุกสาขาที่ผูก POS นี้) รายวัน (BKK)
// read-only: ไม่มี shift state machine — อ่านจาก posSale/posPayment ที่มีอยู่ · follow-up = ปิดรอบจริง

// unitIds (HF-POS-PAGES) = จำกัดเฉพาะสาขาที่ผู้ใช้เข้าได้ · ไม่ระบุ = ทุกสาขาของ POS นี้ (เหมือนเดิม)
export type CloseCtx = { tenantId: string; systemId: string; unitIds?: string[] };

// POS P1.8 ▸ amountSatang = สุทธิหลังหักเงินคืนของวิธีนั้น · count = จำนวนรายการรับ (เดิม) · refund* = ใบคืนของวิธีนั้น (เพิ่มล้วน) ◂
export type PayMethodLine = { type: PosPayType; label: string; amountSatang: number; count: number; refundCount?: number; refundSatang?: number };

export type PosDaySummary = {
  businessDate: string; // YYYY-MM-DD (BKK)
  netSalesSatang: number; // ยอดขายสุทธิ (บิล PAID)
  billCount: number; // จำนวนบิล PAID
  voidCount: number; // จำนวนบิล void (createdAt วันนั้น)
  voidTotalSatang: number; // ยอดรวมบิล void
  /** POS P1.8 — ใบคืนเงินของวันนั้น (หักออกจาก netSales/byMethod/เงินในลิ้นชักแล้ว) */
  refundCount: number;
  refundTotalSatang: number;
  byMethod: PayMethodLine[]; // แยกตามวิธีจ่าย (จาก PosPayment ของบิล PAID วันนั้น) — เรียงตาม enum
  cashInDrawerSatang: number; // เงินสดที่ควรมีในลิ้นชัก = ยอดจ่ายเงินสดของบิล PAID วันนั้น
  // แยกยอดตามชนิดรายการ — ธุรกิจที่มีทั้งสินค้าและบริการต้องรู้ว่ารายได้มาจากทางไหน
  // (ยอดรวม 3 ก้อนนี้ = ยอดก่อนหักส่วนลดท้ายบิล จึงอาจไม่เท่า netSales พอดี)
  productSalesSatang: number; // รายการที่ผูกสินค้าในคลัง
  serviceSalesSatang: number; // รายการที่ผูกบริการ
  otherSalesSatang: number; // รายการที่พนักงานพิมพ์เอง (ไม่ผูกทั้งสองอย่าง)
};

export const PAY_TYPE_ORDER: PosPayType[] = ["CASH", "PROMPTPAY", "TRANSFER", "CARD", "DEPOSIT", "ROOM_CHARGE"];
export const PAY_TYPE_LABEL_TH: Record<PosPayType, string> = {
  CASH: "เงินสด",
  PROMPTPAY: "พร้อมเพย์",
  TRANSFER: "โอน",
  CARD: "บัตร", // POS P1.6 (เลขอ้างอิง EDC · ไม่มีเกตเวย์)
  DEPOSIT: "มัดจำ",
  ROOM_CHARGE: "ลงบิลห้องพัก",
};

// business date (BKK) → ช่วง UTC [start, end) ของวันนั้น
function bkkDayRange(businessDate: string): { start: Date; end: Date } {
  const start = new Date(new Date(businessDate + "T00:00:00Z").getTime() - 7 * 3600000);
  return { start, end: new Date(start.getTime() + 24 * 3600000) };
}

// วันนี้ตามเวลาไทย (YYYY-MM-DD)
export function bkkToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// แถวบิลของวันนั้น (สำหรับตาราง/CSV) — วิธีจ่ายรวมเป็นข้อความ (บิลเดียวอาจมีหลายวิธี)
export type PosDayBill = {
  receiptNo: string | null;
  createdAt: Date;
  grandTotalSatang: number;
  status: string;
  methodLabel: string;
  /** POS P1.8 — "REFUND" = ใบคืนเงิน (grandTotalSatang เป็นบวก ตีความเป็นเงินออก) */
  docType?: string;
};

// ── สรุปวัน (default = วันนี้ BKK) ต่อระบบ POS ──
export async function closeDaySummary(ctx: CloseCtx, businessDate?: string): Promise<PosDaySummary> {
  const date = businessDate ?? bkkToday();
  const { start, end } = bkkDayRange(date);

  // บิลทั้งหมดของระบบ POS นี้ในวันนั้น (PAID + VOIDED + คืนครบ) + ใบคืนเงินของวันนั้น (POS P1.8 ▸ R3: docType แยก ◂)
  const sales = await prisma.posSale.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: start, lt: end }, ...(ctx.unitIds ? { unitId: { in: ctx.unitIds } } : {}) },
    select: { id: true, status: true, grandTotalSatang: true, docType: true },
  });
  // บิลขายที่ยังนับยอด = ไม่ถูกยกเลิก (PAID หรือคืนครบ REFUNDED — การคืนถูกหักผ่านใบคืนเงินของวันที่คืน)
  const paid = sales.filter((s) => s.docType === "SALE" && s.status !== "VOIDED");
  const voided = sales.filter((s) => s.docType === "SALE" && s.status === "VOIDED");
  const refunds = sales.filter((s) => s.docType === "REFUND");

  // แยกวิธีจ่าย จาก PosPayment ของบิลวันนั้น (ใบคืน = หักออก)
  const paidIds = paid.map((s) => s.id);
  const refundIds = refunds.map((s) => s.id);
  const payments = paidIds.length || refundIds.length
    ? await prisma.posPayment.findMany({
        where: { tenantId: ctx.tenantId, saleId: { in: [...paidIds, ...refundIds] } },
        select: { type: true, amountSatang: true, saleId: true },
      })
    : [];
  const refundSet = new Set(refundIds);
  const agg = new Map<PosPayType, { amountSatang: number; count: number; refundCount: number; refundSatang: number }>();
  for (const p of payments) {
    const cur = agg.get(p.type) ?? { amountSatang: 0, count: 0, refundCount: 0, refundSatang: 0 };
    if (refundSet.has(p.saleId)) {
      cur.amountSatang -= p.amountSatang;
      cur.refundCount += 1;
      cur.refundSatang += p.amountSatang;
    } else {
      cur.amountSatang += p.amountSatang;
      cur.count += 1;
    }
    agg.set(p.type, cur);
  }
  const byMethod: PayMethodLine[] = PAY_TYPE_ORDER.filter((t) => agg.has(t)).map((t) => ({
    type: t,
    label: PAY_TYPE_LABEL_TH[t],
    amountSatang: agg.get(t)!.amountSatang,
    count: agg.get(t)!.count,
    ...(agg.get(t)!.refundCount ? { refundCount: agg.get(t)!.refundCount, refundSatang: agg.get(t)!.refundSatang } : {}),
  }));

  // แยกยอดสินค้า/บริการ/พิมพ์เอง จากบรรทัดของบิลวันนั้น (บรรทัดใบคืนถือ itemId/serviceId ของบรรทัดเดิม = หักออก)
  const saleLines = paidIds.length || refundIds.length
    ? await prisma.posSaleLine.findMany({
        where: { tenantId: ctx.tenantId, saleId: { in: [...paidIds, ...refundIds] } },
        select: { lineTotalSatang: true, itemId: true, serviceId: true, saleId: true },
      })
    : [];
  let productSalesSatang = 0;
  let serviceSalesSatang = 0;
  let otherSalesSatang = 0;
  for (const l of saleLines) {
    const v = refundSet.has(l.saleId) ? -l.lineTotalSatang : l.lineTotalSatang;
    if (l.serviceId) serviceSalesSatang += v;
    else if (l.itemId) productSalesSatang += v;
    else otherSalesSatang += v;
  }
  const refundTotalSatang = refunds.reduce((s, x) => s + x.grandTotalSatang, 0);

  return {
    businessDate: date,
    netSalesSatang: paid.reduce((s, x) => s + x.grandTotalSatang, 0) - refundTotalSatang,
    billCount: paid.length,
    voidCount: voided.length,
    voidTotalSatang: voided.reduce((s, x) => s + x.grandTotalSatang, 0),
    refundCount: refunds.length,
    refundTotalSatang,
    byMethod,
    cashInDrawerSatang: agg.get("CASH")?.amountSatang ?? 0,
    productSalesSatang,
    serviceSalesSatang,
    otherSalesSatang,
  };
}

// ── รายการบิลของวัน (PAID + VOIDED) เรียงตามเวลา — สำหรับตาราง/CSV ──
export async function closeDayBills(ctx: CloseCtx, businessDate?: string): Promise<PosDayBill[]> {
  const date = businessDate ?? bkkToday();
  const { start, end } = bkkDayRange(date);
  const sales = await prisma.posSale.findMany({
    where: { tenantId: ctx.tenantId, systemId: ctx.systemId, createdAt: { gte: start, lt: end }, ...(ctx.unitIds ? { unitId: { in: ctx.unitIds } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, receiptNo: true, createdAt: true, grandTotalSatang: true, status: true, docType: true },
  });
  const ids = sales.map((s) => s.id);
  const payments = ids.length
    ? await prisma.posPayment.findMany({
        where: { tenantId: ctx.tenantId, saleId: { in: ids } },
        select: { saleId: true, type: true },
      })
    : [];
  const bySale = new Map<string, PosPayType[]>();
  for (const p of payments) {
    const arr = bySale.get(p.saleId) ?? [];
    arr.push(p.type);
    bySale.set(p.saleId, arr);
  }
  return sales.map((s) => {
    const types = bySale.get(s.id) ?? [];
    const uniq = PAY_TYPE_ORDER.filter((t) => types.includes(t));
    return {
      receiptNo: s.receiptNo,
      createdAt: s.createdAt,
      grandTotalSatang: s.grandTotalSatang,
      status: s.status,
      methodLabel: uniq.map((t) => PAY_TYPE_LABEL_TH[t]).join(" + ") || "—",
      docType: s.docType,
    };
  });
}

// ── CSV ปิดวัน (BOM · รายการบิล + บล็อกสรุป) — self-contained เพื่อให้ oracle เรียกได้โดยไม่ต้องมี session ──
const CSV_BOM = "﻿";
/** P1.17 R2-F1 — กันสูตรใน Excel/Sheets: ขึ้นต้น = + - @ TAB CR และไม่ใช่ตัวเลขล้วน ⇒ เติม ' นำหน้า (ตัวเลขติดลบคงเป็นตัวเลข) */
function csvEsc(v: unknown): string {
  const raw = v == null ? "" : String(v);
  const s = /^[=+\-@\t\r]/.test(raw) && !/^-?\d+(\.\d+)?$/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const baht = (satang: number) => (satang / 100).toFixed(2);
const STATUS_TH: Record<string, string> = { PAID: "ชำระแล้ว", VOIDED: "ยกเลิก", REFUNDED: "คืนเงินครบ" };

export async function closeDayCsv(ctx: CloseCtx, businessDate?: string): Promise<string> {
  const date = businessDate ?? bkkToday();
  const [summary, bills] = await Promise.all([closeDaySummary(ctx, date), closeDayBills(ctx, date)]);
  const fmtTime = (d: Date) =>
    new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(d);

  const rows: string[] = [];
  rows.push(["เลขที่ใบเสร็จ", "เวลา", "ยอด (บาท)", "วิธีจ่าย", "สถานะ"].map(csvEsc).join(","));
  for (const b of bills) {
    rows.push(
      [
        b.receiptNo ?? "",
        fmtTime(b.createdAt),
        // POS P1.8 ▸ ใบคืนเงิน = เงินออก (ติดลบ) ◂
        b.docType === "REFUND" ? `-${baht(b.grandTotalSatang)}` : baht(b.grandTotalSatang),
        b.methodLabel,
        b.docType === "REFUND" ? "ใบคืนเงิน" : (STATUS_TH[b.status] ?? b.status),
      ]
        .map(csvEsc)
        .join(","),
    );
  }
  // บล็อกสรุป
  rows.push("");
  rows.push([csvEsc("สรุปวันที่"), csvEsc(date)].join(","));
  rows.push([csvEsc("ยอดขายสุทธิ (บาท)"), csvEsc(baht(summary.netSalesSatang))].join(","));
  rows.push([csvEsc("จำนวนบิล"), csvEsc(summary.billCount)].join(","));
  rows.push([csvEsc("บิลยกเลิก"), csvEsc(`${summary.voidCount} (${baht(summary.voidTotalSatang)} บาท)`)].join(","));
  if (summary.refundCount) rows.push([csvEsc("คืนเงิน"), csvEsc(`${summary.refundCount} (${baht(summary.refundTotalSatang)} บาท)`)].join(","));
  for (const m of summary.byMethod) {
    rows.push([csvEsc(`ยอด${m.label} (บาท)`), csvEsc(baht(m.amountSatang))].join(","));
  }
  rows.push([csvEsc("เงินสดที่ควรมีในลิ้นชัก (บาท)"), csvEsc(baht(summary.cashInDrawerSatang))].join(","));

  return CSV_BOM + rows.join("\n");
}
