// SVC H.5 ▸ เช็กเอาต์ = ปิดบิล POS ใบเดียว (ใบสั่ง ledger/svc-briefs/svc-brief-h.5.md §0 §2.4–2.7 §3.4–3.5 · สเปก S §7.7 §8.2)
//   เส้นเงิน: tx A (ล็อก folio · post คืนค้าง · คำนวณใหม่) → ตรวจ (ภาษี · ยอด) → pos.createSale **นอก tx** (ใบเดียว · คีย์ hotel-sale-<id|groupId>)
//            → ประกัน (คืน/ริบผ่าน POS · นอก tx) → tx B (PAYMENT ต่อ folio · ใช้มัดจำ · SETTLED · CHECKED_OUT · ห้อง DIRTY · ปล่อยห้อง · audit · outbox)
//            → หลัง tx B: คืนมัดจำส่วนเกิน (moduleRefundDeposit) · กันรายได้ซ้ำของบิลร้านที่ลงห้อง (account.reverseRoomChargePosting)
//   ซ้ำ/พร้อมกัน: คีย์บิลเดิม = บิลเดิม (createSale idempotent) · tx B ใช้ CAS CHECKED_IN → CHECKED_OUT ⇒ สถานะ/PAYMENT/event ครั้งเดียว ·
//   ล้มหลังมีบิล (tx B ล้ม) ⇒ เรียกซ้ำ = ใช้บิลเดิมแล้วทำ tx B ต่อ
//   ภาษี: POS ถือราคาบรรทัดรวม VAT เสมอ · INCLUSIVE ส่งตามที่โพสต์ · EXCLUSIVE ส่งบรรทัด "รวม VAT แล้ว" + ค่าบริการ (ยอดต้องเท่า taxLines)
import { z } from "zod";
import type { PosPayType } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { callerTx } from "@/lib/core/caller-tx";
import { emitOutbox, emitOutboxOutsideTx } from "@/lib/core/outbox";
import { resolveSettings } from "@/lib/core/settings";
import { releaseOccupancy } from "@/lib/modules/rooms";
import { createSale, saleStatusByKey, PosSaleError, type CreateSaleInput } from "@/lib/modules/pos/service";
import { DEPOSIT_PAY_TYPES, moduleDepositForBill, moduleForfeitDeposit, moduleRefundDeposit, moduleTakeDeposit } from "@/lib/modules/pos/deposit";
import { parseTaxInvoiceBuyer } from "@/lib/modules/pos/tax-invoice-shared";
import { systemForUnit } from "@/lib/modules/system/service";
import { posAccountSystemId, vatConfigOf, reverseRoomChargePosting, restoreRoomChargePosting } from "@/lib/modules/account";
import { roundFraction, taxLines } from "./pricing";
import {
  CHARGE_TYPES,
  taxBaseSubtotal,
  FolioAbort,
  R,
  auditTx,
  canDo,
  chargeSubtotal,
  dbDate,
  effective,
  emitFolioTx,
  fail,
  folioSettings,
  insertItemTx,
  isFolioFail,
  isOpen,
  isRec,
  isStr,
  lockFolio,
  postRoomNightsTx,
  voidItemTx,
  recomputeTx,
  reservationGate,
  securityStateOf,
  todayYmd,
  unitGate,
  unitTx,
  ymdOf,
  zodReason,
  type FolioActor,
  type FolioFail,
  type FolioSettings,
  type Gate,
  type ResvRow,
  type Tx,
  type UnitCtx,
} from "./folio";

export type CheckoutFailCode =
  | "NOT_CHECKED_IN"
  | "PAY_MISMATCH"
  | "TAX_CONFIG_MISMATCH"
  | "TAX_ROUNDING_MISMATCH"
  | "PAY_METHODS_REQUIRED"
  | "SHIFT_REQUIRED"
  | "SHIFT_CLOSED"
  | "POS_UNLINKED"
  | "POS_REJECTED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "FOLIO_CLOSED"
  | "NO_SECURITY"
  | "DISABLED"
  | "BUSY";
export type CheckoutFail = { ok: false; code: CheckoutFailCode; reason: string };
const cfail = (code: CheckoutFailCode, reason: string): CheckoutFail => ({ ok: false, code, reason });
const asCheckout = (f: FolioFail): CheckoutFail => ({ ok: false, code: f.code === "NOT_ALLOWED" ? "INVALID_INPUT" : f.code, reason: f.reason });

const SYSTEM_ID = "module:hotel";
/** วิธีจ่ายหน้าเคาน์เตอร์โรงแรม v1 (ใบ §2.7) — ไม่รับ ROOM_CHARGE/ON_ACCOUNT/PLATFORM/GIFT_CARD/STORE_CREDIT/DEPOSIT (มัดจำระบบใส่เอง) */
export const COUNTER_PAY_TYPES = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"] as const;
const MAX_PAY_ROWS = 6;
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errText = (e: unknown, d: string) => (e instanceof Error && /[฀-๿]/.test(e.message) ? e.message.replace(/^PAYMENT_MISMATCH:\s*/, "").slice(0, 200) : d);

// ───────────────────────── เป้าหมาย (การจองเดี่ยว / กลุ่ม) ─────────────────────────
type Targets = { g: Gate; rows: ResvRow[]; head: ResvRow | null; keyBase: string; sourceId: string; groupId: string | null };

async function targetsOf(actorIn: unknown, ctx: unknown, input: unknown, need: readonly string[]): Promise<Targets | CheckoutFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  if (!isRec(input) || !isStr(tenantId)) return cfail("NOT_FOUND", R.notFound);
  if (isStr(input.groupId) && !isStr(input.reservationId)) {
    const ids = await tenantDb({ tenantId }).$queryRaw<{ id: string }[]>`
      SELECT id FROM "HotelReservation" WHERE "groupId" = ${input.groupId} AND "tenantId" = ${tenantId} ORDER BY "createdAt", code LIMIT 1`;
    if (!ids[0]) return cfail("NOT_FOUND", R.notFound);
    const g = await reservationGate(actorIn, ctx, { reservationId: ids[0].id, unitId: input.unitId }, need);
    if (isFolioFail(g)) return asCheckout(g);
    const all = await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelReservation.findMany({ where: { groupId: input.groupId }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] });
    const rows = all.filter((r) => r.status === "CHECKED_IN");
    if (!rows.length) return cfail("NOT_CHECKED_IN", "ยังไม่มีห้องในกลุ่มนี้ที่เข้าพักอยู่ — เช็กเอาต์ได้เฉพาะห้องที่เช็กอินแล้ว");
    const head = all.find((r) => r.depositPaidAt && r.depositSaleId) ?? null;
    return { g, rows, head, keyBase: `hotel-sale-${input.groupId}`, sourceId: input.groupId, groupId: input.groupId };
  }
  const g = await reservationGate(actorIn, ctx, input, need);
  if (isFolioFail(g)) return asCheckout(g);
  if (g.rv.status !== "CHECKED_IN") return cfail("NOT_CHECKED_IN", "การจองนี้ยังไม่ได้เช็กอิน (หรือเช็กเอาต์ไปแล้ว) — เช็กเอาต์ได้เฉพาะห้องที่เข้าพักอยู่");
  // ห้องในกลุ่ม settle รายห้อง ⇒ มัดจำของกลุ่มอยู่ที่แถวที่ถือใบรับ (ผู้ตรวจรอบ 1 M2) — ใช้มัดจำคงเหลือกับทุกห้องที่ settle
  const head = g.rv.depositPaidAt && g.rv.depositSaleId
    ? g.rv
    : g.rv.groupId
      ? await tenantDb({ tenantId: g.tenantId, unitId: g.unitId }).hotelReservation.findFirst({ where: { groupId: g.rv.groupId, depositPaidAt: { not: null }, depositSaleId: { not: null } }, orderBy: [{ createdAt: "asc" }, { code: "asc" }] })
      : null;
  return { g, rows: [g.rv], head: head ?? null, keyBase: `hotel-sale-${g.rv.id}`, sourceId: g.rv.id, groupId: g.rv.groupId ?? null };
}

// ───────────────────────── แผนบิล (pure จากรายการ folio) ─────────────────────────
export type PosLine = { name: string; qty: number; unitPriceSatang: number; discountSatang?: number; kind: string };
type PlanItem = { type: string; description: string; qty: number; unitAmountSatang: number; amountSatang: number; voidedAt: Date | null; refType?: string | null; refId?: string | null };
type FolioPlanIn = { folioId: string; reservationId: string; roomTypeName: string; items: PlanItem[] };
export type CheckoutPlan = { lines: PosLine[]; billDiscountSatang: number; serviceChargeSatang: number; grandTotalSatang: number; perFolio: { folioId: string; reservationId: string; totalSatang: number }[] };

