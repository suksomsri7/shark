// Rental (WO-0050) — สินทรัพย์ให้เช่า + จอง/รับ/คืน + ค่าปรับ → เส้นเงินผ่าน pos.createSale (chokepoint C-2)
// นโยบายมัดจำ v1: บันทึกยอดถือมัดจำใน booking (depositHeldSatang) — ไม่เข้า GL · คืนลูกค้านอกระบบ
//   (รอ DEPOSIT mapping WO-0040 · follow-up 0050b)
//
// ctx = { tenantId, unitId } — ทุก query ผ่าน tenantDb(ctx) (defense-in-depth ชั้น 2) · unit type RENTAL
// เงินต้องเข้าเสมอ: คืนของ = ปิดบิลค่าเช่า(+ค่าปรับ) ผ่าน POS (บังคับ · ไม่มี POS = โยนก่อนแตะสถานะ — CRM C2.9)
import { prisma, tenantDb } from "@/lib/core/db";
import { emitOutbox } from "@/lib/core/outbox"; // CRM C2.9 ▸ เหตุการณ์ "คืนของเช่า" ใน tx เดียวกับสถานะ ◂
import * as pos from "@/lib/modules/pos/service";
import { normalizePartyPhone, safeFindOrCreate } from "@/lib/modules/party";
import { listSystems, systemForUnit } from "@/lib/modules/system/service";
import { promptpayPayload } from "@/lib/payment/promptpay";
import type { PosPayType } from "@prisma/client";
import { resolvePublicUnit } from "@/lib/core/storefront";

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
): Promise<{ id: string; days: number; quoteSatang: number; publicToken: string | null }> {
  const days = daysBetween(input.startDate, input.endDate);
  if (days <= 0) throw new Error("วันคืนต้องหลังวันรับอย่างน้อย 1 วัน");
  const name = input.customerName?.trim();
  if (!name) throw new Error("กรุณาระบุชื่อลูกค้า");

  // กันจองซ้อนระดับ DB (race-safe): ล็อกแถวสินทรัพย์ (pessimistic row-lock) ต้น tx → 2 request
  //   ที่เช่า asset เดียวกันช่วงทับกันพร้อมกัน serialize → คนที่ 2 เห็น booking ของคนแรกที่ commit
  //   แล้วในการเช็ค overlap ภายใน tx เดียวกัน → reject (ตาราง "RentalAsset" — schema ไม่มี @@map)
  const res = await prisma.$transaction(async (tx) => {
    const asset = await tx.rentalAsset.findFirst({
      where: { id: input.assetId, tenantId: ctx.tenantId, unitId: ctx.unitId },
    });
    if (!asset) throw new Error("ไม่พบสินทรัพย์");

    await tx.$queryRaw`SELECT id FROM "RentalAsset" WHERE id = ${input.assetId} FOR UPDATE`;

    // เช็ค overlap ภายใน tx (หลังถือ lock) → คนที่ 2 เห็น insert ของคนแรกเสมอ
    const clash = await tx.rentalBooking.findFirst({
      where: {
        tenantId: ctx.tenantId,
        unitId: ctx.unitId,
        assetId: input.assetId,
        status: { in: ["BOOKED", "PICKED_UP"] },
        startDate: { lt: input.endDate },
        endDate: { gt: input.startDate },
      },
    });
    if (clash) throw new Error("ช่วงเวลานี้สินทรัพย์ถูกจองแล้ว");

    const quoteSatang = days * asset.dailyRateSatang;
    const bk = await tx.rentalBooking.create({
      data: {
        tenantId: ctx.tenantId,
        unitId: ctx.unitId,
        assetId: input.assetId,
        customerName: name,
        customerPhone: input.customerPhone?.trim() || "",
        startDate: input.startDate,
        endDate: input.endDate,
        depositHeldSatang: asset.depositSatang,
        depositSatang: asset.depositSatang, // snapshot มัดจำ (จองออนไลน์จ่าย PromptPay แล้วร้านยืนยัน)
        note: input.note?.trim() || null,
      },
    });
    return { id: bk.id, days, quoteSatang, publicToken: bk.publicToken };
  });
  await linkPartyAfterCommit(ctx.tenantId, res.id, name, input.customerPhone); // CRM v2 C1.1 (C11)
  return res;
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

  // CRM C2.9 ▸ (มติผู้คุมงาน · ใบ C2.9) ด่าน POS ต้องอยู่ **ก่อน** การ claim:
  //   เดิมฟังก์ชันนี้ claim (PICKED_UP→RETURNED) + ยิง event ก่อน แล้วจึงหา AppSystem type POS · ไม่มี POS =
  //   revert สถานะกลับ + โยน ⇒ การคืนที่ถูกยกเลิกไปแล้วยังทิ้ง event ค้างไว้ในคิว (และกิจกรรม VISIT ใน CRM
  //   หลังคิวระบาย) — ไทม์ไลน์ลูกค้าจึงโกหกว่า "คืนของแล้ว" ทั้งที่ของยังไม่ได้คืน
  //   แก้โดยย้ายด่านขึ้นมาเป็น pre-check ก่อนเขียนอะไรทั้งสิ้น ⇒ ไม่มี POS = โยนโดยไม่แตะสถานะ ไม่มี event ไม่มีกิจกรรม
  //   ข้อความไทยเดิมทุกตัวอักษร · ลำดับเดิมคงไว้: สถานะไม่ใช่ PICKED_UP / ไม่พบสินทรัพย์ → ok:false มาก่อนด่าน POS
  const posSystems = await listSystems(ctx.tenantId, "POS");
  const posSys = posSystems[0];
  if (!posSys) throw new Error("เปิดระบบขาย (POS) ก่อนรับคืนสินทรัพย์");

  // 1) claim อะตอมมิก: PICKED_UP → RETURNED (แพ้แข่ง/สถานะอื่น → ok:false, ไม่ทำเส้นเงินซ้ำ)
  //   ห่อ **เฉพาะ** การ claim + `emitOutbox(tx, …)` ไว้ใน transaction เดียวกัน ⇒
  //   คืนของสำเร็จ = มี event เสมอ · event เขียนไม่ได้ = การคืนถูกยกเลิกทั้งก้อน (ของยังอยู่สถานะ PICKED_UP)
  //   `pos.createSale` / การผูก posSaleId ยังอยู่ "นอก tx" เหมือนเดิมทุกประการ (ไม่มี nested tx)
  //   payload = id ล้วน + ยอดสตางค์ (X8: ไม่มีชื่อ/เบอร์ผู้เช่า)
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.rentalBooking.updateMany({
      where: { id: bookingId, tenantId: ctx.tenantId, unitId: ctx.unitId, status: "PICKED_UP" },
      data: { status: "RETURNED", returnedAt: new Date(), lateFeeSatang, totalSatang },
    });
    if (claim.count === 0) return false;
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      type: "rental.returned",
      idempotencyKey: `rental.returned#${bookingId}`,
      payload: { bookingId, unitId: ctx.unitId, partyId: bk.partyId, assetId: bk.assetId, totalSatang },
    });
    return true;
  });
  if (!claimed) return { ok: false, totalSatang: 0 };
  // ◂ CRM C2.9

  // 2) ด่าน POS ผ่านแล้วตั้งแต่ก่อน claim (บล็อก CRM C2.9 ด้านบน) — ไม่มีการ revert สถานะหลังยิง event อีกต่อไป

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

