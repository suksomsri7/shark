// Rental (WO-0050) — สินทรัพย์ให้เช่า + จอง/รับ/คืน + ค่าปรับ → เส้นเงินผ่าน pos.createSale (chokepoint C-2)
// นโยบายมัดจำ v1: บันทึกยอดถือมัดจำใน booking (depositHeldSatang) — ไม่เข้า GL · คืนลูกค้านอกระบบ
//   (รอ DEPOSIT mapping WO-0040 · follow-up 0050b)
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2) · unit type RENTAL
// เงินต้องเข้าเสมอ: คืนของ = ปิดบิลค่าเช่า(+ค่าปรับ) ผ่าน POS (บังคับ · ไม่มี POS = โยน + revert)
import { tenantDb } from "@/lib/core/db";
import * as pos from "@/lib/modules/pos/service";
import { listSystems } from "@/lib/modules/system/service";

export type RentalCtx = { tenantId: string; unitId: string };

const MS_DAY = 86_400_000;

// จำนวนวันเช่า = ceil-safe จากช่วง [start, end) — dates เป็น @db.Date (UTC midnight) → หารลงตัว
function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MS_DAY);
}

// ── สินทรัพย์ (asset) ─────────────────────────────────────────
export type CreateAssetInput = {
  name: string;
  dailyRateSatang: number;
  depositSatang?: number;
  code?: string | null;
};

export async function createAsset(ctx: RentalCtx, input: CreateAssetInput): Promise<{ id: string }> {
  const name = input.name?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อสินทรัพย์");
  const dailyRateSatang = Math.round(input.dailyRateSatang);
  if (!Number.isFinite(dailyRateSatang) || dailyRateSatang < 0) throw new Error("ค่าเช่าต่อวันต้องไม่ติดลบ");
  const depositSatang = Math.round(input.depositSatang ?? 0);
  if (!Number.isFinite(depositSatang) || depositSatang < 0) throw new Error("มัดจำต้องไม่ติดลบ");

  const a = await tenantDb(ctx).rentalAsset.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      name,
      code: input.code?.trim() || null,
      dailyRateSatang,
      depositSatang,
    },
  });
  return { id: a.id };
}

export type UpdateAssetPatch = Partial<{
  name: string;
  dailyRateSatang: number;
  depositSatang: number;
  code: string | null;
  active: boolean;
}>;

export async function updateAsset(ctx: RentalCtx, id: string, patch: UpdateAssetPatch): Promise<{ id: string }> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name?.trim();
    if (!name) throw new Error("กรุณาระบุชื่อสินทรัพย์");
    data.name = name;
  }
  if (patch.dailyRateSatang !== undefined) {
    const v = Math.round(patch.dailyRateSatang);
    if (!Number.isFinite(v) || v < 0) throw new Error("ค่าเช่าต่อวันต้องไม่ติดลบ");
    data.dailyRateSatang = v;
  }
  if (patch.depositSatang !== undefined) {
    const v = Math.round(patch.depositSatang);
    if (!Number.isFinite(v) || v < 0) throw new Error("มัดจำต้องไม่ติดลบ");
    data.depositSatang = v;
  }
  if (patch.code !== undefined) data.code = patch.code?.trim() || null;
  if (patch.active !== undefined) data.active = patch.active;

  await tenantDb(ctx).rentalAsset.updateMany({ where: { id }, data });
  return { id };
}