const ITEMIZED = ["SERVICE", "MINIBAR", "PENALTY", "POS_CHARGE"];
function buildPlan(folios: FolioPlanIn[], st: FolioSettings): CheckoutPlan | CheckoutFail {
  const exclusive = st.mode === "EXCLUSIVE";
  const gross = (x: number) => (exclusive ? roundFraction(x * (10_000 + st.vatBp), 10_000, st.rounding) : x);
  const rooms = new Map<string, { typeName: string; unit: number; qty: number }>();
  const lines: PosLine[] = [];
  let discount = 0;
  let scEx = 0;
  const perFolio: CheckoutPlan["perFolio"] = [];
  for (const f of folios) {
    const eff = effective(f.items);
    const sub = chargeSubtotal(f.items);
    // บิลร้านที่ลงห้อง (POS_CHARGE) รวม VAT แล้วเสมอ ⇒ ไม่อยู่ในฐานภาษีของโรงแรม · ไม่บวก VAT ซ้ำ (ผู้ตรวจรอบ 1 C2)
    const base = taxBaseSubtotal(f.items);
    const posPart = sub - base;
    const tl = taxLines(Math.max(0, base), { mode: st.mode, vatBp: st.vatBp, serviceChargeBp: st.scBp }, st.rounding);
    if (base < 0 || sub < 0) return cfail("INVALID_INPUT", "ส่วนลดมากกว่ายอดค่าใช้จ่ายของห้อง — ตรวจรายการส่วนลดก่อนเช็กเอาต์");
    perFolio.push({ folioId: f.folioId, reservationId: f.reservationId, totalSatang: exclusive ? tl.totalSatang + posPart : sub });
    for (const l of tl.lines) if (l.type === "SERVICE_CHARGE") scEx += l.amountSatang;
    for (const i of eff) {
      if (i.type === "ROOM") {
        const k = `${f.roomTypeName}|${i.unitAmountSatang}`;
        const cur = rooms.get(k) ?? { typeName: f.roomTypeName, unit: i.unitAmountSatang, qty: 0 };
        cur.qty += i.qty;
        rooms.set(k, cur);
      } else if (i.type === "DISCOUNT") discount += -i.amountSatang;
      else if (ITEMIZED.includes(i.type) && (i.amountSatang !== 0 || i.unitAmountSatang !== 0)) {
        const lineDisc = i.qty * i.unitAmountSatang - i.amountSatang;
        const g2 = i.type === "POS_CHARGE" ? (x: number) => x : gross; // ยอดรวม VAT แล้ว
        lines.push({ name: i.description.slice(0, 200), qty: i.qty, unitPriceSatang: g2(i.unitAmountSatang), ...(lineDisc > 0 ? { discountSatang: g2(lineDisc) } : {}), kind: i.type });
      }
    }
  }
  const roomLines: PosLine[] = [...rooms.values()].map((r) => ({ name: `ค่าห้อง ${r.typeName} ${r.qty} คืน (คืนละ ${baht(r.unit)})`, qty: r.qty, unitPriceSatang: gross(r.unit), kind: "ROOM" }));
  const all = [...roomLines, ...lines];
  const grand = perFolio.reduce((s, f) => s + f.totalSatang, 0);
  let billDiscount = gross(discount);
  let sc = exclusive ? gross(scEx) : 0;
  const linesSum = () => all.reduce((s, l) => s + l.qty * l.unitPriceSatang - (l.discountSatang ?? 0), 0);
  let diff = grand - (linesSum() - billDiscount + sc);
  if (diff !== 0) {
    if (!exclusive || Math.abs(diff) > 100 * (all.length + 2)) return cfail("TAX_ROUNDING_MISMATCH", "ยอดรวมภาษีของบิลไม่ตรงกับบิลห้อง (ปัดเศษต่อบรรทัด) — ตรวจค่าตั้งภาษี/การปัดเศษ");
    if (sc > 0 && sc + diff >= 0) sc += diff;
    else if (diff < 0) billDiscount += -diff;
    else if (billDiscount >= diff) billDiscount -= diff;
    else {
      const one = all.find((l) => l.qty === 1);
      if (!one) return cfail("TAX_ROUNDING_MISMATCH", "ยอดรวมภาษีของบิลไม่ตรงกับบิลห้อง (ปัดเศษต่อบรรทัด) — ตรวจค่าตั้งภาษี/การปัดเศษ");
      one.unitPriceSatang += diff;
    }
    diff = grand - (linesSum() - billDiscount + sc);
    if (diff !== 0) return cfail("TAX_ROUNDING_MISMATCH", "ยอดรวมภาษีของบิลไม่ตรงกับบิลห้อง — ตรวจค่าตั้งภาษี/การปัดเศษ");
  }
  if (billDiscount > linesSum()) return cfail("INVALID_INPUT", "ส่วนลดมากกว่ายอดค่าใช้จ่าย — ตรวจรายการส่วนลดก่อนเช็กเอาต์");
  return { lines: all, billDiscountSatang: billDiscount, serviceChargeSatang: sc, grandTotalSatang: grand, perFolio };
}

/** รายการ folio ของเป้าหมาย (+ คืนที่ยังไม่ post · เพื่อคาดยอดโดยไม่เขียน) */
async function planInputs(c: UnitCtx, rows: ResvRow[], withUnposted: boolean): Promise<FolioPlanIn[]> {
  const db = tenantDb(c);
  const types = await db.hotelRoomType.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.roomTypeId))] } }, select: { id: true, name: true } });
  const nameOf = new Map(types.map((t) => [t.id, t.name]));
  const out: FolioPlanIn[] = [];
  for (const rv of rows) {
    const f = await db.hotelFolio.findFirst({ where: { reservationId: rv.id } });
    const all: PlanItem[] = f ? await db.hotelFolioItem.findMany({ where: { folioId: f.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) : [];
    // ROOM ที่อ้างคืนที่เลิกนับแล้ว (ย่นวันออก) และยังไม่ปิดวัน = ไม่เก็บ (ผู้ตรวจรอบ 1 M1 · settle void ให้ใน tx A)
    const released = new Set((await db.hotelBookingNight.findMany({ where: { reservationId: rv.id, counted: false, postedAuditId: null }, select: { id: true } })).map((n) => n.id));
    const items = all.filter((i) => !(i.type === "ROOM" && i.refType === "HotelBookingNight" && i.refId && released.has(i.refId) && !i.voidedAt));
    if (withUnposted) {
      const nights = await db.hotelBookingNight.findMany({ where: { reservationId: rv.id, counted: true, folioItemId: null, date: { lt: rv.checkOutDate } }, orderBy: { date: "asc" } });
      for (const n of nights) items.push({ type: "ROOM", description: "ค่าห้อง", qty: 1, unitAmountSatang: n.priceSatang, amountSatang: n.priceSatang, voidedAt: null });
    }
    out.push({ folioId: f?.id ?? `new:${rv.id}`, reservationId: rv.id, roomTypeName: nameOf.get(rv.roomTypeId) ?? "ห้องพัก", items });
  }
  return out;
}

/** void ROOM ที่อ้างคืนที่เลิกนับแล้วและยังไม่ปิดวัน (ย่นวันออกหลังค่าห้องถูก post) — ผู้เรียกล็อก folio แล้ว */
async function voidReleasedNightsTx(tx: Tx, c: UnitCtx, folioId: string, reservationId: string, byUserId: string): Promise<number> {
  const released = await tx.hotelBookingNight.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId, counted: false, postedAuditId: null }, select: { id: true } });
  if (!released.length) return 0;
  const items = await tx.hotelFolioItem.findMany({ where: { folioId, type: "ROOM", refType: "HotelBookingNight", refId: { in: released.map((n) => n.id) }, voidedAt: null } });
  for (const it of items) await voidItemTx(tx, c, it, "คืนนี้ถูกปล่อยแล้ว (ย่นวันออก) — ไม่เก็บค่าห้อง", byUserId);
  return items.length;
}