// ── คืนเงิน (RETURNED → REFUNDED) — void PosSale (ห้ามลบ record) ──
// mirror ของ shop.refundOrder / hotel.refundStay:
//   1) claim อะตอมมิก RETURNED→REFUNDED (idempotent — คืนซ้ำ/สถานะอื่น → ok:false ไม่กลับเส้นเงินซ้ำ)
//   2) กลับเส้นเงิน pos.voidSale (คืนบัญชี+แต้ม) "นอก tx" — voidSale เปิด tx เอง (ไม่ nested) · เฉพาะบิลที่ยัง PAID
//   asset: ปล่อยไว้ว่างตามเดิม — availability คิดจาก booking ที่ BOOKED/PICKED_UP เท่านั้น
//     (RETURNED/REFUNDED ไม่บล็อกช่วงเวลาอยู่แล้ว → ไม่ต้องแตะ asset)
// cross-tenant: tenantDb(ctx) กรอง tenantId → claim ไม่ match → ok:false (record ร้านอื่นไม่ถูกแตะ)
export async function refundRental(
  ctx: RentalCtx,
  bookingId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = tenantDb(ctx);

  // 1) claim อะตอมมิก: RETURNED → REFUNDED
  const claim = await db.rentalBooking.updateMany({
    where: { id: bookingId, status: "RETURNED" },
    data: { status: "REFUNDED", refundedAt: new Date() },
  });
  if (claim.count === 0) {
    const cur = await db.rentalBooking.findFirst({ where: { id: bookingId } });
    if (!cur) return { ok: false, reason: "ไม่พบการจอง" };
    if (cur.status === "REFUNDED") return { ok: false, reason: "การจองนี้คืนเงินแล้ว" };
    if (cur.status === "BOOKED" || cur.status === "PICKED_UP")
      return { ok: false, reason: "การจองนี้ยังไม่ได้คิดเงิน (ใช้ปุ่มยกเลิกแทน)" };
    return { ok: false, reason: "คืนเงินได้เฉพาะการจองที่คืนของ/คิดเงินแล้ว" };
  }

  const bk = await db.rentalBooking.findFirst({ where: { id: bookingId } });
  if (!bk) return { ok: false, reason: "ไม่พบการจอง" };

  // 2) กลับเส้นเงิน — void PosSale (เฉพาะบิลที่ยัง PAID — กัน void ซ้ำหลัง retry)
  if (bk.posSaleId) {
    const sale = await prisma.posSale.findFirst({ where: { id: bk.posSaleId, tenantId: ctx.tenantId } });
    if (sale && sale.status === "PAID") {
      await pos.voidSale(ctx.tenantId, ctx.unitId, bk.posSaleId);
    }
  }

  return { ok: true };
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
  opts: { status?: "BOOKED" | "PICKED_UP" | "RETURNED" | "CANCELLED" | "REFUNDED" } = {},
) {
  return tenantDb(ctx).rentalBooking.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { createdAt: "desc" },
    include: { asset: true },
    take: 200,
  });
}

