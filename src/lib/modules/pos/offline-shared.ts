// offline-shared.ts — กติกาบริสุทธิ์ของการขายออฟไลน์ (POS P3.4 · C-13 v2 · บรีฟ pos-brief-P3.4.md R3 R4 R5 R11 R12 · §10 มติ 1–15)
// POS P3.4 ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//
// 🔴 บริสุทธิ์ + ใช้ร่วม client (P3.4U: IndexedDB · จอขายออฟไลน์ · วงซิงก์) และเซิร์ฟเวอร์ (pos/offline-sync.ts):
//    ห้าม import prisma / server-only / next/* / node:* / ไฟล์ "use server" · ไม่มี directive
// 🔴 ไม่อ่านนาฬิกาเอง (ไม่มี Date.now() / new Date() ไม่มีอาร์กิวเมนต์) · ไม่สุ่ม — ผู้เรียกส่ง now เข้ามา ⇒ เรียกซ้ำได้ผลเดิม
// 🔴 เงินเป็นสตางค์จำนวนเต็ม · ยอดออฟไลน์คิดด้วย priceCart ตัวเดียวกับหน้าขาย (ราคาจาก snapshot ของเครื่อง) — เซิร์ฟเวอร์คิดซ้ำตอนซิงก์เสมอ (R6)
import { priceCart, type PriceCartLineInput, type PriceCartOk, type PriceCartResult, type PriceVat } from "./pricing-shared";
import { weighedPriceSatang } from "./scan-shared";
import { RECEIPT_LABELS, type ReceiptLabels, type ReceiptPayload } from "./receipt-render";
import type { RegisterProduct, RegisterQuoteInput, RegisterSubmitInput } from "./register-shared";

// ═══════════════════ ค่าคงที่ (มติ 4 6 · R7) ═══════════════════
/** วิธีชำระที่ขายออฟไลน์ได้ (มติ 4: เงินสด + โอน · พร้อมเพย์/บัตร/บัตรของขวัญ/เครดิตร้าน/มัดจำ/แพลตฟอร์ม = ต้องออนไลน์) */
export const OFFLINE_TENDERS = ["CASH", "TRANSFER"] as const;
export type OfflineTender = (typeof OFFLINE_TENDERS)[number];
/** รายการต่อหนึ่งคำขอซิงก์ (R5) */
export const OFFLINE_SYNC_BATCH_MAX = 50;
/** อายุ snapshot / อายุบิลสูงสุด (มติ 6: 24 ชม. = forceCloseAfterHours ปริยาย) */
export const OFFLINE_MAX_AGE_MS = 86_400_000;
/** บิลค้างซิงก์สูงสุดต่อเครื่อง (มติ 6) */
export const OFFLINE_MAX_BILLS = 300;
/** หยุดขายเมื่อเลย priceValidUntil เกินนี้โดยไม่ได้ snapshot ใหม่ (มติ 6) */
export const OFFLINE_PRICE_GRACE_MS = 900_000;
/** soldAt ล้ำนาฬิกาเซิร์ฟเวอร์ได้ไม่เกิน (R7) */
export const OFFLINE_CLOCK_SKEW_MS = 120_000;
/** soldAt ก่อนเปิดกะได้ไม่เกิน (R7 · เท่ากับ slack ของรายงานกะ shift.ts) */
export const OFFLINE_SHIFT_SLACK_MS = 300_000;
/** เหตุผลที่เซิร์ฟเวอร์ปฏิเสธรายการออฟไลน์ (R6–R9 + รหัสเดิมของหน้าขายที่ส่งผ่าน) */
export const OFFLINE_REFUSAL_CODES = [
  "PRICE_MISMATCH",
  "CLOCK_INVALID",
  "SHIFT_CLOSED",
  "SELLER_MISMATCH",
  "OFFLINE_REF_TAKEN",
  "STOCK_INSUFFICIENT",
  "SNAPSHOT_UNKNOWN",
  "DEVICE_REVOKED",
  "STAFF_TOKEN_INVALID",
  "VALIDATION",
  "PRICE_WINDOW_REVIEW", // POS P3.4 ▸ fix1 N3: โปรตามเวลา ณ soldAt ถูกกว่าราคาตอนซิงก์ + ซิงก์ช้า > 30 นาที → คิวผู้จัดการ ◂
] as const;
export type OfflineRefusalCode = (typeof OFFLINE_REFUSAL_CODES)[number];
/** คีย์ของรายการซิงก์ (R5 · CD-3) — คีย์อื่น = VALIDATION ทั้งชุด */
export const OFFLINE_ITEM_KEYS = ["offlineRef", "idempotencyKey", "soldAt", "shiftId", "staffToken", "sellerUserId", "snapshotHash", "sale"] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