// ───────────────────────── ภาษี · กะ · POS ─────────────────────────
type TaxCheck = { ok: boolean; warnings: { code: string; message: string }[] };
async function taxCheck(tenantId: string, posSystemId: string | null, st: FolioSettings): Promise<TaxCheck> {
  if (!posSystemId) return { ok: true, warnings: [{ code: "POS_UNLINKED", message: "โรงแรมนี้ยังไม่ผูกระบบขายหน้าร้าน (POS) — ผูกก่อนจึงเช็กเอาต์รับเงินได้" }] };
  const book = await posAccountSystemId(tenantId, posSystemId);
  if (!book) return { ok: true, warnings: [{ code: "ACCOUNT_UNLINKED", message: "ระบบขายหน้าร้านยังไม่เชื่อมบัญชี — บิลไม่ลงบัญชี/ภาษีให้อัตโนมัติ" }] };
  const v = await vatConfigOf(book);
  const posBp = v.vatRegistered && Number.isInteger(v.vatRateBp) && v.vatRateBp > 0 && v.vatRateBp <= 10_000 ? v.vatRateBp : 0;
  if (posBp !== st.vatBp)
    return { ok: false, warnings: [{ code: "TAX_CONFIG_MISMATCH", message: `อัตราภาษีของโรงแรม (${(st.vatBp / 100).toFixed(2)}%) ไม่ตรงกับระบบขาย/บัญชี (${(posBp / 100).toFixed(2)}%) — ตั้งค่าให้ตรงกันก่อนเช็กเอาต์` }] };
  return { ok: true, warnings: [] };
}
async function openShiftsOf(tenantId: string, unitId: string, posSystemId: string | null): Promise<{ id: string; label: string }[]> {
  if (!posSystemId) return [];
  const rows = await tenantDb({ tenantId, systemId: posSystemId }).posShift.findMany({ where: { unitId, status: "OPEN" }, orderBy: [{ openedAt: "asc" }, { id: "asc" }], select: { id: true, deviceLabel: true, shiftNo: true } });
  return rows.map((s) => ({ id: s.id, label: `${s.deviceLabel ?? "เคาน์เตอร์"} · กะที่ ${s.shiftNo}` }));
}
/** คีย์บิลของการเช็กเอาต์ — บิลของคีย์ถูก void ไปแล้ว ⇒ -r1, -r2 … · คืน {key, paid?} (paid = บิลที่ออกแล้วของคีย์นี้) */
async function saleKeyOf(tenantId: string, base: string): Promise<{ key: string; paid: boolean }> {
  for (let round = 0; round <= 20; round++) {
    const key = round === 0 ? base : `${base}-r${round}`;
    const st = await saleStatusByKey(tenantId, key);
    if (st === null) return { key, paid: false };
    if (st === "PAID") return { key, paid: true };
  }
  return { key: `${base}-r21`, paid: false };
}
type SaleRow = { id: string; receiptNo: string | null; grandTotalSatang: number; status: string; systemId: string };
async function saleOfKey(tenantId: string, key: string): Promise<SaleRow | null> {
  const r = await tenantDb({ tenantId }).$queryRaw<SaleRow[]>`
    SELECT id, "receiptNo", "grandTotalSatang", status::text AS status, "systemId" FROM "PosSale" WHERE "tenantId" = ${tenantId} AND "idempotencyKey" = ${key} LIMIT 1`;
  return r[0] ?? null;
}

// ───────────────────────── prepareCheckout (§3.4) ─────────────────────────
export type PrepareOk = {
  ok: true;
  lines: PosLine[];
  billDiscountSatang: number;
  serviceChargeSatang: number;
  grandTotalSatang: number;
  depositSatang: number;
  payableSatang: number;
  folios: { folioId: string; reservationId: string; totalSatang: number }[];
  security: { heldSatang: number; saleId: string | null; state: string };
  openShifts: { id: string; label: string }[];
  taxOk: boolean;
  taxMode: string;
  vatIncludedSatang: number;
  invoiceFromPos: boolean;
  posLinked: boolean;
  warnings: { code: string; message: string }[];
};
export async function prepareCheckout(actorIn: unknown, ctx: unknown, input: unknown): Promise<PrepareOk | CheckoutFail> {
  const t = await targetsOf(actorIn, ctx, input, ["hotel.reservation.checkOut"]);
  if (!("g" in t)) return t;
  const c = { tenantId: t.g.tenantId, unitId: t.g.unitId };
  const st = await folioSettings(c.tenantId, c.unitId);
  const plan = buildPlan(await planInputs(c, t.rows, true), st);
  if ("ok" in plan) return plan;
  const posSystemId = await systemForUnit(c.tenantId, c.unitId, "POS");
  const [tc, shifts, dep, security] = await Promise.all([
    taxCheck(c.tenantId, posSystemId, st),
    openShiftsOf(c.tenantId, c.unitId, posSystemId),
    t.head?.depositSaleId ? moduleDepositForBill(c.tenantId, c.unitId, t.head.depositSaleId, plan.grandTotalSatang) : Promise.resolve(null),
    t.rows.length === 1 ? securityStateOf(c.tenantId, t.rows[0]!) : Promise.resolve({ heldSatang: 0, saleId: null, state: "NONE" as const }),
  ]);
  const depositSatang = dep?.satang ?? 0;
  return {
    ok: true,
    lines: plan.lines,
    billDiscountSatang: plan.billDiscountSatang,
    serviceChargeSatang: plan.serviceChargeSatang,
    grandTotalSatang: plan.grandTotalSatang,
    depositSatang,
    payableSatang: plan.grandTotalSatang - depositSatang,
    folios: plan.perFolio,
    security,
    openShifts: shifts,
    taxOk: tc.ok,
    taxMode: st.mode,
    vatIncludedSatang: st.mode === "INCLUSIVE" ? taxLines(plan.grandTotalSatang, { mode: "INCLUSIVE", vatBp: st.vatBp, serviceChargeBp: 0 }, st.rounding).vatIncludedSatang : 0,
    invoiceFromPos: st.invoiceFromPos,
    posLinked: !!posSystemId,
    warnings: tc.warnings,
  };
}

// ───────────────────────── settleAndCheckOut (§2.4 · §3.4) ─────────────────────────
const PayRow = z
  .object({
    type: z.enum(COUNTER_PAY_TYPES, { message: "วิธีจ่ายต้องเป็น เงินสด · พร้อมเพย์ · โอน · บัตร" }),
    amountSatang: z.number({ message: "ยอดชำระต้องเป็นตัวเลข" }).int({ message: "ยอดชำระต้องเป็นจำนวนเต็มสตางค์" }).min(0, { message: "ยอดชำระต้องไม่ติดลบ" }).max(1_000_000_000),
    cashTenderedSatang: z.number().int({ message: "เงินที่รับต้องเป็นจำนวนเต็มสตางค์" }).min(0).max(1_000_000_000).optional().nullable(),
    reference: z.string().trim().max(64, { message: "เลขอ้างอิงยาวเกิน 64 ตัวอักษร" }).optional().nullable(),
  })
  .refine((p) => p.cashTenderedSatang == null || (p.type === "CASH" && p.cashTenderedSatang >= p.amountSatang), { message: "เงินที่รับต้องเป็นแถวเงินสดและไม่น้อยกว่ายอดของแถว" });
const SettleInput = z.object({
  reservationId: z.string().min(1).max(200).optional(),
  groupId: z.string().min(1).max(200).optional(),
  payMethods: z.array(PayRow).max(MAX_PAY_ROWS, { message: `แยกจ่ายได้ไม่เกิน ${MAX_PAY_ROWS} แถว` }),
  shiftId: z.string().min(1).max(200).nullable().optional(),
  taxInvoice: z.unknown().optional().nullable(),
  securityDeposit: z.enum(["REFUND", "FORFEIT"], { message: "เงินประกันต้องเลือก คืน หรือ ริบ" }).optional(),
  forfeitReason: z.string().trim().max(300).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});
type SettleOpts = { legacyCash?: boolean };
export type SettleOk = { ok: true; saleId: string | null; receiptNo: string | null; changeSatang: number; folios: { id: string; status: string; reservationId: string }[]; warnings: string[] };

const SALE_CODE: Record<string, CheckoutFailCode> = { SHIFT_REQUIRED: "SHIFT_REQUIRED", SHIFT_CLOSED: "SHIFT_CLOSED", PAYMENT_MISMATCH: "PAY_MISMATCH", SPLIT_INVALID: "INVALID_INPUT", VALIDATION: "INVALID_INPUT" };
const SHIFT_REASON: Record<string, string> = { SHIFT_REQUIRED: "ไม่พบกะที่เปิดอยู่ของเคาน์เตอร์นี้ — เปิดกะที่ POS ก่อน หรือเลือกกะที่ถูกต้อง", SHIFT_CLOSED: "กะที่เลือกปิดไปแล้ว — เปิดกะใหม่ที่ POS ก่อนรับเงิน" };

