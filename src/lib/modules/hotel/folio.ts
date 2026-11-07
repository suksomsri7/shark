// SVC H.5 ▸ บิลระหว่างพัก (folio) ฝั่งเซิร์ฟเวอร์ (ใบสั่ง ledger/svc-briefs/svc-brief-h.5.md §0 §2 §3.1–3.3 · สเปก S §3.5 §4 §7.5 §8.1)
//   • 1 การจอง = 1 folio · item immutable: แก้ = void (แถวเดิมติด voidedAt/voidReason · แถวใหม่ VOID_REVERSAL ตรงข้ามเครื่องหมาย อ้าง reversalOfId)
//   • balanceSatang = Σ amount ทุกแถว (charge บวก · DEPOSIT/PAYMENT/DISCOUNT ลบ · REFUND บวก · SECURITY_* = 0) คำนวณใหม่ใน tx เดียวกับการเขียนทุกครั้ง
//   • TAX/SERVICE_CHARGE = แถวแสดงผล (EXCLUSIVE เท่านั้น · 1 แถวต่อชนิด · ปรับยอดในที่ทุกครั้งที่ยอด charge เปลี่ยน) — ไม่ส่งเป็นบรรทัด POS
//   • ด่าน: การจองของร้าน (ctx.tenantId) → หน่วย HOTEL → ผู้กระทำเข้าหน่วยได้ (ไม่ได้ ⇒ NOT_FOUND) → สิทธิ์ (FORBIDDEN) · ผิดทุกแบบ = {ok:false, code, reason ไทย} ไม่ throw
//   • ไฟล์นี้ไม่แตะ POS/บัญชี (เงินผ่าน checkout.ts เท่านั้น) · วันที่ธุรกิจ = bkkYmd (ห้ามวันดิบของเครื่อง)
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox";
import { canAccessUnit, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { resolveSettings } from "@/lib/core/settings";
import { dayOfWeekOf, isYmd, taxLines } from "./pricing";

export type FolioActor = MembershipCtx & { userId: string };
export type FolioFailCode = "NOT_FOUND" | "FORBIDDEN" | "INVALID_INPUT" | "FOLIO_CLOSED" | "NOT_ALLOWED" | "NOT_CHECKED_IN" | "PAY_MISMATCH" | "BUSY";
export type FolioFail = { ok: false; code: FolioFailCode; reason: string };
export type Tx = Prisma.TransactionClient;
export type UnitCtx = { tenantId: string; unitId: string };

export const FOLIO_ITEM_TYPES = ["ROOM", "SERVICE", "POS_CHARGE", "MINIBAR", "DISCOUNT", "TAX", "SERVICE_CHARGE", "DEPOSIT", "PAYMENT", "REFUND", "PENALTY", "SECURITY_DEPOSIT", "SECURITY_REFUND", "VOID_REVERSAL"] as const;
/** ค่าใช้จ่ายที่ขึ้นบิล POS (DISCOUNT = ลบ → ส่วนลดท้ายบิล) */
export const CHARGE_TYPES: readonly string[] = ["ROOM", "SERVICE", "POS_CHARGE", "MINIBAR", "PENALTY", "DISCOUNT"];
const MANUAL_TYPES = ["SERVICE", "MINIBAR", "PENALTY", "DISCOUNT"] as const;
/** ชนิดที่ void ไม่ได้ (ใบ §2.2 · POS_CHARGE = ร้านต้นทาง void บิลเอง · TAX/SC/ประกัน = ระบบคำนวณ/ข้อมูล) */
const NO_VOID: readonly string[] = ["PAYMENT", "DEPOSIT", "VOID_REVERSAL", "POS_CHARGE", "TAX", "SERVICE_CHARGE", "REFUND", "SECURITY_DEPOSIT", "SECURITY_REFUND"];
export const READ_KEYS = ["hotel.reservation.create", "hotel.reservation.checkOut", "hotel.booking.manage", "hotel.folio.post", "hotel.folio.void"];
const TX_OPTS = { maxWait: 20_000, timeout: 30_000 } as const;
const SYSTEM_ID = "module:hotel";

export const R = {
  notFound: "ไม่พบการจองหรือบิลห้องนี้ (หรืออยู่นอกสาขาที่คุณดูแล)",
  forbidden: "คุณยังไม่มีสิทธิ์ทำรายการนี้ — ขอสิทธิ์จากเจ้าของร้าน",
  closed: "บิลห้องนี้ปิดแล้ว (เช็กเอาต์หรือยกเลิกแล้ว) — ลงหรือยกเลิกรายการเพิ่มไม่ได้",
  busy: "ระบบไม่ว่าง ลองใหม่อีกครั้ง",
};
export const fail = (code: FolioFailCode, reason: string): FolioFail => ({ ok: false, code, reason });
export const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
export const isFolioFail = (v: unknown): v is FolioFail => isRec(v) && v.ok === false && typeof v.code === "string";
/** "YYYY-MM-DD" ของคอลัมน์ @db.Date (เที่ยงคืน UTC) */
export const ymdOf = (d: Date): string => d.toISOString().split("T")[0] ?? "";
export const dbDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);
export const todayYmd = (): string => bkkYmd(new Date());
export const jsonOf = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
const zodReason = (e: z.ZodError): string => {
  const m = e.issues[0]?.message ?? "";
  return /[฀-๿]/.test(m) ? m : "ข้อมูลไม่ครบหรือไม่ถูกต้อง";
};
export { zodReason };