// ───────────────────────── Public storefront (ลูกค้าจองเช่าเอง · no-auth) ─────────────────────────
// resolve unit จาก slug (public) → tenantId+unitId · unit ต้อง ACTIVE + type=RENTAL (กันสวมร้าน/ประเภทผิด)
// mirror resolveHotelUnit
export async function resolveRentalUnit(tenantSlug: string, unitSlug: string) {
  // คิวรีเดียว (เดิมยิง tenant แล้ว unit เรียงกัน = 2 round-trip ไปสิงคโปร์)
  return resolvePublicUnit(tenantSlug, unitSlug, "RENTAL");
}

// สินทรัพย์ให้เช่าสำหรับหน้าจองลูกค้า + ว่างไหมในช่วง [from, to) (mirror listPublicAvailability)
// ช่วงไม่ถูกต้อง → available=false ทุกตัว (จองไม่ได้)
export type PublicRentalAsset = {
  id: string;
  name: string;
  code: string | null;
  dailyRateSatang: number;
  depositSatang: number;
  available: boolean;
};

export async function listPublicRentalAssets(
  ctx: RentalCtx,
  range: { from: Date; to: Date } | null,
): Promise<PublicRentalAsset[]> {
  const db = tenantDb(ctx);
  const assets = await db.rentalAsset.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const validRange = !!range && range.to.getTime() > range.from.getTime();
  // clash ทั้งหมดในช่วง (query เดียว) → เช็ค available ต่อ asset ใน memory
  const clashes = validRange
    ? await db.rentalBooking.findMany({
        where: {
          status: { in: ["BOOKED", "PICKED_UP"] },
          startDate: { lt: range!.to },
          endDate: { gt: range!.from },
        },
        select: { assetId: true },
      })
    : [];
  const busy = new Set(clashes.map((c) => c.assetId));
  return assets.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    dailyRateSatang: a.dailyRateSatang,
    depositSatang: a.depositSatang,
    available: validRange && !busy.has(a.id),
  }));
}

// สถานะการจอง (public จาก publicToken) — กัน cross-tenant: token ต้องเป็นของ unit นี้ (กัน leak PII ลูกค้า)
// mirror getPublicReservation
export async function getPublicBooking(unitId: string, publicToken: string) {
  const token = (publicToken ?? "").trim();
  if (!token) return null;
  const bk = await prisma.rentalBooking.findUnique({
    where: { publicToken: token },
    include: { asset: { select: { name: true } } },
  });
  if (!bk || bk.unitId !== unitId) return null;
  return bk;
}

// PromptPay payload สำหรับจ่ายมัดจำการจองนี้ (ยอด = depositSatang) — ร้านยังไม่ตั้งเลข → null
// mirror promptpayForDeposit
export async function promptpayForRentalDeposit(
  ctx: RentalCtx,
  bookingId: string,
): Promise<{ payload: string; displayName: string } | null> {
  const db = tenantDb(ctx);
  const bk = await db.rentalBooking.findFirst({ where: { id: bookingId } });
  if (!bk || bk.depositSatang <= 0) return null;
  const profile = await db.paymentProfile.findFirst({ where: {} });
  if (!profile?.promptpayId) return null;
  const payload = promptpayPayload({ id: profile.promptpayId, amountSatang: bk.depositSatang });
  return { payload, displayName: profile.displayName ?? "" };
}