export async function settleAndCheckOut(actorIn: unknown, ctx: unknown, input: unknown, opts: SettleOpts = {}): Promise<SettleOk | CheckoutFail> {
  const t = await targetsOf(actorIn, ctx, input, ["hotel.reservation.checkOut"]);
  if (!("g" in t)) return t;
  const { g } = t;
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const st = await folioSettings(c.tenantId, c.unitId);
  const raw = isRec(input) ? input : {};
  const legacy = opts.legacyCash === true && raw.payMethods === undefined;
  if (raw.payMethods === undefined && !legacy) return cfail("PAY_METHODS_REQUIRED", "เลือกวิธีรับเงินก่อนเช็กเอาต์ (เงินสด · พร้อมเพย์ · โอน · บัตร)");
  if (legacy && !st.allowLegacyCash) return cfail("PAY_METHODS_REQUIRED", "ต้องเช็กเอาต์จากหน้าบิลระหว่างพัก (เลือกวิธีรับเงิน) — ทางเดิมแบบเงินสดอัตโนมัติปิดอยู่");
  const p = SettleInput.safeParse(legacy ? { ...raw, payMethods: [] } : raw);
  if (!p.success) return cfail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  const secMode = d.securityDeposit ?? "REFUND";
  // ประกัน (ห้องเดี่ยว) — ริบต้องเป็นผู้จัดการ + เหตุผล (ตรวจก่อนแตะเงิน)
  const secRv = t.rows.length === 1 ? t.rows[0]! : null;
  const sec = secRv ? await securityStateOf(c.tenantId, secRv) : { heldSatang: 0, saleId: null, state: "NONE" as const };
  if (secMode === "FORFEIT" && sec.state === "HELD") {
    if (!canDo(g.actor, g.unitId, "hotel.booking.manage")) return cfail("FORBIDDEN", "การริบเงินประกันต้องมีสิทธิ์จัดการการจอง (ผู้จัดการ)");
    if ((d.forfeitReason ?? "").length < 3) return cfail("INVALID_INPUT", "ระบุเหตุผลการริบเงินประกันอย่างน้อย 3 ตัวอักษร");
  }
  let taxInvoice: CreateSaleInput["taxInvoice"] | undefined;
  if (d.taxInvoice !== undefined && d.taxInvoice !== null) {
    if (!st.invoiceFromPos) return cfail("INVALID_INPUT", "โรงแรมนี้ปิดการออกใบกำกับภาษีเต็มรูปจากบิลเช็กเอาต์");
    const ti = isRec(d.taxInvoice) ? { ...d.taxInvoice, kind: d.taxInvoice.kind === "COMPANY" ? "JURISTIC" : d.taxInvoice.kind === "INDIVIDUAL" ? "PERSON" : d.taxInvoice.kind } : d.taxInvoice;
    const b = parseTaxInvoiceBuyer(ti);
    if (!b.ok) return cfail("INVALID_INPUT", b.message);
    taxInvoice = { ...b.buyer, requestedAt: new Date().toISOString() };
  }
  const posSystemId = await systemForUnit(c.tenantId, c.unitId, "POS");
  if (!posSystemId && !legacy) return cfail("POS_UNLINKED", "โรงแรมนี้ยังไม่ผูกระบบขายหน้าร้าน (POS) — ผูกระบบก่อนจึงเช็กเอาต์รับเงินได้");
  const key = await saleKeyOf(c.tenantId, t.keyBase);
  if (!key.paid && posSystemId) {
    const tc = await taxCheck(c.tenantId, posSystemId, st);
    if (!tc.ok) return cfail("TAX_CONFIG_MISMATCH", tc.warnings[0]?.message ?? "อัตราภาษีของโรงแรมไม่ตรงกับระบบขาย — ตั้งค่าให้ตรงกันก่อนเช็กเอาต์");
  }

  // (1) tx A: ล็อก folio · ยืนยันสถานะ · void ค่าห้องของคืนที่เลิกนับแล้ว (ย่นวันออก · ยังไม่ปิดวัน) · คำนวณใหม่
  //   คืนค้างไม่ post ที่นี่ — post ใน tx B หลังบิล POS สำเร็จ (POS ล้ม = folio ไม่เปลี่ยน · ผู้ตรวจรอบ 1 M1)
  const a = await unitTx(c, async (tx) => {
    for (const rv of [...t.rows].sort((x, y) => x.id.localeCompare(y.id))) {
      const cur = await tx.hotelReservation.findFirst({ where: { id: rv.id, tenantId: c.tenantId, unitId: c.unitId }, select: { id: true, status: true } });
      if (!cur || cur.status !== "CHECKED_IN") throw new FolioAbort(fail("NOT_CHECKED_IN", "การจองนี้เช็กเอาต์ไปแล้วหรือสถานะเปลี่ยน — โหลดใหม่"));
      const f = await lockFolio(tx, c, rv.id);
      if (!isOpen(f)) throw new FolioAbort(fail("FOLIO_CLOSED", R.closed));
      if ((await voidReleasedNightsTx(tx, c, f.id, rv.id, g.actor.userId)) > 0) await recomputeTx(tx, c, f.id, st);
    }
    return true;
  });
  if (isFolioFail(a)) return asCheckout(a);
  const plan = buildPlan(await planInputs(c, t.rows, true), st);
  if ("ok" in plan) return plan;

  // (2)+(3) บิล POS ใบเดียว (นอก tx)
  let sale: SaleRow | null = null;
  const warnings: string[] = [];
  let changeSatang = 0;
  if (posSystemId && !(plan.grandTotalSatang === 0 && plan.lines.length === 0)) {
    if (key.paid) sale = await saleOfKey(c.tenantId, key.key);
    else {
      const dep = t.head?.depositSaleId ? await moduleDepositForBill(c.tenantId, c.unitId, t.head.depositSaleId, plan.grandTotalSatang) : null;
      const payable = plan.grandTotalSatang - (dep?.satang ?? 0);
      // ทางเดิม (P1): มัดจำ + เงินสดส่วนที่เหลือเสมอ (แถวเงินสด 0 เมื่อมัดจำพอดี — แบบบิลเดิม) · ทางใหม่: แถวยอด 0 ไม่ส่งเข้า POS
      const pays = legacy ? [{ type: "CASH" as const, amountSatang: Math.max(0, payable) }] : d.payMethods.filter((x) => x.amountSatang > 0 || (x.cashTenderedSatang ?? 0) > 0);
      const paid = pays.reduce((s, x) => s + x.amountSatang, 0);
      if (paid !== payable) return cfail("PAY_MISMATCH", `ยอดที่รับ ฿${baht(paid)} ไม่เท่ากับยอดที่ต้องชำระ ฿${baht(payable)} — ตรวจยอดแต่ละวิธีจ่าย`);
      changeSatang = pays.reduce((s, x) => s + ("cashTenderedSatang" in x && x.cashTenderedSatang != null ? x.cashTenderedSatang - x.amountSatang : 0), 0);
      const memberId = t.head?.customerId ?? t.rows[0]?.customerId ?? null;
      const saleInput: CreateSaleInput = {
        tenantId: c.tenantId,
        unitId: c.unitId,
        systemId: posSystemId,
        sourceModule: "HOTEL",
        sourceId: t.sourceId,
        idempotencyKey: key.key,
        lines: plan.lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceSatang: l.unitPriceSatang, ...(l.discountSatang ? { discountSatang: l.discountSatang } : {}) })),
        ...(plan.billDiscountSatang > 0 ? { billDiscountSatang: plan.billDiscountSatang } : {}),
        ...(plan.serviceChargeSatang > 0 ? { serviceChargeSatang: plan.serviceChargeSatang } : {}),
        payMethods: [
          ...(dep ? [{ type: "DEPOSIT" as PosPayType, amountSatang: dep.satang, refSaleId: dep.refSaleId }] : []),
          ...pays.map((x) => ({
            type: x.type as PosPayType,
            amountSatang: x.amountSatang,
            ...("cashTenderedSatang" in x && x.cashTenderedSatang != null ? { cashTenderedSatang: x.cashTenderedSatang } : {}),
            ...("reference" in x && x.reference ? { reference: x.reference } : {}),
          })),
        ],
        ...(legacy && d.shiftId === undefined ? {} : { shiftId: d.shiftId ?? null }),
        ...(memberId ? { memberId, memberAttachOnly: true } : {}),
        ...(taxInvoice ? { taxInvoice } : {}),
        ...(g.actor.userId.startsWith("module:") ? {} : { soldByUserId: g.actor.userId }),
        ...(d.note ? { note: d.note } : {}),
      };
      try {
        const r = await createSale(saleInput);
        sale = { id: r.saleId, receiptNo: r.receiptNo, grandTotalSatang: r.grandTotalSatang, status: r.status ?? "PAID", systemId: posSystemId };
      } catch (e) {
        const again = await saleOfKey(c.tenantId, key.key);
        if (again && again.status === "PAID") sale = again; // แข่งกันออกบิลคีย์เดียวกัน (X4) ⇒ ใช้บิลที่ออกแล้ว
        else if (e instanceof PosSaleError) return cfail(SALE_CODE[e.code] ?? "POS_REJECTED", SHIFT_REASON[e.code] ?? errText(e, "ระบบขายหน้าร้านปฏิเสธบิลนี้ — ลองอีกครั้ง"));
        else if (e instanceof Error && e.message.startsWith("PAYMENT_MISMATCH")) return cfail("PAY_MISMATCH", "ยอดที่รับไม่เท่ากับยอดบิล — ตรวจยอดแต่ละวิธีจ่าย");
        else throw e;
      }
    }
    if (!sale || sale.status !== "PAID") return cfail("POS_REJECTED", "บิลของการเช็กเอาต์นี้ถูกยกเลิกแล้ว — ลองเช็กเอาต์อีกครั้ง");
  }

  // ประกัน (นอก tx · ก่อน tx B)
  const secOut: SecOut[] = [];
  if (secRv && sec.state === "HELD" && sec.saleId) {
    if (secMode === "FORFEIT") {
      const r = await forfeitMoney(c, secRv, sec.saleId, d.forfeitReason ?? "", g.actor.userId);
      if (r.ok) secOut.push({ reservationId: secRv.id, kind: "FORFEIT", saleId: r.saleId, amountSatang: r.satang, reason: d.forfeitReason ?? "" });
      else warnings.push(`ริบเงินประกันไม่สำเร็จ (${r.message}) — ทำที่การ์ดเงินประกันอีกครั้ง`);
    } else {
      const r = await moduleRefundDeposit({ tenantId: c.tenantId, unitId: c.unitId, receiptSaleId: sec.saleId, reason: `คืนเงินประกันห้อง ${secRv.code}`, actorId: g.actor.userId });
      if (r.ok && r.refundSaleId) secOut.push({ reservationId: secRv.id, kind: "REFUND", saleId: r.refundSaleId, amountSatang: sec.heldSatang, reason: "" });
      else warnings.push(`คืนเงินประกันไม่สำเร็จ (${r.ok ? "ไม่พบใบรับ" : r.message}) — คืนที่การ์ดเงินประกันอีกครั้ง`);
    }
  }
  // กลุ่ม (ผู้ตรวจรอบ 1 m2): คืนเงินประกันที่ถือของทุกห้องที่ออก · ริบทั้งกลุ่มไม่รองรับ ⇒ เตือนรายห้อง (ไม่เงียบ)
  if (!secRv) {
    for (const rv of t.rows) {
      const st2 = await securityStateOf(c.tenantId, rv);
      if (st2.state !== "HELD" || !st2.saleId) continue;
      if (secMode === "FORFEIT") {
        warnings.push(`ห้อง ${rv.code} ยังถือเงินประกัน ฿${baht(st2.heldSatang)} — ริบได้ทีละห้องที่การ์ดเงินประกัน`);
        continue;
      }
      const r = await moduleRefundDeposit({ tenantId: c.tenantId, unitId: c.unitId, receiptSaleId: st2.saleId, reason: `คืนเงินประกันห้อง ${rv.code}`, actorId: g.actor.userId });
      if (r.ok && r.refundSaleId) secOut.push({ reservationId: rv.id, kind: "REFUND", saleId: r.refundSaleId, amountSatang: st2.heldSatang, reason: "" });
      else warnings.push(`ห้อง ${rv.code}: คืนเงินประกัน ฿${baht(st2.heldSatang)} ไม่สำเร็จ (${r.ok ? "ไม่พบใบรับ" : r.message}) — คืนที่การ์ดเงินประกัน`);
    }
  }

  // (4) tx B
  const b = await finalizeTx(c, g.actor, t, sale, secOut, st);
  if (isFolioFail(b)) {
    if (b.code !== "NOT_CHECKED_IN") console.error(`[hotel.checkout] tenant=${c.tenantId} key=${key.key}: บิล POS ออกแล้วแต่ปิด folio ไม่สำเร็จ (${b.code}) — เรียกเช็กเอาต์ซ้ำ/ให้ผู้จัดการตรวจบิล`);
    return asCheckout(b);
  }

  // (5) หลัง tx B: คืนมัดจำส่วนเกิน · กันรายได้ซ้ำของบิลร้านที่ลงห้อง
  // ทางเดิม P1 (legacyCash): มัดจำคงเหลือค้าง OPEN แบบเดิม (คืนที่หน้าขาย/refundStay คืนทั้งก้อน — สัญญา P5.1 MA2b) · ทางใหม่: คืนส่วนเกินทันที (ใบ §2.5)
  if (sale && t.head?.depositSaleId && !legacy) await refundExcessDeposit(c, t, sale, warnings);
  if (sale) await reverseRoomCharges(c, b.posChargeSaleIds, sale.id, warnings);
  return { ok: true, saleId: sale?.id ?? null, receiptNo: sale?.receiptNo ?? null, changeSatang, folios: b.folios, warnings };
}