/** ธุรกรรมชน/หมดเวลา/deadlock ⇒ BUSY (ไม่โยนดิบ) */
export function isTxBusy(e: unknown): boolean {
  let cur: unknown = e;
  for (let d = 0; d < 6 && cur && typeof cur === "object"; d++) {
    const o = cur as { code?: unknown; message?: unknown; cause?: unknown; meta?: unknown };
    if (o.code === "P2028" || o.code === "P2034" || o.code === "40P01") return true;
    if (typeof o.message === "string" && /deadlock detected|40P01|Transaction already closed|expired transaction/i.test(o.message)) return true;
    const meta = o.meta && typeof o.meta === "object" ? (o.meta as { code?: unknown; driverAdapterError?: unknown }) : null;
    if (meta?.code === "40P01") return true;
    cur = o.cause ?? meta?.driverAdapterError;
  }
  return false;
}
/** ย้อน tx ทั้งก้อนด้วยผลปฏิเสธ */
export class FolioAbort extends Error {
  constructor(readonly result: FolioFail) {
    super(result.code);
  }
}
/** ธุรกรรมของหน่วย (tenantDb · Abort ⇒ ผลปฏิเสธ · หมดเวลา ⇒ BUSY) */
export async function unitTx<T>(c: UnitCtx, fn: (tx: Tx) => Promise<T>): Promise<T | FolioFail> {
  try {
    return await tenantDb({ tenantId: c.tenantId, unitId: c.unitId }).$transaction((t) => fn(t as unknown as Tx), TX_OPTS);
  } catch (e) {
    if (e instanceof FolioAbort) return e.result;
    if (isTxBusy(e)) return fail("BUSY", R.busy);
    throw e;
  }
}

export function actorOf(a: unknown): FolioActor | null {
  if (!isRec(a) || !isStr(a.role) || !isStr(a.userId)) return null;
  return {
    role: a.role as MembershipCtx["role"],
    unitAccess: Array.isArray(a.unitAccess) ? a.unitAccess.filter(isStr) : [],
    permissions: isRec(a.permissions) ? a.permissions : {},
    userId: a.userId,
  };
}
export const canDo = (actor: FolioActor, unitId: string, action: string): boolean => evaluate(actor, { module: "hotel", action, unitId });
export const canAny = (actor: FolioActor, unitId: string, actions: readonly string[]): boolean => actions.some((a) => canDo(actor, unitId, a));

// ───────────────────────── ด่าน ─────────────────────────
export type ResvRow = NonNullable<Awaited<ReturnType<Tx["hotelReservation"]["findFirst"]>>>;
export type Gate = UnitCtx & { actor: FolioActor; unitName: string };

/** หน่วยโรงแรมของร้านที่ผู้กระทำเข้าได้ (unitId · ประตูเดียวของทุกฟังก์ชันที่รับ unitId) */
export async function unitGate(actorIn: unknown, ctx: unknown, unitId: unknown, need: readonly string[]): Promise<Gate | FolioFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const actor = actorOf(actorIn);
  if (!isStr(tenantId) || !isStr(unitId) || !actor) return fail("NOT_FOUND", R.notFound);
  const unit = await tenantDb({ tenantId }).businessUnit.findFirst({ where: { id: unitId, type: "HOTEL" }, select: { id: true, name: true } });
  if (!unit || !canAccessUnit(actor, unit.id)) return fail("NOT_FOUND", R.notFound);
  if (need.length && !canAny(actor, unit.id, need)) return fail("FORBIDDEN", R.forbidden);
  return { tenantId, unitId: unit.id, actor, unitName: unit.name };
}

/** หน่วยของการจอง (ข้อมูลร้านนี้เท่านั้น · SQL ระบุ tenantId ตรง) */
export async function unitOfReservation(tenantId: string, reservationId: string): Promise<string | null> {
  const rows = await tenantDb({ tenantId }).$queryRaw<{ unitId: string }[]>`
    SELECT "unitId" FROM "HotelReservation" WHERE id = ${reservationId} AND "tenantId" = ${tenantId} LIMIT 1`;
  return rows[0]?.unitId ?? null;
}

/** ด่านของการจอง: ctx.tenantId → การจอง → หน่วย HOTEL → เข้าหน่วยได้ (NOT_FOUND) → สิทธิ์อย่างใดอย่างหนึ่งใน need (FORBIDDEN) · input.unitId (ถ้าส่ง) ต้องตรง */
export async function reservationGate(actorIn: unknown, ctx: unknown, input: unknown, need: readonly string[]): Promise<(Gate & { rv: ResvRow }) | FolioFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const reservationId = isRec(input) ? input.reservationId : null;
  if (!isStr(tenantId) || !isStr(reservationId) || reservationId.length > 200) return fail("NOT_FOUND", R.notFound);
  const unitId = await unitOfReservation(tenantId, reservationId);
  if (!unitId) return fail("NOT_FOUND", R.notFound);
  if (isRec(input) && isStr(input.unitId) && input.unitId !== unitId) return fail("NOT_FOUND", R.notFound);
  const g = await unitGate(actorIn, ctx, unitId, need);
  if (isFolioFail(g)) return g;
  const rv = await tenantDb({ tenantId, unitId }).hotelReservation.findFirst({ where: { id: reservationId } });
  if (!rv) return fail("NOT_FOUND", R.notFound);
  return { ...g, rv };
}