// ═══════════════════ ธง (R3 · ST8) ═══════════════════
/** AppSystem(POS).settings.pos.offline.enabled === true เท่านั้น — ไม่มี/ไม่ใช่ boolean true = ปิด (ปริยาย = จอแบบ 19ง วันนี้) */
export function posOfflineEnabled(settings: unknown): boolean {
  if (!isRecord(settings)) return false;
  const pos = settings.pos;
  if (!isRecord(pos)) return false;
  const off = pos.offline;
  return isRecord(off) && off.enabled === true;
}

// ═══════════════════ เลข OFF (R4) ═══════════════════
const OFFLINE_CODE_RE = /^C[1-9][0-9]{0,5}$/;
const OFFLINE_SEQ_MAX = 99_999_999;
const OFFLINE_REF_RE = /^OFF-(C[1-9][0-9]{0,5})-([0-9]{4,8})$/;
/** "OFF-<code>-<seq ≥ 4 หลัก>" (เช่น OFF-C1-0007 · OFF-C12-10000) · รหัสต้องเป็น C<n> · seq จำนวนเต็ม 1–99,999,999 · ผิดรูป = null */
export function offlineRef(code: string, seq: number): string | null {
  if (typeof code !== "string" || !OFFLINE_CODE_RE.test(code)) return null;
  if (!isInt(seq) || seq < 1 || seq > OFFLINE_SEQ_MAX) return null;
  return `OFF-${code}-${String(seq).padStart(4, "0")}`;
}
/** แกะเลข OFF กลับ — รับเฉพาะรูปมาตรฐาน (ตัวพิมพ์ใหญ่ · เติมศูนย์ 4 หลักพอดี) · อื่น = null */
export function parseOfflineRef(ref: unknown): { code: string; seq: number } | null {
  if (typeof ref !== "string") return null;
  const m = OFFLINE_REF_RE.exec(ref);
  if (!m) return null;
  const seq = Number(m[2]);
  return offlineRef(m[1]!, seq) === ref ? { code: m[1]!, seq } : null;
}
/** seq ถัดไป = max(ของเครื่อง, ของเซิร์ฟเวอร์, 0) + 1 — ค่าที่ไม่ใช่จำนวนเต็มไม่ติดลบ = 0 (จองต่อเนื่องเพิ่มขึ้นเสมอ) */
export function nextOfflineSeq(local: number, server: number): number {
  const n = (v: unknown) => (isInt(v) && v >= 0 ? v : 0);
  return Math.max(n(local), n(server), 0) + 1;
}

// ═══════════════════ เนื้อหาที่ขายออฟไลน์ได้ (R3 · มติ 4 5) ═══════════════════
/** ฟิลด์ของบิลที่ออฟไลน์ห้าม (สมาชิก/คูปอง/สิทธิ์ · โต๊ะ · บิลพัก · ช่องทาง · PIN ผู้จัดการ · ผู้ซื้อใบกำกับ · โทเคนผู้ขายต้องอยู่ระดับรายการ) */
const OFFLINE_FORBIDDEN_FIELDS = [
  "memberId",
  "couponCode",
  "memberChoices",
  "tableSessionId",
  "tableSplitPartId",
  "heldCartId",
  "channelId",
  "channelRef",
  "managerPin",
  "managerUserId",
  "taxInvoice",
  "rememberBuyer",
  "expectedTableItemsHash",
  "expectedSplitVersion",
  "staffToken",
  "couponDiscountSatang",
] as const;
export type OfflineSaleRefusal = { code: "VALIDATION"; field: string };
/**
 * null = บิล "walk-in" ที่ขายออฟไลน์ได้ (เงินสด · โอน (เลขอ้างอิงไม่บังคับ) · เงินสด+โอน · ส่วนลดบรรทัด/ท้ายบิล) ·
 * {code VALIDATION, field} = มีของที่ต้องออนไลน์ (วิธีชำระอื่น · สมาชิก/คูปอง/สิทธิ์ · โต๊ะ/บิลย่อย · บิลพัก · ช่องทาง · ผู้ซื้อใบกำกับ · PIN)
 */