type FinalOut = { folios: { id: string; status: string; reservationId: string }[]; posChargeSaleIds: string[] };
type SecOut = { reservationId: string; kind: "REFUND" | "FORFEIT"; saleId: string; amountSatang: number; reason: string };
const ACTIVE_RV = ["HOLD", "CONFIRMED", "CHECKED_IN", "BOOKED"] as const;
async function finalizeTx(c: UnitCtx, actor: FolioActor, t: Targets, sale: SaleRow | null, secOut: SecOut[], st: FolioSettings): Promise<FinalOut | FolioFail> {
  const actorId = actor.userId;
  return unitTx(c, async (tx) => {
    for (const typeId of [...new Set(t.rows.map((r) => r.roomTypeId))].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${c.unitId}::text || ':' || ${typeId}::text))`;
    const ordered = [...t.rows].sort((x, y) => x.id.localeCompare(y.id));
    const folios = new Map<string, Awaited<ReturnType<typeof lockFolio>>>();
    for (const rv of ordered) folios.set(rv.id, await lockFolio(tx, c, rv.id));
    const holder = t.head;
    const holderInTargets = !!holder && folios.has(holder.id);
    const holderFolio = holder ? (holderInTargets ? folios.get(holder.id)! : await lockFolio(tx, c, holder.id)) : null;
    const today = todayYmd();
    for (const rv of ordered) {
      const f = folios.get(rv.id)!;
      if (!isOpen(f)) throw new FolioAbort(fail("FOLIO_CLOSED", R.closed));
      const cur = await tx.hotelReservation.findFirst({ where: { id: rv.id, tenantId: c.tenantId, unitId: c.unitId }, select: { id: true, roomTypeId: true, checkOutDate: true } });
      const cas = await tx.hotelReservation.updateMany({ where: { id: rv.id, tenantId: c.tenantId, unitId: c.unitId, status: "CHECKED_IN" }, data: { status: "CHECKED_OUT", checkedOutAt: new Date() } });
      if (cas.count === 0 || !cur) throw new FolioAbort(fail("NOT_CHECKED_IN", "การจองนี้เช็กเอาต์ไปแล้ว (บิลเดียวกัน) — โหลดใหม่"));
      // ค่าห้องคืนค้างถึงวันออก (post หลังบิล POS สำเร็จเท่านั้น · ผู้ตรวจรอบ 1 M1) · คืนที่เลิกนับแล้วไม่เก็บ
      await voidReleasedNightsTx(tx, c, f.id, rv.id, actorId);
      await postRoomNightsTx(tx, c, f.id, cur, ymdOf(cur.checkOutDate), null);
      await recomputeTx(tx, c, f.id, st);
    }
    const receipt = sale?.receiptNo ? ` ${sale.receiptNo}` : "";
    const totals: { rv: ResvRow; folioId: string; total: number }[] = [];
    const posChargeSaleIds = new Set<string>();
    for (const rv of ordered) {
      const f = folios.get(rv.id)!;
      const items = await tx.hotelFolioItem.findMany({ where: { folioId: f.id } });
      const total = effective(items).filter((i) => CHARGE_TYPES.includes(i.type) || i.type === "TAX" || i.type === "SERVICE_CHARGE").reduce((s, i) => s + i.amountSatang, 0);
      for (const i of effective(items)) if (i.type === "POS_CHARGE" && i.refType === "PosSale" && i.refId) posChargeSaleIds.add(i.refId);
      totals.push({ rv, folioId: f.id, total });
    }
    const sum = totals.reduce((s, x) => s + x.total, 0);
    if (sale && sum !== sale.grandTotalSatang) throw new FolioAbort(fail("PAY_MISMATCH", `ยอดบิลห้อง (฿${baht(sum)}) ไม่ตรงกับบิล POS${receipt} (฿${baht(sale.grandTotalSatang)}) — มีรายการเปลี่ยนระหว่างเช็กเอาต์ ให้ผู้จัดการยกเลิกบิล POS แล้วเช็กเอาต์ใหม่`));
    if (!sale && sum !== 0 && !st.allowLegacyCash) throw new FolioAbort(fail("PAY_MISMATCH", "ยังไม่มีบิลรับเงิน"));
    // มัดจำที่บิลนี้ใช้ (อ่านจากแถวชำระจริงของบิล): DEPOSIT บวกบน folio ที่ถือมัดจำ (ยังเปิด/กำลังปิด) ·
    //   folio ผู้ถือปิดไปแล้ว (หัวกลุ่มออกก่อน) ⇒ ห้ามเขียน folio ที่ปิด (ผู้ตรวจรอบ 1 m1) — ลงคู่ "รับโอนมัดจำ (ลบ) + ใช้มัดจำ (บวก)" ที่ folio ห้องที่กำลังออก
    if (sale && holder?.depositSaleId && holderFolio) {
      const usedRows = await tx.posPayment.findMany({ where: { saleId: sale.id, type: "DEPOSIT", refSaleId: holder.depositSaleId }, select: { amountSatang: true } });
      const used = usedRows.reduce((s, x) => s + x.amountSatang, 0);
      const target = holderInTargets || isOpen(holderFolio) ? holderFolio.id : totals[0]!.folioId;
      const dup = await tx.hotelFolioItem.findFirst({ where: { folioId: target, type: "DEPOSIT", refType: "PosSale", refId: sale.id }, select: { id: true } });
      if (used > 0 && !dup) {
        if (target !== holderFolio.id) await insertItemTx(tx, c, target, { type: "DEPOSIT", description: `รับโอนมัดจำของกลุ่ม (การจอง ${holder.code})`, qty: 1, unitAmountSatang: -used, refType: "PosSale", refId: holder.depositSaleId }, actorId);
        await insertItemTx(tx, c, target, { type: "DEPOSIT", description: `ใช้มัดจำชำระบิลเช็กเอาต์${receipt}`, qty: 1, unitAmountSatang: used, refType: "PosSale", refId: sale.id }, actorId);
      }
    }
    const outFolios: FinalOut["folios"] = [];
    for (const x of totals) {
      if (x.total !== 0 || sale) await insertItemTx(tx, c, x.folioId, { type: "PAYMENT", description: `ชำระบิลเช็กเอาต์${receipt}`, qty: 1, unitAmountSatang: -x.total, refType: sale ? "PosSale" : null, refId: sale?.id ?? null }, actorId);
      for (const so of secOut.filter((y) => y.reservationId === x.rv.id)) {
        const type = so.kind === "REFUND" ? "SECURITY_REFUND" : "PENALTY";
        const dupSec = await tx.hotelFolioItem.findFirst({ where: { folioId: x.folioId, type, refType: "PosSale", refId: so.saleId }, select: { id: true } });
        if (dupSec) continue;
        const description = so.kind === "REFUND" ? `คืนเงินประกันห้อง ฿${baht(so.amountSatang)}` : `ริบเงินประกันห้อง ฿${baht(so.amountSatang)} — ${so.reason}`;
        await insertItemTx(tx, c, x.folioId, { type, description, qty: 1, unitAmountSatang: 0, amountSatang: 0, refType: "PosSale", refId: so.saleId }, actorId);
        const event = so.kind === "REFUND" ? "hotel.security_deposit.refunded" : "hotel.security_deposit.forfeited";
        await auditTx(tx, c, actorId, event, "HotelReservation", x.rv.id, { securitySaleId: x.rv.securityDepositSaleId }, { saleId: so.saleId, amountSatang: so.amountSatang, type, via: "checkout" });
        await emitFolioTx(tx, c, event, so.saleId, { reservationId: x.rv.id, folioId: x.folioId, saleId: so.saleId, amountSatang: so.amountSatang });
      }
    }
    // หัวกลุ่มออกแต่ห้องอื่นในกลุ่มยังใช้มัดจำต่อ ⇒ ย้ายเครดิตมัดจำคงเหลือออกจาก folio หัว (folio หัวปิดที่ 0 · ห้องที่ใช้ภายหลังลงคู่รับโอน)
    if (holderInTargets && holder && t.groupId && holderFolio) {
      const others = await tx.hotelReservation.count({ where: { tenantId: c.tenantId, unitId: c.unitId, groupId: t.groupId, status: { in: [...ACTIVE_RV] } } });
      if (others > 0) {
        const dep = await tx.hotelFolioItem.aggregate({ where: { folioId: holderFolio.id, type: { in: ["DEPOSIT", "REFUND"] } }, _sum: { amountSatang: true } });
        const credit = -(dep._sum.amountSatang ?? 0);
        if (credit > 0) await insertItemTx(tx, c, holderFolio.id, { type: "DEPOSIT", description: "ย้ายมัดจำคงเหลือไปใช้กับห้องอื่นในกลุ่ม", qty: 1, unitAmountSatang: credit, refType: "PosSale", refId: holder.depositSaleId }, actorId);
      }
    }
    for (const x of totals) {
      const balance = await recomputeTx(tx, c, x.folioId, st);
      const deps = await tx.hotelFolioItem.aggregate({ where: { folioId: x.folioId, type: { in: ["DEPOSIT", "REFUND"] } }, _sum: { amountSatang: true } });
      if (balance - (deps._sum.amountSatang ?? 0) !== 0) {
        console.error(`[hotel.checkout] วิกฤต tenant=${c.tenantId} folio=${x.folioId}: ยอดคงค้างหลังชำระไม่เป็น 0 — ย้อนทั้งก้อน`);
        throw new FolioAbort(fail("PAY_MISMATCH", "ยอดคงค้างหลังชำระไม่เป็นศูนย์ — ย้อนการเช็กเอาต์แล้ว ให้ผู้จัดการตรวจบิล"));
      }
      await tx.hotelFolio.updateMany({ where: { id: x.folioId, tenantId: c.tenantId, unitId: c.unitId }, data: { status: "SETTLED", settledSaleId: sale?.id ?? null, settledAt: new Date() } });
      outFolios.push({ id: x.folioId, status: "SETTLED", reservationId: x.rv.id });
    }
    if (holderFolio && !holderInTargets && isOpen(holderFolio)) await recomputeTx(tx, c, holderFolio.id, st);
    for (const x of totals) {
      const rv = x.rv;
      if (rv.roomId) {
        const room = await tx.hotelRoom.findFirst({ where: { id: rv.roomId, tenantId: c.tenantId, unitId: c.unitId }, select: { hkStatus: true } });
        await tx.hotelRoom.updateMany({ where: { id: rv.roomId, tenantId: c.tenantId, unitId: c.unitId }, data: { status: "CLEANING", hkStatus: "DIRTY", hkUpdatedAt: new Date() } });
        await tx.hotelHousekeepingLog.create({ data: { tenantId: c.tenantId, unitId: c.unitId, roomId: rv.roomId, fromStatus: room?.hkStatus ?? "CLEAN", toStatus: "DIRTY", byUserId: actorId.startsWith("module:") ? null : actorId, reservationId: rv.id, note: "เช็กเอาต์" } });
      }
      // ออกก่อนกำหนด: คืนตั้งแต่คืนนี้เป็นต้นไปไม่ถือห้องแล้ว (ค่าห้องเก็บตามที่ post · ห้องว่างขายต่อได้ — เทียบ P1 ที่ CHECKED_OUT ไม่กินห้อง)
      await tx.hotelBookingNight.updateMany({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, counted: true, date: { gte: dbDate(today) } }, data: { counted: false } });
      const occ = await tx.roomOccupancy.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, refType: "HotelReservation", refId: rv.id, active: true }, select: { id: true } });
      for (const o of occ) await releaseOccupancy(tx, { tenantId: c.tenantId, unitId: c.unitId, occupancyId: o.id, reason: "เช็กเอาต์" });
      await auditTx(tx, c, actorId, "hotel.folio.settled", "HotelReservation", rv.id, { status: "CHECKED_IN", folioStatus: "OPEN" }, { status: "CHECKED_OUT", folioStatus: "SETTLED", folioId: x.folioId, saleId: sale?.id ?? null, receiptNo: sale?.receiptNo ?? null, amountSatang: x.total, groupId: t.groupId });
      await emitFolioTx(tx, c, "hotel.folio.settled", `${x.folioId}#${sale?.id ?? "nopos"}`, { reservationId: rv.id, groupId: t.groupId, folioId: x.folioId, saleId: sale?.id ?? null, amountSatang: x.total });
      // CRM C2.9 ▸ "เช็คเอาท์แล้ว" ใน tx เดียวกับสถานะ (คีย์เดิมของ P1 · payload เดิม + saleId · ไม่มีชื่อ/เบอร์) ◂
      await emitOutbox(tx, { tenantId: c.tenantId, unitId: c.unitId, type: "hotel.checked_out", idempotencyKey: `hotel.checked_out#${rv.id}`, payload: { reservationId: rv.id, unitId: c.unitId, partyId: rv.partyId, nights: rv.nights, totalSatang: rv.totalSatang, saleId: sale?.id ?? null } });
    }
    return { folios: outFolios, posChargeSaleIds: [...posChargeSaleIds] };
  });
}

