import { prisma, tenantDb } from "@/lib/core/db";
import type { AppointmentStatus } from "@prisma/client";
import * as member from "@/lib/modules/member/service";
import { ensureUnitSystems } from "@/lib/modules/system/service";
import {
  computeStaffSlots,
  localToUtc,
  localWeekday,
  minutesToHHMM,
} from "./slots";

// resolve unit จาก slug (public/no-auth) → tenantId+unitId
export async function resolveUnit(tenantSlug: string, unitSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const unit = await prisma.businessUnit.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: unitSlug } },
  });
  if (!unit || unit.status !== "ACTIVE" || unit.type !== "BOOKING") return null;
  return { tenant, unit };
}

// ── data สำหรับหน้าจอง ──
export async function getBookingData(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const [services, staff] = await Promise.all([
    db.bookingService.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.bookingStaff.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { services, staff };
}

export type SlotOption = { hhmm: string; startMin: number; staffId: string };

// ช่องว่างของวัน — staffId=null = ใครก็ได้ (คืน staff ที่ว่างคนแรกต่อเวลา)
export async function getAvailableSlots(
  tenantId: string,
  unitId: string,
  serviceId: string,
  staffId: string | null,
  dateStr: string,
): Promise<SlotOption[]> {
  const db = tenantDb({ tenantId, unitId });
  const service = await db.bookingService.findFirst({ where: { id: serviceId, active: true } });
  if (!service) return [];

  const weekday = localWeekday(dateStr);
  const dayStart = localToUtc(dateStr, 0);
  const dayEnd = localToUtc(dateStr, 24 * 60);

  const staffList = staffId
    ? await db.bookingStaff.findMany({ where: { id: staffId, active: true } })
    : await db.bookingStaff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (staffList.length === 0) return [];

  const [hours, appts] = await Promise.all([
    db.bookingStaffHours.findMany({
      where: { weekday, staffId: { in: staffList.map((s) => s.id) } },
    }),
    db.appointment.findMany({
      where: {
        staffId: { in: staffList.map((s) => s.id) },
        startAt: { gte: dayStart, lt: dayEnd },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      select: { staffId: true, startAt: true, endAt: true },
    }),
  ]);

  const now = new Date();
  // รวมช่องต่อเวลา → เก็บ staff ที่ว่างคนแรก
  const byTime = new Map<number, string>();
  for (const s of staffList) {
    const mins = computeStaffSlots({
      dateStr,
      hours: hours.filter((h) => h.staffId === s.id),
      busy: appts.filter((a) => a.staffId === s.id),
      durationMin: service.durationMin,
      bufferMin: service.bufferMin,
      now,
    });
    for (const m of mins) if (!byTime.has(m)) byTime.set(m, s.id);
  }

  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([startMin, sid]) => ({ startMin, hhmm: minutesToHHMM(startMin), staffId: sid }));
}

// ── สร้างนัด (กันจองซ้อนใน transaction) ──
export async function createAppointment(input: {
  tenantId: string;
  unitId: string;
  serviceId: string;
  staffId: string; // ต้องเป็น staff จริง (แก้ "ใครก็ได้" มาก่อนเรียก)
  dateStr: string;
  startMin: number;
  customerName: string;
  customerPhone: string;
  note?: string;
  source?: "STAFF" | "ONLINE";
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const db = tenantDb({ tenantId: input.tenantId, unitId: input.unitId });
  const service = await db.bookingService.findFirst({
    where: { id: input.serviceId, active: true },
  });
  if (!service) return { ok: false, reason: "ไม่พบบริการ" };
  const staff = await db.bookingStaff.findFirst({ where: { id: input.staffId, active: true } });
  if (!staff) return { ok: false, reason: "ไม่พบช่าง" };

  const startAt = localToUtc(input.dateStr, input.startMin);
  const endAt = localToUtc(input.dateStr, input.startMin + service.durationMin + service.bufferMin);
  if (startAt.getTime() <= Date.now()) return { ok: false, reason: "เวลาที่เลือกผ่านไปแล้ว" };

  const phone = input.customerPhone.trim();

  // resolve ระบบสมาชิกของ unit (provision ถ้ายังไม่มี)
  const unit = await prisma.businessUnit.findFirst({
    where: { id: input.unitId, tenantId: input.tenantId },
  });
  const sys = await ensureUnitSystems(input.tenantId, input.unitId, unit?.name ?? "กิจการ");

  try {
    const appt = await prisma.$transaction(async (tx) => {
      // กันจองซ้อน: ล็อกช่วงเวลาของช่างคนนี้
      const clash = await tx.appointment.findFirst({
        where: {
          tenantId: input.tenantId,
          unitId: input.unitId,
          staffId: input.staffId,
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (clash) throw new Error("SLOT_TAKEN");

      // แกนกลาง Member: findOrCreate ในระบบสมาชิกของ unit (contract 2.6)
      const customer = await member.findOrCreate(
        {
          tenantId: input.tenantId,
          memberSystemId: sys.MEMBER,
          phone,
          name: input.customerName,
          source: input.source === "STAFF" ? "STAFF" : "SELF",
        },
        tx,
      );

      const created = await tx.appointment.create({
        data: {
          tenantId: input.tenantId,
          unitId: input.unitId,
          customerId: customer.id,
          staffId: input.staffId,
          serviceId: input.serviceId,
          startAt,
          endAt,
          status: "CONFIRMED",
          customerName: input.customerName,
          customerPhone: phone,
          note: input.note,
          source: input.source ?? "ONLINE",
        },
      });

      // timeline (contract 2.7)
      await member.logActivity(
        {
          tenantId: input.tenantId,
          customerId: customer.id,
          unitId: input.unitId,
          module: "booking",
          type: "APPOINTMENT_BOOKED",
          refType: "Appointment",
          refId: created.id,
          summary: `จองนัด ${service.name} · ${input.dateStr} ${minutesToHHMM(input.startMin)}`,
        },
        tx,
      );
      return created;
    });
    return { ok: true, id: appt.id };
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return { ok: false, reason: "ช่วงเวลานี้เพิ่งถูกจองไปแล้ว กรุณาเลือกเวลาอื่น" };
    }
    throw e;
  }
}

// ── dashboard: รายการนัด ──
export async function listAppointments(tenantId: string, unitId: string, fromDateStr: string) {
  const db = tenantDb({ tenantId, unitId });
  const from = localToUtc(fromDateStr, 0);
  return db.appointment.findMany({
    where: { startAt: { gte: from }, status: { notIn: ["CANCELLED"] } },
    orderBy: { startAt: "asc" },
    include: { staff: true, service: true },
    take: 200,
  });
}

export async function setAppointmentStatus(
  tenantId: string,
  unitId: string,
  appointmentId: string,
  status: AppointmentStatus,
) {
  const db = tenantDb({ tenantId, unitId });
  await db.appointment.update({ where: { id: appointmentId }, data: { status } });
}
