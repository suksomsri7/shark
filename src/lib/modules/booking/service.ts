import { resolvePublicUnit } from "@/lib/core/storefront";
import { prisma, tenantDb } from "@/lib/core/db";
import type { AppointmentStatus, PosPayType } from "@prisma/client";
import * as member from "@/lib/modules/member/service";
import * as pos from "@/lib/modules/pos/service";
import { systemForUnit } from "@/lib/modules/system/service";

export type BookingCtx = { tenantId: string; unitId: string };
import {
  computeStaffSlots,
  localToUtc,
  localWeekday,
  minutesToHHMM,
  type HoursWindow,
} from "./slots";

// resolve unit จาก slug (public/no-auth) → tenantId+unitId
export async function resolveUnit(tenantSlug: string, unitSlug: string) {
  // คิวรีเดียว (เดิมยิง tenant แล้ว unit เรียงกัน = 2 round-trip ไปสิงคโปร์)
  return resolvePublicUnit(tenantSlug, unitSlug, "BOOKING");
}

// ── data สำหรับหน้าจอง ──
export async function getBookingData(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const [services, staff] = await Promise.all([
    db.bookingService.findMany({
      // bookable=false = รายการที่ขายหน้าร้านอย่างเดียว (ค่าจัดส่ง/ห่อของขวัญ) ห้ามโผล่ให้ลูกค้าจอง
      where: { active: true, bookable: true },
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
  const service = await db.bookingService.findFirst({ where: { id: serviceId, active: true, bookable: true } });
  if (!service) return [];

  const weekday = localWeekday(dateStr);
  const dayStart = localToUtc(dateStr, 0);
  const dayEnd = localToUtc(dateStr, 24 * 60);

  // กรอบเวลา = เวลาทำการร้านของ weekday นั้น (เดิมใช้ตารางรายช่าง)
  // แล้ว **วันหยุด/เวลาพิเศษรายวัน (BookingClosure) ทับทีหลัง** — ปีใหม่/สงกรานต์/วันเปิดสั้น
  const unitHours = await getUnitHours(tenantId, unitId);
  const day = unitHours.find((h) => h.weekday === weekday);
  const closure = await db.bookingClosure.findFirst({ where: { date: dateStr } });
  if (closure?.closed) return []; // ปิดทั้งวัน — ชนะเวลาทำการรายสัปดาห์เสมอ
  const openMin = closure && !closure.closed ? (closure.openMin ?? day?.openMin) : day?.openMin;
  const closeMin = closure && !closure.closed ? (closure.closeMin ?? day?.closeMin) : day?.closeMin;
  // ไม่มี closure แล้วสัปดาห์นั้นปิด/ไม่ได้ตั้ง = ปิด · มี closure เปิดพิเศษ = เปิดแม้ weekday ปิดอยู่
  if (openMin == null || closeMin == null || (!closure && day?.closed !== false)) {
    if (!closure || closure.closed) return [];
  }
  if (openMin == null || closeMin == null || closeMin <= openMin) return [];
  const window: HoursWindow[] = [{ startMin: openMin, endMin: closeMin }];

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
  } else {
    // พิมพ์ชื่อเอง + ร้านเปิดระบบพนักงานอยู่ → ขึ้นทะเบียนใน HR ให้เลยแล้วผูกกัน
    // เจ้าของทัก 11 ส.ค.: "จองคิว>พนักงาน" กับ "ทีมงาน>พนักงาน" ซ้ำซ้อน — ต้นเหตุคือ
    // เพิ่มช่างในระบบจองแล้ว HR ไม่รู้จัก เลยต้องกรอกคนเดิมสองที่ (และลงเวลา/เงินเดือนไม่ได้)
    const hrSystem = await prisma.appSystem.findFirst({
      where: { tenantId: input.tenantId, type: "HR", active: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (hrSystem) {
      // ชื่อซ้ำ = ถือว่าคนเดียวกัน ผูกของเดิม (ไม่สร้างซ้ำ)
      const dup = await prisma.hrEmployee.findFirst({
        where: { tenantId: input.tenantId, systemId: hrSystem.id, name, active: true },
        select: { id: true },
      });
      const emp =
        dup ??
        (await prisma.hrEmployee.create({
          data: { tenantId: input.tenantId, systemId: hrSystem.id, name },
          select: { id: true },
        }));
      employeeId = emp.id;
    }
  }

  return db.bookingStaff.create({
    data: { tenantId: input.tenantId, unitId: input.unitId, name, employeeId },
  });
}

/**
 * รวมช่างในระบบจองที่ยังไม่ผูก HR เข้าทะเบียนพนักงาน — ใช้กับร้านที่เพิ่มช่างไว้ก่อนมีระบบนี้
 * ชื่อซ้ำ = ผูกของเดิม ไม่สร้างซ้ำ · คืนจำนวนที่ผูกได้
 */
export async function linkStaffToHr(ctx: BookingCtx): Promise<{ linked: number; created: number }> {
  const hrSystem = await prisma.appSystem.findFirst({
    where: { tenantId: ctx.tenantId, type: "HR", active: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!hrSystem) return { linked: 0, created: 0 };
  const db = tenantDb(ctx);
  const orphans = await db.bookingStaff.findMany({ where: { active: true, employeeId: null } });
  let linked = 0;
  let created = 0;
  for (const st of orphans) {
    const dup = await prisma.hrEmployee.findFirst({
      where: { tenantId: ctx.tenantId, systemId: hrSystem.id, name: st.name, active: true },
      select: { id: true },
    });
    let empId = dup?.id;
    if (!empId) {
      const emp = await prisma.hrEmployee.create({
        data: { tenantId: ctx.tenantId, systemId: hrSystem.id, name: st.name },
        select: { id: true },
      });
      empId = emp.id;
      created += 1;
    }
    await db.bookingStaff.updateMany({ where: { id: st.id }, data: { employeeId: empId } });
    linked += 1;
  }
  return { linked, created };
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
  idempotencyKey?: string; // ผูกกับ 1 การกดจอง → ยิงซ้ำ/ดับเบิลคลิก = คืนนัดเดิม (ไม่สร้างใหม่)
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const db = tenantDb({ tenantId: input.tenantId, unitId: input.unitId });
  const idem = input.idempotencyKey?.trim() || null;

  // fast path: key นี้เคยสร้างนัดแล้ว (กดซ้ำ) → คืนนัดเดิมทันที ไม่แตะ member/tx
  if (idem) {
    const prior = await db.appointment.findFirst({ where: { idempotencyKey: idem } });
    if (prior) return { ok: true, id: prior.id };
  }

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
      // กันจองซ้อนระดับ DB: ล็อกแถวช่าง (pessimistic row-lock) → 2 request ที่จองช่าง
      // คนเดียวกันพร้อมกัน serialize กัน → คนที่ 2 เห็น insert ของคนแรกที่ commit แล้ว
      // ตาราง = "BookingStaff" (schema ไม่มี @@map)
      await tx.$queryRaw`SELECT id FROM "BookingStaff" WHERE id = ${input.staffId} FOR UPDATE`;

      // idempotency ข้าม request: key เดิม (ที่เพิ่ง commit ระหว่างที่เรารอ lock) → คืนนัดเดิม
      // ต้องเช็คก่อนกันจองซ้อน ไม่งั้นกดซ้ำ slot เดิมจะกลายเป็น SLOT_TAKEN แทนที่จะ idempotent
      if (idem) {
        const dup = await tx.appointment.findFirst({
          where: { tenantId: input.tenantId, idempotencyKey: idem },
        });
        if (dup) return dup;
      }

      // กันจองซ้อน: ช่วงเวลาช่างคนนี้ทับกับนัดที่ยัง active
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
          // snapshot มัดจำจากบริการ ณ ตอนสร้างนัด (ราคาบริการเปลี่ยนภายหลังไม่กระทบนัดเดิม)
          // ไม่บังคับจ่ายตอนนี้ — ร้านเก็บทีหลังผ่าน recordDeposit
          // snapshot ราคา+มัดจำ ณ วันจอง — ร้านขึ้นราคาทีหลังไม่กระทบนัดใบนี้
          priceSatang: service.priceSatang,
          depositSatang: service.depositSatang,
          idempotencyKey: idem,
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
    // ชน unique(tenantId, idempotencyKey) จากยิงพร้อมกัน key เดียวกัน → คืนนัดเดิม (idempotent)
    if (idem && (e as { code?: string }).code === "P2002") {
      const dup = await db.appointment.findFirst({ where: { idempotencyKey: idem } });
      if (dup) return { ok: true, id: dup.id };
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

// ── มัดจำ (WO Wave3-A: กัน no-show) ─────────────────────────────
// ตั้งมัดจำต่อบริการ (บาท→สตางค์เก็บที่ action) · 0 = ไม่ต้องมัดจำ
export async function setServiceDeposit(
  ctx: BookingCtx,
  serviceId: string,
  depositSatang: number,
): Promise<{ ok: boolean; reason?: string }> {
  if (!Number.isFinite(depositSatang) || depositSatang < 0) {
    return { ok: false, reason: "มัดจำต้องเป็นจำนวนเงินไม่ติดลบ" };
  }
  const db = tenantDb(ctx);
  const res = await db.bookingService.updateMany({
    where: { id: serviceId },
    data: { depositSatang: Math.round(depositSatang) },
  });
  if (res.count === 0) return { ok: false, reason: "ไม่พบบริการ" };
  return { ok: true };
}

// ร้านกดรับมัดจำ — เปิดบิล POS ชนิด DEPOSIT (ลงบัญชี Dr 2110 เงินมัดจำรับ) แล้วปั๊ม depositPaidAt
//   guard: นัดมีมัดจำ (depositSatang>0) + ยังไม่จ่าย (depositPaidAt=null)
//   idempotent: createSale ผูก key `booking-deposit-<appointmentId>` (ยิงซ้ำ = บิลเดิม ไม่เบิ้ล)
//               + claim อะตอมมิก depositPaidAt (race 2 คนกดพร้อมกัน → บันทึกเดียว)
//   ไม่ผูก POS → บันทึก depositPaidAt เฉย ๆ (standalone · saleId=null)
export async function recordDeposit(
  ctx: BookingCtx,
  appointmentId: string,
  payMethod: PosPayType = "DEPOSIT",
): Promise<{ ok: boolean; reason?: string; saleId?: string; noop?: boolean }> {
  const db = tenantDb(ctx);
  const appt = await db.appointment.findFirst({
    where: { id: appointmentId },
    include: { service: true },
  });
  if (!appt) return { ok: false, reason: "ไม่พบนัด" };
  if (appt.depositSatang <= 0) return { ok: false, reason: "นัดนี้ไม่ต้องมัดจำ" };
  // จ่ายแล้วกดซ้ำ = no-op (idempotent) — ไม่เปิดบิลใหม่
  if (appt.depositPaidAt) {
    return { ok: true, noop: true, saleId: appt.depositSaleId ?? undefined };
  }

  const amount = appt.depositSatang;

  // เปิดบิลมัดจำผ่าน POS (chokepoint เงิน) — idempotent · ไม่มี POS = ข้าม (บันทึก paidAt เฉย ๆ)
  let saleId: string | null = null;
  const posSystemId = await systemForUnit(ctx.tenantId, ctx.unitId, "POS");
  if (posSystemId) {
    const sale = await pos.createSale({
      tenantId: ctx.tenantId,
      unitId: ctx.unitId,
      systemId: posSystemId,
      sourceModule: "BOOKING",
      sourceId: appointmentId,
      idempotencyKey: `booking-deposit-${appointmentId}`,
      lines: [{ name: `มัดจำ ${appt.service.name}`, qty: 1, unitPriceSatang: amount, serviceId: appt.serviceId }],
      payMethods: [{ type: payMethod, amountSatang: amount }],
    });
    saleId = sale.saleId;
  }

  // claim อะตอมมิก: ปั๊ม depositPaidAt เฉพาะแถวที่ยังไม่จ่าย (กัน 2 request แข่งกัน)
  const claim = await db.appointment.updateMany({
    where: { id: appointmentId, depositPaidAt: null },
    data: { depositPaidAt: new Date(), depositSaleId: saleId },
  });
  if (claim.count === 0) {
    // แพ้แข่ง (อีก request บันทึกไปแล้ว) — บิลเดียวกัน (idempotent) ไม่เบิ้ล
    const cur = await db.appointment.findFirst({ where: { id: appointmentId } });
    return { ok: true, noop: true, saleId: cur?.depositSaleId ?? undefined };
  }
  return { ok: true, saleId: saleId ?? undefined };
}

// คืนมัดจำ (ยกเลิกนัด/ตามนโยบาย) — void บิลมัดจำ (กลับ Dr 2110) + เคลียร์ depositPaidAt
//   guard: จ่ายแล้วเท่านั้น (depositPaidAt≠null) · claim อะตอมมิก (double refund = no-op)
//   void เฉพาะบิลที่ยัง PAID (กัน void ซ้ำ) · ไม่ผูก POS = เคลียร์เฉย ๆ
export async function refundDeposit(
  ctx: BookingCtx,
  appointmentId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = tenantDb(ctx);
  const appt = await db.appointment.findFirst({ where: { id: appointmentId } });
  if (!appt) return { ok: false, reason: "ไม่พบนัด" };
  if (!appt.depositPaidAt) return { ok: false, reason: "นัดนี้ยังไม่ได้รับมัดจำ" };
  const saleId = appt.depositSaleId; // จับไว้ก่อน claim (จะถูกเคลียร์)

  // claim อะตอมมิก: เคลียร์ depositPaidAt เฉพาะแถวที่ยังจ่ายอยู่ (กันคืนซ้ำ)
  const claim = await db.appointment.updateMany({
    where: { id: appointmentId, depositPaidAt: { not: null } },
    data: { depositPaidAt: null, depositSaleId: null },
  });
  if (claim.count === 0) return { ok: false, reason: "มัดจำนี้ถูกคืนไปแล้ว" };

  // กลับเส้นเงิน — void PosSale (เฉพาะบิลที่ยัง PAID) · voidSale เปิด tx เอง (ไม่ nested)
  if (saleId) {
    const sale = await prisma.posSale.findFirst({ where: { id: saleId, tenantId: ctx.tenantId } });
    if (sale && sale.status === "PAID") {
      await pos.voidSale(ctx.tenantId, ctx.unitId, saleId);
    }
  }
  return { ok: true };
}


// ─────────────────── วันหยุด/เวลาพิเศษรายวัน (11 ส.ค. 2026) ───────────────────
// เดิมตั้งได้แค่รายสัปดาห์ → ร้านปิดปีใหม่/สงกรานต์ หรือวันไหนเปิดสั้นกว่าปกติ ทำไม่ได้เลย
// กติกา: closure ของวันไหน "ทับ" เวลาทำการรายสัปดาห์ของวันนั้นเสมอ

export type ClosureRow = {
  id: string;
  date: string;
  closed: boolean;
  openMin: number | null;
  closeMin: number | null;
  note: string | null;
};

/** วันหยุด/เวลาพิเศษตั้งแต่วันที่ระบุเป็นต้นไป (ค่าเริ่มต้น = วันนี้) เรียงตามวัน */
export async function listClosures(
  ctx: BookingCtx,
  fromDate?: string,
  take = 60,
): Promise<ClosureRow[]> {
  // วันนี้ตามเวลาไทย (ไม่ import จาก pos — ข้ามโมดูล) — booking ใช้ +07:00 คงที่อยู่แล้วทั้งไฟล์
  const from = fromDate ?? new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  return tenantDb(ctx).bookingClosure.findMany({
    where: { date: { gte: from } },
    orderBy: { date: "asc" },
    take,
    select: { id: true, date: true, closed: true, openMin: true, closeMin: true, note: true },
  });
}

/** ตั้ง/แก้วันหยุดของวันหนึ่ง — upsert ต่อ (unit, date) · กดซ้ำวันเดิมไม่งอกแถว */
export async function setClosure(
  ctx: BookingCtx,
  input: { date: string; closed: boolean; openMin?: number | null; closeMin?: number | null; note?: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, reason: "รูปแบบวันไม่ถูกต้อง" };
  if (!input.closed) {
    const o = input.openMin ?? null;
    const c = input.closeMin ?? null;
    if (o == null || c == null) return { ok: false, reason: "เปิดเวลาพิเศษต้องระบุเวลาเปิด-ปิด" };
    if (o < 0 || c > 24 * 60 || c <= o) return { ok: false, reason: "เวลาปิดต้องหลังเวลาเปิด" };
  }
  const data = {
    closed: input.closed,
    openMin: input.closed ? null : (input.openMin ?? null),
    closeMin: input.closed ? null : (input.closeMin ?? null),
    note: input.note?.trim() || null,
  };
  const existing = await tenantDb(ctx).bookingClosure.findFirst({ where: { date: input.date } });
  if (existing) {
    await tenantDb(ctx).bookingClosure.updateMany({ where: { id: existing.id }, data });
  } else {
    await prisma.bookingClosure.create({
      data: { tenantId: ctx.tenantId, unitId: ctx.unitId, date: input.date, ...data },
    });
  }
  return { ok: true };
}

/** ลบวันหยุด (กลับไปใช้เวลาทำการรายสัปดาห์ตามปกติ) */
export async function removeClosure(ctx: BookingCtx, id: string): Promise<void> {
  await tenantDb(ctx).bookingClosure.deleteMany({ where: { id } });
}