export function offlineSaleRefusal(sale: unknown): OfflineSaleRefusal | null {
  if (!isRecord(sale)) return { code: "VALIDATION", field: "sale" };
  for (const f of OFFLINE_FORBIDDEN_FIELDS) if (sale[f] !== undefined && sale[f] !== null && sale[f] !== false) return { code: "VALIDATION", field: f };
  const pays = sale.payMethods;
  if (!Array.isArray(pays) || pays.length === 0) return { code: "VALIDATION", field: "payMethods" };
  for (const p of pays) {
    if (!isRecord(p) || !(OFFLINE_TENDERS as readonly unknown[]).includes(p.type)) return { code: "VALIDATION", field: "payMethods" };
    // แถวที่พกบัตรของขวัญ/มัดจำ/4 หลักท้าย = ไม่ใช่เงินสด/โอนจริง (และห้ามเก็บ PIN · R13)
    if (p.giftCard !== undefined || p.depositId !== undefined || p.phoneLast4 !== undefined) return { code: "VALIDATION", field: "payMethods" };
  }
  if (!Array.isArray(sale.lines)) return { code: "VALIDATION", field: "lines" };
  return null;
}

// ═══════════════════ snapshot + ยอดออฟไลน์ (R2 · Q3) ═══════════════════
export type OfflineSnapshotChoice = { choiceId: string; groupId: string; name: string; priceDeltaSatang: number };
export type OfflineSnapshotProduct = RegisterProduct & { choices: OfflineSnapshotChoice[] };
/** snapshot ที่เครื่องเก็บ (issueOfflineSnapshot) — ราคา = ราคาหน้าร้าน ณ issuedAt · ไม่มีต้นทุน/ข้อมูลสมาชิก (SEC1) */
export type OfflineSnapshot = {
  hash: string;
  issuedAt: string;
  priceValidUntil: string | null;
  offlineCode: string;
  offlineSeq: number;
  vat: PriceVat;
  serviceChargeBp: number;
  products: OfflineSnapshotProduct[];
};
const MAX_WEIGHT_GRAMS = 99_999;
const lineRefusal = (lineIndex: number, message: string): PriceCartResult => ({ ok: false, code: "INVALID_LINE", message, lineIndex });
/**
 * ยอดของตะกร้าออฟไลน์ = priceCart บนราคา snapshot (ราคาสินค้า · ราคาต่อกก. × น้ำหนักที่กรอก · ส่วนต่างตัวเลือกของสินค้านั้น · VAT/ค่าบริการของ snapshot) ·
 * สินค้าไม่อยู่ใน snapshot / ตัวเลือกของสินค้าอื่น / ปิดขาย / ไม่ตั้งราคา (ไม่ส่งราคาเปิด) = ok:false (INVALID_LINE + lineIndex)
 */