// ───────────────────────── ค่าตั้ง ─────────────────────────
export type FolioSettings = { mode: "INCLUSIVE" | "EXCLUSIVE"; vatBp: number; scBp: number; rounding: string; manualMax: number; invoiceFromPos: boolean; allowLegacyCash: boolean };
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
export async function folioSettings(tenantId: string, unitId: string): Promise<FolioSettings> {
  const keys = ["rooms.hotel.tax.mode", "rooms.hotel.tax.vatBp", "rooms.hotel.tax.serviceChargeBp", "rooms.money.rounding", "rooms.hotel.folio.manualItemMaxSatang", "rooms.hotel.tax.invoiceFromPos", "rooms.hotel.checkout.allowLegacyCash"];
  const st = await resolveSettings({ tenantId }, keys, { unitId });
  const v = (k: string) => st[k]?.value;
  return {
    mode: v("rooms.hotel.tax.mode") === "EXCLUSIVE" ? "EXCLUSIVE" : "INCLUSIVE",
    vatBp: num(v("rooms.hotel.tax.vatBp"), 700),
    scBp: num(v("rooms.hotel.tax.serviceChargeBp"), 0),
    rounding: String(v("rooms.money.rounding") ?? "SATANG"),
    manualMax: num(v("rooms.hotel.folio.manualItemMaxSatang"), 5_000_000),
    invoiceFromPos: v("rooms.hotel.tax.invoiceFromPos") !== false,
    allowLegacyCash: v("rooms.hotel.checkout.allowLegacyCash") === true,
  };
}

// ───────────────────────── แกน folio (ใน tx ของผู้เรียก) ─────────────────────────
export type ItemRow = NonNullable<Awaited<ReturnType<Tx["hotelFolioItem"]["findFirst"]>>>;
export type FolioRow = NonNullable<Awaited<ReturnType<Tx["hotelFolio"]["findFirst"]>>>;

/** folio ของการจอง (ไม่มี ⇒ สร้าง OPEN — การจองเดิมก่อน H.3) แล้วล็อกแถว FOR UPDATE */
export async function lockFolio(tx: Tx, c: UnitCtx, reservationId: string): Promise<FolioRow> {
  let f = await tx.hotelFolio.findFirst({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId } });
  if (!f) {
    await tx.$executeRaw`INSERT INTO "HotelFolio" (id, "tenantId", "unitId", "reservationId", status, "balanceSatang", "createdAt", "updatedAt")
        VALUES (${`fol${randomUUID().replace(/-/g, "")}`}, ${c.tenantId}, ${c.unitId}, ${reservationId}, 'OPEN', 0, now(), now())
        ON CONFLICT ("reservationId") DO NOTHING`; // แข่งสร้าง = ไม่ทำอะไร แล้วอ่านซ้ำหลังล็อก
  }
  await tx.$queryRaw`SELECT id FROM "HotelFolio" WHERE "reservationId" = ${reservationId} AND "tenantId" = ${c.tenantId} FOR UPDATE`;
  f = await tx.hotelFolio.findFirst({ where: { tenantId: c.tenantId, unitId: c.unitId, reservationId } });
  if (!f) throw new FolioAbort(fail("NOT_FOUND", R.notFound));
  return f;
}
export const isOpen = (f: { status: string }) => f.status === "OPEN";

/** แถวที่ "มีผล" (ไม่ถูก void และไม่ใช่ตัวกลับรายการ — คู่ void/กลับรายการหักล้างกันเป็น 0) */
export const effective = <T extends { voidedAt: Date | null; type: string }>(items: T[]): T[] => items.filter((i) => !i.voidedAt && i.type !== "VOID_REVERSAL");
/** ยอดค่าใช้จ่ายสุทธิ (ฐานภาษี) = Σ แถวค่าใช้จ่ายที่มีผล (ส่วนลดติดลบ) */
export const chargeSubtotal = (items: { voidedAt: Date | null; type: string; amountSatang: number }[]): number =>
  effective(items).filter((i) => CHARGE_TYPES.includes(i.type)).reduce((s, i) => s + i.amountSatang, 0);

/**
 * คำนวณใหม่ใน tx (ผู้เรียกล็อก folio แล้ว): EXCLUSIVE ⇒ TAX/SERVICE_CHARGE 1 แถวต่อชนิดตาม taxLines(Σ ค่าใช้จ่าย) (ปรับยอดในที่ · 0 = ลบแถว) ·
 * INCLUSIVE ⇒ ไม่มีแถวภาษี (แถวค้างจากการเปลี่ยนโหมด = ลบ) · แล้ว balanceSatang = Σ amount ทุกแถว
 */
