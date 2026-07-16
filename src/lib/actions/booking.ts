"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import * as member from "@/lib/modules/member/service";
import * as pos from "@/lib/modules/pos/service";
import { systemForUnit } from "@/lib/modules/system/service";

// ตารางเวลาเริ่มต้นเมื่อเพิ่มช่าง: ทุกวัน 10:00–20:00 (ปรับภายหลังได้)
const DEFAULT_HOURS = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  startMin: 600,
  endMin: 1200,
}));

type UnitAuth = Awaited<ReturnType<typeof requireUnit>>["auth"];

// ตรวจสิทธิ์ระดับหน่วย (OWNER/MANAGER ผ่าน · STAFF ตาม permission)
function assertBookingCan(auth: UnitAuth, unitId: string, action: string) {
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "booking", action, unitId },
  );
}

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  durationMin: z.coerce.number().int().min(5).max(600),
  priceBaht: z.coerce.number().min(0).max(1_000_000),
});

export async function addServiceAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.service.create");
  const p = serviceSchema.safeParse({
    name: formData.get("name"),
    durationMin: formData.get("durationMin"),
    priceBaht: formData.get("priceBaht"),
  });
  if (!p.success) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const db = tenantDb(ctx);
  await db.bookingService.create({
    data: {
      ...ctx,
      name: p.data.name,
      durationMin: p.data.durationMin,
      priceSatang: Math.round(p.data.priceBaht * 100),
    },
  });
  revalidatePath(`/app/u/${unitSlug}/booking/setup`);
}

export async function removeServiceAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.service.delete");
  const id = String(formData.get("id") ?? "");
  const db = tenantDb({ tenantId: auth.active.tenantId, unitId: unit.id });
  await db.bookingService.update({ where: { id }, data: { active: false } });
  revalidatePath(`/app/u/${unitSlug}/booking/setup`);
}

export async function addStaffAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.staff.create");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const db = tenantDb(ctx);
  const staff = await db.bookingStaff.create({ data: { ...ctx, name } });
  await db.bookingStaffHours.createMany({
    data: DEFAULT_HOURS.map((h) => ({ ...ctx, ...h, staffId: staff.id })),
  });
  revalidatePath(`/app/u/${unitSlug}/booking/setup`);
}

export async function removeStaffAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.staff.delete");
  const id = String(formData.get("id") ?? "");
  const db = tenantDb({ tenantId: auth.active.tenantId, unitId: unit.id });
  await db.bookingStaff.update({ where: { id }, data: { active: false } });
  revalidatePath(`/app/u/${unitSlug}/booking/setup`);
}

export async function setStatusAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.appointment.setStatus");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const parsed = z.nativeEnum(AppointmentStatus).safeParse(status);
  if (!parsed.success) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const db = tenantDb(ctx);
  const appt = await db.appointment.update({
    where: { id },
    data: { status: parsed.data },
    include: { service: true },
  });
  // มาใช้บริการจริง → ระบบที่ "เชื่อมไว้" ทำงานตามนั้น (member/pos/point เป็นการเชื่อมแบบเลือกได้)
  if (parsed.data === "DONE") {
    const spent = appt.service.priceSatang;
    const [posSystemId, pointSystemId] = await Promise.all([
      systemForUnit(ctx.tenantId, ctx.unitId, "POS"),
      systemForUnit(ctx.tenantId, ctx.unitId, "POINT"),
    ]);
    if (appt.customerId) {
      await member.recordVisit(ctx.tenantId, appt.customerId);
      await member.logActivity({
        tenantId: ctx.tenantId,
        customerId: appt.customerId,
        unitId: ctx.unitId,
        module: "booking",
        type: "VISIT",
        refType: "Appointment",
        refId: appt.id,
        summary: "มาใช้บริการ",
      });
    }
    if (spent > 0 && posSystemId) {
      await pos.createSale({
        tenantId: ctx.tenantId,
        unitId: ctx.unitId,
        systemId: posSystemId,
        pointSystemId: pointSystemId ?? undefined,
        memberId: appt.customerId ?? undefined,
        sourceModule: "BOOKING",
        sourceId: appt.id,
        idempotencyKey: `booking-sale-${appt.id}`,
        lines: [{ name: appt.service.name, qty: 1, unitPriceSatang: spent }],
        payMethods: [{ type: "CASH", amountSatang: spent }],
      });
    }
  }
  revalidatePath(`/app/u/${unitSlug}/booking`);
}