export function offlineCartTotals(snapshot: OfflineSnapshot, cart: RegisterQuoteInput): PriceCartResult {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.products)) return { ok: false, code: "VALIDATION", message: "ไม่มี snapshot ของเครื่อง" };
  if (!isRecord(cart) || !Array.isArray(cart.lines)) return { ok: false, code: "VALIDATION", message: "ข้อมูลตะกร้าไม่ถูกต้อง" };
  const byId = new Map<string, OfflineSnapshotProduct>();
  for (const p of snapshot.products) if (isRecord(p) && typeof p.id === "string") byId.set(p.id, p);
  const lines: PriceCartLineInput[] = [];
  for (let i = 0; i < cart.lines.length; i++) {
    const l = cart.lines[i] as unknown;
    if (!isRecord(l)) return lineRefusal(i, "รายการในตะกร้าไม่ถูกต้อง");
    const discount = (l.discount ?? null) as PriceCartLineInput["discount"];
    if (typeof l.productId !== "string") {
      // รายการกำหนดเอง (ชื่อ + ราคา) — สิทธิ์ราคาเปิดตรวจที่เซิร์ฟเวอร์ตอนซิงก์
      if (typeof l.name !== "string" || !isInt(l.unitPriceSatang)) return lineRefusal(i, "รายการกำหนดเองต้องมีชื่อและราคา");
      lines.push({ qty: l.qty as number, unitPriceSatang: l.unitPriceSatang, discount });
      continue;
    }
    const p = byId.get(l.productId);
    if (!p) return lineRefusal(i, "สินค้าไม่อยู่ใน snapshot ของเครื่อง");
    if (p.notSold === true || p.soldOutReason === "UNAVAILABLE") return lineRefusal(i, "สินค้านี้ปิดขาย");
    if (l.weighedBarcode !== undefined) return lineRefusal(i, "ป้ายเครื่องชั่งต้องออนไลน์");
    const choices = Array.isArray(p.choices) ? p.choices : [];
    const deltas: number[] = [];
    const opts = l.options;
    if (opts !== undefined) {
      if (!Array.isArray(opts)) return lineRefusal(i, "ตัวเลือกไม่ถูกต้อง");
      for (const o of opts) {
        const c = isRecord(o) ? choices.find((x) => x.choiceId === o.choiceId) : undefined;
        if (!c) return lineRefusal(i, "ตัวเลือกไม่ใช่ของสินค้านี้");
        deltas.push(c.priceDeltaSatang);
      }
    }
    let unit: number;
    if (l.openPrice === true) {
      if (!isInt(l.unitPriceSatang)) return lineRefusal(i, "ราคาเปิดต้องเป็นจำนวนเต็มสตางค์");
      unit = l.unitPriceSatang;
    } else if (p.priceSatang === null || !isInt(p.priceSatang)) return lineRefusal(i, "สินค้านี้ยังไม่ตั้งราคา");
    else if (p.soldByWeight) {
      if (!isInt(l.weightGrams) || l.weightGrams < 1 || l.weightGrams > MAX_WEIGHT_GRAMS || l.qty !== 1) return lineRefusal(i, "สินค้าชั่งต้องกรอกน้ำหนัก (กรัม) จำนวน 1");
      unit = weighedPriceSatang(l.weightGrams, p.priceSatang);
    } else unit = p.priceSatang;
    lines.push({ qty: l.qty as number, unitPriceSatang: unit, optionDeltasSatang: deltas, discount });
  }
  return priceCart({ lines, billDiscount: cart.billDiscount ?? null, vat: snapshot.vat, serviceChargeBp: snapshot.serviceChargeBp });
}

// ═══════════════════ คิว + ผลซิงก์ (R5 · R11) ═══════════════════
export type OfflineQueueItem = {
  offlineRef: string;
  idempotencyKey: string;
  soldAt: string;
  shiftId?: string;
  staffToken?: string;
  sellerUserId?: string;
  snapshotHash: string;
  sale: Omit<RegisterSubmitInput, "idempotencyKey" | "staffToken">;
};
export type OfflineSyncStatus = "OK" | "DUPLICATE" | "REJECTED";
export type OfflineDriftLine = { productId: string; priceAtSoldAtSatang: number | null; snapshotPriceSatang: number };
export type OfflineDrift = { totalAtSoldAtSatang: number | null; snapshotTotalSatang: number; lines: OfflineDriftLine[] };
export type OfflineSyncResult = {
  offlineRef: string;
  status: OfflineSyncStatus;
  offlineSaleId?: string;
  saleId?: string;
  receiptNo?: string | null;
  reason?: string;
  drift?: OfflineDrift;
};
/** แบ่งชุดซิงก์ — เรียง (soldAt, seq ของเลข OFF) แบบคงลำดับ · ชุดละ ≤ 50 (ขอเกิน 50 = 50) · ไม่แก้ array ที่ส่งเข้า */
export function offlineBatches<T extends { soldAt: string; offlineRef: string }>(items: readonly T[], size?: number): T[][] {
  const n = isInt(size) && size >= 1 ? Math.min(size, OFFLINE_SYNC_BATCH_MAX) : OFFLINE_SYNC_BATCH_MAX;
  const keyed = (Array.isArray(items) ? items : []).map((it, i) => {
    const t = Date.parse(String(it?.soldAt ?? ""));
    return { it, i, t: Number.isFinite(t) ? t : Number.POSITIVE_INFINITY, seq: parseOfflineRef(it?.offlineRef)?.seq ?? Number.POSITIVE_INFINITY };
  });
  keyed.sort((a, b) => (a.t !== b.t ? (a.t < b.t ? -1 : 1) : a.seq !== b.seq ? (a.seq < b.seq ? -1 : 1) : a.i - b.i));
  const out: T[][] = [];
  for (let i = 0; i < keyed.length; i += n) out.push(keyed.slice(i, i + n).map((k) => k.it));
  return out;
}
/** ผลต่อรายการ → สิ่งที่เครื่องทำ: OK/DUPLICATE = เอาออกจากคิว (ได้เลขจริง) · REJECTED = พักรอผู้จัดการ (ไม่ส่งซ้ำ) · อื่น (เครือข่าย/5xx/BUSY) = เก็บไว้ส่งใหม่ */
export function classifyOfflineResult(r: Partial<OfflineSyncResult> | null | undefined): "remove" | "park" | "keep" {
  const s = r && typeof r === "object" ? r.status : undefined;
  if (s === "OK" || s === "DUPLICATE") return "remove";
  if (s === "REJECTED") return "park";
  return "keep";
}