/** มัดจำคงเหลือหลังบิล (มัดจำ > ยอด · ใบ §2.5) ⇒ คืนผ่าน POS เมื่อกลุ่มไม่เหลือห้องที่ยังใช้มัดจำ · แถว REFUND (บวก) บน folio ของหัวกลุ่ม */
async function refundExcessDeposit(c: UnitCtx, t: Targets, sale: SaleRow, warnings: string[]): Promise<void> {
  const head = t.head;
  if (!head?.depositSaleId) return;
  try {
    if (t.groupId) {
      const active = await tenantDb(c).hotelReservation.count({ where: { groupId: t.groupId, status: { in: ["HOLD", "CONFIRMED", "CHECKED_IN", "BOOKED"] } } });
      if (active > 0) return; // ห้องอื่นในกลุ่มยังใช้มัดจำได้
    }
    const left = await moduleDepositForBill(c.tenantId, c.unitId, head.depositSaleId, Number.MAX_SAFE_INTEGER);
    if (!left || left.satang <= 0) return;
    const r = await moduleRefundDeposit({ tenantId: c.tenantId, unitId: c.unitId, receiptSaleId: head.depositSaleId, reason: `คืนมัดจำส่วนเกินหลังเช็กเอาต์ ${head.code}`, actorId: SYSTEM_ID });
    if (!r.ok || !r.refundSaleId) {
      warnings.push(`คืนมัดจำส่วนเกิน ฿${baht(left.satang)} ไม่สำเร็จ (${r.ok ? "ไม่พบใบรับ" : r.message}) — คืนที่หน้าขาย`);
      return;
    }
    const refundId = r.refundSaleId;
    const amt = await tenantDb({ tenantId: c.tenantId }).$queryRaw<{ g: number }[]>`SELECT "grandTotalSatang" AS g FROM "PosSale" WHERE id = ${refundId} AND "tenantId" = ${c.tenantId} LIMIT 1`;
    const amount = Math.abs(amt[0]?.g ?? left.satang);
    // ผู้ถือมัดจำออกในบิลนี้ ⇒ REFUND ที่ folio ผู้ถือ · ผู้ถือออกไปก่อนแล้ว (เครดิตถูกย้ายออก) ⇒ คู่ "รับโอน + คืน" ที่ folio ห้องที่เพิ่งออก (ไม่เขียน folio ที่ปิดก่อนหน้า)
    const holderHere = t.rows.some((r) => r.id === head.id);
    const rid = holderHere ? head.id : t.rows[0]!.id;
    await unitTx(c, async (tx) => {
      const f = await lockFolio(tx, c, rid);
      const dup = await tx.hotelFolioItem.findFirst({ where: { folioId: f.id, type: "REFUND", refType: "PosSale", refId: refundId }, select: { id: true } });
      if (dup) return null;
      if (!holderHere) await insertItemTx(tx, c, f.id, { type: "DEPOSIT", description: `รับโอนมัดจำคงเหลือของกลุ่ม (การจอง ${head.code})`, qty: 1, unitAmountSatang: -amount, refType: "PosSale", refId: head.depositSaleId }, SYSTEM_ID);
      await insertItemTx(tx, c, f.id, { type: "REFUND", description: `คืนมัดจำส่วนเกิน (ใบคืนอ้างใบรับมัดจำ · บิล${sale.receiptNo ? ` ${sale.receiptNo}` : ""})`, qty: 1, unitAmountSatang: amount, refType: "PosSale", refId: refundId }, SYSTEM_ID);
      await recomputeTx(tx, c, f.id);
      return null;
    });
  } catch (e) {
    warnings.push(`คืนมัดจำส่วนเกินไม่สำเร็จ — คืนที่หน้าขาย (${e instanceof Error ? e.message.slice(0, 80) : "error"})`);
  }
}

