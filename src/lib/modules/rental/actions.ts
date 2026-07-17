"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import * as rental from "./service";

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

function ctxOf(auth: UnitAuth, unitId: string) {
  return { tenantId: auth.active.tenantId, unitId };
}

function assertRentalCan(auth: UnitAuth, unitId: string, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "rental", action, unitId },
  );
}

// ───────────────────────── สินทรัพย์ ─────────────────────────
const assetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dailyRateBaht: z.coerce.number().min(0).max(10_000_000),
  depositBaht: z.coerce.number().min(0).max(10_000_000).optional(),
  code: z.string().trim().max(60).optional(),
});

export async function createAssetAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertRentalCan(auth, unit.id, "rental.asset.create");
  const p = assetSchema.safeParse({
    name: formData.get("name"),
    dailyRateBaht: formData.get("dailyRateBaht"),
    depositBaht: formData.get("depositBaht") || undefined,
    code: formData.get("code") || undefined,
  });
  if (!p.success) return;
  await rental.createAsset(ctxOf(auth, unit.id), {
    name: p.data.name,
    dailyRateSatang: Math.round(p.data.dailyRateBaht * 100),
    depositSatang: p.data.depositBaht !== undefined ? Math.round(p.data.depositBaht * 100) : 0,
    code: p.data.code,
  });
  revalidatePath(`/app/u/${unitSlug}/rental`);
}

export async function toggleAssetAction(unitSlug: string, assetId: string, active: boolean) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertRentalCan(auth, unit.id, "rental.asset.update");
  await rental.updateAsset(ctxOf(auth, unit.id), assetId, { active });
  revalidatePath(`/app/u/${unitSlug}/rental`);
}

// ───────────────────────── จอง ─────────────────────────
const bookingSchema = z.object({
  assetId: z.string().trim().min(1).max(40),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().max(30).optional(),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().min(1),
  note: z.string().trim().max(300).optional(),
});

export async function createBookingAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertRentalCan(auth, unit.id, "rental.booking.create");
  const p = bookingSchema.safeParse({
    assetId: formData.get("assetId"),
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    note: formData.get("note") || undefined,
  });
  if (!p.success) return;
  try {
    await rental.createBooking(ctxOf(auth, unit.id), {
      assetId: p.data.assetId,
      customerName: p.data.customerName,
      customerPhone: p.data.customerPhone ?? "",
      startDate: new Date(p.data.startDate),
      endDate: new Date(p.data.endDate),
      note: p.data.note,
    });
  } catch {
    // ช่วงซ้อน/วันไม่ถูกต้อง → กลับไปหน้าเดิม (inline validation ชั้น service)
  }
  revalidatePath(`/app/u/${unitSlug}/rental`);
}

export async function pickUpAction(unitSlug: string, bookingId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertRentalCan(auth, unit.id, "rental.booking.update");
  await rental.pickUp(ctxOf(auth, unit.id), bookingId);
  revalidatePath(`/app/u/${unitSlug}/rental`);
}

export async function returnAction(unitSlug: string, bookingId: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertRentalCan(auth, unit.id, "rental.booking.return");
  const lateFeeBaht = Number(formData.get("lateFeeBaht") ?? 0);
  await rental.returnAsset(ctxOf(auth, unit.id), bookingId, {
    lateFeeSatang: Number.isFinite(lateFeeBaht) && lateFeeBaht > 0 ? Math.round(lateFeeBaht * 100) : 0,
  });
  revalidatePath(`/app/u/${unitSlug}/rental`);
}

export async function cancelAction(unitSlug: string, bookingId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertRentalCan(auth, unit.id, "rental.booking.cancel");
  await rental.cancelBooking(ctxOf(auth, unit.id), bookingId);
  revalidatePath(`/app/u/${unitSlug}/rental`);
}

// คืนเงินหลังคืนของ/คิดเงิน — void PosSale · error inline ผ่าน ?err=
export async function refundRentalAction(unitSlug: string, bookingId: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertRentalCan(auth, unit.id, "rental.booking.refund");
  const res = await rental.refundRental(ctxOf(auth, unit.id), bookingId);
  revalidatePath(`/app/u/${unitSlug}/rental`);
  if (!res.ok) {
    redirect(`/app/u/${unitSlug}/rental?err=${encodeURIComponent(res.reason ?? "คืนเงินไม่สำเร็จ")}`);
  }
}