export async function listAssets(ctx: RentalCtx, opts: { activeOnly?: boolean } = {}) {
  return tenantDb(ctx).rentalAsset.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// ── ว่างไหม (overlap check) ────────────────────────────────────
// ช่วง [from, to) ชนกับ booking BOOKED/PICKED_UP เดิมของสินทรัพย์นี้ → false
// overlap: existing.startDate < to  AND  existing.endDate > from  (endDate exclusive ทั้งคู่)
export async function isAvailable(
  ctx: RentalCtx,
  assetId: string,
  range: { from: Date; to: Date },
): Promise<boolean> {
  const clash = await tenantDb(ctx).rentalBooking.findFirst({
    where: {
      assetId,
      status: { in: ["BOOKED", "PICKED_UP"] },
      startDate: { lt: range.to },
      endDate: { gt: range.from },
    },
  });
  return !clash;
}

// ── จอง ───────────────────────────────────────────────────────
export type CreateBookingInput = {
  assetId: string;
  customerName: string;
  customerPhone: string;
  startDate: Date;
  endDate: Date;
  note?: string | null;
};

export async function createBooking(
  ctx: RentalCtx,
  input: CreateBookingInput,
): Promise<{ id: string; days: number; quoteSatang: number }> {
  const db = tenantDb(ctx);
  const asset = await db.rentalAsset.findFirst({ where: { id: input.assetId } });
  if (!asset) throw new Error("ไม่พบสินทรัพย์");

  const days = daysBetween(input.startDate, input.endDate);
  if (days <= 0) throw new Error("วันคืนต้องหลังวันรับอย่างน้อย 1 วัน");

  const available = await isAvailable(ctx, input.assetId, { from: input.startDate, to: input.endDate });
  if (!available) throw new Error("ช่วงเวลานี้สินทรัพย์ถูกจองแล้ว");

  const quoteSatang = days * asset.dailyRateSatang;
  const name = input.customerName?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อลูกค้า");

  const bk = await db.rentalBooking.create({
    data: {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      assetId: input.assetId,
      customerName: name,
      customerPhone: input.customerPhone?.trim() || "",
      startDate: input.startDate,
      endDate: input.endDate,
      depositHeldSatang: asset.depositSatang,
      note: input.note?.trim() || null,
    },
  });
  return { id: bk.id, days, quoteSatang };
}

// ── รับรถ (BOOKED → PICKED_UP) ─────────────────────────────────
export async function pickUp(ctx: RentalCtx, bookingId: string): Promise<boolean> {
  const res = await tenantDb(ctx).rentalBooking.updateMany({
    where: { id: bookingId, status: "BOOKED" },
    data: { status: "PICKED_UP", pickedUpAt: new Date() },
  });
  return res.count > 0;
}

// ── คืน (PICKED_UP → RETURNED) — เส้นเงิน C-2 ผ่าน pos.createSale ──
export async function returnAsset(
  ctx: RentalCtx,
  bookingId: string,
  opts: { lateFeeSatang?: number } = {},
): Promise<{ ok: boolean; totalSatang: number; posSaleId?: string }> {
  const db = tenantDb(ctx);

  // อ่าน booking ก่อนเพื่อคำนวณค่าเช่า (ต้องอยู่สถานะ PICKED_UP)
  const bk = await db.rentalBooking.findFirst({ where: { id: bookingId } });
  if (!bk || bk.status !== "PICKED_UP") return { ok: false, totalSatang: 0 };

  const asset = await db.rentalAsset.findFirst({ where: { id: bk.assetId } });
  if (!asset) return { ok: false, totalSatang: 0 };

  const lateFeeSatang = Math.max(0, Math.round(opts.lateFeeSatang ?? 0));
  const days = daysBetween(bk.startDate, bk.endDate);
  const quoteSatang = days * asset.dailyRateSatang;
  const totalSatang = quoteSatang + lateFeeSatang;

  // 1) claim อะตอมมิก: PICKED_UP → RETURNED (แพ้แข่ง/สถานะอื่น → ok:false, ไม่ทำเส้นเงินซ้ำ)
  const claim = await db.rentalBooking.updateMany({
    where: { id: bookingId, status: "PICKED_UP" },
    data: { status: "RETURNED", returnedAt: new Date(), lateFeeSatang, totalSatang },
  });
  if (claim.count === 0) return { ok: false, totalSatang: 0 };

  // 2) หา AppSystem type POS ตัวแรกของ tenant — ไม่มี = revert แล้วโยน (เงินเข้าไม่ได้ถ้าไม่มีจุดตัดเงิน)
  const posSystems = await listSystems(ctx.tenantId, "POS");
  const posSys = posSystems[0];
  if (!posSys) {
    await db.rentalBooking.updateMany({
      where: { id: bookingId, status: "RETURNED", posSaleId: null },
      data: { status: "PICKED_UP", returnedAt: null, lateFeeSatang: 0, totalSatang: 0 },
    });
    throw new Error("เปิดระบบขาย (POS) ก่อนรับคืนสินทรัพย์");
  }

  // 3) เส้นเงิน C-2 — pos.createSale (idempotent ต่อ `rental-<bookingId>`)
  const lines = [{ name: `ค่าเช่า ${asset.name} (${days} วัน)`, qty: 1, unitPriceSatang: quoteSatang }];
  if (lateFeeSatang > 0) lines.push({ name: "ค่าปรับคืนล่าช้า", qty: 1, unitPriceSatang: lateFeeSatang });
  const sale = await pos.createSale({
    tenantId: ctx.tenantId,
    unitId: ctx.unitId,
    systemId: posSys.id,
    sourceModule: "RENTAL",
    sourceId: bookingId,
    idempotencyKey: `rental-${bookingId}`,
    lines,
    payMethods: [{ type: "CASH", amountSatang: totalSatang }],
  });

  await db.rentalBooking.updateMany({ where: { id: bookingId }, data: { posSaleId: sale.saleId } });

  return { ok: true, totalSatang, posSaleId: sale.saleId };
}

// ── ยกเลิก (BOOKED เท่านั้น) ────────────────────────────────────
export async function cancelBooking(ctx: RentalCtx, bookingId: string): Promise<boolean> {
  const res = await tenantDb(ctx).rentalBooking.updateMany({
    where: { id: bookingId, status: "BOOKED" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  return res.count > 0;
}

// รายการจอง (จัดการหลังบ้าน)
export async function listBookings(
  ctx: RentalCtx,
  opts: { status?: "BOOKED" | "PICKED_UP" | "RETURNED" | "CANCELLED" } = {},
) {
  return tenantDb(ctx).rentalBooking.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { createdAt: "desc" },
    include: { asset: true },
    take: 200,
  });
}