export async function recomputeTx(tx: Tx, c: UnitCtx, folioId: string, st?: FolioSettings): Promise<number> {
  const s = st ?? (await folioSettings(c.tenantId, c.unitId));
  const items = await tx.hotelFolioItem.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, folioId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const sub = chargeSubtotal(items);
  const want = new Map<string, number>();
  if (s.mode === "EXCLUSIVE") for (const l of taxLines(Math.max(0, sub), { mode: "EXCLUSIVE", vatBp: s.vatBp, serviceChargeBp: s.scBp }, s.rounding).lines) want.set(l.type, l.amountSatang);
  for (const type of ["SERVICE_CHARGE", "TAX"] as const) {
    const rows = items.filter((i) => i.type === type && !i.voidedAt);
    const amt = want.get(type) ?? 0;
    const [keep, ...extra] = rows;
    for (const x of extra) await tx.hotelFolioItem.deleteMany({ where: { id: x.id, tenantId: c.tenantId, unitId: c.unitId } });
    if (amt <= 0) {
      if (keep) await tx.hotelFolioItem.deleteMany({ where: { id: keep.id, tenantId: c.tenantId, unitId: c.unitId } });
      continue;
    }
    const description = type === "TAX" ? `ภาษีมูลค่าเพิ่ม ${(s.vatBp / 100).toFixed(2)}%` : `ค่าบริการ ${(s.scBp / 100).toFixed(2)}%`;
    if (keep) {
      if (keep.amountSatang !== amt || keep.description !== description) await tx.hotelFolioItem.updateMany({ where: { id: keep.id, tenantId: c.tenantId, unitId: c.unitId }, data: { amountSatang: amt, unitAmountSatang: amt, qty: 1, description } });
    } else {
      await tx.hotelFolioItem.create({ data: { tenantId: c.tenantId, unitId: c.unitId, folioId, type, description, qty: 1, unitAmountSatang: amt, amountSatang: amt, businessDate: dbDate(todayYmd()), postedById: SYSTEM_ID } });
    }
  }
  const agg = await tx.hotelFolioItem.aggregate({ where: { tenantId: c.tenantId, unitId: c.unitId, folioId }, _sum: { amountSatang: true } });
  const balance = agg._sum.amountSatang ?? 0;
  await tx.hotelFolio.updateMany({ where: { id: folioId, tenantId: c.tenantId, unitId: c.unitId }, data: { balanceSatang: balance } });
  return balance;
}

export type NewItem = { type: string; description: string; qty: number; unitAmountSatang: number; amountSatang?: number; refType?: string | null; refId?: string | null; businessDate?: string; reversalOfId?: string | null };
/** เขียนแถวใหม่ (ผู้เรียกล็อก folio แล้ว · ไม่คำนวณยอด) */
export async function insertItemTx(tx: Tx, c: UnitCtx, folioId: string, it: NewItem, byUserId: string | null): Promise<ItemRow> {
  return tx.hotelFolioItem.create({
    data: {
      tenantId: c.tenantId,
      unitId: c.unitId,
      folioId,
      type: it.type,
      description: it.description.slice(0, 300),
      qty: it.qty,
      unitAmountSatang: it.unitAmountSatang,
      amountSatang: it.amountSatang ?? it.qty * it.unitAmountSatang,
      businessDate: dbDate(it.businessDate ?? todayYmd()),
      refType: it.refType ?? null,
      refId: it.refId ?? null,
      reversalOfId: it.reversalOfId ?? null,
      postedById: byUserId ?? SYSTEM_ID,
    },
  });
}

/** สรุปแถวลง audit/event (ไม่มีข้อมูลแขก) */
export const itemView = (i: { id: string; type: string; description: string; qty: number; unitAmountSatang: number; amountSatang: number; businessDate: Date; refType: string | null; refId: string | null; voidedAt?: Date | null; reversalOfId?: string | null }) => ({
  itemId: i.id,
  type: i.type,
  description: i.description,
  qty: i.qty,
  unitAmountSatang: i.unitAmountSatang,
  amountSatang: i.amountSatang,
  businessDate: ymdOf(i.businessDate),
  refType: i.refType,
  refId: i.refId,
  voided: !!i.voidedAt,
  reversalOfId: i.reversalOfId ?? null,
});

export async function auditTx(tx: Tx, c: UnitCtx, actorId: string | null, action: string, targetType: string, targetId: string, before: unknown, after: unknown): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: c.tenantId,
      unitId: c.unitId,
      actorType: actorId && !actorId.startsWith("module:") ? "USER" : "SYSTEM",
      actorId: actorId ?? SYSTEM_ID,
      action,
      targetType,
      targetId,
      before: before === null ? undefined : jsonOf(before),
      after: after === null ? undefined : jsonOf(after),
    },
  });
}
/** event ของ folio (payload id + สตางค์ล้วน · X8/X10) */
export async function emitFolioTx(tx: Tx, c: UnitCtx, type: string, key: string, payload: Record<string, unknown>): Promise<void> {
  await emitOutbox(tx, { tenantId: c.tenantId, unitId: c.unitId, type, idempotencyKey: `${type}#${key}`, payload: { tenantId: c.tenantId, unitId: c.unitId, ...payload } });
}

// ───────────────────────── ค่าห้องรายคืน (S §7.5 · H.7 เรียก) ─────────────────────────
const DOW_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const nightLabelTh = (ymd: string): string => `${DOW_TH[dayOfWeekOf(ymd)] ?? ""} ${Number(ymd.slice(8, 10))} ${MONTH_TH[Number(ymd.slice(5, 7)) - 1] ?? ""}`;
const SOURCE_TH: Record<string, string> = { RATE: "ราคาตามวัน", OVERRIDE: "ราคาพิเศษ", FALLBACK: "ราคาฐาน", MANUAL: "ราคาแก้มือ" };