// ร้านยืนยันรับมัดจำ — เปิดบิล POS DEPOSIT (Dr 2110 เงินมัดจำรับ) แล้วปั๊ม depositPaidAt (mirror recordDeposit)
//   guard: การจองมีมัดจำ (depositSatang>0) + ยังไม่จ่าย + ยังไม่ยกเลิก/คืนเงิน
//   idempotent: createSale key `rental-deposit-<bookingId>` + claim อะตอมมิก depositPaidAt
//   ไม่ผูก POS → บันทึก depositPaidAt เฉย ๆ (standalone · saleId=null)
export async function recordRentalDeposit(
  ctx: RentalCtx,
  bookingId: string,
  payMethod: PosPayType = "DEPOSIT",
): Promise<{ ok: boolean; reason?: string; saleId?: string; noop?: boolean }> {
  const db = tenantDb(ctx);
  const bk = await db.rentalBooking.findFirst({ where: { id: bookingId } });
  if (!bk) return { ok: false, reason: "ไม่พบการจอง" };
  if (bk.status === "CANCELLED" || bk.status === "REFUNDED")
    return { ok: false, reason: "การจองนี้ยกเลิก/คืนเงินแล้ว รับมัดจำไม่ได้" };
  if (bk.depositSatang <= 0) return { ok: false, reason: "การจองนี้ไม่ต้องมัดจำ" };
  if (bk.depositPaidAt) return { ok: true, noop: true, saleId: bk.depositSaleId ?? undefined };

  const amount = bk.depositSatang;
  // เปิดบิลมัดจำผ่าน POS (chokepoint เงิน) — idempotent · ไม่มี POS = ข้าม (บันทึก paidAt เฉย ๆ)
  let saleId: string | null = null;
  const posSystemId = await systemForUnit(ctx.tenantId, ctx.unitId, "POS");
  if (posSystemId) {
    const sale = await pos.createSale({
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      systemId: posSystemId,
      sourceModule: "RENTAL",
      sourceId: bookingId,
      idempotencyKey: `rental-deposit-${bookingId}`,
      lines: [{ name: `มัดจำเช่า ${bk.customerName}`, qty: 1, unitPriceSatang: amount }],
      payMethods: [{ type: payMethod, amountSatang: amount }],
    });
    saleId = sale.saleId;
  }

  // claim อะตอมมิก: ปั๊ม depositPaidAt เฉพาะแถวที่ยังไม่จ่าย (กัน 2 request แข่งกัน)
  const claim = await db.rentalBooking.updateMany({
    where: { id: bookingId, depositPaidAt: null },
    data: { depositPaidAt: new Date(), depositSaleId: saleId },
  });
  if (claim.count === 0) {
    const cur = await db.rentalBooking.findFirst({ where: { id: bookingId } });
    return { ok: true, noop: true, saleId: cur?.depositSaleId ?? undefined };
  }
  return { ok: true, saleId: saleId ?? undefined };
}

// ───────── CRM v2 ใบ C1.1 (C11) — ผูก Party กลางให้ RentalBooking ─────────
// 🔴 เรียก "หลัง commit" เท่านั้น: รายการที่ล้ม (เต็ม/ชน/ไม่พบ) ต้องไม่ทิ้ง Party ของคนที่ไม่ได้เป็นลูกค้า (PDPA · เก็บเท่าที่จำเป็น)
//    และไม่ถือ connection ที่สองขณะ transaction ธุรกิจถือ lock อยู่
// 🔴 กุญแจต้องเชื่อถือได้: เบอร์ normalize ≥ 9 หลัก — ไม่งั้นไม่ผูก (party.findOrCreate สร้างใหม่ทุกครั้งเมื่อเบอร์ < 8 หลัก ⇒ Party ขยะ)
// 🔴 ไม่มีวัน throw เข้าหาผู้เรียก · ล้ม = ปล่อย partyId ว่างให้ backfill party-links เก็บตก
// AUDIT-CLASS X8: log แค่ชื่อตาราง + tenant ไม่มีเบอร์/อีเมล/ชื่อ
async function linkPartyAfterCommit(tenantId: string, id: string, name: string | null | undefined, phone: string | null | undefined): Promise<void> {
  try {
    const phoneOk = normalizePartyPhone(phone).length >= 9;
    if (!phoneOk) return;
    const partyId = await safeFindOrCreate(tenantId, { name: name?.trim() || "ลูกค้าไม่ระบุชื่อ", phone: phoneOk ? phone : null });
    if (partyId) await prisma.rentalBooking.updateMany({ where: { id, tenantId, partyId: null }, data: { partyId } });
    else console.warn(`[party-link] RentalBooking tenant=${tenantId}: ไม่ได้ partyId — ปล่อยว่าง`);
  } catch {
    console.warn(`[party-link] RentalBooking tenant=${tenantId}: ผูก Party ไม่สำเร็จ — ปล่อยว่าง`);
  }
}
