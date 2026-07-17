import { prisma, tenantDb } from "@/lib/core/db";
import type { AppointmentStatus } from "@prisma/client";
import * as member from "@/lib/modules/member/service";
import { systemForUnit } from "@/lib/modules/system/service";
import {
  computeStaffSlots,
  localToUtc,
  localWeekday,
  minutesToHHMM,
  type HoursWindow,
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

// ── เวลาทำการร้าน (B) ──
export type UnitHoursRow = { weekday: number; openMin: number; closeMin: number; closed: boolean };

const DEFAULT_HOURS_ROW = { openMin: 600, closeMin: 1200, closed: false };

// คืน 7 แถวเสมอ (weekday 0=อาทิตย์..6) — merge DB กับค่าเริ่มต้น · ไม่ persist ตอนอ่าน
export async function getUnitHours(tenantId: string, unitId: string): Promise<UnitHoursRow[]> {
  const db = tenantDb({ tenantId, unitId });
  const rows = await db.bookingHours.findMany({ where: {} });
  const byWeekday = new Map(rows.map((r) => [r.weekday, r]));
  return Array.from({ length: 7 }, (_, weekday) => {
    const r = byWeekday.get(weekday);
    return r
      ? { weekday, openMin: r.openMin, closeMin: r.closeMin, closed: r.closed }
      : { weekday, ...DEFAULT_HOURS_ROW };
  });
}

// upsert เวลาทำการรายวัน (unique unitId+weekday)
export async function setUnitHours(
  tenantId: string,
  unitId: string,
  rows: { weekday: number; openMin: number; closeMin: number; closed: boolean }[],
) {
  const db = tenantDb({ tenantId, unitId });
  for (const r of rows) {
    if (!r.closed && r.openMin >= r.closeMin) {
      throw new Error("เวลาเปิดต้องมาก่อนเวลาปิด");
    }
    // upsert รายวัน (unique unitId+weekday) — ผ่าน tenantDb (guard inject tenantId/unitId)
    // ใช้ท่า update→create แทน .upsert() เพราะ guard wrap where ของ upsert เป็น AND
    // ทำให้ compound-unique (unitId_weekday) ใช้ไม่ได้ (guard เป็น core ห้ามแก้)
    try {
      await db.bookingHours.update({
        where: { unitId_weekday: { unitId, weekday: r.weekday } },
        data: { openMin: r.openMin, closeMin: r.closeMin, closed: r.closed },
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "P2025" && !(e instanceof Error && /นอกขอบเขต/.test(e.message))) throw e;
      await db.bookingHours.create({
        data: { tenantId, unitId, weekday: r.weekday, openMin: r.openMin, closeMin: r.closeMin, closed: r.closed },
      });
    }
  }
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

  // กรอบเวลา = เวลาทำการร้านของ weekday นั้น (เดิมใช้ตารางรายช่าง)
  const unitHours = await getUnitHours(tenantId, unitId);
  const day = unitHours.find((h) => h.weekday === weekday);
  if (!day || day.closed) return [];
  const window: HoursWindow[] = [{ startMin: day.openMin, endMin: day.closeMin }];

  const staffList = staffId
    ? await db.bookingStaff.findMany({ where: { id: staffId, active: true } })
    : await db.bookingStaff.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (staffList.length === 0) return [];

  const appts = await db.appointment.findMany({
    where: {
      staffId: { in: staffList.map((s) => s.id) },
      startAt: { gte: dayStart, lt: dayEnd },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    select: { staffId: true, startAt: true, endAt: true },
  });

  const now = new Date();
  // รวมช่องต่อเวลา → เก็บ staff ที่ว่างคนแรก
  const byTime = new Map<number, string>();
  for (const s of staffList) {
    const mins = computeStaffSlots({
      dateStr,
      hours: window,
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

// ── เชื่อมพนักงานกับระบบ HR (A) ──
// พนักงานจากระบบ HR ที่เปิดอยู่ของ tenant นี้ (เลือกได้ ไม่บังคับ) · ไม่เปิด HR = []
export async function listLinkableEmployees(tenantId: string) {
  const hrSystems = await prisma.appSystem.findMany({
    where: { tenantId, type: "HR", active: true },
    select: { id: true },
  });
  if (hrSystems.length === 0) return [];
  const employees = await prisma.hrEmployee.findMany({
    where: { tenantId, systemId: { in: hrSystems.map((s) => s.id) }, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, position: true },
  });
  return employees.map((e) => ({ id: e.id, name: e.name, position: e.position }));
}

// ตัวกลางสร้างช่าง — เลือกจาก HR (employeeId) หรือพิมพ์ชื่อเอง (name)
export async function createStaff(input: {
  tenantId: string;
  unitId: string;
  name?: string;
  employeeId?: string;
}) {
  const db = tenantDb({ tenantId: input.tenantId, unitId: input.unitId });
  let name = (input.name ?? "").trim();
  let employeeId: string | null = null;

  if (input.employeeId) {
    // ต้องเป็นพนักงานของระบบ HR ใน tenant เดียวกัน
    const hrSystems = await prisma.appSystem.findMany({
      where: { tenantId: input.tenantId, type: "HR", active: true },
      select: { id: true },
    });
    const emp =
      hrSystems.length > 0
        ? await prisma.hrEmployee.findFirst({
            where: {
              id: input.employeeId,
              tenantId: input.tenantId,
              systemId: { in: hrSystems.map((s) => s.id) },
              active: true,
            },
          })
        : null;
    if (!emp) throw new Error("ไม่พบพนักงานที่เลือก");
    name = emp.name;
    employeeId = emp.id;
  } else if (name.length < 1) {
    throw new Error("กรุณากรอกชื่อพนักงาน");
  }

  return db.bookingStaff.create({
    data: { tenantId: input.tenantId, unitId: input.unitId, name, employeeId },
  });
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

  // ระบบสมาชิกที่เชื่อมกับระบบนี้ (optional — เชื่อมจากหน้า "เพิ่มระบบ")
  const memberSystemId = await systemForUnit(input.tenantId, input.unitId, "MEMBER");

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

      // เชื่อมระบบสมาชิก → findOrCreate (contract 2.6); ไม่เชื่อม → จองแบบ guest
      const customer = memberSystemId
        ? await member.findOrCreate(
            {
              tenantId: input.tenantId,
              memberSystemId,
              phone,
              name: input.customerName,
              source: input.source === "STAFF" ? "STAFF" : "SELF",
            },
            tx,
          )
        : null;

      const created = await tx.appointment.create({
        data: {
          tenantId: input.tenantId,
          unitId: input.unitId,
          customerId: customer?.id ?? null,
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

      // timeline (contract 2.7) — เฉพาะเมื่อเชื่อมระบบสมาชิก
      if (customer) {
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
      }
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