// ═══════════════════ ด่านขายออฟไลน์ของเครื่อง (มติ 6 · Q4) ═══════════════════
export type OfflineSellGateInput = {
  enabled: boolean;
  deviceActive: boolean;
  snapshotIssuedAt: string | null;
  priceValidUntil: string | null;
  queueLength: number;
  now: number | Date;
};
export type OfflineSellGateReason = "DISABLED" | "DEVICE_INACTIVE" | "NO_SNAPSHOT" | "CLOCK_INVALID" | "SNAPSHOT_TOO_OLD" | "PRICES_EXPIRED" | "QUEUE_FULL";
/** ขายออฟไลน์ต่อได้ไหม: ปิดธง · เครื่องไม่ ACTIVE · ไม่มี snapshot · snapshot เกิน 24 ชม. · เลย priceValidUntil + 15 นาที · คิว ≥ 300 = หยุด (พร้อมเหตุผล) */
export function offlineSellGate(input: OfflineSellGateInput): { ok: true } | { ok: false; reason: OfflineSellGateReason } {
  const i = (isRecord(input) ? input : {}) as Partial<OfflineSellGateInput>;
  const now = i.now instanceof Date ? i.now.getTime() : typeof i.now === "number" ? i.now : Number.NaN;
  if (i.enabled !== true) return { ok: false, reason: "DISABLED" };
  if (i.deviceActive !== true) return { ok: false, reason: "DEVICE_INACTIVE" };
  const issued = typeof i.snapshotIssuedAt === "string" ? Date.parse(i.snapshotIssuedAt) : Number.NaN;
  if (!Number.isFinite(issued)) return { ok: false, reason: "NO_SNAPSHOT" };
  if (!Number.isFinite(now) || issued > now + OFFLINE_CLOCK_SKEW_MS) return { ok: false, reason: "CLOCK_INVALID" };
  if (now - issued > OFFLINE_MAX_AGE_MS) return { ok: false, reason: "SNAPSHOT_TOO_OLD" };
  const pvu = typeof i.priceValidUntil === "string" ? Date.parse(i.priceValidUntil) : Number.NaN;
  if (Number.isFinite(pvu) && now > pvu + OFFLINE_PRICE_GRACE_MS) return { ok: false, reason: "PRICES_EXPIRED" };
  if (!isInt(i.queueLength) || i.queueLength >= OFFLINE_MAX_BILLS) return { ok: false, reason: "QUEUE_FULL" };
  return { ok: true };
}

// ═══════════════════ ใบรับเงินชั่วคราว (R12 · มติ 2 3) ═══════════════════
/** หัวสลิปออฟไลน์ — ไม่ใช่ใบกำกับภาษีอย่างย่อ (มติ 3 · W11) · ข้อความเดียวกับ pos.register.offline.slip.title */
export const OFFLINE_SLIP_TITLE = { th: "ใบรับเงินชั่วคราว — รอออกเลขจริง", en: "TEMPORARY RECEIPT — AWAITING FINAL NUMBER" } as const;
export type OfflineSlipInput = {
  offlineRef: string;
  soldAt: string;
  shop: { name: string; branchName: string; address: string; phone: string; taxId?: string; branchNo?: string };
  cashierName?: string;
  lines: { name: string; qty: number; unitPriceSatang: number; discountSatang?: number; lineTotalSatang: number; options?: string[]; weightGrams?: number }[];
  totals: PriceCartOk;
  payments: { type: string; amountSatang: number; tenderedSatang?: number; changeSatang?: number; reference?: string }[];
  printLocale?: "th" | "en";
};
const slipLabels = (base: ReceiptLabels, title: string): ReceiptLabels => ({ ...base, receipt: title, taxInvoiceAbb: title, pay: { ...base.pay } });
/**
 * สลิปที่เครื่องพิมพ์ตอนออฟไลน์ (ReceiptPayload เดียวกับใบเสร็จจริง ⇒ renderReceiptHtml/ESC-POS เดิมพิมพ์ได้) —
 * kind RECEIPT · เลข = OFF-… · หัว "ใบรับเงินชั่วคราว — รอออกเลขจริง" · ไม่มี QR /r/ (โทเคนออกที่เซิร์ฟเวอร์ตอนซิงก์) · ไม่มีคำใบ้ใบกำกับเต็มรูป
 */