/** post คืนที่นับ · ยังไม่ post · วันที่ < upToDate (ผู้เรียกล็อก folio · การจองต้อง CHECKED_IN) */
export async function postRoomNightsTx(tx: Tx, c: UnitCtx, folioId: string, rv: { id: string; roomTypeId: string }, upToDate: string, auditId: string | null): Promise<number> {
  const nights = await tx.hotelBookingNight.findMany({
    where: { tenantId: c.tenantId, unitId: c.unitId, reservationId: rv.id, counted: true, folioItemId: null, date: { lt: dbDate(upToDate) } },
    orderBy: { date: "asc" },
  });
  if (!nights.length) return 0;
  const types = await tx.hotelRoomType.findMany({ where: { tenantId: c.tenantId, unitId: c.unitId, id: { in: [...new Set(nights.map((n) => n.roomTypeId))] } }, select: { id: true, name: true } });
  const nameOf = new Map(types.map((t) => [t.id, t.name]));
  let n = 0;
  for (const night of nights) {
    const ymd = ymdOf(night.date);
    const item = await insertItemTx(
      tx,
      c,
      folioId,
      { type: "ROOM", description: `${nightLabelTh(ymd)} · ${nameOf.get(night.roomTypeId) ?? "ห้องพัก"} · ${SOURCE_TH[night.priceSource] ?? "ราคาตามวัน"}`, qty: 1, unitAmountSatang: night.priceSatang, refType: "HotelBookingNight", refId: night.id, businessDate: ymd },
      null,
    );
    const upd = await tx.hotelBookingNight.updateMany({ where: { id: night.id, tenantId: c.tenantId, unitId: c.unitId, folioItemId: null }, data: { folioItemId: item.id, ...(auditId ? { postedAuditId: auditId } : {}) } });
    if (upd.count === 0) throw new FolioAbort(fail("BUSY", R.busy));
    n++;
  }
  return n;
}

const NightsInput = z.object({ reservationId: z.string().min(1).max(200), upToDate: z.string().refine((s) => isYmd(s), { message: "วันที่ไม่ถูกต้อง" }), auditId: z.string().min(1).max(200).optional().nullable() });
/** postRoomNights(ctx, {reservationId, upToDate, auditId?}) — คืนที่ date < upToDate · idempotent (ข้ามคืนที่มี folioItemId) · เฉพาะ CHECKED_IN */
export async function postRoomNights(ctx: unknown, input: unknown): Promise<{ ok: true; posted: number } | (FolioFail & { posted: 0 })> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const p = NightsInput.safeParse(input);
  if (!isStr(tenantId)) return { ...fail("NOT_FOUND", R.notFound), posted: 0 };
  if (!p.success) return { ...fail("INVALID_INPUT", zodReason(p.error)), posted: 0 };
  const unitId = await unitOfReservation(tenantId, p.data.reservationId);
  if (!unitId) return { ...fail("NOT_FOUND", R.notFound), posted: 0 };
  const c = { tenantId, unitId };
  const out = await unitTx(c, async (tx) => {
    const rv = await tx.hotelReservation.findFirst({ where: { id: p.data.reservationId, tenantId, unitId }, select: { id: true, status: true, roomTypeId: true } });
    if (!rv || rv.status !== "CHECKED_IN") return 0;
    const f = await lockFolio(tx, c, rv.id);
    if (!isOpen(f)) return 0;
    const n = await postRoomNightsTx(tx, c, f.id, rv, p.data.upToDate, p.data.auditId ?? null);
    if (n > 0) await recomputeTx(tx, c, f.id);
    return n;
  });
  if (isFolioFail(out)) return { ...out, posted: 0 };
  return { ok: true, posted: out };
}

// ───────────────────────── DTO ─────────────────────────
export type FolioItemDto = {
  id: string;
  type: string;
  description: string;
  qty: number;
  unitAmountSatang: number;
  amountSatang: number;
  businessDate: string;
  postedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  reversalOfId: string | null;
  refType: string | null;
  refId: string | null;
};
export type FolioDto = {
  id: string;
  status: string;
  balanceSatang: number;
  items: FolioItemDto[];
  tax: { mode: "INCLUSIVE" | "EXCLUSIVE"; lines: { type: string; amountSatang: number }[]; vatIncludedSatang: number; vatBp: number; serviceChargeBp: number };
  deposit: { paidSatang: number; saleId: string | null };
  security: { heldSatang: number; saleId: string | null; state: "NONE" | "HELD" | "REFUNDED" | "FORFEITED" };
  chargesSatang: number;
  reservation: { id: string; code: string; status: string; checkIn: string; checkOut: string; nights: number; roomNumber: string | null; roomTypeName: string; groupId: string | null };
  canPost: boolean;
  canVoid: boolean;
  canSettle: boolean;
  canManage: boolean;
  canSecurity: boolean;
};
const itemDto = (i: ItemRow): FolioItemDto => ({
  id: i.id,
  type: i.type,
  description: i.description,
  qty: i.qty,
  unitAmountSatang: i.unitAmountSatang,
  amountSatang: i.amountSatang,
  businessDate: ymdOf(i.businessDate),
  postedAt: i.createdAt.toISOString(),
  voidedAt: i.voidedAt ? i.voidedAt.toISOString() : null,
  voidReason: i.voidReason ?? null,
  reversalOfId: i.reversalOfId ?? null,
  refType: i.refType ?? null,
  refId: i.refId ?? null,
});

/** สถานะเงินประกันจากใบรับ (PosDeposit · SQL ระบุร้าน) */
export async function securityStateOf(tenantId: string, rv: { securityDepositSatang: number; securityDepositSaleId: string | null }): Promise<FolioDto["security"]> {
  if (!rv.securityDepositSaleId) return { heldSatang: 0, saleId: null, state: "NONE" };
  const rows = await tenantDb({ tenantId }).$queryRaw<{ status: string; amountSatang: number; usedSatang: number; refundedSatang: number }[]>`
    SELECT status::text AS status, "amountSatang", "usedSatang", "refundedSatang" FROM "PosDeposit" WHERE "receiptSaleId" = ${rv.securityDepositSaleId} AND "tenantId" = ${tenantId} LIMIT 1`;
  const d = rows[0];
  if (!d) return { heldSatang: rv.securityDepositSatang, saleId: rv.securityDepositSaleId, state: "HELD" };
  if (d.status === "OPEN") return { heldSatang: Math.max(0, d.amountSatang - d.usedSatang - d.refundedSatang), saleId: rv.securityDepositSaleId, state: "HELD" };
  return { heldSatang: 0, saleId: rv.securityDepositSaleId, state: d.usedSatang > 0 ? "FORFEITED" : "REFUNDED" };
}