/** บิลร้านที่จ่ายแบบลงห้อง (ROOM_CHARGE) ซึ่งรวมเข้าบิลเช็กเอาต์แล้ว ⇒ กลับรายการบัญชีของบิลร้าน (รายได้รับรู้ครั้งเดียวที่บิลโรงแรม · ลูกหนี้ 1100 ล้าง) */
export async function reverseRoomCharges(c: UnitCtx, saleIds: string[], settleSaleId: string, warnings: string[], restore = false): Promise<void> {
  if (!saleIds.length) return;
  // ยอดลงห้อง (Σ ROOM_CHARGE) กับยอดบิลร้าน — บิลผสม (เงินสดที่ร้าน + ลงห้อง) ปรับบัญชีเฉพาะส่วนลงห้อง (ผู้ตรวจรอบ 1 C1)
  const rows = await tenantDb({ tenantId: c.tenantId }).$queryRaw<{ id: string; systemId: string; rc: bigint | number; gross: number }[]>`
    SELECT s.id, s."systemId", sum(p."amountSatang") AS rc, s."grandTotalSatang" AS gross FROM "PosSale" s JOIN "PosPayment" p ON p."saleId" = s.id
    WHERE s."tenantId" = ${c.tenantId} AND p.type = 'ROOM_CHARGE' AND s.id = ANY(${saleIds}::text[]) GROUP BY s.id, s."systemId", s."grandTotalSatang"`;
  for (const s of rows) {
    try {
      const input = { tenantId: c.tenantId, posSystemId: s.systemId, saleId: s.id, settleSaleId, roomChargeSatang: Number(s.rc), grossSatang: s.gross, reason: restore ? "คืนเงินการเข้าพัก — บิลร้านกลับเป็นลูกหนี้" : "รวมเข้าบิลเช็กเอาต์ของโรงแรมแล้ว" };
      if (restore) await restoreRoomChargePosting(input);
      else await reverseRoomChargePosting(input);
    } catch (e) {
      warnings.push(`ปรับบัญชีบิลร้านที่ลงห้องไม่สำเร็จ — ให้ฝ่ายบัญชีตรวจ`);
      console.warn(`[hotel.checkout] posting_warn tenant=${c.tenantId} sale=${s.id}: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
      await emitOutboxOutsideTx({ tenantId: c.tenantId, unitId: c.unitId, type: "hotel.folio.posting_warn", idempotencyKey: `hotel.folio.posting_warn#${s.id}#${settleSaleId}#${restore ? "restore" : "reverse"}`, payload: { tenantId: c.tenantId, unitId: c.unitId, saleId: s.id, settleSaleId, reason: restore ? "RESTORE_FAILED" : "REVERSE_FAILED" } });
    }
  }
}

/** refundStay (service.ts) หลัง void บิลเช็กเอาต์: folio → VOID (+ REFUND เท่ายอดที่ชำระ) · บิลร้านที่ลงห้องคืนสภาพลูกหนี้ (restoreRoomChargePosting) */
export async function afterRefundStay(tenantId: string, unitId: string, reservationId: string, settleSaleId: string): Promise<void> {
  const c = { tenantId, unitId };
  const out = await unitTx(c, async (tx) => {
    const f = await lockFolio(tx, c, reservationId);
    const items = await tx.hotelFolioItem.findMany({ where: { folioId: f.id } });
    const paid = -effective(items).filter((i) => i.type === "PAYMENT" && i.refId === settleSaleId).reduce((s, i) => s + i.amountSatang, 0);
    const done = items.some((i) => i.type === "REFUND" && i.refId === settleSaleId);
    if (paid > 0 && !done) await insertItemTx(tx, c, f.id, { type: "REFUND", description: "คืนเงินบิลเช็กเอาต์ (ยกเลิกบิล POS)", qty: 1, unitAmountSatang: paid, refType: "PosSale", refId: settleSaleId }, SYSTEM_ID);
    await recomputeTx(tx, c, f.id);
    if (f.status !== "VOID") {
      await tx.hotelFolio.updateMany({ where: { id: f.id, tenantId, unitId }, data: { status: "VOID" } });
      await auditTx(tx, c, SYSTEM_ID, "hotel.folio.refund", "HotelReservation", reservationId, { folioStatus: f.status }, { folioStatus: "VOID", saleId: settleSaleId, refundSatang: paid });
    }
    return effective(items).filter((i) => i.type === "POS_CHARGE" && i.refType === "PosSale" && i.refId).map((i) => i.refId as string);
  });
  if (isFolioFail(out)) {
    console.warn(`[hotel.refundStay] tenant=${tenantId} reservation=${reservationId}: ปิด folio ไม่สำเร็จ (${out.code})`);
    return;
  }
  await reverseRoomCharges(c, [...new Set(out)], settleSaleId, [], true);
}

// ───────────────────────── เงินประกันห้อง (§3.5 · Q3) ─────────────────────────
const SecTakeInput = z.object({
  reservationId: z.string().min(1).max(200),
  amountSatang: z.number().int({ message: "ยอดต้องเป็นจำนวนเต็มสตางค์" }).min(1, { message: "ยอดต้องมากกว่า 0" }).max(100_000_000).optional().nullable(),
  payType: z.enum(DEPOSIT_PAY_TYPES, { message: "วิธีรับเงินประกันไม่ถูกต้อง (เงินสด · พร้อมเพย์ · โอน · บัตร)" }),
  reference: z.string().trim().max(64).optional().nullable(),
});
const PAY_TH: Record<string, string> = { CASH: "เงินสด", PROMPTPAY: "พร้อมเพย์", TRANSFER: "โอน", CARD: "บัตร" };

export async function takeSecurityDeposit(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; saleId: string; duplicated?: boolean } | CheckoutFail> {
  const g = await reservationGate(actorIn, ctx, input, ["hotel.reservation.checkIn", "hotel.folio.post"]);
  if (isFolioFail(g)) return asCheckout(g);
  const p = SecTakeInput.safeParse(input);
  if (!p.success) return cfail("INVALID_INPUT", zodReason(p.error));
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const rv = g.rv;
  if (!["CONFIRMED", "CHECKED_IN", "BOOKED"].includes(rv.status)) return cfail("NOT_CHECKED_IN", "รับเงินประกันได้เฉพาะการจองที่ยืนยันแล้วหรือเข้าพักอยู่");
  const cur = await securityStateOf(c.tenantId, rv);
  if (cur.state === "HELD" && cur.saleId) return { ok: true, saleId: cur.saleId, duplicated: true };
  const sv = await resolveSettings({ tenantId: c.tenantId }, ["rooms.hotel.securityDeposit.enabled", "rooms.hotel.securityDeposit"], { unitId: c.unitId, roomTypeId: rv.roomTypeId });
  if (sv["rooms.hotel.securityDeposit.enabled"]?.value !== true) return cfail("DISABLED", "โรงแรมนี้ยังไม่เปิดเก็บเงินประกันห้อง (ตั้งค่า › โรงแรม › เก็บเงินประกันห้อง)");
  const amount = p.data.amountSatang ?? (typeof sv["rooms.hotel.securityDeposit"]?.value === "number" ? (sv["rooms.hotel.securityDeposit"]!.value as number) : 0);
  if (!(amount > 0)) return cfail("INVALID_INPUT", "ยอดเงินประกันต้องมากกว่า 0");
  const systemId = await systemForUnit(c.tenantId, c.unitId, "POS");
  if (!systemId) return cfail("POS_UNLINKED", "โรงแรมนี้ยังไม่ผูกระบบขายหน้าร้าน (POS) — ผูกก่อนจึงรับเงินประกันได้");
  let saleId: string;
  try {
    const r = await moduleTakeDeposit(
      { ...c, systemId, keyBase: `hotel-secdep-${rv.id}`, amountSatang: amount, payType: p.data.payType, customerId: rv.customerId ?? null, customerName: rv.guestName ?? null, note: `เงินประกันห้อง ${rv.code}`, createdBy: SYSTEM_ID },
      (tx, k) =>
        createSale(
          {
            ...c,
            systemId,
            sourceModule: k.sourceModule,
            sourceId: k.sourceId,
            idempotencyKey: k.idempotencyKey,
            lines: [{ name: `เงินประกันห้อง ${rv.code}`, qty: 1, unitPriceSatang: amount }],
            payMethods: [{ type: k.payType, amountSatang: amount, ...(p.data.reference ? { reference: p.data.reference } : {}) }],
          },
          callerTx(tx),
        ),
    );
    saleId = r.saleId;
  } catch (e) {
    if (e instanceof PosSaleError) return cfail(SALE_CODE[e.code] ?? "POS_REJECTED", SHIFT_REASON[e.code] ?? errText(e, "ระบบขายหน้าร้านปฏิเสธใบรับเงินประกัน"));
    throw e;
  }
  const out = await unitTx(c, async (tx) => {
    const f = await lockFolio(tx, c, rv.id);
    await tx.hotelReservation.updateMany({ where: { id: rv.id, tenantId: c.tenantId, unitId: c.unitId }, data: { securityDepositSatang: amount, securityDepositSaleId: saleId } });
    const dup = await tx.hotelFolioItem.findFirst({ where: { folioId: f.id, type: "SECURITY_DEPOSIT", refType: "PosSale", refId: saleId }, select: { id: true } });
    if (dup) return null;
    await insertItemTx(tx, c, f.id, { type: "SECURITY_DEPOSIT", description: `รับเงินประกันห้อง ฿${baht(amount)} (${PAY_TH[p.data.payType] ?? p.data.payType}) · คืนแยกตอนเช็กเอาต์`, qty: 1, unitAmountSatang: 0, amountSatang: 0, refType: "PosSale", refId: saleId }, g.actor.userId);
    await recomputeTx(tx, c, f.id);
    await auditTx(tx, c, g.actor.userId, "hotel.security_deposit.taken", "HotelReservation", rv.id, { securityDepositSatang: rv.securityDepositSatang }, { securityDepositSatang: amount, saleId, payType: p.data.payType });
    await emitFolioTx(tx, c, "hotel.security_deposit.taken", saleId, { reservationId: rv.id, folioId: f.id, saleId, amountSatang: amount });
    return null;
  });
  if (isFolioFail(out)) return asCheckout(out);
  return { ok: true, saleId };
}

async function securityGate(actorIn: unknown, ctx: unknown, input: unknown, need: readonly string[]) {
  const g = await reservationGate(actorIn, ctx, input, need);
  if (isFolioFail(g)) return asCheckout(g);
  const sec = await securityStateOf(g.tenantId, g.rv);
  return { g, sec };
}

export async function refundSecurityDeposit(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; saleId: string; duplicated?: boolean } | CheckoutFail> {
  const s = await securityGate(actorIn, ctx, input, ["hotel.reservation.checkOut", "hotel.booking.manage"]);
  if (!("g" in s)) return s;
  const { g, sec } = s;
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const prior = await tenantDb(c).hotelFolioItem.findFirst({ where: { folio: { reservationId: g.rv.id }, type: "SECURITY_REFUND" }, select: { refId: true } });
  if (sec.state === "REFUNDED" && prior?.refId) return { ok: true, saleId: prior.refId, duplicated: true };
  if (sec.state !== "HELD" || !sec.saleId) return cfail("NO_SECURITY", sec.state === "FORFEITED" ? "เงินประกันของการจองนี้ถูกริบไปแล้ว" : "การจองนี้ไม่มีเงินประกันที่ถืออยู่");
  const r = await moduleRefundDeposit({ tenantId: c.tenantId, unitId: c.unitId, receiptSaleId: sec.saleId, reason: `คืนเงินประกันห้อง ${g.rv.code}`, actorId: g.actor.userId });
  if (!r.ok) return cfail(r.code === "SHIFT_REQUIRED" ? "SHIFT_REQUIRED" : "POS_REJECTED", r.message);
  if (!r.refundSaleId) return cfail("NO_SECURITY", "ไม่พบใบรับเงินประกันในระบบขาย — คืนที่หน้าขาย");
  const refundId = r.refundSaleId;
  await secItem(c, g, "SECURITY_REFUND", refundId, `คืนเงินประกันห้อง ฿${baht(sec.heldSatang)}`, "hotel.security_deposit.refunded", sec.heldSatang);
  return { ok: true, saleId: refundId, ...(r.duplicated ? { duplicated: true } : {}) };
}

/** ริบเต็มผ่าน POS (บิลริบ = รายได้ค่าเสียหายครั้งเดียว · ใบ §0 · มติ 4) */
async function forfeitMoney(c: UnitCtx, rv: ResvRow, receiptSaleId: string, reason: string, actorId: string): Promise<{ ok: true; saleId: string; satang: number } | { ok: false; message: string }> {
  const systemId = await systemForUnit(c.tenantId, c.unitId, "POS");
  if (!systemId) return { ok: false, message: "ไม่ผูกระบบขายหน้าร้าน" };
  const r = await moduleForfeitDeposit({ ...c, receiptSaleId, reason, actorId }, (tx, p) =>
    createSale({ ...c, systemId, sourceModule: "HOTEL", sourceId: rv.id, ...p, lines: p.lines.map((l) => ({ ...l, name: `ค่าเสียหาย (ริบเงินประกันห้อง ${rv.code})` })) }, callerTx(tx)),
  );
  if (r.ok === false) return { ok: false, message: r.message };
  if ("legacy" in r) return { ok: false, message: "ไม่พบใบรับเงินประกันในระบบขาย" };
  return { ok: true, saleId: r.saleId, satang: r.satang };
}

const ForfeitInput = z.object({ reservationId: z.string().min(1).max(200), reason: z.string().trim().min(3, { message: "ระบุเหตุผลการริบอย่างน้อย 3 ตัวอักษร" }).max(300, { message: "เหตุผลยาวเกิน 300 ตัวอักษร" }) });
export async function forfeitSecurityDeposit(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; saleId: string; duplicated?: boolean } | CheckoutFail> {
  const s = await securityGate(actorIn, ctx, input, ["hotel.booking.manage"]);
  if (!("g" in s)) return s;
  const { g, sec } = s;
  const p = ForfeitInput.safeParse(input);
  if (!p.success) return cfail("INVALID_INPUT", zodReason(p.error));
  if (sec.state !== "HELD" || !sec.saleId) return cfail("NO_SECURITY", sec.state === "REFUNDED" ? "เงินประกันของการจองนี้คืนไปแล้ว — ริบไม่ได้" : sec.state === "FORFEITED" ? "เงินประกันของการจองนี้ถูกริบไปแล้ว" : "การจองนี้ไม่มีเงินประกันที่ถืออยู่");
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const r = await forfeitMoney(c, g.rv, sec.saleId, p.data.reason, g.actor.userId);
  if (!r.ok) return cfail("POS_REJECTED", r.message);
  await secItem(c, g, "PENALTY", r.saleId, `ริบเงินประกันห้อง ฿${baht(r.satang)} — ${p.data.reason}`, "hotel.security_deposit.forfeited", r.satang);
  return { ok: true, saleId: r.saleId };
}

/** แถวข้อมูลประกัน (amount 0) + audit + event — idempotent ต่อบิล */
async function secItem(c: UnitCtx, g: Gate & { rv: ResvRow }, type: "SECURITY_REFUND" | "PENALTY", saleId: string, description: string, event: string, amountSatang: number): Promise<void> {
  await unitTx(c, async (tx) => {
    const f = await lockFolio(tx, c, g.rv.id);
    const dup = await tx.hotelFolioItem.findFirst({ where: { folioId: f.id, type, refType: "PosSale", refId: saleId }, select: { id: true } });
    if (dup) return null;
    await insertItemTx(tx, c, f.id, { type, description, qty: 1, unitAmountSatang: 0, amountSatang: 0, refType: "PosSale", refId: saleId }, g.actor.userId);
    await recomputeTx(tx, c, f.id);
    await auditTx(tx, c, g.actor.userId, event, "HotelReservation", g.rv.id, { securitySaleId: g.rv.securityDepositSaleId }, { saleId, amountSatang, type });
    await emitFolioTx(tx, c, event, saleId, { reservationId: g.rv.id, folioId: f.id, saleId, amountSatang });
    return null;
  });
}

/** ด่านหน่วย (หน้าคิวลงห้อง ฯลฯ) — re-export ให้ room-charge.ts ใช้ตัวเดียวกัน */
export { unitGate };
export const _internal = { buildPlan, dbDate, todayYmd };
// ◂ SVC H.5