export function offlineSlipPayload(input: OfflineSlipInput): ReceiptPayload {
  const t = input.totals;
  const vatBase = t.vatMode === "INCLUDED" ? t.grandTotalSatang - t.vatSatang : t.netSatang + t.serviceChargeSatang;
  return {
    docType: "SALE",
    kind: "RECEIPT",
    status: "PAID",
    copy: false,
    paper: null,
    shop: {
      name: input.shop.name,
      branchName: input.shop.branchName,
      address: input.shop.address,
      phone: input.shop.phone,
      ...(input.shop.taxId ? { taxId: input.shop.taxId } : {}),
      ...(input.shop.branchNo ? { branchNo: input.shop.branchNo } : {}),
    },
    device: {},
    doc: { receiptNo: input.offlineRef, issuedAt: input.soldAt, ...(input.cashierName ? { cashierName: input.cashierName } : {}) },
    lines: input.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      unitPriceSatang: l.unitPriceSatang,
      lineTotalSatang: l.lineTotalSatang,
      discountSatang: l.discountSatang ?? 0,
      options: Array.isArray(l.options) ? [...l.options] : [],
      ...(l.weightGrams ? { weightGrams: l.weightGrams } : {}),
    })),
    totals: {
      subtotalSatang: t.subtotalSatang,
      lineDiscountSatang: t.lineDiscountSatang,
      billDiscountSatang: t.billDiscountSatang,
      couponDiscountSatang: 0,
      tierDiscountSatang: 0,
      serviceChargeSatang: t.serviceChargeSatang,
      grandTotalSatang: t.grandTotalSatang,
      vatBaseSatang: vatBase,
      vatSatang: t.vatSatang,
      vatRateBp: t.vatRateBp,
      tipSatang: 0,
    },
    payments: input.payments.map((p) => ({
      type: p.type,
      amountSatang: p.amountSatang,
      ...(p.tenderedSatang !== undefined ? { tenderedSatang: p.tenderedSatang } : {}),
      ...(p.changeSatang !== undefined ? { changeSatang: p.changeSatang } : {}),
      ...(p.reference ? { reference: p.reference } : {}),
    })),
    channel: null,
    footer: { text: "", qrEReceiptUrl: null, fullTaxInvoiceHint: false },
    labels: { th: slipLabels(RECEIPT_LABELS.th, OFFLINE_SLIP_TITLE.th), en: slipLabels(RECEIPT_LABELS.en, OFFLINE_SLIP_TITLE.en) },
    printLocale: input.printLocale === "en" ? "en" : "th",
  };
}

// ═══════════════════ ข้อความ (F15.4 · ST6) ═══════════════════
const OFFLINE_REFUSAL_KEY: Readonly<Record<string, string>> = {
  PRICE_MISMATCH: "offline.refusal.priceMismatch",
  CLOCK_INVALID: "offline.refusal.clockInvalid",
  SHIFT_CLOSED: "offline.refusal.shiftClosed",
  SELLER_MISMATCH: "offline.refusal.sellerMismatch",
  OFFLINE_REF_TAKEN: "offline.refusal.offlineRefTaken",
  STOCK_INSUFFICIENT: "offline.refusal.stockInsufficient",
  SNAPSHOT_UNKNOWN: "offline.refusal.snapshotUnknown",
  DEVICE_REVOKED: "offline.refusal.deviceRevoked",
  STAFF_TOKEN_INVALID: "offline.refusal.staffTokenInvalid",
  VALIDATION: "offline.refusal.validation",
  PRICE_WINDOW_REVIEW: "offline.refusal.priceWindowReview", // POS P3.4 ▸ fix1 N3 ◂
};
/** รหัสปฏิเสธของรายการออฟไลน์ → คีย์ข้อความใต้ `pos.register` (จอห้ามแสดง message ไทยของเซิร์ฟเวอร์) · รหัสอื่น = offline.refusal.other */
export function offlineRefusalMessageKey(code: string): string {
  return Object.prototype.hasOwnProperty.call(OFFLINE_REFUSAL_KEY, code) ? OFFLINE_REFUSAL_KEY[code]! : "offline.refusal.other";
}
