"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";
import { requireUnit } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import * as member from "@/lib/modules/member/service";
import * as pos from "@/lib/modules/pos/service";
import * as booking from "@/lib/modules/booking/service";
import { systemForUnit } from "@/lib/modules/system/service";

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

// 🔴 13 ส.ค. 2026 (เจ้าของสั่งข้อ 15): สร้าง/แก้/ลบบริการ ทำที่ระบบสินค้า/บริการ "ที่เดียว"
// action addService/editService ที่เคยอยู่ตรงนี้ถูกถอดออกโดยเจตนา — หน้าจองคิวเหลือแค่ติ๊กเปิด/ปิดรับจอง
// (ของเดิม: บริการสร้างได้ทั้งที่จองคิวและที่ POS → ราคาไม่ตรงกัน แก้ที่หนึ่งอีกที่ไม่รู้)

const depositSchema = z.object({
  id: z.string().min(1),
  depositBaht: z.coerce.number().min(0).max(1_000_000),
});

export async function setServiceDepositAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.service.setDeposit");
  const p = depositSchema.safeParse({
    id: formData.get("id"),
    depositBaht: formData.get("depositBaht"),
  });
  if (!p.success) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  await booking.setServiceDeposit(ctx, p.data.id, Math.round(p.data.depositBaht * 100));
  revalidatePath(`/app/u/${unitSlug}/booking/services`);
}

export async function recordDepositAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.deposit.record");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  await booking.recordDeposit(ctx, id);
  revalidatePath(`/app/u/${unitSlug}/booking`);
}

export async function refundDepositAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.deposit.refund");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  await booking.refundDeposit(ctx, id);
  revalidatePath(`/app/u/${unitSlug}/booking`);
}

export async function addStaffAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.staff.create");
  const name = String(formData.get("name") ?? "").trim();
  const employeeId = String(formData.get("employeeId") ?? "").trim() || undefined;
  // ต้องมีอย่างใดอย่างหนึ่ง: เลือกจาก HR หรือพิมพ์ชื่อเอง
  if (!employeeId && name.length < 1) return;
  await booking.createStaff({ tenantId: auth.active.tenantId, unitId: unit.id, name, employeeId });
  revalidatePath(`/app/u/${unitSlug}/booking/staff`);
}

const HOURS_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
function hhmmToMin(v: string): number | null {
  const m = HOURS_RE.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export async function setBookingHoursAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.hours.set");
  const rows = Array.from({ length: 7 }, (_, weekday) => {
    const closed = formData.get(`closed-${weekday}`) != null;
    const openMin = hhmmToMin(String(formData.get(`open-${weekday}`) ?? "")) ?? 600;
    const closeMin = hhmmToMin(String(formData.get(`close-${weekday}`) ?? "")) ?? 1200;
    return { weekday, openMin, closeMin, closed };
  });
  await booking.setUnitHours(auth.active.tenantId, unit.id, rows);
  revalidatePath(`/app/u/${unitSlug}/booking/hours`);
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
    // ราคาที่คิดจริง = ราคา ณ วันจอง (snapshot) — ร้านขึ้นราคาทีหลังต้องไม่ย้อนไปคิดกับนัดเก่า
    // -1 = นัดที่จองก่อนมีฟิลด์นี้ → ใช้ราคาบริการปัจจุบันตามพฤติกรรมเดิม
    const spent = appt.priceSatang >= 0 ? appt.priceSatang : appt.service.priceSatang;
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
        // ผูก serviceId → รายงานแยก "บริการ" ได้ตรงกับที่ขายผ่านหน้าขาย (ไม่งั้นนัดจะไปกอง "รายการอื่น")
        lines: [{ name: appt.service.name, qty: 1, unitPriceSatang: spent, serviceId: appt.serviceId }],
        payMethods: [{ type: "CASH", amountSatang: spent }],
      });
    }
  }
  revalidatePath(`/app/u/${unitSlug}/booking`);
}

// ─────────────────── วันหยุด/เวลาพิเศษรายวัน ───────────────────
// เดิมตั้งได้แค่รายสัปดาห์ → ปิดปีใหม่/สงกรานต์/ลาพักร้อน ทำไม่ได้ (เจ้าของทัก 11 ส.ค. 2026)

export async function addClosureAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.hours.set");
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const date = String(formData.get("date") ?? "").trim();
  const mode = String(formData.get("mode") ?? "closed");
  const note = String(formData.get("note") ?? "").trim() || null;
  const toMin = (v: FormDataEntryValue | null): number | null => {
    const [h, m] = String(v ?? "").split(":");
    const hh = Number(h);
    const mm = Number(m);
    return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
  };
  await booking.setClosure(ctx, {
    date,
    closed: mode !== "open",
    openMin: toMin(formData.get("openAt")),
    closeMin: toMin(formData.get("closeAt")),
    note,
  });
  revalidatePath(`/app/u/${unitSlug}/booking/hours`);
}

export async function removeClosureAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.hours.set");
  await booking.removeClosure({ tenantId: auth.active.tenantId, unitId: unit.id }, String(formData.get("id") ?? ""));
  revalidatePath(`/app/u/${unitSlug}/booking/hours`);
}

/** รวมช่างที่ยังไม่ผูกทะเบียนพนักงาน — ปุ่มบนหน้าพนักงานของระบบจอง */
// ── บริการ: ติ๊กเปิดรับจองจากแคตตาล็อกกลาง + ย้ายบริการเก่าเข้าแคตตาล็อก (ข้อ 12-15) ──
export async function setServiceOfferedAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.service.update");
  const itemId = String(formData.get("itemId") ?? "");
  const offered = String(formData.get("offered") ?? "") === "1";
  if (!itemId) return;
  await booking.setServiceOffered({ tenantId: auth.active.tenantId, unitId: unit.id }, itemId, offered);
  revalidatePath(`/app/u/${unitSlug}/booking/services`);
}

export async function importServicesToCatalogAction(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.service.create");
  await booking.importServicesToCatalog({ tenantId: auth.active.tenantId, unitId: unit.id });
  revalidatePath(`/app/u/${unitSlug}/booking/services`);
}

// ติ๊ก "รับคิวที่สาขานี้" ให้พนักงาน HR คนหนึ่ง (มติเจ้าของ 13 ส.ค.: เพิ่ม/ลบคนทำที่ HR ที่เดียว)
export async function setStaffReceivingAction(unitSlug: string, formData: FormData) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.staff.create");
  const employeeId = String(formData.get("employeeId") ?? "");
  const receiving = String(formData.get("receiving") ?? "") === "1";
  if (!employeeId) return;
  await booking.setStaffReceiving({ tenantId: auth.active.tenantId, unitId: unit.id }, employeeId, receiving);
  revalidatePath(`/app/u/${unitSlug}/booking/staff`);
}

export async function linkStaffToHrAction(unitSlug: string) {
  const { auth, unit } = await requireUnit(unitSlug);
  assertBookingCan(auth, unit.id, "booking.staff.create");
  await booking.linkStaffToHr({ tenantId: auth.active.tenantId, unitId: unit.id });
  revalidatePath(`/app/u/${unitSlug}/booking/staff`);
}