export async function folioDtoOf(g: Gate & { rv: ResvRow }): Promise<FolioDto> {
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const db = tenantDb(c);
  const st = await folioSettings(g.tenantId, g.unitId);
  let f = await db.hotelFolio.findFirst({ where: { reservationId: g.rv.id } });
  if (!f) {
    const made = await unitTx(c, async (tx) => lockFolio(tx, c, g.rv.id));
    if (isFolioFail(made)) throw new Error(made.reason);
    f = made;
  }
  const [items, room, type, security] = await Promise.all([
    db.hotelFolioItem.findMany({ where: { folioId: f.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    g.rv.roomId ? db.hotelRoom.findFirst({ where: { id: g.rv.roomId }, select: { number: true } }) : Promise.resolve(null),
    db.hotelRoomType.findFirst({ where: { id: g.rv.roomTypeId }, select: { name: true } }),
    securityStateOf(g.tenantId, g.rv),
  ]);
  const sub = chargeSubtotal(items);
  const tl = taxLines(Math.max(0, sub), { mode: st.mode, vatBp: st.vatBp, serviceChargeBp: st.scBp }, st.rounding);
  const open = isOpen(f);
  return {
    id: f.id,
    status: f.status,
    balanceSatang: f.balanceSatang,
    items: items.map(itemDto),
    tax: {
      mode: st.mode,
      lines: st.mode === "EXCLUSIVE" ? effective(items).filter((i) => i.type === "TAX" || i.type === "SERVICE_CHARGE").map((i) => ({ type: i.type, amountSatang: i.amountSatang })) : [],
      vatIncludedSatang: st.mode === "INCLUSIVE" ? tl.vatIncludedSatang : 0,
      vatBp: st.vatBp,
      serviceChargeBp: st.scBp,
    },
    deposit: { paidSatang: g.rv.depositPaidAt ? g.rv.depositSatang : 0, saleId: g.rv.depositSaleId ?? null },
    security,
    chargesSatang: sub,
    reservation: {
      id: g.rv.id,
      code: g.rv.code,
      status: g.rv.status,
      checkIn: ymdOf(g.rv.checkInDate),
      checkOut: ymdOf(g.rv.checkOutDate),
      nights: g.rv.nights,
      roomNumber: room?.number ?? null,
      roomTypeName: type?.name ?? "",
      groupId: g.rv.groupId ?? null,
    },
    canPost: open && canDo(g.actor, g.unitId, "hotel.folio.post"),
    canVoid: open && canDo(g.actor, g.unitId, "hotel.folio.void"),
    canSettle: open && g.rv.status === "CHECKED_IN" && canDo(g.actor, g.unitId, "hotel.reservation.checkOut"),
    canManage: canDo(g.actor, g.unitId, "hotel.booking.manage"),
    canSecurity: canAny(g.actor, g.unitId, ["hotel.reservation.checkIn", "hotel.folio.post"]),
  };
}

/** getFolio(actor, ctx, {reservationId}) — สิทธิ์อ่าน = จอง/เช็กเอาต์/จัดการ/ลงรายการ/ยกเลิกรายการ · ไม่มีเบอร์/อีเมล/ชื่อแขก */
export async function getFolio(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; folio: FolioDto } | FolioFail> {
  const g = await reservationGate(actorIn, ctx, input, READ_KEYS);
  if (isFolioFail(g)) return g;
  try {
    return { ok: true, folio: await folioDtoOf(g) };
  } catch (e) {
    if (isTxBusy(e)) return fail("BUSY", R.busy);
    throw e;
  }
}

/** folioForGroup(actor, ctx, {groupId}) — folio ของทุกห้องในกลุ่ม (ย่อ) */
export async function folioForGroup(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; folios: { reservationId: string; code: string; status: string; folioId: string | null; folioStatus: string | null; balanceSatang: number }[] } | FolioFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const groupId = isRec(input) ? input.groupId : null;
  if (!isStr(tenantId) || !isStr(groupId)) return fail("NOT_FOUND", R.notFound);
  const rows = await tenantDb({ tenantId }).$queryRaw<{ id: string; unitId: string }[]>`
    SELECT id, "unitId" FROM "HotelReservation" WHERE "groupId" = ${groupId} AND "tenantId" = ${tenantId} ORDER BY "createdAt", code`;
  if (!rows.length) return fail("NOT_FOUND", R.notFound);
  const g = await unitGate(actorIn, ctx, rows[0]!.unitId, READ_KEYS);
  if (isFolioFail(g)) return g;
  const db = tenantDb({ tenantId, unitId: g.unitId });
  const rvs = await db.hotelReservation.findMany({ where: { groupId }, orderBy: [{ createdAt: "asc" }, { code: "asc" }], select: { id: true, code: true, status: true } });
  const folios = await db.hotelFolio.findMany({ where: { reservationId: { in: rvs.map((r) => r.id) } } });
  const byRv = new Map(folios.map((f) => [f.reservationId, f]));
  return { ok: true, folios: rvs.map((r) => ({ reservationId: r.id, code: r.code, status: r.status, folioId: byRv.get(r.id)?.id ?? null, folioStatus: byRv.get(r.id)?.status ?? null, balanceSatang: byRv.get(r.id)?.balanceSatang ?? 0 })) };
}

// ───────────────────────── ลงรายการ manual (§3.2) ─────────────────────────
const PostInput = z.object({
  reservationId: z.string().min(1).max(200),
  type: z.enum(MANUAL_TYPES, { message: "ชนิดรายการต้องเป็น บริการ · มินิบาร์ · ค่าปรับ · ส่วนลด" }),
  description: z.string().trim().min(1, { message: "กรอกรายละเอียดรายการ" }).max(200, { message: "รายละเอียดยาวเกิน 200 ตัวอักษร" }),
  qty: z.number({ message: "จำนวนต้องเป็นตัวเลข" }).int({ message: "จำนวนต้องเป็นจำนวนเต็ม" }).min(1, { message: "จำนวนต้องตั้งแต่ 1" }).max(1000, { message: "จำนวนมากเกินไป" }),
  unitAmountSatang: z.number({ message: "ราคาต้องเป็นตัวเลข" }).int({ message: "ราคาต้องเป็นจำนวนเต็มสตางค์" }),
  refType: z.string().trim().min(1).max(64).optional().nullable(),
  refId: z.string().trim().min(1).max(200).optional().nullable(),
});

export async function postFolioItem(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; itemId: string; balanceSatang: number } | FolioFail> {
  const g = await reservationGate(actorIn, ctx, input, ["hotel.folio.post"]);
  if (isFolioFail(g)) return g;
  const p = PostInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const d = p.data;
  if (d.type === "DISCOUNT" ? d.unitAmountSatang >= 0 : d.unitAmountSatang <= 0) return fail("INVALID_INPUT", d.type === "DISCOUNT" ? "ส่วนลดต้องเป็นยอดติดลบ" : "ราคาต้องมากกว่า 0");
  if (d.type === "DISCOUNT" && !canDo(g.actor, g.unitId, "hotel.booking.manage")) return fail("FORBIDDEN", "การให้ส่วนลดต้องมีสิทธิ์จัดการการจอง (ผู้จัดการ)");
  const st = await folioSettings(g.tenantId, g.unitId);
  if (Math.abs(d.unitAmountSatang) > st.manualMax || Math.abs(d.unitAmountSatang * d.qty) > st.manualMax) return fail("INVALID_INPUT", `ยอดต่อรายการเกินเพดาน ฿${(st.manualMax / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} — ให้ผู้จัดการตรวจ`);
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const out = await unitTx(c, async (tx) => {
    const f = await lockFolio(tx, c, g.rv.id);
    if (!isOpen(f)) throw new FolioAbort(fail("FOLIO_CLOSED", R.closed));
    const item = await insertItemTx(tx, c, f.id, { type: d.type, description: d.description, qty: d.qty, unitAmountSatang: d.unitAmountSatang, refType: d.refType ?? null, refId: d.refId ?? null }, g.actor.userId);
    const balance = await recomputeTx(tx, c, f.id, st);
    await auditTx(tx, c, g.actor.userId, "hotel.folio.posted", "HotelFolioItem", item.id, null, { reservationId: g.rv.id, folioId: f.id, ...itemView(item), balanceSatang: balance });
    await emitFolioTx(tx, c, "hotel.folio.posted", item.id, { reservationId: g.rv.id, folioId: f.id, itemId: item.id, type: item.type, amountSatang: item.amountSatang });
    return { itemId: item.id, balanceSatang: balance };
  });
  if (isFolioFail(out)) return out;
  return { ok: true, ...out };
}

// ───────────────────────── void (§2.2) ─────────────────────────
const VoidInput = z.object({ itemId: z.string().min(1).max(200), reason: z.string().trim().min(3, { message: "ระบุเหตุผลอย่างน้อย 3 ตัวอักษร" }).max(300, { message: "เหตุผลยาวเกิน 300 ตัวอักษร" }) });

/** void ในtx (ผู้เรียกล็อก folio แล้ว · ไม่ตรวจสิทธิ์) — คืนแถวกลับรายการ */
export async function voidItemTx(tx: Tx, c: UnitCtx, item: ItemRow, reason: string, byUserId: string | null): Promise<ItemRow> {
  const upd = await tx.hotelFolioItem.updateMany({ where: { id: item.id, tenantId: c.tenantId, unitId: c.unitId, voidedAt: null }, data: { voidedAt: new Date(), voidReason: reason } });
  if (upd.count === 0) throw new FolioAbort(fail("NOT_ALLOWED", "รายการนี้ถูกยกเลิกไปแล้ว"));
  return insertItemTx(
    tx,
    c,
    item.folioId,
    { type: "VOID_REVERSAL", description: `ยกเลิก: ${item.description}`, qty: item.qty, unitAmountSatang: -item.unitAmountSatang, amountSatang: -item.amountSatang, refType: item.refType, refId: item.refId, reversalOfId: item.id },
    byUserId,
  );
}

export async function voidFolioItem(actorIn: unknown, ctx: unknown, input: unknown): Promise<{ ok: true; reversalId: string; balanceSatang: number } | FolioFail> {
  const tenantId = isRec(ctx) ? ctx.tenantId : null;
  const itemId = isRec(input) ? input.itemId : null;
  if (!isStr(tenantId) || !isStr(itemId) || itemId.length > 200) return fail("NOT_FOUND", R.notFound);
  const loc = await tenantDb({ tenantId }).$queryRaw<{ unitId: string; reservationId: string }[]>`
    SELECT i."unitId", f."reservationId" FROM "HotelFolioItem" i JOIN "HotelFolio" f ON f.id = i."folioId" WHERE i.id = ${itemId} AND i."tenantId" = ${tenantId} LIMIT 1`;
  const at = loc[0];
  if (!at) return fail("NOT_FOUND", R.notFound);
  const g = await reservationGate(actorIn, ctx, { reservationId: at.reservationId }, ["hotel.folio.void"]);
  if (isFolioFail(g)) return g;
  const p = VoidInput.safeParse(input);
  if (!p.success) return fail("INVALID_INPUT", zodReason(p.error));
  const c = { tenantId: g.tenantId, unitId: g.unitId };
  const out = await unitTx(c, async (tx) => {
    const f = await lockFolio(tx, c, g.rv.id);
    const item = await tx.hotelFolioItem.findFirst({ where: { id: itemId, folioId: f.id } });
    if (!item) throw new FolioAbort(fail("NOT_FOUND", R.notFound));
    if (NO_VOID.includes(item.type)) throw new FolioAbort(fail("NOT_ALLOWED", item.type === "POS_CHARGE" ? "รายการจากร้านค้า ให้ยกเลิกบิลที่ร้านต้นทาง (POS) — ระบบจะกลับรายการให้เอง" : "รายการชนิดนี้ยกเลิกเองไม่ได้"));
    if (item.voidedAt) throw new FolioAbort(fail("NOT_ALLOWED", "รายการนี้ถูกยกเลิกไปแล้ว"));
    if (item.type === "ROOM" && item.refType === "HotelBookingNight" && item.refId) {
      const night = await tx.hotelBookingNight.findFirst({ where: { id: item.refId }, select: { postedAuditId: true } });
      if (night?.postedAuditId && !canDo(g.actor, g.unitId, "hotel.booking.manage")) throw new FolioAbort(fail("FORBIDDEN", "ค่าห้องคืนที่ปิดวันแล้ว ยกเลิกได้เฉพาะผู้จัดการ"));
    }
    if (!isOpen(f)) throw new FolioAbort(fail("FOLIO_CLOSED", R.closed));
    const rev = await voidItemTx(tx, c, item, p.data.reason, g.actor.userId);
    const balance = await recomputeTx(tx, c, f.id);
    await auditTx(tx, c, g.actor.userId, "hotel.folio.voided", "HotelFolioItem", item.id, itemView(item), { voided: true, reason: p.data.reason, reversalId: rev.id, balanceSatang: balance, reservationId: g.rv.id });
    await emitFolioTx(tx, c, "hotel.folio.voided", item.id, { reservationId: g.rv.id, folioId: f.id, itemId: item.id, reversalId: rev.id, type: item.type, amountSatang: item.amountSatang });
    return { reversalId: rev.id, balanceSatang: balance };
  });
  if (isFolioFail(out)) return out;
  return { ok: true, ...out };
}

// ───────────────────────── มัดจำการจอง (H.3 takeBookingDeposit เรียก · ใบ §2.1) ─────────────────────────
/**
 * DEPOSIT (ลบ) อ้างใบรับ POS_DEPOSIT — idempotent ต่อ saleId · ไม่มีวัน throw (มัดจำรับแล้วห้ามล้มเพราะชั้น folio · ล้ม = log ให้ backfill)
 * folio ปิดแล้ว (VOID/SETTLED) ⇒ ไม่โพสต์
 */
export async function postDeposit(ctx: UnitCtx, input: { reservationId: string; saleId: string | null | undefined; amountSatang: number; byUserId?: string | null }): Promise<{ posted: boolean }> {
  try {
    if (!input.saleId || !(input.amountSatang > 0)) return { posted: false };
    const saleId = input.saleId;
    const out = await unitTx(ctx, async (tx) => {
      const f = await lockFolio(tx, ctx, input.reservationId);
      if (!isOpen(f)) return false;
      const dup = await tx.hotelFolioItem.findFirst({ where: { folioId: f.id, type: "DEPOSIT", refType: "PosSale", refId: saleId }, select: { id: true } });
      if (dup) return false;
      const rec = await tenantDb({ tenantId: ctx.tenantId }).$queryRaw<{ receiptNo: string | null }[]>`SELECT "receiptNo" FROM "PosSale" WHERE id = ${saleId} AND "tenantId" = ${ctx.tenantId} LIMIT 1`;
      const item = await insertItemTx(tx, ctx, f.id, { type: "DEPOSIT", description: `รับมัดจำการจอง${rec[0]?.receiptNo ? ` (ใบรับ ${rec[0].receiptNo})` : ""}`, qty: 1, unitAmountSatang: -input.amountSatang, refType: "PosSale", refId: saleId }, input.byUserId ?? null);
      await recomputeTx(tx, ctx, f.id);
      await emitFolioTx(tx, ctx, "hotel.folio.posted", item.id, { reservationId: input.reservationId, folioId: f.id, itemId: item.id, type: "DEPOSIT", amountSatang: item.amountSatang });
      return true;
    });
    return { posted: out === true };
  } catch (e) {
    console.warn(`[hotel.folio] postDeposit tenant=${ctx.tenantId} reservation=${input.reservationId}: ${e instanceof Error ? e.message.slice(0, 120) : "error"} — ให้ backfill`);
    return { posted: false };
  }
}
// ◂ SVC H.5
